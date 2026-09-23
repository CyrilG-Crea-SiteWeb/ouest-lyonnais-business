import { slugifierNom } from "@/lib/annuaire";

export type ContactVCard = {
  prenom: string;
  nom: string;
  entreprise: string | null;
  categorie: string | null;
  email: string | null;
  telephone: string | null;
  site_web: string | null;
  photo_url: string | null;
};

/** Échappe les caractères réservés d'une valeur vCard (RFC 2426). */
function echapper(valeur: string): string {
  return valeur
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Replie les lignes longues à 75 caractères (continuation = espace en début de ligne). */
function replier(ligne: string): string {
  if (ligne.length <= 75) return ligne;
  const morceaux = [ligne.slice(0, 75)];
  for (let i = 75; i < ligne.length; i += 74) morceaux.push(" " + ligne.slice(i, i + 74));
  return morceaux.join("\r\n");
}

/**
 * Récupère la photo en base64 pour l'intégrer à la fiche. Best-effort : si l'image
 * est inaccessible (CORS, format non pris en charge par les carnets, trop lourde),
 * la fiche est générée sans photo.
 */
async function photoEnBase64(url: string): Promise<{ type: string; data: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type === "image/png" ? "PNG" : blob.type === "image/jpeg" ? "JPEG" : null;
    if (!type || blob.size > 1_000_000) return null;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return data ? { type, data } : null;
  } catch {
    return null;
  }
}

export async function genererVCard(c: ContactVCard): Promise<string> {
  const lignes = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${echapper(c.nom)};${echapper(c.prenom)};;;`,
    `FN:${echapper(`${c.prenom} ${c.nom}`.trim())}`,
  ];
  if (c.entreprise) lignes.push(`ORG:${echapper(c.entreprise)}`);
  if (c.categorie) lignes.push(`TITLE:${echapper(c.categorie)}`);
  if (c.telephone) lignes.push(`TEL;TYPE=WORK,VOICE:${echapper(c.telephone)}`);
  if (c.email) lignes.push(`EMAIL;TYPE=INTERNET,WORK:${echapper(c.email)}`);
  if (c.site_web) lignes.push(`URL:${echapper(c.site_web)}`);
  lignes.push(`NOTE:${echapper("Membre du réseau Ouest Lyonnais Business (OLB)")}`);
  if (c.photo_url) {
    const photo = await photoEnBase64(c.photo_url);
    if (photo) lignes.push(`PHOTO;ENCODING=b;TYPE=${photo.type}:${photo.data}`);
  }
  lignes.push("END:VCARD");
  return lignes.map(replier).join("\r\n") + "\r\n";
}

/** Télécharge la fiche contact : sur mobile, le téléphone propose de l'ajouter aux contacts. */
export async function telechargerVCard(c: ContactVCard): Promise<void> {
  const contenu = await genererVCard(c);
  const blob = new Blob([contenu], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugifierNom(c.prenom, c.nom) || "contact"}.vcf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
