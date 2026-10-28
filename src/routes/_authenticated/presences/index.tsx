import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Plane,
  UserCheck,
  UserX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { exportPresencesXlsx } from "@/lib/exports";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/presences/")({
  head: () => ({ meta: [{ title: "Présences — OLB" }] }),
  // Page élargie sur grand écran (pointage + colonne taux / export), cf. AppShell.
  staticData: { pageLarge: true },
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

type Statut = "present" | "absent";
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
  nb_absent: number;
  taux_presence: number | null;
};

function formatSemaine(s: Semaine): string {
  // Toujours formater en français à partir de date_debut (AAAA-MM-JJ), en
  // construisant la date en heure locale pour éviter tout décalage de fuseau.
  const [y, m, d] = s.date_debut.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return `Semaine du ${date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;
}

// Date locale au format AAAA-MM-JJ (sans décalage de fuseau).
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Premier jeudi de l'année civile (les réunions ont lieu le jeudi).
function premierJeudiAnnee(year: number): string {
  const d = new Date(year, 0, 1);
  const offset = (4 - d.getDay() + 7) % 7; // jours jusqu'au jeudi (getDay: jeudi = 4)
  d.setDate(d.getDate() + offset);
  return toISODate(d);
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
        .order("prenom", { ascending: true });
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

  const membres = membresQ.data ?? [];
  const nbPresent = membres.filter(
    (mb) => presencesByMembre.get(mb.id)?.statut === "present",
  ).length;
  const nbAbsent = membres.length - nbPresent;

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
      {/* PC : semaine, option vacances et compteurs sur une seule ligne. */}
      <Card>
        <CardContent className="p-4 space-y-4 lg:flex lg:items-center lg:gap-4 lg:space-y-0">
          <div className="flex items-center justify-between gap-2 lg:min-w-0 lg:flex-1">
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

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3 lg:shrink-0">
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

          {!selected?.sans_reunion && (
            <div className="hidden shrink-0 gap-2 lg:flex">
              <SummaryTile label="Présents" value={nbPresent} tone="present" compact />
              <SummaryTile label="Absents" value={nbAbsent} tone="absent" compact />
            </div>
          )}
        </CardContent>
      </Card>

      {/* PC : pointage à gauche, taux de présence et export à droite (colonne
          qui reste visible au défilement). Mobile : une colonne, ordre inchangé. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,380px)] lg:items-start">
        <div className="min-w-0 space-y-6">
          {selected?.sans_reunion ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                <Plane className="h-6 w-6 mx-auto mb-2 text-accent" />
                Semaine sans réunion, exclue des statistiques.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Synthèse (mobile ; sur PC, les compteurs sont dans le bandeau) */}
              <div className="grid grid-cols-2 gap-3 lg:hidden">
                <SummaryTile label="Présents" value={nbPresent} tone="present" />
                <SummaryTile label="Absents" value={nbAbsent} tone="absent" />
              </div>

              {/* Liste de pointage — mobile : 3 colonnes avec 2 boutons par membre ;
              PC : grille dense où un clic sur la carte bascule présent / absent. */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Pointage des membres</CardTitle>
                </CardHeader>
                <CardContent>
                  {membresQ.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : membres.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun membre actif.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2 lg:hidden">
                        {membres.map((mb) => {
                          const current = presencesByMembre.get(mb.id)?.statut ?? "absent";
                          return (
                            <MembreCard
                              key={mb.id}
                              membre={mb}
                              current={current}
                              disabled={setStatut.isPending}
                              onSet={(statut) => setStatut.mutate({ membreId: mb.id, statut })}
                            />
                          );
                        })}
                      </div>
                      <div className="hidden gap-2 lg:grid lg:grid-cols-4 wide:grid-cols-5 2xl:grid-cols-6">
                        {membres.map((mb) => {
                          const current = presencesByMembre.get(mb.id)?.statut ?? "absent";
                          return (
                            <MembreBascule
                              key={mb.id}
                              membre={mb}
                              current={current}
                              disabled={setStatut.isPending}
                              onSet={(statut) => setStatut.mutate({ membreId: mb.id, statut })}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
          {/* Taux de présence par membre */}
          <TauxPresence />

          {/* Export Excel sur une plage de dates */}
          <ExportPresences />
        </aside>
      </div>
    </div>
  );
}

function MembreCard({
  membre,
  current,
  disabled,
  onSet,
}: {
  membre: MembreLite;
  current: Statut;
  disabled: boolean;
  onSet: (statut: Statut) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2">
      <div className="text-center leading-tight">
        <p className="text-sm font-semibold truncate" title={membre.prenom}>
          {membre.prenom}
        </p>
        <p className="text-xs text-muted-foreground truncate" title={membre.nom}>
          {membre.nom}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {(["present", "absent"] as Statut[]).map((statut) => (
          <StatutButton
            key={statut}
            statut={statut}
            active={current === statut}
            disabled={disabled}
            onClick={() => onSet(statut)}
          />
        ))}
      </div>
    </div>
  );
}

/** PC : carte cliquable qui bascule le membre entre présent et absent. */
function MembreBascule({
  membre,
  current,
  disabled,
  onSet,
}: {
  membre: MembreLite;
  current: Statut;
  disabled: boolean;
  onSet: (statut: Statut) => void;
}) {
  const present = current === "present";
  const Icon = present ? UserCheck : UserX;
  return (
    <button
      type="button"
      aria-pressed={present}
      disabled={disabled}
      onClick={() => onSet(present ? "absent" : "present")}
      title={present ? "Cliquer pour marquer absent" : "Cliquer pour marquer présent"}
      className={cn(
        "flex min-w-0 flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-wait",
        present
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-card hover:border-primary hover:bg-primary/5",
      )}
    >
      <span className="w-full truncate text-sm font-semibold" title={membre.prenom}>
        {membre.prenom}
      </span>
      <span
        className={cn(
          "w-full truncate text-xs",
          present ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
        title={membre.nom}
      >
        {membre.nom || "\u00a0"}
      </span>
      <span className="mt-1.5 flex items-center gap-1 text-xs font-medium">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {present ? "Présent" : "Absent"}
      </span>
    </button>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string;
  value: number;
  tone: Statut;
  /** Version réduite pour le bandeau PC. */
  compact?: boolean;
}) {
  const tones: Record<Statut, string> = {
    present: "bg-primary/10 text-primary",
    absent: "bg-muted text-muted-foreground",
  };
  return (
    <div className={cn("rounded-lg text-center", compact ? "px-4 py-1.5" : "p-4", tones[tone])}>
      <p className={cn("font-bold", compact ? "text-xl leading-tight" : "text-2xl")}>{value}</p>
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
      className={cn(
        "h-auto w-full justify-center gap-1.5 px-1.5 py-3 text-xs",
        active && meta.activeClass,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{meta.label}</span>
    </Button>
  );
}

function ExportPresences() {
  const [debut, setDebut] = useState(() => premierJeudiAnnee(new Date().getFullYear()));
  const [fin, setFin] = useState(() => toISODate(new Date()));
  const [pending, setPending] = useState(false);

  const handleExport = async () => {
    if (fin < debut) {
      toast.error("La date de fin doit être postérieure à la date de début.");
      return;
    }
    setPending(true);
    try {
      await exportPresencesXlsx(debut, fin);
      toast.success("Export Excel généré.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'export.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Export Excel des présences</CardTitle>
      </CardHeader>
      <CardContent>
        {/* PC : colonne étroite, dates côte à côte et bouton en dessous. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end lg:grid lg:grid-cols-2">
          <div className="space-y-1.5 sm:flex-1">
            <Label htmlFor="export-debut" className="text-xs">
              Du
            </Label>
            <Input
              id="export-debut"
              type="date"
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:flex-1">
            <Label htmlFor="export-fin" className="text-xs">
              Au
            </Label>
            <Input
              id="export-fin"
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
            />
          </div>
          <Button
            onClick={handleExport}
            disabled={pending}
            className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 lg:col-span-2"
          >
            <Download className="h-4 w-4" />
            Exporter (.xlsx)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TauxPresence() {
  // Replié par défaut sur mobile, déplié sur PC (colonne de droite) tant que
  // l'utilisateur n'a pas choisi lui-même.
  const ecranLarge = useMediaQuery("(min-width: 1024px)");
  const [choix, setOpen] = useState<boolean | null>(null);
  const open = choix ?? ecranLarge;
  const tauxQ = useQuery({
    queryKey: ["presences", "taux"],
    queryFn: async (): Promise<TauxRow[]> => {
      // RPC SECURITY DEFINER : la vue lue directement ne voit les présences
      // que pour le bureau (RLS de `presences`), sinon tous les taux valent 0 %.
      const { data, error } = await supabase.rpc("taux_presence_membres");
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
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg">Taux de présence par membre</CardTitle>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
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
                    <TableHead className="w-24 text-right">Taux</TableHead>
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
                        </TableCell>
                        <TableCell className="w-24 text-right">
                          {pct == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Badge
                              variant="secondary"
                              className={cn(
                                "whitespace-nowrap tabular-nums",
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
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
