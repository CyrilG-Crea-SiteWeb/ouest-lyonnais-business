import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

export type MembreLookup = Record<string, { prenom: string; nom: string; entreprise: string | null }>;
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
      : r.contact_externe ?? "",
    "Montant (€)": r.montant ?? "",
    Validé: r.type === "merci_business" ? (r.valide ? "Oui" : "Non") : "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 22 },
    { wch: 22 }, { wch: 24 }, { wch: 12 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recommandations");
  XLSX.writeFile(wb, opts.filename ?? `recommandations-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

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
