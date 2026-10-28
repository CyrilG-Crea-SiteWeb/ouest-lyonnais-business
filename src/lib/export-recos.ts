/**
 * Export Excel enrichi de la page Recommandations (classeur 6 feuilles) :
 * Synthèse · Détail · Recos qui → qui · CA qui → qui · Par mois · Par réunion.
 *
 * Les feuilles d'agrégats contiennent des formules (COUNTIFS / SUMIFS) qui
 * pointent vers la feuille « Détail » : si le bureau corrige une ligne du
 * détail, tout se recalcule. Chaque formule est écrite avec son résultat
 * pré-calculé en JS pour que les aperçus mobiles (qui ne recalculent pas)
 * affichent les bons chiffres.
 *
 * exceljs est importé dynamiquement (SheetJS Community n'écrit pas les styles).
 */
import { format } from "date-fns";
import type { Cell, Worksheet } from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { fetchAll, fetchAllIn } from "@/lib/supabase-fetch-all";

export type TypeReco = Database["public"]["Enums"]["type_recommandation"];

export const TYPE_RECO_LABEL: Record<TypeReco, string> = {
  tete_a_tete: "Tête-à-tête",
  reco_interne: "Reco interne",
  reco_externe: "Reco externe",
  merci_business: "Merci pour le business",
};

export type ExportRecosOptions = {
  /** Semaines de la période choisie ; null = toutes les semaines. */
  semaineIds: number[] | null;
  /** Membre déclarant OU concerné ; null = tous. */
  membreId: string | null;
  type: TypeReco | null;
  /** Ex. « Année OLB 2026-2027 » (affiché en tête de la Synthèse). */
  periodeLibelle: string;
  /** Ex. « aucun » ou « Membre : … · Type : … ». */
  filtresLibelle: string;
  /** Portion du nom de fichier, ex. « annee-OLB-2026-2027 ». */
  filenameSlug: string;
};

// --- Charte -------------------------------------------------------------------

const FONT = "Arial";
const COUL = {
  teal: "FF006875",
  tealFonce: "FF00424A",
  orange: "FFF6A000",
  gris: "FF5F6B6D",
  blanc: "FFFFFFFF",
  ligneAlt: "FFF3F8F9",
  bordure: "FFD0D7D9",
  diagonale: "FFE6E6E6",
  colTotal: "FFE6F0F1",
  barreTeal: "FF7FB8C0",
  barreOrange: "FFFBD27F",
  echelleTeal: "FF5FA3AD",
};
const COUL_TYPE: Record<TypeReco, string> = {
  reco_interne: "FFEAD1DC",
  reco_externe: "FFF4E1E8",
  tete_a_tete: "FFCFE2F3",
  merci_business: "FFD9EAD3",
};
const FMT_NB = "0;\\-0;\\-";
const FMT_EUR = '#,##0" €";\\-#,##0" €";\\-';
const FMT_EUR_MATRICE = '#,##0;\\-#,##0;""';
const FMT_DATE = "dd/mm/yyyy";
const FMT_MOIS = "mmmm yyyy";

const F_DETAIL = "Détail";
const F_REUNION = "Par réunion";

type Style = {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  fill?: string;
  numFmt?: string;
  align?: "left" | "center";
  wrap?: boolean;
  rotation?: number;
  bordure?: boolean;
};

function styler(cell: Cell, s: Style = {}) {
  cell.font = {
    name: FONT,
    size: s.size ?? 10,
    bold: s.bold,
    italic: s.italic,
    color: s.color ? { argb: s.color } : undefined,
  };
  if (s.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.fill } };
  if (s.numFmt) cell.numFmt = s.numFmt;
  if (s.align || s.wrap || s.rotation) {
    cell.alignment = {
      horizontal: s.align,
      vertical: "middle",
      wrapText: s.wrap,
      textRotation: s.rotation,
    };
  }
  if (s.bordure) cell.border = { bottom: { style: "thin", color: { argb: COUL.bordure } } };
}

function ecrire(ws: Worksheet, adresse: string, valeur: Cell["value"], s?: Style) {
  const cell = ws.getCell(adresse);
  cell.value = valeur;
  styler(cell, s);
  return cell;
}

const STYLE_ENTETE: Style = {
  bold: true,
  color: COUL.blanc,
  fill: COUL.teal,
  align: "center",
  wrap: true,
};
const STYLE_TOTAL: Style = { bold: true, color: COUL.blanc, fill: COUL.tealFonce };

function titre(ws: Worksheet, texte: string, sousTitre: string) {
  ecrire(ws, "A1", texte, { size: 16, bold: true, color: COUL.teal });
  ws.getRow(1).height = 19.7;
  ecrire(ws, "A2", sousTitre, { italic: true, color: COUL.gris });
}

const col = (ws: Worksheet, n: number) => ws.getColumn(n).letter;
// Résultat arrondi au centime pour éviter le bruit des flottants (383124.3899999…).
const f = (formula: string, result: number | Date) =>
  ({
    formula,
    result: typeof result === "number" ? Math.round(result * 100) / 100 : result,
  }) as Cell["value"];

// --- Dates (AAAA-MM-JJ, sans fuseau) -----------------------------------------

/** Date « calendaire » en UTC : exceljs convertit les Date en série Excel via UTC. */
const isoVersDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const isoVersFr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const moisSuivant = (cle: string) => {
  const [y, m] = cle.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

// --- 1. Récupération Supabase ------------------------------------------------

type SemaineRow = {
  id: number;
  libelle: string;
  date_debut: string;
  date_fin: string;
  sans_reunion: boolean;
};
type MembreRow = { id: string; prenom: string; nom: string; statut: string };
type RecoRow = {
  id: number;
  type: TypeReco;
  membre_id: string;
  membre_cible_id: string | null;
  contact_externe: string | null;
  montant: number | null;
  notes: string | null;
  semaine_id: number;
  created_at: string;
};

const RECO_COLS =
  "id, type, membre_id, membre_cible_id, contact_externe, montant, notes, semaine_id, created_at";

async function recupererDonnees(opts: ExportRecosOptions) {
  const [semaines, membres] = await Promise.all([
    fetchAll<SemaineRow>((from, to) =>
      supabase
        .from("semaines")
        .select("id, libelle, date_debut, date_fin, sans_reunion")
        .order("id")
        .range(from, to),
    ),
    // Tous les membres, inactifs compris (anciens membres présents dans l'historique).
    fetchAll<MembreRow>((from, to) =>
      supabase.from("membres").select("id, prenom, nom, statut").order("id").range(from, to),
    ),
  ]);

  const requeteRecos = () => {
    const q = supabase.from("recommandations").select(RECO_COLS);
    return opts.type ? q.eq("type", opts.type) : q;
  };
  const recos = opts.semaineIds
    ? await fetchAllIn<RecoRow, number>(opts.semaineIds, (ids, from, to) =>
        requeteRecos().in("semaine_id", ids).order("id").range(from, to),
      )
    : await fetchAll<RecoRow>((from, to) => requeteRecos().order("id").range(from, to));

  // Tête-à-tête : une ligne par participant.
  const teteIds = recos.filter((r) => r.type === "tete_a_tete").map((r) => r.id);
  const participantsRows = await fetchAllIn<
    { recommandation_id: number; membre_id: string },
    number
  >(teteIds, (ids, from, to) =>
    supabase
      .from("reco_participants")
      .select("recommandation_id, membre_id")
      .in("recommandation_id", ids)
      .order("recommandation_id")
      .order("membre_id")
      .range(from, to),
  );
  const participants = new Map<number, string[]>();
  participantsRows.forEach((p) => {
    const arr = participants.get(p.recommandation_id) ?? [];
    arr.push(p.membre_id);
    participants.set(p.recommandation_id, arr);
  });

  return { semaines, membres, recos, participants };
}

// --- 2. Lignes « Détail » normalisées ----------------------------------------

type LigneDetail = {
  /** semaines.date_fin (jeudi de la réunion), AAAA-MM-JJ. */
  date: string;
  semaineId: number;
  type: TypeReco;
  declarantId: string;
  concerneId: string | null;
  contact: string;
  montant: number | null;
  notes: string;
};

const nomAffiche = (m?: MembreRow) =>
  m ? [m.prenom, (m.nom ?? "").toUpperCase()].filter(Boolean).join(" ") : "(membre inconnu)";

function construireLignes(
  donnees: Awaited<ReturnType<typeof recupererDonnees>>,
  opts: ExportRecosOptions,
  nom: (id: string | null) => string,
) {
  const semaineParId = new Map(donnees.semaines.map((s) => [s.id, s]));
  const lignes: LigneDetail[] = donnees.recos.flatMap((r) => {
    const base: LigneDetail = {
      // Règle : une reco annoncée le jeudi J est rattachée à la semaine dont date_fin = J.
      date: semaineParId.get(r.semaine_id)?.date_fin ?? r.created_at.slice(0, 10),
      semaineId: r.semaine_id,
      type: r.type,
      declarantId: r.membre_id,
      concerneId: r.membre_cible_id,
      contact: r.contact_externe ?? "",
      montant: r.montant == null ? null : Number(r.montant),
      notes: r.notes ?? "",
    };
    const parts = r.type === "tete_a_tete" ? donnees.participants.get(r.id) : undefined;
    return parts?.length ? parts.map((pid) => ({ ...base, concerneId: pid })) : [base];
  });

  const filtrees = opts.membreId
    ? lignes.filter((l) => l.declarantId === opts.membreId || l.concerneId === opts.membreId)
    : lignes;

  return filtrees.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      TYPE_RECO_LABEL[a.type].localeCompare(TYPE_RECO_LABEL[b.type], "fr") ||
      nom(a.declarantId).localeCompare(nom(b.declarantId), "fr"),
  );
}

// --- 3. Agrégations -----------------------------------------------------------

const estReco = (t: TypeReco) => t === "reco_interne" || t === "reco_externe";

type StatsMembre = {
  recosDonnees: number;
  dontExternes: number;
  recosRecues: number;
  tete: number;
  mercisRecus: number;
  caApporte: number;
  mercisDonnes: number;
  caRecu: number;
};

type StatsPeriode = {
  recos: number;
  externes: number;
  tete: number;
  mercis: number;
  ca: number;
};
const statsVides = (): StatsPeriode => ({ recos: 0, externes: 0, tete: 0, mercis: 0, ca: 0 });
function cumuler(s: StatsPeriode, l: LigneDetail) {
  if (estReco(l.type)) s.recos++;
  if (l.type === "reco_externe") s.externes++;
  if (l.type === "tete_a_tete") s.tete++;
  if (l.type === "merci_business") {
    s.mercis++;
    s.ca += l.montant ?? 0;
  }
}

function agreger(
  lignes: LigneDetail[],
  donnees: Awaited<ReturnType<typeof recupererDonnees>>,
  opts: ExportRecosOptions,
) {
  // Membres : ceux qui apparaissent dans le détail + (sans filtre membre) tous les actifs.
  const ids = new Set<string>();
  lignes.forEach((l) => {
    ids.add(l.declarantId);
    if (l.concerneId) ids.add(l.concerneId);
  });
  if (!opts.membreId)
    donnees.membres.filter((m) => m.statut === "actif").forEach((m) => ids.add(m.id));
  const membreParId = new Map(donnees.membres.map((m) => [m.id, m]));
  const membres = Array.from(ids).sort((a, b) => {
    const ma = membreParId.get(a);
    const mb = membreParId.get(b);
    return (
      // Sans nom de famille (ex. « Marion »), le prénom sert de clé de tri.
      (ma?.nom || ma?.prenom || "").localeCompare(mb?.nom || mb?.prenom || "", "fr", {
        sensitivity: "base",
      }) || (ma?.prenom ?? "").localeCompare(mb?.prenom ?? "", "fr", { sensitivity: "base" })
    );
  });

  const stats = new Map<string, StatsMembre>(
    membres.map((id) => [
      id,
      {
        recosDonnees: 0,
        dontExternes: 0,
        recosRecues: 0,
        tete: 0,
        mercisRecus: 0,
        caApporte: 0,
        mercisDonnes: 0,
        caRecu: 0,
      },
    ]),
  );
  // matriceRecos[donneur][receveur] ; matriceCa[remercié][déclarant du merci]
  const matriceRecos = new Map<string, Map<string, number>>();
  const matriceCa = new Map<string, Map<string, number>>();
  const ajouter = (m: Map<string, Map<string, number>>, a: string, b: string, v: number) => {
    const ligne = m.get(a) ?? new Map<string, number>();
    ligne.set(b, (ligne.get(b) ?? 0) + v);
    m.set(a, ligne);
  };

  const parDate = new Map<string, StatsPeriode>();
  const parMois = new Map<string, StatsPeriode>();
  const total = statsVides();

  lignes.forEach((l) => {
    const decl = stats.get(l.declarantId)!;
    const conc = l.concerneId ? stats.get(l.concerneId) : undefined;
    const montant = l.montant ?? 0;
    if (estReco(l.type)) decl.recosDonnees++;
    if (l.type === "reco_externe") decl.dontExternes++;
    if (l.type === "reco_interne" && conc) {
      conc.recosRecues++;
      ajouter(matriceRecos, l.declarantId, l.concerneId!, 1);
    }
    if (l.type === "tete_a_tete") decl.tete++;
    if (l.type === "merci_business") {
      decl.mercisDonnes++;
      decl.caRecu += montant;
      if (conc) {
        conc.mercisRecus++;
        conc.caApporte += montant;
        ajouter(matriceCa, l.concerneId!, l.declarantId, montant);
      }
    }
    for (const [map, cle] of [
      [parDate, l.date],
      [parMois, l.date.slice(0, 7)],
    ] as const) {
      const s = map.get(cle) ?? statsVides();
      cumuler(s, l);
      map.set(cle, s);
    }
    cumuler(total, l);
  });

  // Semaines de la période : celles de la portée jusqu'à aujourd'hui (+ toute
  // semaine ayant de l'activité), triées par date de réunion.
  const aujourdHui = format(new Date(), "yyyy-MM-dd");
  const portee = opts.semaineIds ? new Set(opts.semaineIds) : null;
  const semainesActives = new Set(lignes.map((l) => l.semaineId));
  const semaines = donnees.semaines
    .filter((s) => !portee || portee.has(s.id))
    .filter((s) => s.date_fin <= aujourdHui || semainesActives.has(s.id))
    .sort((a, b) => a.date_fin.localeCompare(b.date_fin));

  // Mois : du premier au dernier mois de la période, mois sans réunion inclus.
  const mois: { cle: string; reunions: number }[] = [];
  if (semaines.length) {
    const fin = semaines[semaines.length - 1].date_fin.slice(0, 7);
    for (let cle = semaines[0].date_fin.slice(0, 7); cle <= fin; cle = moisSuivant(cle)) {
      mois.push({
        cle,
        reunions: semaines.filter((s) => !s.sans_reunion && s.date_fin.startsWith(cle)).length,
      });
    }
  }
  const nbReunions = semaines.filter((s) => !s.sans_reunion).length;

  return {
    membres,
    stats,
    matriceRecos,
    matriceCa,
    parDate,
    parMois,
    total,
    semaines,
    mois,
    nbReunions,
  };
}

// --- 4. Écriture exceljs -----------------------------------------------------

export async function exportRecommandationsClasseur(opts: ExportRecosOptions): Promise<number> {
  const donnees = await recupererDonnees(opts);
  const membreParId = new Map(donnees.membres.map((m) => [m.id, m]));
  const nom = (id: string | null) => (id ? nomAffiche(membreParId.get(id)) : "");

  const lignes = construireLignes(donnees, opts, nom);
  if (!lignes.length) return 0;
  const agg = agreger(lignes, donnees, opts);

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "OLB";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  const vue = (xSplit: number, ySplit: number, grille = false) => [
    { state: "frozen" as const, xSplit, ySplit, showGridLines: grille },
  ];
  const wsSynth = wb.addWorksheet("Synthèse", {
    properties: { tabColor: { argb: COUL.teal } },
    views: vue(1, 8),
  });
  const wsDetail = wb.addWorksheet(F_DETAIL, {
    properties: { tabColor: { argb: COUL.teal } },
    views: vue(0, 1, true),
  });
  const wsRecos = wb.addWorksheet("Recos qui → qui", {
    properties: { tabColor: { argb: COUL.orange } },
    views: vue(1, 4),
  });
  const wsCa = wb.addWorksheet("CA qui → qui", {
    properties: { tabColor: { argb: COUL.orange } },
    views: vue(1, 4),
  });
  const wsMois = wb.addWorksheet("Par mois", {
    properties: { tabColor: { argb: COUL.orange } },
    views: vue(0, 3),
  });
  const wsReunion = wb.addWorksheet(F_REUNION, {
    properties: { tabColor: { argb: COUL.orange } },
    views: vue(0, 3),
  });

  // Plages de la feuille Détail (et Par réunion) utilisées par les formules.
  const derDetail = lignes.length + 1;
  const D = (c: string) => `'${F_DETAIL}'!$${c}$2:$${c}$${derDetail}`;
  const derReunion = Math.max(agg.semaines.length + 3, 4);
  const R = (c: string) => `'${F_REUNION}'!$${c}$4:$${c}$${derReunion}`;

  // ---------- Détail ----------
  const entetesDetail = [
    "Date réunion",
    "Mois",
    "Type",
    "Déclarant",
    "Membre concerné",
    "Contact externe",
    "Montant (€)",
    "Notes",
  ];
  [13, 15, 22, 24, 24, 22, 13, 40].forEach((w, i) => (wsDetail.getColumn(i + 1).width = w));
  entetesDetail.forEach((h, i) => ecrire(wsDetail, `${col(wsDetail, i + 1)}1`, h, STYLE_ENTETE));
  wsDetail.getRow(1).height = 31.5;
  lignes.forEach((l, i) => {
    const r = i + 2;
    ecrire(wsDetail, `A${r}`, isoVersDate(l.date), { numFmt: FMT_DATE });
    ecrire(
      wsDetail,
      `B${r}`,
      f(`DATE(YEAR(A${r}),MONTH(A${r}),1)`, isoVersDate(`${l.date.slice(0, 7)}-01`)),
      { numFmt: FMT_MOIS },
    );
    ecrire(wsDetail, `C${r}`, TYPE_RECO_LABEL[l.type], { fill: COUL_TYPE[l.type] });
    ecrire(wsDetail, `D${r}`, nom(l.declarantId));
    ecrire(wsDetail, `E${r}`, nom(l.concerneId));
    ecrire(wsDetail, `F${r}`, l.contact);
    ecrire(wsDetail, `G${r}`, l.montant, { numFmt: FMT_EUR });
    ecrire(wsDetail, `H${r}`, l.notes);
  });
  wsDetail.autoFilter = `A1:H${derDetail}`;

  // ---------- Synthèse ----------
  const debut = agg.semaines[0]?.date_fin;
  const fin = agg.semaines[agg.semaines.length - 1]?.date_fin;
  const bornes =
    debut && fin
      ? debut.slice(0, 4) === fin.slice(0, 4)
        ? ` (${isoVersFr(debut).slice(0, 5)} → ${isoVersFr(fin)})`
        : ` (${isoVersFr(debut)} → ${isoVersFr(fin)})`
      : "";
  titre(
    wsSynth,
    "OLB · Recommandations — Synthèse",
    `Période : ${opts.periodeLibelle}${bornes} · Filtres : ${opts.filtresLibelle} · ` +
      `Généré le ${format(new Date(), "dd/MM/yyyy")} depuis l'appli OLB`,
  );
  [26, 12, 11, 12, 11, 12, 16, 12, 16, 13].forEach((w, i) => (wsSynth.getColumn(i + 1).width = w));

  const kpis: [string, string, Cell["value"], string?][] = [
    ["A", "Recos données", f(`COUNTIFS(${D("C")},"Reco*")`, agg.total.recos)],
    ["C", "Tête-à-tête", f(`COUNTIFS(${D("C")},"Tête-à-tête")`, agg.total.tete)],
    ["E", "Mercis pour le business", f(`COUNTIFS(${D("C")},"Merci*")`, agg.total.mercis)],
    ["G", "CA généré (€)", f(`SUMIFS(${D("G")},${D("C")},"Merci*")`, agg.total.ca), COUL.orange],
    ["I", "Réunions", f(`COUNTIFS(${R("I")},"")`, agg.nbReunions)],
  ];
  kpis.forEach(([c, label, valeur, couleur]) => {
    ecrire(wsSynth, `${c}4`, label, { size: 9, bold: true, color: COUL.gris });
    ecrire(wsSynth, `${c}5`, valeur, {
      size: 18,
      bold: true,
      color: couleur ?? COUL.tealFonce,
      numFmt: c === "G" ? FMT_EUR : FMT_NB,
      align: "left",
    });
  });
  wsSynth.getRow(5).height = 22.05;
  ecrire(wsSynth, "G7", "Ce que le membre a fait gagner", {
    size: 8,
    italic: true,
    color: COUL.gris,
  });
  ecrire(wsSynth, "I7", "Ce que le groupe lui a fait gagner", {
    size: 8,
    italic: true,
    color: COUL.gris,
  });

  [
    "Membre",
    "Recos données",
    "dont externes",
    "Recos reçues",
    "Tête-à-tête",
    "Mercis reçus\n(nb)",
    "CA apporté aux autres (€)",
    "Mercis donnés\n(nb)",
    "CA reçu du groupe (€)",
    "Total déclarations",
  ].forEach((h, i) => ecrire(wsSynth, `${col(wsSynth, i + 1)}8`, h, STYLE_ENTETE));
  wsSynth.getRow(8).height = 42;

  const premSynth = 9;
  const derSynth = premSynth + agg.membres.length - 1;
  agg.membres.forEach((id, i) => {
    const r = premSynth + i;
    const s = agg.stats.get(id)!;
    const fond = i % 2 === 1 ? COUL.ligneAlt : undefined;
    const nb: Style = { numFmt: FMT_NB, align: "center", fill: fond, bordure: true };
    const eur: Style = { ...nb, numFmt: FMT_EUR };
    ecrire(wsSynth, `A${r}`, nom(id), { bold: true, fill: fond, bordure: true });
    const cnt = (colDetail: string, crit: string) =>
      `COUNTIFS(${D(colDetail)},$A${r},${D("C")},"${crit}")`;
    ecrire(wsSynth, `B${r}`, f(cnt("D", "Reco*"), s.recosDonnees), nb);
    ecrire(wsSynth, `C${r}`, f(cnt("D", "Reco externe"), s.dontExternes), nb);
    ecrire(wsSynth, `D${r}`, f(cnt("E", "Reco interne"), s.recosRecues), nb);
    ecrire(wsSynth, `E${r}`, f(cnt("D", "Tête-à-tête"), s.tete), nb);
    ecrire(wsSynth, `F${r}`, f(cnt("E", "Merci*"), s.mercisRecus), nb);
    ecrire(
      wsSynth,
      `G${r}`,
      f(`SUMIFS(${D("G")},${D("E")},$A${r},${D("C")},"Merci*")`, s.caApporte),
      eur,
    );
    ecrire(wsSynth, `H${r}`, f(cnt("D", "Merci*"), s.mercisDonnes), nb);
    ecrire(
      wsSynth,
      `I${r}`,
      f(`SUMIFS(${D("G")},${D("D")},$A${r},${D("C")},"Merci*")`, s.caRecu),
      eur,
    );
    ecrire(wsSynth, `J${r}`, f(`B${r}+E${r}+H${r}`, s.recosDonnees + s.tete + s.mercisDonnes), nb);
  });

  const rTotal = derSynth + 1;
  ecrire(wsSynth, `A${rTotal}`, "TOTAL GROUPE", { ...STYLE_TOTAL, align: "left" });
  const somme = (k: keyof StatsMembre) =>
    agg.membres.reduce((acc, id) => acc + agg.stats.get(id)![k], 0);
  const totaux: [string, number, string][] = [
    ["B", somme("recosDonnees"), FMT_NB],
    ["C", somme("dontExternes"), FMT_NB],
    ["D", somme("recosRecues"), FMT_NB],
    ["E", somme("tete"), FMT_NB],
    ["F", somme("mercisRecus"), FMT_NB],
    ["G", somme("caApporte"), FMT_EUR],
    ["H", somme("mercisDonnes"), FMT_NB],
    ["I", somme("caRecu"), FMT_EUR],
    ["J", somme("recosDonnees") + somme("tete") + somme("mercisDonnes"), FMT_NB],
  ];
  totaux.forEach(([c, v, fmt]) =>
    ecrire(wsSynth, `${c}${rTotal}`, f(`SUM(${c}${premSynth}:${c}${derSynth})`, v), {
      ...STYLE_TOTAL,
      numFmt: fmt,
      align: "center",
    }),
  );
  wsSynth.autoFilter = `A8:J${derSynth}`;

  const barres: [string, string][] = [
    ["B", COUL.barreTeal],
    ["D", COUL.barreTeal],
    ["E", COUL.barreTeal],
    ["G", COUL.barreOrange],
    ["I", COUL.barreOrange],
  ];
  barres.forEach(([c, couleur]) =>
    wsSynth.addConditionalFormatting({
      ref: `${c}${premSynth}:${c}${derSynth}`,
      rules: [
        // `color` est géré par exceljs mais absent de ses typages.
        {
          type: "dataBar",
          priority: 1,
          gradient: false,
          cfvo: [{ type: "min" }, { type: "max" }],
          color: { argb: couleur },
        } as never,
      ],
    }),
  );

  const lecture = [
    "• Recos données / reçues : recommandations internes entre membres (externes = vers un contact hors groupe, comptées dans « données » uniquement).",
    "• Tête-à-tête : chaque membre déclare les siens (pas de double crédit automatique).",
    "• CA apporté = montants des « merci pour le business » où le membre est remercié. CA reçu = montants qu'il a déclarés en remerciant les autres.",
    "• Total déclarations = recos données + tête-à-tête + mercis donnés. Tous les chiffres se recalculent à partir de la feuille « Détail ».",
  ];
  ecrire(wsSynth, `A${rTotal + 2}`, "Lecture :", { size: 9, bold: true, color: COUL.gris });
  lecture.forEach((t, i) =>
    ecrire(wsSynth, `A${rTotal + 3 + i}`, t, { size: 9, italic: true, color: COUL.gris }),
  );

  // ---------- Matrices ----------
  const ecrireMatrice = (
    ws: Worksheet,
    cfg: {
      titre: string;
      sousTitre: string;
      valeurs: Map<string, Map<string, number>>;
      formule: (r: number, c: string) => string;
      numFmt: string;
      couleurMax: string;
    },
  ) => {
    titre(ws, cfg.titre, cfg.sousTitre);
    const n = agg.membres.length;
    const derLigne = 4 + n;
    const colTotal = n + 2;
    const lTotal = col(ws, colTotal);
    const lDer = col(ws, n + 1);
    ws.getColumn(1).width = 24;
    for (let j = 2; j <= n + 1; j++) ws.getColumn(j).width = 6.51;
    ws.getColumn(colTotal).width = 10;
    ws.getRow(4).height = 120;

    ecrire(ws, "A4", "↓ de  /  à →", { size: 9, bold: true, color: COUL.blanc, fill: COUL.teal });
    agg.membres.forEach((id, j) =>
      ecrire(ws, `${col(ws, j + 2)}4`, nom(id), {
        size: 8,
        bold: true,
        color: COUL.blanc,
        fill: COUL.teal,
        align: "center",
        rotation: 90,
      }),
    );
    ecrire(ws, `${lTotal}4`, "TOTAL", {
      size: 9,
      bold: true,
      color: COUL.blanc,
      fill: COUL.tealFonce,
      align: "center",
      rotation: 90,
    });

    const totauxCol = new Array<number>(n).fill(0);
    agg.membres.forEach((idLigne, i) => {
      const r = 5 + i;
      ecrire(ws, `A${r}`, nom(idLigne), { size: 9, bold: true });
      let totalLigne = 0;
      agg.membres.forEach((idCol, j) => {
        const v = cfg.valeurs.get(idLigne)?.get(idCol) ?? 0;
        totalLigne += v;
        totauxCol[j] += v;
        const c = col(ws, j + 2);
        ecrire(ws, `${c}${r}`, f(cfg.formule(r, c), v), {
          size: 9,
          numFmt: cfg.numFmt,
          align: "center",
          fill: i === j ? COUL.diagonale : undefined,
        });
      });
      ecrire(ws, `${lTotal}${r}`, f(`SUM(B${r}:${lDer}${r})`, totalLigne), {
        size: 9,
        bold: true,
        numFmt: cfg.numFmt,
        fill: COUL.colTotal,
      });
    });

    const rT = derLigne + 1;
    ecrire(ws, `A${rT}`, "TOTAL", { ...STYLE_TOTAL, size: 9 });
    totauxCol.forEach((v, j) => {
      const c = col(ws, j + 2);
      ecrire(ws, `${c}${rT}`, f(`SUM(${c}5:${c}${derLigne})`, v), {
        ...STYLE_TOTAL,
        size: 9,
        numFmt: cfg.numFmt,
        align: "center",
      });
    });
    ecrire(
      ws,
      `${lTotal}${rT}`,
      f(
        `SUM(${lTotal}5:${lTotal}${derLigne})`,
        totauxCol.reduce((a, b) => a + b, 0),
      ),
      { ...STYLE_TOTAL, size: 9, numFmt: cfg.numFmt, align: "center" },
    );

    ws.addConditionalFormatting({
      ref: `B5:${lDer}${derLigne}`,
      rules: [
        {
          type: "colorScale",
          priority: 1,
          cfvo: [{ type: "min" }, { type: "max" }],
          color: [{ argb: COUL.blanc }, { argb: cfg.couleurMax }],
        },
      ],
    });
  };

  ecrireMatrice(wsRecos, {
    titre: "OLB · Recos qui → qui",
    sousTitre:
      "Ligne = membre qui donne la reco · Colonne = membre qui la reçoit · Recos internes uniquement",
    valeurs: agg.matriceRecos,
    formule: (r, c) => `COUNTIFS(${D("D")},$A${r},${D("E")},${c}$4,${D("C")},"Reco interne")`,
    numFmt: FMT_NB,
    couleurMax: COUL.echelleTeal,
  });
  ecrireMatrice(wsCa, {
    titre: "OLB · CA qui → qui",
    sousTitre:
      "Ligne = membre qui a apporté le CA (remercié) · Colonne = membre qui l'a reçu (déclarant du merci) · en €",
    valeurs: agg.matriceCa,
    formule: (r, c) => `SUMIFS(${D("G")},${D("E")},$A${r},${D("D")},${c}$4,${D("C")},"Merci*")`,
    numFmt: FMT_EUR_MATRICE,
    couleurMax: COUL.orange,
  });

  // ---------- Par réunion ----------
  titre(wsReunion, "OLB · Activité par réunion", "Une ligne par réunion du jeudi (semaine OLB)");
  [14, 16, 10, 11, 11, 10, 15, 15, 14].forEach((w, i) => (wsReunion.getColumn(i + 1).width = w));
  [
    "Date réunion",
    "Mois",
    "Recos",
    "dont externes",
    "Tête-à-tête",
    "Mercis",
    "CA généré (€)",
    "CA cumulé (€)",
    "Remarque",
  ].forEach((h, i) => ecrire(wsReunion, `${col(wsReunion, i + 1)}3`, h, STYLE_ENTETE));
  wsReunion.getRow(3).height = 31.5;
  let cumul = 0;
  agg.semaines.forEach((sem, i) => {
    const r = 4 + i;
    const s = agg.parDate.get(sem.date_fin) ?? statsVides();
    cumul += s.ca;
    const base: Style = {
      bordure: true,
      italic: sem.sans_reunion,
      color: sem.sans_reunion ? COUL.gris : undefined,
    };
    const nb: Style = { ...base, numFmt: FMT_NB, align: "center" };
    const eur: Style = { ...nb, numFmt: FMT_EUR };
    const cnt = (crit: string) => `COUNTIFS(${D("A")},$A${r},${D("C")},"${crit}")`;
    ecrire(wsReunion, `A${r}`, isoVersDate(sem.date_fin), { ...base, numFmt: FMT_DATE });
    ecrire(
      wsReunion,
      `B${r}`,
      f(`DATE(YEAR(A${r}),MONTH(A${r}),1)`, isoVersDate(`${sem.date_fin.slice(0, 7)}-01`)),
      { ...base, numFmt: FMT_MOIS },
    );
    ecrire(wsReunion, `C${r}`, f(cnt("Reco*"), s.recos), nb);
    ecrire(wsReunion, `D${r}`, f(cnt("Reco externe"), s.externes), nb);
    ecrire(wsReunion, `E${r}`, f(cnt("Tête-à-tête"), s.tete), nb);
    ecrire(wsReunion, `F${r}`, f(cnt("Merci*"), s.mercis), nb);
    ecrire(
      wsReunion,
      `G${r}`,
      f(`SUMIFS(${D("G")},${D("A")},$A${r},${D("C")},"Merci*")`, s.ca),
      eur,
    );
    ecrire(wsReunion, `H${r}`, f(`SUM($G$4:G${r})`, cumul), eur);
    // « Sans réunion » : la semaine n'est pas comptée dans les réunions (Synthèse, Par mois).
    ecrire(wsReunion, `I${r}`, sem.sans_reunion ? "Sans réunion" : null, base);
  });

  // ---------- Par mois ----------
  titre(
    wsMois,
    "OLB · Activité par mois",
    "Mois de la réunion (date du jeudi) · moyennes par réunion",
  );
  [16, 10, 10, 12, 11, 10, 15, 15].forEach((w, i) => (wsMois.getColumn(i + 1).width = w));
  [
    "Mois",
    "Réunions",
    "Recos",
    "Recos / réunion",
    "Tête-à-tête",
    "Mercis",
    "CA généré (€)",
    "CA cumulé (€)",
  ].forEach((h, i) => ecrire(wsMois, `${col(wsMois, i + 1)}3`, h, STYLE_ENTETE));
  wsMois.getRow(3).height = 31.5;
  cumul = 0;
  const totMois = { reunions: 0, ...statsVides() };
  agg.mois.forEach((m, i) => {
    const r = 4 + i;
    const s = agg.parMois.get(m.cle) ?? statsVides();
    cumul += s.ca;
    totMois.reunions += m.reunions;
    totMois.recos += s.recos;
    totMois.tete += s.tete;
    totMois.mercis += s.mercis;
    totMois.ca += s.ca;
    const nb: Style = { numFmt: FMT_NB, align: "center", bordure: true };
    const eur: Style = { ...nb, numFmt: FMT_EUR };
    const cnt = (crit: string) => `COUNTIFS(${D("B")},$A${r},${D("C")},"${crit}")`;
    ecrire(wsMois, `A${r}`, isoVersDate(`${m.cle}-01`), { numFmt: FMT_MOIS, bordure: true });
    ecrire(wsMois, `B${r}`, f(`COUNTIFS(${R("B")},$A${r},${R("I")},"")`, m.reunions), nb);
    ecrire(wsMois, `C${r}`, f(cnt("Reco*"), s.recos), nb);
    ecrire(wsMois, `D${r}`, f(`IF(B${r}=0,0,C${r}/B${r})`, m.reunions ? s.recos / m.reunions : 0), {
      ...nb,
      numFmt: "0.0",
    });
    ecrire(wsMois, `E${r}`, f(cnt("Tête-à-tête"), s.tete), nb);
    ecrire(wsMois, `F${r}`, f(cnt("Merci*"), s.mercis), nb);
    ecrire(wsMois, `G${r}`, f(`SUMIFS(${D("G")},${D("B")},$A${r},${D("C")},"Merci*")`, s.ca), eur);
    ecrire(wsMois, `H${r}`, f(`SUM($G$4:G${r})`, cumul), eur);
  });
  const rTM = 4 + agg.mois.length;
  const derM = rTM - 1;
  const tot: Style = { ...STYLE_TOTAL, numFmt: FMT_NB, align: "center" };
  ecrire(wsMois, `A${rTM}`, "TOTAL", { ...STYLE_TOTAL, align: "left" });
  ecrire(wsMois, `B${rTM}`, f(`SUM(B4:B${derM})`, totMois.reunions), tot);
  ecrire(wsMois, `C${rTM}`, f(`SUM(C4:C${derM})`, totMois.recos), tot);
  ecrire(
    wsMois,
    `D${rTM}`,
    f(`IF(B${rTM}=0,0,C${rTM}/B${rTM})`, totMois.reunions ? totMois.recos / totMois.reunions : 0),
    { ...tot, numFmt: "0.0" },
  );
  ecrire(wsMois, `E${rTM}`, f(`SUM(E4:E${derM})`, totMois.tete), tot);
  ecrire(wsMois, `F${rTM}`, f(`SUM(F4:F${derM})`, totMois.mercis), tot);
  ecrire(wsMois, `G${rTM}`, f(`SUM(G4:G${derM})`, totMois.ca), { ...tot, numFmt: FMT_EUR });
  ecrire(wsMois, `H${rTM}`, null, STYLE_TOTAL);

  // ---------- Téléchargement ----------
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `OLB_Recommandations_${opts.filenameSlug}_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return lignes.length;
}
