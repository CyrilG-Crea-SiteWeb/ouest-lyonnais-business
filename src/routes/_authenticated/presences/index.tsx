import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Plane,
  UserCheck,
  UserMinus,
  UserX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/presences/")({
  head: () => ({ meta: [{ title: "Présences — OLB" }] }),
  // Garde d'accès : réservé au bureau/admin (même pattern que /invites).
  beforeLoad: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw redirect({ to: "/auth" });
    const { data: m } = await supabase
      .from("membres")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    const role = m?.role;
    if (role !== "bureau" && role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  component: PresencesPage,
});

type Statut = "present" | "excuse" | "absent";
type Semaine = {
  id: number;
  date_debut: string;
  date_fin: string;
  libelle: string;
  sans_reunion: boolean;
};
type MembreLite = { id: string; prenom: string; nom: string };
type Presence = { id: number; semaine_id: number; membre_id: string; statut: Statut };
type TauxRow = {
  membre_id: string;
  prenom: string;
  nom: string;
  nb_reunions_dues: number;
  nb_present: number;
  nb_excuse: number;
  nb_absent: number;
  taux_presence: number | null;
};

function formatSemaine(s: Semaine): string {
  if (s.libelle) return s.libelle;
  const d = new Date(s.date_debut);
  return `Semaine du ${d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;
}

function PresencesPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // S'assure que la semaine en cours existe (la crée au besoin) et la
  // sélectionne par défaut. Invalide la liste des semaines pour qu'elle apparaisse.
  const currentQ = useQuery({
    queryKey: ["presences", "semaine-courante"],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("get_or_create_semaine");
      if (error) throw error;
      return data as number;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (currentQ.data != null) {
      setSelectedId((prev) => prev ?? currentQ.data);
      qc.invalidateQueries({ queryKey: ["presences", "semaines"] });
    }
  }, [currentQ.data, qc]);

  // Toutes les semaines, de la plus récente à la plus ancienne (pour naviguer).
  const semainesQ = useQuery({
    queryKey: ["presences", "semaines"],
    queryFn: async (): Promise<Semaine[]> => {
      const { data, error } = await supabase
        .from("semaines")
        .select("id, date_debut, date_fin, libelle, sans_reunion")
        .order("date_debut", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Semaine[];
    },
  });

  const membresQ = useQuery({
    queryKey: ["presences", "membres-actifs"],
    queryFn: async (): Promise<MembreLite[]> => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, prenom, nom")
        .eq("statut", "actif")
        .order("nom", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MembreLite[];
    },
    staleTime: 60_000,
  });

  const presencesQ = useQuery({
    queryKey: ["presences", "semaine", selectedId],
    enabled: selectedId != null,
    queryFn: async (): Promise<Presence[]> => {
      const { data, error } = await supabase
        .from("presences")
        .select("id, semaine_id, membre_id, statut")
        .eq("semaine_id", selectedId!);
      if (error) throw error;
      return (data ?? []) as Presence[];
    },
  });

  const semaines = semainesQ.data ?? [];
  const selected = semaines.find((s) => s.id === selectedId) ?? null;
  const selectedIndex = semaines.findIndex((s) => s.id === selectedId);
  // Liste triée du plus récent (index 0) au plus ancien : "précédent" = plus ancien.
  const hasOlder = selectedIndex >= 0 && selectedIndex < semaines.length - 1;
  const hasNewer = selectedIndex > 0;

  const presencesByMembre = useMemo(() => {
    const m = new Map<string, Presence>();
    (presencesQ.data ?? []).forEach((p) => m.set(p.membre_id, p));
    return m;
  }, [presencesQ.data]);

  // Synthèse : présent / excusé / absent (absent = pas de ligne 'present'/'excuse').
  const membres = membresQ.data ?? [];
  const nbPresent = membres.filter(
    (mb) => presencesByMembre.get(mb.id)?.statut === "present",
  ).length;
  const nbExcuse = membres.filter((mb) => presencesByMembre.get(mb.id)?.statut === "excuse").length;
  const nbAbsent = membres.length - nbPresent - nbExcuse;

  // Bascule "semaine sans réunion" via RPC réservée au bureau.
  const toggleSansReunion = useMutation({
    mutationFn: async (value: boolean) => {
      if (!selectedId) throw new Error("Aucune semaine sélectionnée");
      const { error } = await supabase.rpc("set_semaine_sans_reunion", {
        p_semaine_id: selectedId,
        p_sans_reunion: value,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presences", "semaines"] });
      qc.invalidateQueries({ queryKey: ["presences", "taux"] });
      toast.success("Semaine mise à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Pointage d'un membre. 'absent' => suppression de la ligne (convention).
  const setStatut = useMutation({
    mutationFn: async ({ membreId, statut }: { membreId: string; statut: Statut }) => {
      if (!selectedId) throw new Error("Aucune semaine sélectionnée");
      if (statut === "absent") {
        const { error } = await supabase
          .from("presences")
          .delete()
          .eq("semaine_id", selectedId)
          .eq("membre_id", membreId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("presences")
        .upsert(
          { semaine_id: selectedId, membre_id: membreId, statut },
          { onConflict: "semaine_id,membre_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presences", "semaine", selectedId] });
      qc.invalidateQueries({ queryKey: ["presences", "taux"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CheckSquare className="h-7 w-7 text-primary" />
        <h1 className="text-2xl md:text-3xl font-bold">Présences</h1>
      </div>

      {/* Sélecteur de semaine */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={!hasOlder}
              onClick={() => setSelectedId(semaines[selectedIndex + 1]!.id)}
              aria-label="Semaine précédente"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="text-center min-w-0">
              {selected ? (
                <p className="font-semibold truncate">{formatSemaine(selected)}</p>
              ) : (
                <Skeleton className="h-5 w-40 mx-auto" />
              )}
              <p className="text-xs text-muted-foreground">Réunion du jeudi</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              disabled={!hasNewer}
              onClick={() => setSelectedId(semaines[selectedIndex - 1]!.id)}
              aria-label="Semaine suivante"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-2 min-w-0">
              <Plane className="h-4 w-4 shrink-0 text-accent" />
              <Label htmlFor="sans-reunion" className="text-sm">
                Pas de réunion cette semaine (vacances)
              </Label>
            </div>
            <Switch
              id="sans-reunion"
              checked={selected?.sans_reunion ?? false}
              disabled={!selected || toggleSansReunion.isPending}
              onCheckedChange={(v) => toggleSansReunion.mutate(v)}
            />
          </div>
        </CardContent>
      </Card>

      {selected?.sans_reunion ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            <Plane className="h-6 w-6 mx-auto mb-2 text-accent" />
            Semaine sans réunion, exclue des statistiques.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Synthèse */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryTile label="Présents" value={nbPresent} tone="present" />
            <SummaryTile label="Excusés" value={nbExcuse} tone="excuse" />
            <SummaryTile label="Absents" value={nbAbsent} tone="absent" />
          </div>

          {/* Liste de pointage */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Pointage des membres</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {membresQ.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : membres.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun membre actif.</p>
              ) : (
                membres.map((mb) => {
                  const current = presencesByMembre.get(mb.id)?.statut ?? "absent";
                  return (
                    <div
                      key={mb.id}
                      className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="font-medium">
                        {mb.prenom} {mb.nom}
                      </span>
                      <div className="grid grid-cols-3 gap-2 sm:flex sm:w-auto">
                        <StatutButton
                          statut="present"
                          active={current === "present"}
                          disabled={setStatut.isPending}
                          onClick={() => setStatut.mutate({ membreId: mb.id, statut: "present" })}
                        />
                        <StatutButton
                          statut="excuse"
                          active={current === "excuse"}
                          disabled={setStatut.isPending}
                          onClick={() => setStatut.mutate({ membreId: mb.id, statut: "excuse" })}
                        />
                        <StatutButton
                          statut="absent"
                          active={current === "absent"}
                          disabled={setStatut.isPending}
                          onClick={() => setStatut.mutate({ membreId: mb.id, statut: "absent" })}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Taux de présence par membre */}
      <TauxPresence />
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: Statut }) {
  const tones: Record<Statut, string> = {
    present: "bg-primary/10 text-primary",
    excuse: "bg-accent/10 text-accent",
    absent: "bg-muted text-muted-foreground",
  };
  return (
    <div className={cn("rounded-lg p-4 text-center", tones[tone])}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
    </div>
  );
}

const STATUT_META: Record<Statut, { label: string; icon: typeof UserCheck; activeClass: string }> =
  {
    present: {
      label: "Présent",
      icon: UserCheck,
      activeClass: "bg-primary text-primary-foreground hover:bg-primary/90",
    },
    excuse: {
      label: "Excusé",
      icon: UserMinus,
      activeClass: "bg-accent text-accent-foreground hover:bg-accent/90",
    },
    absent: {
      label: "Absent",
      icon: UserX,
      activeClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    },
  };

function StatutButton({
  statut,
  active,
  disabled,
  onClick,
}: {
  statut: Statut;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const meta = STATUT_META[statut];
  const Icon = meta.icon;
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      disabled={disabled}
      onClick={onClick}
      className={cn("gap-1.5", active && meta.activeClass)}
    >
      <Icon className="h-4 w-4" />
      {meta.label}
    </Button>
  );
}

function TauxPresence() {
  const tauxQ = useQuery({
    queryKey: ["presences", "taux"],
    queryFn: async (): Promise<TauxRow[]> => {
      const { data, error } = await supabase.from("v_taux_presence_membre").select("*");
      if (error) throw error;
      return (data ?? []) as TauxRow[];
    },
  });

  const rows = useMemo(
    () => [...(tauxQ.data ?? [])].sort((a, b) => (b.taux_presence ?? 0) - (a.taux_presence ?? 0)),
    [tauxQ.data],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Taux de présence par membre</CardTitle>
      </CardHeader>
      <CardContent>
        {tauxQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune donnée. Vérifiez que la date d'entrée des membres est renseignée.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membre</TableHead>
                <TableHead className="text-right">Présence</TableHead>
                <TableHead className="text-right">Taux</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const pct = r.taux_presence != null ? Math.round(r.taux_presence * 100) : null;
                return (
                  <TableRow key={r.membre_id}>
                    <TableCell className="font-medium">
                      {r.prenom} {r.nom}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.nb_present}/{r.nb_reunions_dues}
                      {r.nb_excuse > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          dont {r.nb_excuse} excusé{r.nb_excuse > 1 ? "s" : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {pct == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "tabular-nums",
                            pct >= 80
                              ? "bg-primary/10 text-primary"
                              : pct >= 50
                                ? "bg-accent/10 text-accent"
                                : "bg-destructive/10 text-destructive",
                          )}
                        >
                          {pct} %
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
