import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, hasRole } from "@/hooks/use-profile";
import { creerNotificationsSafe } from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Comments } from "@/components/Comments";
import { ExportRecos } from "@/components/ExportRecos";
import { HelpButton } from "@/components/HelpButton";
import {
  Handshake, Users2, UserPlus, Euro, Trash2, Loader2, Check, ClipboardCheck,
  ChevronRight, Filter, X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/recommandations")({
  head: () => ({ meta: [{ title: "Recommandations — OLB" }] }),
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
  valide: boolean;
  semaine_id: number;
  notes: string | null;
  created_at: string;
};

type Semaine = { id: number; date_debut: string; libelle: string };
type MembreLite = { id: string; nom: string; prenom: string; entreprise: string | null };

const TYPE_META: Record<RecoType, { label: string; short: string; icon: typeof Handshake; color: string }> = {
  tete_a_tete:    { label: "Tête-à-tête",            short: "T-à-T",   icon: Users2,    color: "bg-blue-100 text-blue-800" },
  reco_interne:   { label: "Reco interne", short: "Interne", icon: Handshake, color: "bg-emerald-100 text-emerald-800" },
  reco_externe:   { label: "Reco externe", short: "Externe", icon: UserPlus,  color: "bg-amber-100 text-amber-800" },
  merci_business: { label: "Thx U 4 Pepette", short: "Merci",   icon: Euro,      color: "bg-fuchsia-100 text-fuchsia-800" },
};

// ---- Helpers de regroupement par année / mois ----
const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
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
  const qc = useQueryClient();

  const { data: membres = [] } = useQuery({
    queryKey: ["membres", "lite"],
    queryFn: async (): Promise<MembreLite[]> => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, nom, prenom, entreprise")
        .eq("statut", "actif")
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
        .select("id, type, membre_id, membre_cible_id, contact_externe, montant, valide, semaine_id, notes, created_at")
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
      (data ?? []).forEach((row: any) => {
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
      (data ?? []).forEach((s: any) => { map[s.id] = s as Semaine; });
      return map;
    },
  });

  const membresMap = useMemo(() => {
    const m: Record<string, MembreLite> = {};
    membres.forEach((x) => { m[x.id] = x; });
    return m;
  }, [membres]);

  // --- Filtres de l'historique (membre / type / plage de dates) ---
  const [fMembre, setFMembre] = useState<string>("__all__");
  const [fType, setFType] = useState<string>("__all__");

  const filtresActifs = fMembre !== "__all__" || fType !== "__all__";

  const resetFiltres = () => {
    setFMembre("__all__");
    setFType("__all__");
  };

  const recosFiltrees = useMemo(() => {
    return recos.filter((r) => {
      if (fType !== "__all__" && r.type !== fType) return false;
      if (fMembre !== "__all__") {
        const parts = participantsMap[r.id] ?? [];
        const concerne =
          r.membre_id === fMembre ||
          r.membre_cible_id === fMembre ||
          parts.includes(fMembre);
        if (!concerne) return false;
      }
      return true;
    });
  }, [recos, fMembre, fType, participantsMap]);

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

  const aValider = useMemo(() => recos.filter((r) => r.type === "merci_business" && !r.valide), [recos]);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold">Recommandations</h1>
          <HelpButton title="Comment fonctionne cette page" ariaLabel="Aide Recommandations">
            <p>Choisissez le type de saisie selon votre activité :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Tête-à-tête</strong> : vous avez rencontré un ou plusieurs membres. Sélectionnez tous les participants.</li>
              <li><strong>Reco interne</strong> : vous recommandez un membre du groupe. Cochez « Je me recommande » si c'est vous que vous recommandez auprès de ce membre.</li>
              <li><strong>Reco externe</strong> : vous transmettez un contact hors groupe à un membre destinataire.</li>
              <li><strong>Merci pour le business</strong> : un membre vous a apporté du CA (indiquez le montant).</li>
            </ul>
            <p>
              Chaque saisie est automatiquement rattachée à la semaine en cours.
              Vous voyez l'historique de tous, mais ne modifiez que vos propres entrées.
            </p>
          </HelpButton>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Saisie rapide rattachée à la semaine en cours.
        </p>
      </header>

      {isBureau && aValider.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              À valider ({aValider.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 divide-y">
            {aValider.map((r) => (
              <AValiderRow
                key={r.id}
                reco={r}
                emetteur={membresMap[r.membre_id]}
                cible={r.membre_cible_id ? membresMap[r.membre_cible_id] : undefined}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <RecoForm
        membres={membres.filter((m) => m.id !== profile?.id)}
        allMembres={membres}
        isBureau={isBureau}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["recos", "list"] });
          qc.invalidateQueries({ queryKey: ["reco_participants", "all"] });
        }}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Historique</h2>
          {filtresActifs && (
            <Button variant="ghost" size="sm" onClick={resetFiltres} className="h-8 text-muted-foreground">
              <X className="h-4 w-4 mr-1" /> Réinitialiser
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-4 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Filter className="h-3 w-3" /> Membre
              </Label>
              <Select value={fMembre} onValueChange={setFMembre}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous les membres</SelectItem>
                  {membres.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.prenom} {m.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={fType} onValueChange={setFType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous les types</SelectItem>
                  <SelectItem value="tete_a_tete">Tête-à-tête</SelectItem>
                  <SelectItem value="reco_interne">Reco interne</SelectItem>
                  <SelectItem value="reco_externe">Reco externe</SelectItem>
                  <SelectItem value="merci_business">Merci pour le business</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : annees.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">
            {filtresActifs ? "Aucune recommandation pour ces filtres." : "Aucune recommandation."}
          </CardContent></Card>
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

      {isBureau && <ExportRecos />}
    </div>
  );
}

// ---- Bloc Année (repliable) ----
function AnneeBlock({
  annee, mois, defaultOpen, moisCourant, membresMap, participantsMap, profileId, isBureau, semaineCouranteId,
}: {
  annee: number;
  mois: { mois: number; annee: number; semaines: { id: number; semaine?: Semaine; items: Reco[]; debut: string }[] }[];
  defaultOpen: boolean;
  moisCourant: number;
  membresMap: Record<string, MembreLite>;
  participantsMap: Record<number, string[]>;
  profileId?: string;
  isBureau: boolean;
  semaineCouranteId: number | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const total = mois.reduce((acc, m) => acc + m.semaines.reduce((s, sem) => s + sem.items.length, 0), 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-lg border bg-card px-4 py-3 text-left hover:bg-accent transition-colors">
          <ChevronRight className={"h-5 w-5 shrink-0 transition-transform " + (open ? "rotate-90" : "")} />
          <span className="text-lg font-bold">{annee}</span>
          <Badge variant="outline" className="ml-auto">{total}</Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pl-2 pt-3 md:pl-4">
        {mois.map((m) => (
          <MoisBlock
            key={m.mois}
            mois={m.mois}
            semaines={m.semaines}
            defaultOpen={m.mois === moisCourant}
            membresMap={membresMap}
            participantsMap={participantsMap}
            profileId={profileId}
            isBureau={isBureau}
            semaineCouranteId={semaineCouranteId}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---- Bloc Mois (repliable) ----
function MoisBlock({
  mois, semaines, defaultOpen, membresMap, participantsMap, profileId, isBureau, semaineCouranteId,
}: {
  mois: number;
  semaines: { id: number; semaine?: Semaine; items: Reco[]; debut: string }[];
  defaultOpen: boolean;
  membresMap: Record<string, MembreLite>;
  participantsMap: Record<number, string[]>;
  profileId?: string;
  isBureau: boolean;
  semaineCouranteId: number | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const total = semaines.reduce((s, sem) => s + sem.items.length, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent transition-colors">
          <ChevronRight className={"h-4 w-4 shrink-0 transition-transform " + (open ? "rotate-90" : "")} />
          <span className="font-semibold">{MOIS_FR[mois]}</span>
          <Badge variant="outline" className="ml-auto text-[10px]">{total}</Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        {semaines.map((g) => (
          <SemaineBlock
            key={g.id}
            group={g}
            defaultOpen={g.id === semaineCouranteId}
            membresMap={membresMap}
            participantsMap={participantsMap}
            profileId={profileId}
            isBureau={isBureau}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---- Bloc Semaine (repliable ; seule la semaine en cours ouverte par défaut) ----
function SemaineBlock({
  group, defaultOpen, membresMap, participantsMap, profileId, isBureau,
}: {
  group: { id: number; semaine?: Semaine; items: Reco[]; debut: string };
  defaultOpen: boolean;
  membresMap: Record<string, MembreLite>;
  participantsMap: Record<number, string[]>;
  profileId?: string;
  isBureau: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const libelle = group.semaine?.libelle ?? `Semaine #${group.id}`;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-accent/50 transition-colors rounded-t-lg">
            <ChevronRight className={"h-4 w-4 shrink-0 transition-transform " + (open ? "rotate-90" : "")} />
            <span className="text-sm font-semibold text-primary">{libelle}</span>
            {defaultOpen && (
              <Badge className="text-[10px]">En cours</Badge>
            )}
            <Badge variant="outline" className="ml-auto text-[10px]">{group.items.length}</Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 divide-y">
            {group.items.map((r) => (
              <RecoRow
                key={r.id}
                reco={r}
                emetteur={membresMap[r.membre_id]}
                cible={r.membre_cible_id ? membresMap[r.membre_cible_id] : undefined}
                participants={(participantsMap[r.id] ?? []).map((id) => membresMap[id]).filter(Boolean)}
                canEdit={isBureau || r.membre_id === profileId}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function RecoForm({
  membres, allMembres, isBureau, onCreated,
}: {
  membres: MembreLite[];      // sans soi-même (pour T-à-T, reco interne classique, reco externe, merci)
  allMembres: MembreLite[];   // avec soi-même : sert à choisir l'auteur en saisie déléguée
  isBureau: boolean;
  onCreated: () => void;
}) {
  const { data: profile } = useProfile();
  const [type, setType] = useState<RecoType>("tete_a_tete");
  const [membreCible, setMembreCible] = useState<string>("");          // reco interne / externe / merci
  const [participants, setParticipants] = useState<string[]>([]);       // tête-à-tête (multi)
  const [autoReco, setAutoReco] = useState(false);                      // reco interne : "je me recommande"
  const [contactExterne, setContactExterne] = useState("");
  const [montant, setMontant] = useState("");
  const [pourAutre, setPourAutre] = useState(false);                  // bureau : saisir au nom d'un autre
  const [auteurId, setAuteurId] = useState<string>("");               // membre au nom duquel on saisit

  const resetFields = () => {
    setMembreCible("");
    setParticipants([]);
    setAutoReco(false);
    setContactExterne("");
    setMontant("");
    setPourAutre(false);
    setAuteurId("");
  };

  const toggleParticipant = (id: string) => {
    setParticipants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // Auteur effectif de la saisie : un autre membre si le bureau délègue, sinon soi-même.
  const delegue = isBureau && pourAutre && auteurId !== "";
  const auteurEffectifId = delegue ? auteurId : profile?.id;

  // Liste des membres "cible" (destinataire / participants), excluant l'auteur effectif.
  const membresCibles = allMembres.filter((m) => m.id !== auteurEffectifId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profil non chargé");
      if (delegue && !auteurId) throw new Error("Sélectionnez le membre au nom duquel saisir");
      const { data: semaineId, error: semErr } = await supabase.rpc("get_or_create_semaine");
      if (semErr) throw semErr;

      const auteur = auteurEffectifId!;  // émetteur réel (soi-même ou membre délégué)

      const payload: any = {
        type,
        membre_id: auteur,
        semaine_id: semaineId,
      };

      if (type === "tete_a_tete") {
        if (participants.length === 0) throw new Error("Sélectionnez au moins un membre");
        // 1 seule ligne (compte pour 1 dans les stats), participants en liaison.
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
    type === "reco_interne" ? (autoReco ? "Membre auprès de qui vous vous recommandez" : "Membre destinataire") :
    type === "reco_externe" ? "Membre destinataire" :
    "Membre émetteur";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nouvelle saisie</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
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
                  onClick={() => { setType(t); }}
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
                onClick={() => { setPourAutre((v) => !v); setAuteurId(""); setMembreCible(""); setParticipants([]); }}
                className="flex w-full items-center gap-3 text-left text-sm"
              >
                <FauxCheck checked={pourAutre} />
                <span className="font-medium">Saisir pour un autre membre</span>
              </button>
              {pourAutre && (
                <div className="space-y-1.5">
                  <Label>Membre au nom duquel saisir</Label>
                  <Select value={auteurId} onValueChange={(v) => { setAuteurId(v); setMembreCible(""); setParticipants([]); }}>
                    <SelectTrigger><SelectValue placeholder="Choisir le membre…" /></SelectTrigger>
                    <SelectContent>
                      {allMembres.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.prenom} {m.nom}{m.entreprise ? ` — ${m.entreprise}` : ""}
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
          
          {/* TÊTE-À-TÊTE : sélection multiple de participants */}
          {type === "tete_a_tete" && (
            <div className="space-y-2">
              <Label>Membres rencontrés ({participants.length} sélectionné{participants.length > 1 ? "s" : ""})</Label>
              <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
                {membresCibles.map((m) => {
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
                        {m.prenom} {m.nom}{m.entreprise ? ` — ${m.entreprise}` : ""}
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
                <Select value={membreCible} onValueChange={setMembreCible}>
                  <SelectTrigger><SelectValue placeholder="Choisir un membre…" /></SelectTrigger>
                  <SelectContent>
                    {membresCibles.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.prenom} {m.nom}{m.entreprise ? ` — ${m.entreprise}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* MERCI BUSINESS : sélecteur membre émetteur */}
          {type === "merci_business" && (
            <div className="space-y-1.5">
              <Label>{membreLabel}</Label>
              <Select value={membreCible} onValueChange={setMembreCible}>
                <SelectTrigger><SelectValue placeholder="Choisir un membre…" /></SelectTrigger>
                <SelectContent>
                  {membresCibles.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.prenom} {m.nom}{m.entreprise ? ` — ${m.entreprise}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <Select value={membreCible} onValueChange={setMembreCible}>
                  <SelectTrigger><SelectValue placeholder="À qui transmettez-vous ce contact ?" /></SelectTrigger>
                  <SelectContent>
                    {membresCibles.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.prenom} {m.nom}{m.entreprise ? ` — ${m.entreprise}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
  reco, emetteur, cible, participants = [], canEdit,
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
  const cibleName = cible ? `${cible.prenom} ${cible.nom}` : reco.contact_externe ?? "—";
  const isAutoReco = reco.type === "reco_interne" && reco.notes === "auto_reco";

  // Pour le tête-à-tête : lister les participants (sinon retomber sur membre_cible_id).
  const participantsName =
    participants.length > 0
      ? participants.map((p) => `${p.prenom} ${p.nom}`).join(", ")
      : cibleName;

  const description =
    reco.type === "tete_a_tete" ? `${emName} ↔ ${participantsName}` :
    reco.type === "reco_interne"
      ? (isAutoReco ? `${emName} s'est recommandé auprès de ${cibleName}` : `${emName} → ${cibleName}`) :
    reco.type === "reco_externe" ? `${emName} → ${cibleName} (externe) → ${reco.contact_externe ?? ""}` :
    `${cibleName} → ${emName}`; // merci : emetteur du remerciement est membre_id, le membre cible a apporté le business

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
        <div className={"h-8 w-8 rounded-md flex items-center justify-center shrink-0 " + meta.color}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{meta.short}</Badge>
            {isAutoReco && <Badge variant="outline" className="text-[10px]">Auto</Badge>}
            {reco.montant != null && (
              <Badge className="text-[10px]">
                {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(reco.montant))}
              </Badge>
            )}
          </div>
          <p className="text-sm mt-0.5 break-words">{description}</p>
        </div>
        {canEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive">
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

function AValiderRow({
  reco,
  emetteur,
  cible,
}: {
  reco: Reco;
  emetteur?: MembreLite;
  cible?: MembreLite;
}) {
  const qc = useQueryClient();
  const emName = emetteur ? `${emetteur.prenom} ${emetteur.nom}` : "—";
  const cibleName = cible ? `${cible.prenom} ${cible.nom}` : "—";

  const validate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("recommandations")
        .update({ valide: true })
        .eq("id", reco.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Montant validé");
      qc.invalidateQueries({ queryKey: ["recos", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 bg-fuchsia-100 text-fuchsia-800">
        <Euro className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">Merci</Badge>
          {reco.montant != null && (
            <Badge className="text-[10px]">
              {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(reco.montant))}
            </Badge>
          )}
        </div>
        <p className="text-sm mt-0.5 truncate">{cibleName} → {emName}</p>
      </div>
      <Button
        size="sm"
        disabled={validate.isPending}
        onClick={() => validate.mutate()}
      >
        {validate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Valider"}
      </Button>
    </div>
  );
}