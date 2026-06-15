import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import { exportRecommandationsXlsx, type MembreLookup, type SemaineLookup } from "@/lib/exports";
import { toast } from "sonner";

const ALL = "__all__";

export function ExportRecos() {
  const [semaineId, setSemaineId] = useState<string>(ALL);
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
    membres.forEach((x: any) => { m[x.id] = { prenom: x.prenom, nom: x.nom, entreprise: x.entreprise }; });
    return m;
  }, [membres]);

  const semainesMap: SemaineLookup = useMemo(() => {
    const m: SemaineLookup = {};
    semaines.forEach((x: any) => { m[x.id] = { libelle: x.libelle, date_debut: x.date_debut }; });
    return m;
  }, [semaines]);

  const handleExport = async () => {
    try {
      let q = supabase
        .from("recommandations")
        .select("id, type, membre_id, membre_cible_id, contact_externe, montant, valide, semaine_id, created_at")
        .order("created_at", { ascending: false });
      if (semaineId !== ALL) q = q.eq("semaine_id", Number(semaineId));
      if (membreId !== ALL) q = q.eq("membre_id", membreId);
      if (type !== ALL) q = q.eq("type", type as any);
      const { data, error } = await q;
      if (error) throw error;
      if (!data?.length) {
        toast.info("Aucune recommandation à exporter pour ces filtres.");
        return;
      }
      exportRecommandationsXlsx({
        recos: data as any,
        membres: membresMap,
        semaines: semainesMap,
      });
      toast.success(`${data.length} ligne(s) exportée(s).`);
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Semaine</Label>
            <Select value={semaineId} onValueChange={setSemaineId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Toutes</SelectItem>
                {semaines.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.libelle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Membre</Label>
            <Select value={membreId} onValueChange={setMembreId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous</SelectItem>
                {membres.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.prenom} {m.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
