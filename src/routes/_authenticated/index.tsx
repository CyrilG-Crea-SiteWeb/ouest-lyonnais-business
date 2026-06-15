import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, HandshakeIcon, Euro, Trophy, Coffee, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportPalmaresPdf } from "@/lib/exports";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useProfile } from "@/hooks/use-profile";

const TEAL = "#006875";
const ORANGE = "#F6A000";

const euros = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Tableau de bord — OLB" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: profile } = useProfile();

  // Semaine en cours
  const { data: semaineId } = useQuery({
    queryKey: ["semaine", "courante"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_or_create_semaine");
      if (error) throw error;
      return data as number;
    },
  });

  const { data: semaineCourante } = useQuery({
    enabled: !!semaineId,
    queryKey: ["semaine", "info", semaineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semaines").select("libelle").eq("id", semaineId!).single();
      if (error) throw error;
      return data;
    },
  });

  // Recos de la semaine courante (pour KPI groupe)
  const { data: recosSemaine } = useQuery({
    enabled: !!semaineId,
    queryKey: ["dashboard", "recos-semaine", semaineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommandations")
        .select("type, montant, valide")
        .eq("semaine_id", semaineId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nbTeteATete = recosSemaine?.filter((r: any) => r.type === "tete_a_tete").length ?? 0;
  const nbRecos =
    recosSemaine?.filter((r: any) => r.type === "reco_interne" || r.type === "reco_externe").length ?? 0;
  const caValide =
    recosSemaine
      ?.filter((r: any) => r.type === "merci_business" && r.valide)
      .reduce((s: number, r: any) => s + Number(r.montant ?? 0), 0) ?? 0;

  // Evolution par semaine (12 dernières)
  const { data: evolution } = useQuery({
    queryKey: ["dashboard", "evolution"],
    queryFn: async () => {
      const { data: semaines, error: e1 } = await supabase
        .from("semaines")
        .select("id, libelle, date_debut")
        .order("date_debut", { ascending: false })
        .limit(12);
      if (e1) throw e1;
      const ids = (semaines ?? []).map((s) => s.id);
      if (!ids.length) return [];
      const { data: recos, error: e2 } = await supabase
        .from("recommandations")
        .select("type, montant, valide, semaine_id")
        .in("semaine_id", ids);
      if (e2) throw e2;
      return (semaines ?? [])
        .slice()
        .reverse()
        .map((s) => {
          const rs = (recos ?? []).filter((r: any) => r.semaine_id === s.id);
          return {
            semaine: s.libelle?.replace("Semaine du ", "") ?? String(s.id),
            recommandations: rs.filter(
              (r: any) => r.type === "reco_interne" || r.type === "reco_externe",
            ).length,
            ca: rs
              .filter((r: any) => r.type === "merci_business" && r.valide)
              .reduce((sum: number, r: any) => sum + Number(r.montant ?? 0), 0),
          };
        });
    },
  });

  // Palmarès de la semaine
  const { data: palmares } = useQuery({
    enabled: !!semaineId,
    queryKey: ["dashboard", "palmares", semaineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_palmares_semaine")
        .select("*")
        .eq("semaine_id", semaineId!)
        .order("rang", { ascending: true })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Liste membres pour vue individuelle
  const { data: membres } = useQuery({
    queryKey: ["dashboard", "membres-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, nom, prenom, photo_url, entreprise")
        .eq("statut", "actif")
        .order("nom", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const [selectedMembre, setSelectedMembre] = useState<string | undefined>();
  const membreId = selectedMembre ?? profile?.id;

  const { data: statsIndiv } = useQuery({
    enabled: !!membreId,
    queryKey: ["dashboard", "indiv", membreId],
    queryFn: async () => {
      // Recos données
      const { data: donnees, error: e1 } = await supabase
        .from("recommandations")
        .select("type, montant, valide")
        .eq("membre_id", membreId!);
      if (e1) throw e1;
      // Recos reçues (en tant que cible)
      const { data: recues, error: e2 } = await supabase
        .from("recommandations")
        .select("type, montant, valide")
        .eq("membre_cible_id", membreId!);
      if (e2) throw e2;
      const recosDonnees = donnees.filter(
        (r: any) => r.type === "reco_interne" || r.type === "reco_externe",
      ).length;
      const recosRecues = recues.filter((r: any) => r.type === "reco_interne").length;
      const teteATete = donnees.filter((r: any) => r.type === "tete_a_tete").length;
      // CA apporté = "merci_business" où le membre est émetteur (membre_id) — c'est celui qui dit merci.
      // CA apporté au membre = sommes "merci" où membre_cible_id = membre (le bénéficiaire reçoit du business)
      const caApporte = recues
        .filter((r: any) => r.type === "merci_business" && r.valide)
        .reduce((s: number, r: any) => s + Number(r.montant ?? 0), 0);
      return { recosDonnees, recosRecues, teteATete, caApporte };
    },
  });

  const stats = [
    { label: "Tête-à-tête (semaine)", value: nbTeteATete, icon: Coffee },
    { label: "Recommandations (semaine)", value: nbRecos, icon: HandshakeIcon },
    { label: "CA validé (semaine)", value: euros(caValide), icon: Euro },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Indicateurs de la semaine BNI en cours et évolution du groupe.
        </p>
      </header>

      {/* KPIs semaine */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-muted-foreground">{label}</span>
                <Icon className="h-4 w-4" style={{ color: TEAL }} />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Évolution */}
      <Card>
        <CardHeader>
          <CardTitle>Évolution par semaine</CardTitle>
          <CardDescription>12 dernières semaines — recommandations et CA validé</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolution ?? []} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="semaine" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke={TEAL} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  stroke={ORANGE}
                  tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  formatter={(value: any, name: string) =>
                    name === "CA validé (€)" ? euros(Number(value)) : value
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="recommandations"
                  name="Recommandations"
                  stroke={TEAL}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="ca"
                  name="CA validé (€)"
                  stroke={ORANGE}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Palmarès */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" style={{ color: ORANGE }} />
              Palmarès de la semaine
            </CardTitle>
            <CardDescription>Classement par CA validé</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!palmares?.length}
            onClick={() => {
              if (!palmares?.length) return;
              exportPalmaresPdf({
                semaineLibelle: `Semaine #${semaineId}`,
                rows: palmares.map((r: any) => ({
                  rang: r.rang,
                  membre: r.membre,
                  nb_recos: Number(r.nb_recos ?? 0),
                  nb_tete_a_tete: Number(r.nb_tete_a_tete ?? 0),
                  ca_valide: Number(r.ca_valide ?? 0),
                })),
              });
            }}
          >
            <Download className="h-4 w-4 mr-2" /> PDF
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!palmares?.length ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Aucune donnée pour cette semaine.</p>
          ) : (
            <ul className="divide-y">
              {palmares.map((row: any) => (
                <li key={row.membre_id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: row.rang <= 3 ? ORANGE : TEAL }}
                  >
                    {row.rang}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.membre}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.nb_recos} reco{row.nb_recos > 1 ? "s" : ""} · {row.nb_tete_a_tete} T-à-T
                    </p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: ORANGE }}>
                    {euros(Number(row.ca_valide ?? 0))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Vue individuelle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" style={{ color: TEAL }} />
            Vue individuelle
          </CardTitle>
          <CardDescription>Activité cumulée d'un membre</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={membreId} onValueChange={setSelectedMembre}>
            <SelectTrigger className="w-full md:w-80">
              <SelectValue placeholder="Sélectionner un membre" />
            </SelectTrigger>
            <SelectContent>
              {(membres ?? []).map((m: any) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.prenom} {m.nom}
                  {m.entreprise ? ` — ${m.entreprise}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {membreId && statsIndiv && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniStat label="Recos données" value={statsIndiv.recosDonnees} color={TEAL} />
              <MiniStat label="Recos reçues" value={statsIndiv.recosRecues} color={TEAL} />
              <MiniStat label="Tête-à-tête" value={statsIndiv.teteATete} color={TEAL} />
              <MiniStat label="CA apporté" value={euros(statsIndiv.caApporte)} color={ORANGE} />
            </div>
          )}

          {membreId && (
            <MembreHeader membreId={membreId} membres={membres ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function MembreHeader({ membreId, membres }: { membreId: string; membres: any[] }) {
  const m = membres.find((x) => x.id === membreId);
  if (!m) return null;
  const initials = `${(m.prenom?.[0] ?? "").toUpperCase()}${(m.nom?.[0] ?? "").toUpperCase()}`;
  return (
    <div className="flex items-center gap-3 pt-2 border-t">
      <Avatar className="h-10 w-10">
        {m.photo_url ? <AvatarImage src={m.photo_url} alt="" /> : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {m.prenom} {m.nom}
        </p>
        {m.entreprise && <p className="text-xs text-muted-foreground truncate">{m.entreprise}</p>}
      </div>
    </div>
  );
}
