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
import { Download } from "lucide-react";
import { exportRecommandationsXlsx, type MembreLookup, type SemaineLookup } from "@/lib/exports";
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

// Libellé de semaine toujours en français, dérivé de date_debut (AAAA-MM-JJ).
// Le libellé stocké en base peut contenir des mois en anglais.
function formatSemaine(s: { date_debut?: string | null; libelle?: string | null }): string {
  const debut = s.date_debut;
  if (debut) {
    const annee = Number(debut.slice(0, 4));
    const mois = Number(debut.slice(5, 7)) - 1;
    const jour = Number(debut.slice(8, 10));
    return `Semaine du ${jour} ${MOIS_FR[mois]?.toLowerCase() ?? ""} ${annee}`;
  }
  return s.libelle ?? "Semaine";
}

type Granularite = "toutes" | "semaine" | "mois" | "annee";

export function ExportRecos() {
  const [granularite, setGranularite] = useState<Granularite>("toutes");
  const [semaineId, setSemaineId] = useState<string>(ALL);
  const [moisKey, setMoisKey] = useState<string>(ALL); // format "YYYY-MM"
  const [anneeKey, setAnneeKey] = useState<string>(ALL); // format "YYYY"
  const [membreId, setMembreId] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);

  const { data: semaines = [] } = useQuery({
    queryKey: ["export", "semaines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semaines")
        .select("id, libelle, date_debut")
        .order("date_debut", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: membres = [] } = useQuery({
    queryKey: ["export", "membres"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, prenom, nom, entreprise")
        .order("nom");
      if (error) throw error;
      return data ?? [];
    },
  });

  const membresMap: MembreLookup = useMemo(() => {
    const m: MembreLookup = {};
    membres.forEach((x: any) => {
      m[x.id] = { prenom: x.prenom, nom: x.nom, entreprise: x.entreprise };
    });
    return m;
  }, [membres]);

  const semainesMap: SemaineLookup = useMemo(() => {
    const m: SemaineLookup = {};
    semaines.forEach((x: any) => {
      m[x.id] = { libelle: x.libelle, date_debut: x.date_debut };
    });
    return m;
  }, [semaines]);

  // Mois distincts présents (clé "YYYY-MM"), du plus récent au plus ancien.
  const moisOptions = useMemo(() => {
    const map = new Map<string, string>(); // key -> label
    semaines.forEach((s: any) => {
      const d = s.date_debut as string;
      if (!d) return;
      const key = d.slice(0, 7); // YYYY-MM
      const annee = Number(d.slice(0, 4));
      const mois = Number(d.slice(5, 7)) - 1;
      map.set(key, `${MOIS_FR[mois]} ${annee}`);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [semaines]);

  // Années distinctes présentes, du plus récent au plus ancien.
  const anneeOptions = useMemo(() => {
    const set = new Set<string>();
    semaines.forEach((s: any) => {
      const d = s.date_debut as string;
      if (d) set.add(d.slice(0, 4));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [semaines]);

  // Ids de semaines correspondant à la portée période choisie.
  // Retourne null = "pas de filtre période" (toutes les semaines).
  const semaineIdsPortee = (): number[] | null => {
    if (granularite === "toutes") return null;
    if (granularite === "semaine") {
      return semaineId === ALL ? null : [Number(semaineId)];
    }
    if (granularite === "mois") {
      if (moisKey === ALL) return null;
      return semaines
        .filter((s: any) => (s.date_debut as string)?.slice(0, 7) === moisKey)
        .map((s: any) => s.id as number);
    }
    // annee
    if (anneeKey === ALL) return null;
    return semaines
      .filter((s: any) => (s.date_debut as string)?.slice(0, 4) === anneeKey)
      .map((s: any) => s.id as number);
  };

  const handleExport = async () => {
    try {
      const ids = semaineIdsPortee();
      // Portée période choisie mais aucune semaine ne correspond → rien à exporter.
      if (ids !== null && ids.length === 0) {
        toast.info("Aucune semaine pour cette période.");
        return;
      }

      let q = supabase
        .from("recommandations")
        .select(
          "id, type, membre_id, membre_cible_id, contact_externe, montant, valide, semaine_id, created_at",
        )
        .order("created_at", { ascending: false });
      if (ids !== null) q = q.in("semaine_id", ids);
      if (membreId !== ALL) q = q.eq("membre_id", membreId);
      if (type !== ALL) q = q.eq("type", type as any);

      const { data, error } = await q;
      if (error) throw error;
      if (!data?.length) {
        toast.info("Aucune recommandation à exporter pour ces filtres.");
        return;
      }

      // Tête-à-tête : récupérer les participants pour émettre une ligne par
      // participant dans l'export.
      const teteIds = (data as any[])
        .filter((r) => r.type === "tete_a_tete")
        .map((r) => r.id as number);
      let participants: Record<number, string[]> | undefined;
      if (teteIds.length > 0) {
        const { data: rp, error: rpErr } = await supabase
          .from("reco_participants")
          .select("recommandation_id, membre_id")
          .in("recommandation_id", teteIds);
        if (rpErr) throw rpErr;
        participants = {};
        (rp ?? []).forEach((row: any) => {
          (participants![row.recommandation_id] ??= []).push(row.membre_id);
        });
      }

      // Suffixe de nom de fichier selon la portée.
      let suffixe = new Date().toISOString().slice(0, 10);
      if (granularite === "semaine" && semaineId !== ALL) {
        suffixe = (semainesMap[Number(semaineId)]?.libelle ?? `semaine-${semaineId}`)
          .replace(/\s+/g, "-")
          .toLowerCase();
      } else if (granularite === "mois" && moisKey !== ALL) {
        suffixe = moisKey;
      } else if (granularite === "annee" && anneeKey !== ALL) {
        suffixe = anneeKey;
      }

      const nbLignes = exportRecommandationsXlsx({
        recos: data as any,
        membres: membresMap,
        semaines: semainesMap,
        filename: `recommandations-${suffixe}.xlsx`,
        participants,
      });
      toast.success(`${nbLignes} ligne(s) exportée(s).`);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur d'export");
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
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="toutes">Toutes les périodes</SelectItem>
                <SelectItem value="semaine">Par semaine</SelectItem>
                <SelectItem value="mois">Par mois</SelectItem>
                <SelectItem value="annee">Par année</SelectItem>
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
                  {semaines.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {formatSemaine(s)}
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

          {/* Membre */}
          <div>
            <Label className="text-xs">Membre</Label>
            <Select value={membreId} onValueChange={setMembreId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous</SelectItem>
                {membres.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.prenom} {m.nom}
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

        <Button onClick={handleExport} className="w-full md:w-auto">
          <Download className="h-4 w-4 mr-2" />
          Télécharger .xlsx
        </Button>
      </CardContent>
    </Card>
  );
}
