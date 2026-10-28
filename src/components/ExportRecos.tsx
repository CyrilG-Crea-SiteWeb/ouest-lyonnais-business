import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2 } from "lucide-react";
import { exportRecommandationsClasseur, TYPE_RECO_LABEL, type TypeReco } from "@/lib/export-recos";
import { toast } from "sonner";

const ALL = "__all__";

const MOIS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

type Granularite = "toutes" | "semaine" | "mois" | "annee_olb" | "annee";

/**
 * Année OLB (1er juin → 31 mai) d'une date AAAA-MM-JJ, identifiée par l'année
 * de son 1er juin : 2026-10-22 → 2026 (2026-2027), 2027-03-04 → 2026.
 */
const anneeOlbDe = (iso: string) => {
  const annee = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 6 ? annee : annee - 1;
};
const anneeOlbCourante = () => {
  const now = new Date();
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
};

export function ExportRecos() {
  const [granularite, setGranularite] = useState<Granularite>("annee_olb");
  const [semaineId, setSemaineId] = useState<string>(ALL);
  const [moisKey, setMoisKey] = useState<string>(ALL); // format "YYYY-MM"
  const [anneeKey, setAnneeKey] = useState<string>(ALL); // format "YYYY"
  const [anneeOlbKey, setAnneeOlbKey] = useState<string>(String(anneeOlbCourante()));
  const [membreId, setMembreId] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);
  const [enCours, setEnCours] = useState(false);

  // La date de réunion d'une semaine est sa date_fin (jeudi) : mois, années
  // civiles et années OLB sont calculés à partir de date_fin.
  const { data: semaines = [] } = useQuery({
    queryKey: ["export", "semaines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semaines")
        .select("id, libelle, date_fin")
        .order("date_fin", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Inactifs compris : on peut exporter l'historique d'un ancien membre.
  const { data: membres = [] } = useQuery({
    queryKey: ["export", "membres"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, prenom, nom, statut")
        .order("nom");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Mois distincts présents (clé "YYYY-MM"), du plus récent au plus ancien.
  const moisOptions = useMemo(() => {
    const map = new Map<string, string>(); // key -> label
    semaines.forEach((s) => {
      const d = s.date_fin;
      if (!d) return;
      map.set(d.slice(0, 7), `${MOIS_FR[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [semaines]);

  // Années civiles distinctes présentes, du plus récent au plus ancien.
  const anneeOptions = useMemo(() => {
    const set = new Set<string>();
    semaines.forEach((s) => s.date_fin && set.add(s.date_fin.slice(0, 4)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [semaines]);

  // Années OLB distinctes (année de début), l'année en cours toujours proposée.
  const anneeOlbOptions = useMemo(() => {
    const set = new Set<number>([anneeOlbCourante()]);
    semaines.forEach((s) => s.date_fin && set.add(anneeOlbDe(s.date_fin)));
    return Array.from(set).sort((a, b) => b - a);
  }, [semaines]);

  // Ids de semaines correspondant à la portée période choisie.
  // Retourne null = "pas de filtre période" (toutes les semaines).
  const semaineIdsPortee = (): number[] | null => {
    const filtrer = (pred: (dateFin: string) => boolean) =>
      semaines.filter((s) => s.date_fin && pred(s.date_fin)).map((s) => s.id);
    switch (granularite) {
      case "toutes":
        return null;
      case "semaine":
        return semaineId === ALL ? null : [Number(semaineId)];
      case "mois":
        return moisKey === ALL ? null : filtrer((d) => d.slice(0, 7) === moisKey);
      case "annee":
        return anneeKey === ALL ? null : filtrer((d) => d.slice(0, 4) === anneeKey);
      case "annee_olb":
        return filtrer((d) => anneeOlbDe(d) === Number(anneeOlbKey));
    }
  };

  // Libellé (en tête de la Synthèse) et portion du nom de fichier.
  const portee = (): { libelle: string; slug: string } => {
    if (granularite === "semaine" && semaineId !== ALL) {
      const libelle = semaines.find((s) => s.id === Number(semaineId))?.libelle ?? semaineId;
      return {
        libelle: `Semaine ${libelle}`,
        slug: `semaine-${libelle.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}`,
      };
    }
    if (granularite === "mois" && moisKey !== ALL) {
      const label = moisOptions.find(([k]) => k === moisKey)?.[1] ?? moisKey;
      return { libelle: label, slug: moisKey };
    }
    if (granularite === "annee" && anneeKey !== ALL) {
      return { libelle: `Année civile ${anneeKey}`, slug: anneeKey };
    }
    if (granularite === "annee_olb") {
      const a = Number(anneeOlbKey);
      return { libelle: `Année OLB ${a}-${a + 1}`, slug: `annee-OLB-${a}-${a + 1}` };
    }
    return { libelle: "Toutes les périodes", slug: "toutes-periodes" };
  };

  const handleExport = async () => {
    const ids = semaineIdsPortee();
    // Portée période choisie mais aucune semaine ne correspond → rien à exporter.
    if (ids !== null && ids.length === 0) {
      toast.info("Aucune semaine pour cette période.");
      return;
    }
    const filtres: string[] = [];
    if (membreId !== ALL) {
      const m = membres.find((x) => x.id === membreId);
      filtres.push(`Membre : ${m ? `${m.prenom} ${m.nom}` : membreId}`);
    }
    if (type !== ALL) filtres.push(`Type : ${TYPE_RECO_LABEL[type as TypeReco]}`);
    const { libelle, slug } = portee();

    setEnCours(true);
    try {
      const nbLignes = await exportRecommandationsClasseur({
        semaineIds: ids,
        membreId: membreId === ALL ? null : membreId,
        type: type === ALL ? null : (type as TypeReco),
        periodeLibelle: libelle,
        filtresLibelle: filtres.length ? filtres.join(" · ") : "aucun",
        filenameSlug: slug,
      });
      if (nbLignes === 0) {
        toast.info("Aucune recommandation à exporter pour ces filtres.");
        return;
      }
      toast.success(`Classeur généré : ${nbLignes} lignes de détail.`);
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Erreur d'export");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="h-4 w-4" />
          Exporter en Excel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Granularité de période */}
          <div>
            <Label className="text-xs">Période</Label>
            <Select
              value={granularite}
              onValueChange={(v) => {
                setGranularite(v as Granularite);
                // reset des sous-sélecteurs pour éviter un filtre fantôme
                setSemaineId(ALL);
                setMoisKey(ALL);
                setAnneeKey(ALL);
                setAnneeOlbKey(String(anneeOlbCourante()));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="toutes">Toutes les périodes</SelectItem>
                <SelectItem value="semaine">Par semaine</SelectItem>
                <SelectItem value="mois">Par mois</SelectItem>
                <SelectItem value="annee_olb">Année OLB (juin → mai)</SelectItem>
                <SelectItem value="annee">Par année civile</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sous-sélecteur conditionnel */}
          {granularite === "semaine" && (
            <div>
              <Label className="text-xs">Semaine</Label>
              <Select value={semaineId} onValueChange={setSemaineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Toutes les semaines</SelectItem>
                  {semaines.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.libelle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {granularite === "mois" && (
            <div>
              <Label className="text-xs">Mois</Label>
              <Select value={moisKey} onValueChange={setMoisKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tous les mois</SelectItem>
                  {moisOptions.map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {granularite === "annee_olb" && (
            <div>
              <Label className="text-xs">Année OLB</Label>
              <Select value={anneeOlbKey} onValueChange={setAnneeOlbKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anneeOlbOptions.map((a) => (
                    <SelectItem key={a} value={String(a)}>
                      {a}-{a + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {granularite === "annee" && (
            <div>
              <Label className="text-xs">Année</Label>
              <Select value={anneeKey} onValueChange={setAnneeKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Toutes les années</SelectItem>
                  {anneeOptions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Membre : déclarant OU concerné */}
          <div>
            <Label className="text-xs">Membre</Label>
            <Select value={membreId} onValueChange={setMembreId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous</SelectItem>
                {membres.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.prenom} {m.nom}
                    {m.statut !== "actif" && " (ancien)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type */}
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous</SelectItem>
                <SelectItem value="tete_a_tete">Tête-à-tête</SelectItem>
                <SelectItem value="reco_interne">Reco interne</SelectItem>
                <SelectItem value="reco_externe">Reco externe</SelectItem>
                <SelectItem value="merci_business">Merci pour le business</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Button onClick={handleExport} disabled={enCours} className="w-full md:w-auto">
            {enCours ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {enCours ? "Génération…" : "Télécharger .xlsx"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Classeur de 6 feuilles : Synthèse, Détail, matrices, évolution.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
