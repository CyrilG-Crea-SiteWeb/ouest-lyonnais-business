import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

const TYPE_LABEL: Record<string, string> = {
  tete_a_tete: "Tête-à-tête",
  reco_interne: "Reco interne",
  reco_externe: "Reco externe",
  merci_business: "Merci pour le business",
};

export type RecoExportRow = {
  id: number;
  type: string;
  membre_id: string;
  membre_cible_id: string | null;
  contact_externe: string | null;
  montant: number | null;
  valide: boolean;
  semaine_id: number;
  created_at: string;
};

export type MembreLookup = Record<
  string,
  { prenom: string; nom: string; entreprise: string | null }
>;
export type SemaineLookup = Record<number, { libelle: string; date_debut: string }>;

const fullName = (m?: { prenom: string; nom: string }) => (m ? `${m.prenom} ${m.nom}` : "");

export function exportRecommandationsXlsx(opts: {
  recos: RecoExportRow[];
  membres: MembreLookup;
  semaines: SemaineLookup;
  filename?: string;
}) {
  const rows = opts.recos.map((r) => ({
    Date: new Date(r.created_at).toLocaleDateString("fr-FR"),
    Semaine: opts.semaines[r.semaine_id]?.libelle ?? `#${r.semaine_id}`,
    Type: TYPE_LABEL[r.type] ?? r.type,
    Émetteur: fullName(opts.membres[r.membre_id]),
    "Entreprise émetteur": opts.membres[r.membre_id]?.entreprise ?? "",
    Destinataire: r.membre_cible_id
      ? fullName(opts.membres[r.membre_cible_id])
      : (r.contact_externe ?? ""),
    "Montant (€)": r.montant ?? "",
    Validé: r.type === "merci_business" ? (r.valide ? "Oui" : "Non") : "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 22 },
    { wch: 24 },
    { wch: 12 },
    { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recommandations");
  XLSX.writeFile(
    wb,
    opts.filename ?? `recommandations-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

// Lettre affichée dans la grille de détail selon le statut pointé.
// NULL (pas de ligne) ou 'absent' => "A".
const STATUT_LETTRE: Record<string, string> = {
  present: "P",
  excuse: "E",
  absent: "A",
};

/**
 * Export Excel des statistiques de présence sur une plage de dates.
 * Appelle les fonctions SQL stats_presence_periode / detail_presence_periode
 * et produit un classeur à 2 feuilles : "Synthèse" et "Détail" (grille pivotée).
 * @param debut date de début incluse, format AAAA-MM-JJ
 * @param fin   date de fin incluse, format AAAA-MM-JJ
 */
export async function exportPresencesXlsx(debut: string, fin: string) {
  const [synthRes, detailRes] = await Promise.all([
    supabase.rpc("stats_presence_periode", { p_debut: debut, p_fin: fin }),
    supabase.rpc("detail_presence_periode", { p_debut: debut, p_fin: fin }),
  ]);
  if (synthRes.error) throw synthRes.error;
  if (detailRes.error) throw detailRes.error;

  const synthese = synthRes.data ?? [];
  const detail = detailRes.data ?? [];

  // --- Feuille "Synthèse" -----------------------------------------------------
  const syntheseRows = synthese.map((r) => ({
    Prénom: r.prenom,
    Nom: r.nom,
    "Réunions dues": r.nb_reunions_dues,
    Présents: r.nb_present,
    Excusés: r.nb_excuse,
    Absents: r.nb_absent,
    "Taux de présence":
      r.taux_presence != null ? `${Math.round(Number(r.taux_presence) * 100)} %` : "—",
  }));
  const wsSynthese = XLSX.utils.json_to_sheet(syntheseRows);
  wsSynthese["!cols"] = [
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 16 },
  ];

  // --- Feuille "Détail" (pivot membre x semaine) ------------------------------
  // Colonnes = semaines distinctes de la période, triées par date croissante.
  const semainesMap = new Map<number, string>(); // semaine_id -> date_debut
  detail.forEach((d) => semainesMap.set(d.semaine_id, d.date_debut));
  const semaines = Array.from(semainesMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const jeudiLabel = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

  // Statut par couple membre/semaine.
  const cellMap = new Map<string, string>(); // `${membre_id}_${semaine_id}` -> lettre
  detail.forEach((d) => {
    cellMap.set(`${d.membre_id}_${d.semaine_id}`, STATUT_LETTRE[d.statut ?? "absent"] ?? "A");
  });

  // Membres dans l'ordre renvoyé par le SQL (tri nom, prénom).
  const membresOrdre: { id: string; label: string }[] = [];
  const vus = new Set<string>();
  detail.forEach((d) => {
    if (!vus.has(d.membre_id)) {
      vus.add(d.membre_id);
      membresOrdre.push({ id: d.membre_id, label: `${d.prenom} ${d.nom}` });
    }
  });

  const header = ["Membre", ...semaines.map(([, iso]) => jeudiLabel(iso))];
  const body = membresOrdre.map((m) => [
    m.label,
    ...semaines.map(([sid]) => cellMap.get(`${m.id}_${sid}`) ?? "A"),
  ]);
  const wsDetail = XLSX.utils.aoa_to_sheet([header, ...body]);
  wsDetail["!cols"] = [{ wch: 24 }, ...semaines.map(() => ({ wch: 12 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSynthese, "Synthèse");
  XLSX.utils.book_append_sheet(wb, wsDetail, "Détail");
  XLSX.writeFile(wb, `presences_OLB_${debut}_${fin}.xlsx`);
}

export type PalmaresRow = {
  rang: number;
  membre: string;
  nb_recos: number;
  nb_tete_a_tete: number;
  ca_valide: number;
};

export function exportPalmaresPdf(opts: {
  semaineLibelle: string;
  rows: PalmaresRow[];
  filename?: string;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const TEAL = "#006875";
  const ORANGE = "#F6A000";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(TEAL);
  doc.text("Palmarès OLB", 40, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(40);
  doc.text(opts.semaineLibelle, 40, 70);

  const euros = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);

  autoTable(doc, {
    startY: 90,
    head: [["Rang", "Membre", "Recos", "T-à-T", "CA validé"]],
    body: opts.rows.map((r) => [
      String(r.rang),
      r.membre,
      String(r.nb_recos),
      String(r.nb_tete_a_tete),
      euros(Number(r.ca_valide ?? 0)),
    ]),
    headStyles: { fillColor: TEAL, textColor: "#ffffff", fontStyle: "bold" },
    alternateRowStyles: { fillColor: "#f7f7f7" },
    columnStyles: {
      0: { halign: "center", cellWidth: 50 },
      2: { halign: "center", cellWidth: 60 },
      3: { halign: "center", cellWidth: 60 },
      4: { halign: "right", cellWidth: 100, textColor: ORANGE, fontStyle: "bold" },
    },
    styles: { fontSize: 10, cellPadding: 6 },
  });

  doc.save(opts.filename ?? `palmares-${new Date().toISOString().slice(0, 10)}.pdf`);
}
