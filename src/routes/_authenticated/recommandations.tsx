import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useProfile, hasRole } from "@/hooks/use-profile";
import { creerNotificationsSafe } from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Comments } from "@/components/Comments";
import { ExportRecos } from "@/components/ExportRecos";
import { MembreCombobox } from "@/components/MembreCombobox";
import { membreCorrespond } from "@/lib/membres-recherche";
import { useMediaQuery } from "@/hooks/use-media-query";
import { HelpButton } from "@/components/HelpButton";
import {
  Handshake,
  Users2,
  UserPlus,
  Euro,
  Trash2,
  Loader2,
  Check,
  ChevronRight,
  CalendarDays,
  Filter,
  Search,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/recommandations")({
  head: () => ({ meta: [{ title: "Recommandations — OLB" }] }),
  // Page élargie sur grand écran (2 colonnes : saisie + historique), cf. AppShell.
  staticData: { pageLarge: true },
  component: RecosPage,
});

type RecoType = "tete_a_tete" | "reco_interne" | "reco_externe" | "merci_business";

type Reco = {
  id: number;
  type: RecoType;
  membre_id: string;
  membre_cible_id: string | null;
  contact_externe: string | null;
  montant: number | null;
  semaine_id: number;
  notes: string | null;
  saisi_par?: string | null; // NULL pour les saisies antérieures à la colonne
  created_at: string;
};

type Semaine = { id: number; date_debut: string; libelle: string };
type MembreLite = { id: string; nom: string; prenom: string; entreprise: string | null };

const TYPE_META: Record<
  RecoType,
  { label: string; short: string; icon: typeof Handshake; color: string }
> = {
  tete_a_tete: {
    label: "Tête-à-tête",
    short: "T-à-T",
    icon: Users2,
    color: "bg-blue-100 text-blue-800",
  },
  reco_interne: {
    label: "Reco interne",
    short: "Interne",
    icon: Handshake,
    color: "bg-emerald-100 text-emerald-800",
  },
  reco_externe: {
    label: "Reco externe",
    short: "Externe",
    icon: UserPlus,
    color: "bg-amber-100 text-amber-800",
  },
  merci_business: {
    label: "Thx U 4 Pepette",
    short: "Merci",
    icon: Euro,
    color: "bg-fuchsia-100 text-fuchsia-800",
  },
};

// ---- Helpers de regroupement par année / mois ----
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

// Case à cocher purement visuelle (le <button> parent gère le clic).
// Évite d'imbriquer un <button> Radix dans un <button> (React #185).
function FauxCheck({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border " +
        (checked ? "border-primary bg-primary text-primary-foreground" : "border-input")
      }
    >
      {checked && <Check className="h-3 w-3" />}
    </span>
  );
}

function RecosPage() {
  const { data: profile } = useProfile();
  const isBureau = hasRole(profile?.role, "bureau");
  const isAdmin = hasRole(profile?.role, "admin");
  const qc = useQueryClient();

  const { data: membres = [] } = useQuery({
    queryKey: ["membres", "lite"],
    queryFn: async (): Promise<MembreLite[]> => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, nom, prenom, entreprise")
        .eq("statut", "actif")
        .order("prenom")
        .order("nom");
      if (error) throw error;
      return (data ?? []) as MembreLite[];
    },
  });

  const { data: recos = [], isLoading } = useQuery({
    queryKey: ["recos", "list"],
    queryFn: async (): Promise<Reco[]> => {
      const { data, error } = await supabase
        .from("recommandations")
        // `*` plutôt qu'une liste explicite : tant que la migration `saisi_par`
        // n'est pas appliquée, la colonne est simplement absente (repli sur membre_id).
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Reco[];
    },
  });

  // Participants des tête-à-tête (table de liaison reco_participants).
  const { data: participantsMap = {} } = useQuery({
    queryKey: ["reco_participants", "all"],
    queryFn: async (): Promise<Record<number, string[]>> => {
      const { data, error } = await supabase
        .from("reco_participants")
        .select("recommandation_id, membre_id");
      if (error) throw error;
      const map: Record<number, string[]> = {};
      (data ?? []).forEach((row) => {
        (map[row.recommandation_id] ??= []).push(row.membre_id);
      });
      return map;
    },
  });

  const semaineIds = useMemo(() => Array.from(new Set(recos.map((r) => r.semaine_id))), [recos]);

  const { data: semainesMap = {} } = useQuery({
    queryKey: ["semaines", "byIds", semaineIds],
    enabled: semaineIds.length > 0,
    queryFn: async (): Promise<Record<number, Semaine>> => {
      const { data, error } = await supabase
        .from("semaines")
        .select("id, date_debut, libelle")
        .in("id", semaineIds);
      if (error) throw error;
      const map: Record<number, Semaine> = {};
      (data ?? []).forEach((s) => {
        map[s.id] = s;
      });
      return map;
    },
  });

  const membresMap = useMemo(() => {
    const m: Record<string, MembreLite> = {};
    membres.forEach((x) => {
      m[x.id] = x;
    });
    return m;
  }, [membres]);

  // --- Filtres de l'historique (membre / type / plage de dates) ---
  const [fMembre, setFMembre] = useState<string>("__all__");
  const [fType, setFType] = useState<string>("__all__");
  const [fMesSaisies, setFMesSaisies] = useState(false);

  const filtresActifs = fMembre !== "__all__" || fType !== "__all__" || fMesSaisies;

  // « Mes saisies » rend le filtre Membre sans objet : on le remet à zéro et on le désactive.
  const toggleMesSaisies = (checked: boolean) => {
    setFMesSaisies(checked);
    if (checked) setFMembre("__all__");
  };

  const resetFiltres = () => {
    setFMembre("__all__");
    setFType("__all__");
    setFMesSaisies(false);
  };

  const recosFiltrees = useMemo(() => {
    return recos.filter((r) => {
      // Saisisseur réel ; à défaut (lignes anciennes), l'auteur de la reco.
      if (fMesSaisies && (r.saisi_par ?? r.membre_id) !== profile?.id) return false;
      if (fType !== "__all__" && r.type !== fType) return false;
      if (!fMesSaisies && fMembre !== "__all__") {
        const parts = participantsMap[r.id] ?? [];
        const concerne =
          r.membre_id === fMembre || r.membre_cible_id === fMembre || parts.includes(fMembre);
        if (!concerne) return false;
      }
      return true;
    });
  }, [recos, fMembre, fType, fMesSaisies, profile?.id, participantsMap]);

  // Hiérarchie Année > Mois > Semaine, basée sur la date de début de semaine.
  const annees = useMemo(() => {
    // 1. regrouper les recos par semaine
    const parSemaine = new Map<number, Reco[]>();
    recosFiltrees.forEach((r) => {
      const arr = parSemaine.get(r.semaine_id) ?? [];
      arr.push(r);
      parSemaine.set(r.semaine_id, arr);
    });

    // 2. construire la structure année > mois > semaines
    type SemaineGroup = { id: number; semaine?: Semaine; items: Reco[]; debut: string };
    type MoisGroup = { mois: number; annee: number; semaines: SemaineGroup[] };
    type AnneeGroup = { annee: number; mois: MoisGroup[] };

    const anneeMap = new Map<number, Map<number, SemaineGroup[]>>();

    Array.from(parSemaine.entries()).forEach(([id, items]) => {
      const semaine = semainesMap[id];
      const debut = semaine?.date_debut ?? "";
      const d = debut ? new Date(debut) : new Date(0);
      const annee = d.getFullYear();
      const mois = d.getMonth(); // 0-11

      if (!anneeMap.has(annee)) anneeMap.set(annee, new Map());
      const moisMap = anneeMap.get(annee)!;
      if (!moisMap.has(mois)) moisMap.set(mois, []);
      moisMap.get(mois)!.push({ id, semaine, items, debut });
    });

    // 3. trier : années desc, mois desc, semaines desc
    const result: AnneeGroup[] = Array.from(anneeMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([annee, moisMap]) => ({
        annee,
        mois: Array.from(moisMap.entries())
          .sort((a, b) => b[0] - a[0])
          .map(([mois, semaines]) => ({
            mois,
            annee,
            semaines: semaines.sort((a, b) => b.debut.localeCompare(a.debut)),
          })),
      }));

    return result;
  }, [recosFiltrees, semainesMap]);

  const now = new Date();
  const anneeCourante = now.getFullYear();
  const moisCourant = now.getMonth();

  const semaineCouranteId = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let best: { id: number; debut: string } | null = null;
    for (const id of semaineIds) {
      const debut = semainesMap[id]?.date_debut;
      if (!debut) continue;
      if (debut <= today && (!best || debut > best.debut)) {
        best = { id, debut };
      }
    }
    return best?.id ?? null;
  }, [semaineIds, semainesMap]);

  const ecranLarge = useMediaQuery("(min-width: 1024px)");

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold">Recommandations</h1>
          <HelpButton title="Comment fonctionne cette page" ariaLabel="Aide Recommandations">
            <p>Choisissez le type de saisie selon votre activité :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Tête-à-tête</strong> : vous avez rencontré un ou plusieurs membres.
                Sélectionnez tous les participants.
              </li>
              <li>
                <strong>Reco interne</strong> : vous recommandez un membre du groupe. Cochez « Je me
                recommande » si c'est vous que vous recommandez auprès de ce membre.
              </li>
              <li>
                <strong>Reco externe</strong> : vous transmettez un contact hors groupe à un membre
                destinataire.
              </li>
              <li>
                <strong>Merci pour le business</strong> : un membre vous a apporté du CA (indiquez
                le montant).
              </li>
            </ul>
            <p>
              Chaque saisie est automatiquement rattachée à la semaine en cours. Vous voyez
              l'historique de tous, mais ne modifiez que vos propres entrées.
            </p>
          </HelpButton>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Saisie rapide rattachée à la semaine en cours.
        </p>
      </header>

      {/* PC : saisie à gauche (reste visible au défilement), historique à droite.
          Mobile : une colonne, ordre inchangé. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
          <RecoForm
            membres={membres.filter((m) => m.id !== profile?.id)}
            allMembres={membres}
            isBureau={isBureau}
            isAdmin={isAdmin}
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ["recos", "list"] });
              qc.invalidateQueries({ queryKey: ["reco_participants", "all"] });
            }}
          />
          {isBureau && ecranLarge && <ExportRecos />}
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Historique</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={resetFiltres}
              disabled={!filtresActifs}
              className="h-8"
            >
              <X className="h-4 w-4 mr-1" /> Réinitialiser la recherche
            </Button>
          </div>

          <Card>
            <CardContent className="p-4 grid grid-cols-2 gap-3 wide:grid-cols-[1fr_1fr_auto] wide:items-end">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Membre
                </Label>
                <Select value={fMembre} onValueChange={setFMembre} disabled={fMesSaisies}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tous les membres</SelectItem>
                    {membres.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.prenom} {m.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={fType} onValueChange={setFType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tous les types</SelectItem>
                    <SelectItem value="tete_a_tete">Tête-à-tête</SelectItem>
                    <SelectItem value="reco_interne">Reco interne</SelectItem>
                    <SelectItem value="reco_externe">Reco externe</SelectItem>
                    <SelectItem value="merci_business">Merci pour le business</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 flex items-center gap-2 wide:col-span-1 wide:h-9">
                <Checkbox
                  id="f-mes-saisies"
                  checked={fMesSaisies}
                  onCheckedChange={(v) => toggleMesSaisies(v === true)}
                />
                <Label htmlFor="f-mes-saisies" className="text-sm font-normal cursor-pointer">
                  Voir mes dernières saisies
                </Label>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : annees.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {filtresActifs
                  ? "Aucune recommandation pour ces filtres."
                  : "Aucune recommandation."}
              </CardContent>
            </Card>
          ) : (
            annees.map((a) => (
              <AnneeBlock
                key={a.annee}
                annee={a.annee}
                mois={a.mois}
                defaultOpen={a.annee === anneeCourante}
                moisCourant={a.annee === anneeCourante ? moisCourant : -1}
                membresMap={membresMap}
                participantsMap={participantsMap}
                profileId={profile?.id}
                isBureau={isBureau}
                semaineCouranteId={semaineCouranteId}
              />
            ))
          )}
        </section>
      </div>

      {isBureau && !ecranLarge && <ExportRecos />}
    </div>
  );
}

// ---- Bloc Année (repliable) ----
function AnneeBlock({
  annee,
  mois,
  defaultOpen,
  moisCourant,
  membresMap,
  participantsMap,
  profileId,
  isBureau,
  semaineCouranteId,
}: {
  annee: number;
  mois: {
    mois: number;
    annee: number;
    semaines: { id: number; semaine?: Semaine; items: Reco[]; debut: string }[];
  }[];
  defaultOpen: boolean;
  moisCourant: number;
  membresMap: Record<string, MembreLite>;
  participantsMap: Record<number, string[]>;
  profileId?: string;
  isBureau: boolean;
  semaineCouranteId: number | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Mois sélectionné dans la grille (par défaut : mois en cours s'il a des recos)
  const [moisSelectionne, setMoisSelectionne] = useState<number | null>(
    mois.some((m) => m.mois === moisCourant) ? moisCourant : null,
  );
  const moisActif = mois.find((m) => m.mois === moisSelectionne);

  const selectionnerMois = (m: number) => setMoisSelectionne((actuel) => (actuel === m ? null : m));
  const total = mois.reduce(
    (acc, m) => acc + m.semaines.reduce((s, sem) => s + sem.items.length, 0),
    0,
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-lg border bg-card px-4 py-3 text-left hover:bg-accent transition-colors">
          <ChevronRight
            className={"h-5 w-5 shrink-0 transition-transform " + (open ? "rotate-90" : "")}
          />
          <span className="text-lg font-bold">{annee}</span>
          <Badge variant="outline" className="ml-auto">
            {total}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pl-2 pt-3 md:pl-4">
        <p className="text-xs text-muted-foreground">
          Cliquez sur un mois pour afficher ses semaines.
        </p>
        {/* grid-flow-row-dense : le panneau (pleine largeur) se place sous la ligne du mois
            cliqué, et les tuiles suivantes de cette ligne remontent combler les trous. */}
        <div className="grid grid-flow-row-dense grid-cols-2 gap-3 sm:grid-cols-3 wide:grid-cols-4 2xl:grid-cols-6">
          {mois.map((m) => (
            <Fragment key={m.mois}>
              <MoisTuile
                mois={m.mois}
                semaines={m.semaines}
                selected={m.mois === moisSelectionne}
                enCours={m.mois === moisCourant}
                onClick={() => selectionnerMois(m.mois)}
              />
              {moisActif?.mois === m.mois && (
                <SemainesPanneau
                  key={moisActif.mois}
                  annee={annee}
                  mois={moisActif.mois}
                  semaines={moisActif.semaines}
                  semaineCouranteId={semaineCouranteId}
                  onClose={() => setMoisSelectionne(null)}
                  membresMap={membresMap}
                  participantsMap={participantsMap}
                  profileId={profileId}
                  isBureau={isBureau}
                />
              )}
            </Fragment>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---- Tuile Mois (cliquable : affiche les semaines du mois sous la grille) ----
function MoisTuile({
  mois,
  semaines,
  selected,
  enCours,
  onClick,
}: {
  mois: number;
  semaines: { id: number; semaine?: Semaine; items: Reco[]; debut: string }[];
  selected: boolean;
  enCours: boolean;
  onClick: () => void;
}) {
  const total = semaines.reduce((s, sem) => s + sem.items.length, 0);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        "group relative flex flex-col gap-2 rounded-lg border p-3 text-left shadow-sm transition-all hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
        (selected
          ? // Flèche qui pointe vers le panneau des semaines, ouvert juste en dessous
            "border-primary bg-primary text-primary-foreground after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-x-[10px] after:border-t-[12px] after:border-x-transparent after:border-t-primary after:content-['']"
          : "bg-card hover:-translate-y-0.5")
      }
    >
      {/* Badge sous le nom : à côté, il débordait des tuiles étroites (« Septembre »). */}
      <div className="flex flex-col items-start gap-1">
        <span className="font-semibold leading-tight">{MOIS_FR[mois]}</span>
        {enCours && (
          <Badge variant={selected ? "secondary" : "default"} className="text-[10px]">
            En cours
          </Badge>
        )}
      </div>
      <div
        className={"text-xs " + (selected ? "text-primary-foreground/80" : "text-muted-foreground")}
      >
        <span className="text-base font-bold">{total}</span> reco{total > 1 ? "s" : ""} ·{" "}
        {semaines.length} semaine{semaines.length > 1 ? "s" : ""}
      </div>
      <span
        className={
          "mt-auto flex items-center gap-1 whitespace-nowrap text-xs font-medium " +
          (selected ? "text-primary-foreground" : "text-primary")
        }
      >
        {selected ? "Semaines affichées" : "Voir les semaines"}
        <ChevronRight
          className={
            "h-3.5 w-3.5 transition-transform " +
            (selected ? "rotate-90" : "group-hover:translate-x-0.5")
          }
        />
      </span>
    </button>
  );
}

// Ex. "6 – 12 oct." ou "29 sept. – 5 oct." à partir de la date de début (lundi)
function plageSemaine(debut: string): string | null {
  if (!debut) return null;
  const d = new Date(debut + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const f = new Date(d);
  f.setDate(d.getDate() + 6);
  const fmt = (x: Date, mois: boolean) =>
    x.toLocaleDateString("fr-FR", mois ? { day: "numeric", month: "short" } : { day: "numeric" });
  return d.getMonth() === f.getMonth()
    ? `${fmt(d, false)} – ${fmt(f, true)}`
    : `${fmt(d, true)} – ${fmt(f, true)}`;
}

// ---- Panneau des semaines d'un mois : onglets-dates + recos de la semaine choisie ----
function SemainesPanneau({
  annee,
  mois,
  semaines,
  semaineCouranteId,
  onClose,
  membresMap,
  participantsMap,
  profileId,
  isBureau,
}: {
  annee: number;
  mois: number;
  semaines: { id: number; semaine?: Semaine; items: Reco[]; debut: string }[];
  semaineCouranteId: number | null;
  onClose: () => void;
  membresMap: Record<string, MembreLite>;
  participantsMap: Record<number, string[]>;
  profileId?: string;
  isBureau: boolean;
}) {
  // Onglets dans l'ordre chronologique (les semaines arrivent triées de la plus récente à la plus ancienne)
  const chrono = useMemo(() => [...semaines].reverse(), [semaines]);
  // Par défaut : semaine en cours si elle est dans ce mois, sinon la plus récente
  const [selectionId, setSelectionId] = useState<number>(
    semaines.some((g) => g.id === semaineCouranteId) ? semaineCouranteId! : semaines[0]?.id,
  );
  const active = semaines.find((g) => g.id === selectionId) ?? semaines[0];

  return (
    <div className="col-span-full space-y-3 rounded-lg border-2 border-primary bg-primary/5 p-3 md:p-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-primary">
          Semaines de {MOIS_FR[mois].toLowerCase()} {annee}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2"
          onClick={onClose}
          aria-label="Fermer les semaines"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div role="tablist" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {chrono.map((g) => {
          const selected = g.id === active?.id;
          const enCours = g.id === semaineCouranteId;
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSelectionId(g.id)}
              className={
                "flex shrink-0 flex-col items-start rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                (selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:border-primary hover:bg-primary/10")
              }
            >
              <span className="flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold">
                {plageSemaine(g.debut) ?? g.semaine?.libelle ?? `Semaine #${g.id}`}
                {enCours && (
                  <span
                    className={"h-2 w-2 rounded-full " + (selected ? "bg-accent" : "bg-primary")}
                    title="Semaine en cours"
                  />
                )}
              </span>
              <span
                className={
                  "text-xs " + (selected ? "text-primary-foreground/80" : "text-muted-foreground")
                }
              >
                {g.items.length} reco{g.items.length > 1 ? "s" : ""}
                {enCours ? " · en cours" : ""}
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <Card role="tabpanel">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-primary">
              {active.semaine?.libelle ?? `Semaine #${active.id}`}
              {active.id === semaineCouranteId && <Badge className="text-[10px]">En cours</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 divide-y">
            {active.items.map((r) => (
              <RecoRow
                key={r.id}
                reco={r}
                emetteur={membresMap[r.membre_id]}
                cible={r.membre_cible_id ? membresMap[r.membre_cible_id] : undefined}
                participants={(participantsMap[r.id] ?? [])
                  .map((id) => membresMap[id])
                  .filter(Boolean)}
                canEdit={isBureau || r.membre_id === profileId}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RecoForm({
  membres,
  allMembres,
  isBureau,
  isAdmin,
  onCreated,
}: {
  membres: MembreLite[]; // sans soi-même (pour T-à-T, reco interne classique, reco externe, merci)
  allMembres: MembreLite[]; // avec soi-même : sert à choisir l'auteur en saisie déléguée
  isBureau: boolean;
  isAdmin: boolean;
  onCreated: () => void;
}) {
  const { data: profile } = useProfile();
  const [type, setType] = useState<RecoType>("tete_a_tete");
  const [membreCible, setMembreCible] = useState<string>(""); // reco interne / externe / merci
  const [participants, setParticipants] = useState<string[]>([]); // tête-à-tête (multi)
  const [rechercheParticipant, setRechercheParticipant] = useState(""); // filtre de la liste T-à-T
  const [autoReco, setAutoReco] = useState(false); // reco interne : "je me recommande"
  const [contactExterne, setContactExterne] = useState("");
  const [montant, setMontant] = useState("");
  const [pourAutre, setPourAutre] = useState(false); // bureau : saisir au nom d'un autre
  const [auteurId, setAuteurId] = useState<string>(""); // membre au nom duquel on saisit
  const [pourSemaineAnterieure, setPourSemaineAnterieure] = useState(false); // admin : rattacher à une autre semaine
  const [semaineChoisieId, setSemaineChoisieId] = useState<string>(""); // semaine antérieure sélectionnée

  // Liste des semaines existantes (pour la saisie antérieure, réservée aux admins).
  const { data: semaines = [] } = useQuery({
    queryKey: ["semaines", "all"],
    enabled: isAdmin,
    queryFn: async (): Promise<Semaine[]> => {
      const { data, error } = await supabase
        .from("semaines")
        .select("id, date_debut, libelle")
        .order("date_debut", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Semaine[];
    },
  });

  const resetFields = () => {
    setMembreCible("");
    setParticipants([]);
    setAutoReco(false);
    setContactExterne("");
    setMontant("");
    setPourAutre(false);
    setAuteurId("");
    setPourSemaineAnterieure(false);
    setSemaineChoisieId("");
  };

  const toggleParticipant = (id: string) => {
    setParticipants((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Auteur effectif de la saisie : un autre membre si le bureau délègue, sinon soi-même.
  const delegue = isBureau && pourAutre && auteurId !== "";
  const auteurEffectifId = delegue ? auteurId : profile?.id;

  // Liste des membres "cible" (destinataire / participants), excluant l'auteur effectif.
  const membresCibles = allMembres.filter((m) => m.id !== auteurEffectifId);
  // Tête-à-tête : la recherche filtre l'affichage, les membres déjà cochés restent visibles.
  const participantsVisibles = rechercheParticipant.trim()
    ? membresCibles.filter(
        (m) => participants.includes(m.id) || membreCorrespond(m, rechercheParticipant),
      )
    : membresCibles;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profil non chargé");
      if (delegue && !auteurId) throw new Error("Sélectionnez le membre au nom duquel saisir");

      // Semaine de rattachement : par défaut la semaine en cours ; un admin peut
      // choisir une semaine antérieure déjà existante.
      const semaineAnterieure = isAdmin && pourSemaineAnterieure;
      let semaineId: number;
      if (semaineAnterieure) {
        if (!semaineChoisieId) throw new Error("Sélectionnez une semaine");
        semaineId = Number(semaineChoisieId);
      } else {
        const { data, error: semErr } = await supabase.rpc("get_or_create_semaine");
        if (semErr) throw semErr;
        semaineId = data as number;
      }

      const auteur = auteurEffectifId!; // émetteur réel (soi-même ou membre délégué)

      const payload: TablesInsert<"recommandations"> = {
        type,
        membre_id: auteur,
        semaine_id: semaineId,
      };

      if (type === "tete_a_tete") {
        if (participants.length === 0) throw new Error("Sélectionnez au moins un membre");
        // 1 ligne + N participants ; les stats pondèrent par le nombre de participants.
      } else if (type === "reco_externe") {
        if (!contactExterne.trim()) throw new Error("Nom du contact externe requis");
        if (!membreCible) throw new Error("Sélectionnez le membre destinataire");
        payload.contact_externe = contactExterne.trim();
        payload.membre_cible_id = membreCible;
      } else {
        // reco_interne ou merci_business
        if (!membreCible) throw new Error("Sélectionnez un membre");
        payload.membre_cible_id = membreCible;
        if (type === "reco_interne" && autoReco) {
          payload.notes = "auto_reco";
        }
      }

      if (type === "merci_business") {
        const m = Number(montant.replace(",", "."));
        if (!isFinite(m) || m <= 0) throw new Error("Montant invalide");
        payload.montant = m;
      }

      // Insertion principale (on récupère l'id pour la liaison + notifications).
      const { data: inserted, error } = await supabase
        .from("recommandations")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      const recoId = inserted!.id as number;

      // Tête-à-tête : insérer les participants dans la table de liaison.
      if (type === "tete_a_tete") {
        const rows = participants.map((membre_id) => ({
          recommandation_id: recoId,
          membre_id,
        }));
        const { error: partErr } = await supabase.from("reco_participants").insert(rows);
        if (partErr) throw partErr;
      }

      // Notifications (best-effort, ne bloque pas la saisie).
      // Nom affiché = l'émetteur réel (le membre délégué, pas la personne du bureau qui saisit).
      const emMembre = allMembres.find((m) => m.id === auteur);
      const emName = emMembre
        ? `${emMembre.prenom} ${emMembre.nom}`
        : `${profile.prenom} ${profile.nom}`;
      // En saisie déléguée, ne pas notifier l'auteur choisi NI la personne du bureau qui saisit.
      const exclureIds = Array.from(new Set([auteur, profile.id]));
      const filtrer = (ids: string[]) => ids.filter((id) => !exclureIds.includes(id));

      // Saisie rétroactive (semaine antérieure) : ne pas notifier, c'est une
      // régularisation d'historique.
      if (semaineAnterieure) return;

      if (type === "reco_interne") {
        const titre = autoReco
          ? `${emName} s'est recommandé auprès de vous`
          : `Nouvelle reco de ${emName}`;
        await creerNotificationsSafe({
          typeContenu: "recommandation",
          contenuId: recoId,
          titre,
          membreIds: filtrer([membreCible]),
          exclureId: profile.id,
        });
      } else if (type === "reco_externe") {
        await creerNotificationsSafe({
          typeContenu: "recommandation",
          contenuId: recoId,
          titre: `${emName} vous transmet un contact : ${contactExterne.trim()}`,
          membreIds: filtrer([membreCible]),
          exclureId: profile.id,
        });
      }
    },
    onSuccess: () => {
      toast.success("Recommandation enregistrée");
      resetFields();
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const needsMontant = type === "merci_business";
  const membreLabel =
    type === "reco_interne"
      ? autoReco
        ? "Membre auprès de qui vous vous recommandez"
        : "Membre destinataire"
      : type === "reco_externe"
        ? "Membre destinataire"
        : "Merci à";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nouvelle saisie</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TYPE_META) as RecoType[]).map((t) => {
              const meta = TYPE_META[t];
              const Icon = meta.icon;
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                  }}
                  className={
                    "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors " +
                    (active
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-input hover:bg-accent")
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{meta.label}</span>
                  {active && <Check className="h-4 w-4 ml-auto shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* SAISIE DÉLÉGUÉE (bureau/admin) : saisir au nom d'un autre membre */}
          {isBureau && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/50 p-3">
              <button
                type="button"
                onClick={() => {
                  setPourAutre((v) => !v);
                  setAuteurId("");
                  setMembreCible("");
                  setParticipants([]);
                }}
                className="flex w-full items-center gap-3 text-left text-sm"
              >
                <FauxCheck checked={pourAutre} />
                <span className="font-medium">Saisir pour un autre membre</span>
              </button>
              {pourAutre && (
                <div className="space-y-1.5">
                  <Label>Membre au nom duquel saisir</Label>
                  <Select
                    value={auteurId}
                    onValueChange={(v) => {
                      setAuteurId(v);
                      setMembreCible("");
                      setParticipants([]);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir le membre…" />
                    </SelectTrigger>
                    <SelectContent>
                      {allMembres.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.prenom} {m.nom}
                          {m.entreprise ? ` — ${m.entreprise}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    La recommandation sera enregistrée comme si elle venait de ce membre.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SAISIE ANTÉRIEURE (admin) : rattacher à une semaine passée */}
          {isAdmin && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/50 p-3">
              <button
                type="button"
                onClick={() => {
                  setPourSemaineAnterieure((v) => !v);
                  setSemaineChoisieId("");
                }}
                className="flex w-full items-center gap-3 text-left text-sm"
              >
                <FauxCheck checked={pourSemaineAnterieure} />
                <span className="font-medium">Rattacher à une semaine antérieure</span>
              </button>
              {pourSemaineAnterieure && (
                <div className="space-y-1.5">
                  <Label>Semaine</Label>
                  <Select value={semaineChoisieId} onValueChange={setSemaineChoisieId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir la semaine…" />
                    </SelectTrigger>
                    <SelectContent>
                      {semaines.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.libelle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    La recommandation sera comptabilisée sur cette semaine. Aucune notification
                    n'est envoyée pour une saisie rétroactive.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TÊTE-À-TÊTE : sélection multiple de participants */}
          {type === "tete_a_tete" && (
            <div className="space-y-2">
              <Label>
                Membres rencontrés ({participants.length} sélectionné
                {participants.length > 1 ? "s" : ""})
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={rechercheParticipant}
                  onChange={(e) => setRechercheParticipant(e.target.value)}
                  placeholder="Rechercher un membre…"
                  className="pl-9"
                  aria-label="Rechercher un membre rencontré"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border divide-y lg:max-h-72">
                {participantsVisibles.length === 0 && (
                  <p className="px-3 py-2.5 text-sm text-muted-foreground">Aucun membre trouvé.</p>
                )}
                {participantsVisibles.map((m) => {
                  const checked = participants.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleParticipant(m.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
                    >
                      <FauxCheck checked={checked} />
                      <span className="truncate">
                        {m.prenom} {m.nom}
                        {m.entreprise ? ` — ${m.entreprise}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* RECO INTERNE : case "je me recommande" + sélecteur membre */}
          {type === "reco_interne" && (
            <>
              <button
                type="button"
                onClick={() => setAutoReco((v) => !v)}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm hover:bg-accent transition-colors"
              >
                <FauxCheck checked={autoReco} />
                <span>Je me recommande auprès de ce membre</span>
              </button>
              <div className="space-y-1.5">
                <Label>{membreLabel}</Label>
                <MembreCombobox
                  membres={membresCibles}
                  value={membreCible}
                  onChange={setMembreCible}
                  placeholder="Choisir un membre…"
                />
              </div>
            </>
          )}

          {/* MERCI BUSINESS : sélecteur « Merci à » */}
          {type === "merci_business" && (
            <div className="space-y-1.5">
              <Label>{membreLabel}</Label>
              <MembreCombobox
                membres={membresCibles}
                value={membreCible}
                onChange={setMembreCible}
                placeholder="Choisir un membre…"
              />
              <p className="text-xs text-muted-foreground">Membre qui vous a apporté ce business</p>
            </div>
          )}

          {/* RECO EXTERNE : contact + membre destinataire */}
          {type === "reco_externe" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="contact">Nom du contact</Label>
                <Input
                  id="contact"
                  value={contactExterne}
                  onChange={(e) => setContactExterne(e.target.value)}
                  placeholder="Prénom Nom / Société"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{membreLabel}</Label>
                <MembreCombobox
                  membres={membresCibles}
                  value={membreCible}
                  onChange={setMembreCible}
                  placeholder="À qui transmettez-vous ce contact ?"
                />
              </div>
            </>
          )}

          {needsMontant && (
            <div className="space-y-1.5">
              <Label htmlFor="montant">Montant (€)</Label>
              <Input
                id="montant"
                inputMode="decimal"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}

          <Button type="submit" className="w-full h-11" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RecoRow({
  reco,
  emetteur,
  cible,
  participants = [],
  canEdit,
}: {
  reco: Reco;
  emetteur?: MembreLite;
  cible?: MembreLite;
  participants?: MembreLite[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const meta = TYPE_META[reco.type];
  const Icon = meta.icon;
  const emName = emetteur ? `${emetteur.prenom} ${emetteur.nom}` : "—";
  const cibleName = cible ? `${cible.prenom} ${cible.nom}` : (reco.contact_externe ?? "—");
  const isAutoReco = reco.type === "reco_interne" && reco.notes === "auto_reco";

  // Pour le tête-à-tête : lister les participants (sinon retomber sur membre_cible_id).
  const participantsName =
    participants.length > 0
      ? participants.map((p) => `${p.prenom} ${p.nom}`).join(", ")
      : cibleName;

  const description =
    reco.type === "tete_a_tete"
      ? `${emName} ↔ ${participantsName}`
      : reco.type === "reco_interne"
        ? isAutoReco
          ? `${emName} s'est recommandé auprès de ${cibleName}`
          : `${emName} → ${cibleName}`
        : reco.type === "reco_externe"
          ? `${emName} → ${cibleName} (externe) → ${reco.contact_externe ?? ""}`
          : `${cibleName} → ${emName}`; // merci : emetteur du remerciement est membre_id, le membre cible a apporté le business

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("recommandations").delete().eq("id", reco.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["recos", "list"] });
      qc.invalidateQueries({ queryKey: ["reco_participants", "all"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="py-3 border-b last:border-b-0">
      <div className="flex items-start gap-3">
        <div
          className={"h-8 w-8 rounded-md flex items-center justify-center shrink-0 " + meta.color}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {meta.short}
            </Badge>
            {isAutoReco && (
              <Badge variant="outline" className="text-[10px]">
                Auto
              </Badge>
            )}
            {reco.montant != null && (
              <Badge className="text-[10px]">
                {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                  Number(reco.montant),
                )}
              </Badge>
            )}
          </div>
          <p className="text-sm mt-0.5 break-words">{description}</p>
        </div>
        {canEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer cette recommandation ?</AlertDialogTitle>
                <AlertDialogDescription>Cette action est définitive.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => del.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <Comments typeContenu="recommandation" contenuId={reco.id} />
    </div>
  );
}
