/**
 * Attribue les photos du Storage (bucket `avatars`, dossier `membres-olb/`)
 * aux comptes membres en remplissant `membres.photo_url`.
 *
 * Le bucket `avatars` est privé : on génère donc une URL signée (valable 1 an)
 * pour chaque photo, exactement comme le fait src/components/AvatarUpload.tsx.
 *
 * La correspondance fichier <-> membre se fait sur le nom :
 *   - on normalise (minuscules, sans accents, séparateurs unifiés)
 *   - un fichier correspond à un membre si tous les mots du prénom ET du nom
 *     du membre apparaissent dans le nom de fichier.
 *
 * Utilisation :
 *   # 1) Aperçu (n'écrit RIEN, affiche le rapport de correspondance) :
 *   SUPABASE_SERVICE_ROLE_KEY="<clé service role>" bun run scripts/attribuer-photos.ts
 *
 *   # 2) Application réelle (met à jour photo_url) :
 *   SUPABASE_SERVICE_ROLE_KEY="<clé service role>" bun run scripts/attribuer-photos.ts --apply
 *
 * Options :
 *   --apply       Écrit réellement les photo_url (sinon : simple aperçu).
 *   --force       Écrase aussi les photo_url déjà renseignées (sinon : ignorés).
 *   --prefix=...  Dossier dans le bucket (défaut : "membres-olb").
 *
 * SUPABASE_URL est lu depuis l'environnement ou, à défaut, depuis .env
 * (SUPABASE_URL / VITE_SUPABASE_URL). La clé service role n'est jamais
 * stockée : passez-la en variable d'environnement au lancement.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BUCKET = "avatars";
const DUREE_URL = 60 * 60 * 24 * 365; // 1 an, comme AvatarUpload.tsx

// ---- args ----
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const PREFIX = (args.find((a) => a.startsWith("--prefix="))?.split("=")[1] ?? "membres-olb").replace(
  /\/+$/,
  "",
);

// ---- config / secrets ----
function envFromDotenv(key: string): string | undefined {
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const line = raw.split("\n").find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  envFromDotenv("SUPABASE_URL") ||
  envFromDotenv("VITE_SUPABASE_URL");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("❌ SUPABASE_URL introuvable (env ou .env).");
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_SERVICE_ROLE_KEY manquante.\n" +
      '   Relancez avec : SUPABASE_SERVICE_ROLE_KEY="<clé>" bun run scripts/attribuer-photos.ts',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- helpers ----
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i;

function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase()
    .replace(IMAGE_EXT, "") // extension
    .replace(/[_\-.]+/g, " ") // séparateurs -> espace
    .replace(/[^a-z0-9\s]/g, " ") // ponctuation restante
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalise(s).split(" ").filter(Boolean);
}

type Membre = { id: string; prenom: string; nom: string; photo_url: string | null };
type FichierPhoto = { name: string; tokens: Set<string> };

async function listerPhotos(): Promise<FichierPhoto[]> {
  const out: FichierPhoto[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(PREFIX, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Listing storage: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const f of data) {
      // ignore les "dossiers" (id null) et non-images
      if (f.id && IMAGE_EXT.test(f.name)) {
        out.push({ name: f.name, tokens: new Set(tokens(f.name)) });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function listerMembres(): Promise<Membre[]> {
  const { data, error } = await supabase
    .from("membres")
    .select("id, prenom, nom, photo_url")
    .order("nom", { ascending: true });
  if (error) throw new Error(`Lecture membres: ${error.message}`);
  return (data ?? []) as Membre[];
}

/** tous les mots (prénom + nom) du membre sont-ils dans le nom de fichier ? */
function correspond(membre: Membre, fichier: FichierPhoto): boolean {
  const mots = [...tokens(membre.prenom), ...tokens(membre.nom)];
  if (mots.length === 0) return false;
  return mots.every((m) => fichier.tokens.has(m));
}

async function main() {
  console.log(`📂 Bucket "${BUCKET}", dossier "${PREFIX}/"`);
  console.log(`🔧 Mode : ${APPLY ? "APPLICATION (écriture)" : "APERÇU (aucune écriture)"}`);
  if (FORCE) console.log("⚠️  --force : les photo_url existantes seront écrasées.");
  console.log("");

  const [photos, membres] = await Promise.all([listerPhotos(), listerMembres()]);
  console.log(`→ ${photos.length} photo(s) trouvée(s), ${membres.length} membre(s).\n`);

  if (photos.length === 0) {
    console.error(
      "Aucune photo listée. Vérifiez le nom du dossier (--prefix=) et que les fichiers sont bien dans avatars/" +
        PREFIX +
        "/",
    );
    return;
  }

  const assignations: { membre: Membre; fichier: FichierPhoto }[] = [];
  const ambigusMembre: { membre: Membre; fichiers: FichierPhoto[] }[] = [];
  const membresSansPhoto: Membre[] = [];
  const fichierVersMembres = new Map<string, Membre[]>();

  for (const membre of membres) {
    const candidats = photos.filter((f) => correspond(membre, f));
    if (candidats.length === 1) {
      assignations.push({ membre, fichier: candidats[0] });
      const k = candidats[0].name;
      fichierVersMembres.set(k, [...(fichierVersMembres.get(k) ?? []), membre]);
    } else if (candidats.length > 1) {
      ambigusMembre.push({ membre, fichiers: candidats });
    } else {
      membresSansPhoto.push(membre);
    }
  }

  // conflits : un même fichier réclamé par plusieurs membres
  const conflitsFichier = [...fichierVersMembres.entries()].filter(([, ms]) => ms.length > 1);
  const fichiersUtilises = new Set(assignations.map((a) => a.fichier.name));
  const photosOrphelines = photos.filter((p) => !fichiersUtilises.has(p.name));

  // ---- rapport ----
  const nom = (m: Membre) => `${m.prenom} ${m.nom}`.trim();

  console.log("✅ Correspondances trouvées :");
  for (const a of assignations) {
    const deja = a.membre.photo_url ? "  (photo_url déjà présente)" : "";
    console.log(`   • ${nom(a.membre).padEnd(32)} ← ${a.fichier.name}${deja}`);
  }
  console.log("");

  if (ambigusMembre.length) {
    console.log("⚠️  Membres avec plusieurs photos candidates (ignorés) :");
    for (const a of ambigusMembre)
      console.log(`   • ${nom(a.membre)} → ${a.fichiers.map((f) => f.name).join(", ")}`);
    console.log("");
  }
  if (conflitsFichier.length) {
    console.log("⚠️  Photos réclamées par plusieurs membres (ignorées) :");
    for (const [f, ms] of conflitsFichier)
      console.log(`   • ${f} → ${ms.map(nom).join(", ")}`);
    console.log("");
  }
  if (membresSansPhoto.length) {
    console.log("ℹ️  Membres sans photo correspondante :");
    console.log("   " + membresSansPhoto.map(nom).join(", "));
    console.log("");
  }
  if (photosOrphelines.length) {
    console.log("ℹ️  Photos non attribuées (aucun membre correspondant) :");
    console.log("   " + photosOrphelines.map((p) => p.name).join(", "));
    console.log("");
  }

  // exclut les fichiers en conflit des écritures
  const fichiersEnConflit = new Set(conflitsFichier.map(([f]) => f));
  let aEcrire = assignations.filter((a) => !fichiersEnConflit.has(a.fichier.name));
  if (!FORCE) aEcrire = aEcrire.filter((a) => !a.membre.photo_url);

  console.log(
    `📝 ${aEcrire.length} mise(s) à jour ${APPLY ? "à effectuer" : "seraient effectuées"} ` +
      `(sur ${assignations.length} correspondance(s)).`,
  );

  if (!APPLY) {
    console.log("\n👉 Aperçu uniquement. Relancez avec --apply pour écrire les photo_url.");
    return;
  }

  let ok = 0;
  for (const a of aEcrire) {
    const chemin = `${PREFIX}/${a.fichier.name}`;
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(chemin, DUREE_URL);
    if (signErr || !signed) {
      console.error(`   ✗ ${nom(a.membre)} : URL signée échouée (${signErr?.message})`);
      continue;
    }
    const { error: upErr } = await supabase
      .from("membres")
      .update({ photo_url: signed.signedUrl })
      .eq("id", a.membre.id);
    if (upErr) {
      console.error(`   ✗ ${nom(a.membre)} : update échoué (${upErr.message})`);
      continue;
    }
    ok++;
    console.log(`   ✓ ${nom(a.membre)}`);
  }
  console.log(`\n✅ Terminé : ${ok}/${aEcrire.length} photo_url mises à jour.`);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
