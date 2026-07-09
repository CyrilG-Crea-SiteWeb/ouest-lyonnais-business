import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, MapPin, Calendar, Users, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, peutGererEvenementsSondages } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { creerNotificationsSafe, getMembresActifsIds } from "@/lib/notifications";
import { titreConference } from "@/lib/conferences";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/evenements")({
  head: () => ({ meta: [{ title: "Événements — OLB" }] }),
  component: EvenementsPage,
});

type Statut = "present" | "absent" | "peut_etre";
type Evenement = {
  id: number;
  titre: string;
  date_event: string;
  lieu: string | null;
  description: string | null;
  capacite: number | null;
  createur_id: string;
  est_conference: boolean;
};
type Inscription = {
  id: number;
  evenement_id: number;
  membre_id: string;
  statut: Statut;
};
type ConferenceIntervenant = { evenement_id: number; membre_id: string };
type MembreLite = { id: string; prenom: string; nom: string };

// Nom complet d'un membre à partir de la map (ou libellé par défaut).
function nomComplet(membres: Map<string, MembreLite>, id: string) {
  const m = membres.get(id);
  return m ? `${m.prenom} ${m.nom}` : "Membre";
}

// Convertit une date ISO en valeur acceptée par <input type="datetime-local">.
function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EvenementsPage() {
  const { data: profile } = useProfile();
  const canManage = peutGererEvenementsSondages(profile?.role);

  const evQ = useQuery({
    queryKey: ["evenements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evenements")
        .select("*")
        .order("date_event", { ascending: true });
      if (error) throw error;
      return data as Evenement[];
    },
  });

  const insQ = useQuery({
    queryKey: ["inscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inscriptions").select("*");
      if (error) throw error;
      return data as Inscription[];
    },
  });

  // Liaison conférence ↔ intervenants. La table n'est pas encore dans les
  // types générés → cast minimal (à régénérer côté Lovable).
  const ciQ = useQuery({
    queryKey: ["conference_intervenants"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("conference_intervenants")
        .select("evenement_id, membre_id");
      if (error) throw error;
      return data as ConferenceIntervenant[];
    },
  });

  const membresQ = useQuery({
    queryKey: ["membres", "lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("membres").select("id, prenom, nom");
      if (error) throw error;
      return data as MembreLite[];
    },
    staleTime: 60_000,
  });

  const { conferencesAVenir, upcoming, past } = useMemo(() => {
    const now = Date.now();
    const list = evQ.data ?? [];
    const aVenir = (e: Evenement) => new Date(e.date_event).getTime() >= now;
    return {
      // Conférences à venir : bloc dédié, au-dessus des événements classiques.
      conferencesAVenir: list.filter((e) => e.est_conference && aVenir(e)),
      // Événements classiques à venir (les conférences en sont exclues).
      upcoming: list.filter((e) => !e.est_conference && aVenir(e)),
      // Passés : tous les événements (conférences incluses), inchangé.
      past: [...list]
        .filter((e) => new Date(e.date_event).getTime() < now)
        .reverse(),
    };
  }, [evQ.data]);

  const membresMap = useMemo(() => {
    const m = new Map<string, MembreLite>();
    (membresQ.data ?? []).forEach((x) => m.set(x.id, x));
    return m;
  }, [membresQ.data]);

  // Intervenants regroupés par conférence.
  const intervenantsByEv = useMemo(() => {
    const m = new Map<number, string[]>();
    (ciQ.data ?? []).forEach((ci) => {
      const arr = m.get(ci.evenement_id) ?? [];
      arr.push(ci.membre_id);
      m.set(ci.evenement_id, arr);
    });
    return m;
  }, [ciQ.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">Événements</h1>
        {canManage && <CreateEvenementDialog />}
      </div>

      {conferencesAVenir.length > 0 && (
        <ConferencesSection
          conferences={conferencesAVenir}
          intervenantsByEv={intervenantsByEv}
          membres={membresMap}
          membresList={membresQ.data ?? []}
          canManage={canManage}
        />
      )}

      <Section
        title="À venir"
        events={upcoming}
        inscriptions={insQ.data ?? []}
        membres={membresMap}
        myId={profile?.id}
        canManage={canManage}
        past={false}
      />

      <Section
        title="Passés"
        events={past}
        inscriptions={insQ.data ?? []}
        membres={membresMap}
        myId={profile?.id}
        canManage={canManage}
        past
      />
    </div>
  );
}

function Section({
  title,
  events,
  inscriptions,
  membres,
  myId,
  canManage,
  past,
}: {
  title: string;
  events: Evenement[];
  inscriptions: Inscription[];
  membres: Map<string, MembreLite>;
  myId: string | undefined;
  canManage: boolean;
  past: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {events.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Aucun événement.
          </CardContent>
        </Card>
      ) : (
        events.map((e) => (
          <EvenementCard
            key={e.id}
            ev={e}
            inscriptions={inscriptions.filter((i) => i.evenement_id === e.id)}
            membres={membres}
            myId={myId}
            canManage={canManage}
            past={past}
          />
        ))
      )}
    </div>
  );
}

// Section repliable des conférences à venir (fermée par défaut), calquée
// sur la section « Demandes clôturées ».
function ConferencesSection({
  conferences,
  intervenantsByEv,
  membres,
  membresList,
  canManage,
}: {
  conferences: Evenement[];
  intervenantsByEv: Map<number, string[]>;
  membres: Map<string, MembreLite>;
  membresList: MembreLite[];
  canManage: boolean;
}) {
  return (
    <Collapsible className="border-t pt-4">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-md py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <span>Conférence à venir ({conferences.length})</span>
        <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-4">
        {conferences.map((ev) => (
          <ConferenceCard
            key={ev.id}
            ev={ev}
            intervenantIds={intervenantsByEv.get(ev.id) ?? []}
            membres={membres}
            membresList={membresList}
            canManage={canManage}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ConferenceCard({
  ev,
  intervenantIds,
  membres,
  membresList,
  canManage,
}: {
  ev: Evenement;
  intervenantIds: string[];
  membres: Map<string, MembreLite>;
  membresList: MembreLite[];
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const noms = intervenantIds.map((id) => nomComplet(membres, id));
  const date = new Date(ev.date_event);

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("evenements").delete().eq("id", ev.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evenements"] });
      qc.invalidateQueries({ queryKey: ["conference_intervenants"] });
      toast.success("Conférence supprimée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              {titreConference(ev.date_event, noms)}
            </CardTitle>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {date.toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              à{" "}
              {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          {canManage && (
            <div className="flex gap-1 shrink-0">
              <EditConferenceDialog
                ev={ev}
                intervenantIds={intervenantIds}
                membresList={membresList}
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer cette conférence ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible et supprimera également les
                      intervenants associés.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate()}>
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Conférencier{intervenantIds.length > 1 ? "s" : ""}
          </p>
          {intervenantIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun intervenant.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {intervenantIds.map((id) => (
                <Badge key={id} variant="secondary">
                  {nomComplet(membres, id)}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Comments typeContenu="evenement" contenuId={ev.id} />
      </CardContent>
    </Card>
  );
}

const STATUT_LABEL: Record<Statut, string> = {
  present: "Présent",
  absent: "Absent",
  peut_etre: "Peut-être",
};

function EvenementCard({
  ev,
  inscriptions,
  membres,
  myId,
  canManage,
  past,
}: {
  ev: Evenement;
  inscriptions: Inscription[];
  membres: Map<string, MembreLite>;
  myId: string | undefined;
  canManage: boolean;
  past: boolean;
}) {
  const qc = useQueryClient();
  const mine = inscriptions.find((i) => i.membre_id === myId);
  const presents = inscriptions.filter((i) => i.statut === "present");
  const peutEtres = inscriptions.filter((i) => i.statut === "peut_etre");
  const absents = inscriptions.filter((i) => i.statut === "absent");

  const setStatut = useMutation({
    mutationFn: async (statut: Statut) => {
      if (!myId) throw new Error("Non connecté");
      if (mine) {
        const { error } = await supabase
          .from("inscriptions")
          .update({ statut })
          .eq("id", mine.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("inscriptions")
          .insert({ evenement_id: ev.id, membre_id: myId, statut });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inscriptions"] });
      toast.success("Réponse enregistrée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("evenements").delete().eq("id", ev.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evenements"] });
      toast.success("Événement supprimé");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameOf = (id: string) => {
    const m = membres.get(id);
    return m ? `${m.prenom} ${m.nom}` : "Membre";
  };

  const date = new Date(ev.date_event);
  const full = ev.capacite != null && presents.length >= ev.capacite;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">{ev.titre}</CardTitle>
            <div className="text-sm text-muted-foreground space-y-0.5">
              <p className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {date.toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                à{" "}
                {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </p>
              {ev.lieu && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {ev.lieu}
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {presents.length} présent{presents.length > 1 ? "s" : ""}
                {peutEtres.length > 0 && ` • ${peutEtres.length} peut-être`}
                {ev.capacite != null && ` / ${ev.capacite} places`}
              </p>
            </div>
          </div>
          {canManage && (
            <div className="flex gap-1 shrink-0">
              <EditEvenementDialog ev={ev} />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer cet événement ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible et supprimera également toutes les inscriptions.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate()}>Supprimer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {ev.description && (
          <p className="text-sm whitespace-pre-wrap">{ev.description}</p>
        )}

        {!past && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Votre réponse</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["present", "peut_etre", "absent"] as Statut[]).map((s) => {
                const active = mine?.statut === s;
                const disable =
                  setStatut.isPending ||
                  (s === "present" && full && !active);
                return (
                  <Button
                    key={s}
                    variant={active ? "default" : "outline"}
                    size="sm"
                    disabled={disable}
                    onClick={() => setStatut.mutate(s)}
                  >
                    {STATUT_LABEL[s]}
                  </Button>
                );
              })}
            </div>
            {full && mine?.statut !== "present" && (
              <p className="text-xs text-destructive">Capacité maximale atteinte.</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Présents ({presents.length})
          </p>
          {presents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun inscrit pour le moment.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {presents.map((i) => (
                <Badge key={i.id} variant="secondary">
                  {nameOf(i.membre_id)}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {canManage && (peutEtres.length > 0 || absents.length > 0) && (
          <div className="space-y-2 pt-2 border-t">
            {peutEtres.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  Peut-être ({peutEtres.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {peutEtres.map((i) => (
                    <Badge key={i.id} variant="outline">
                      {nameOf(i.membre_id)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {absents.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  Absents ({absents.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {absents.map((i) => (
                    <Badge key={i.id} variant="outline">
                      {nameOf(i.membre_id)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <Comments typeContenu="evenement" contenuId={ev.id} />
      </CardContent>
    </Card>
  );
}

function CreateEvenementDialog() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [estConference, setEstConference] = useState(false);
  const [intervenants, setIntervenants] = useState<string[]>([]);
  const [titre, setTitre] = useState("");
  const [dateEvent, setDateEvent] = useState("");
  const [lieu, setLieu] = useState("");
  const [description, setDescription] = useState("");
  const [capacite, setCapacite] = useState("");

  // Liste des membres pour la sélection des intervenants (mode conférence).
  const membresQ = useQuery({
    queryKey: ["membres", "lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("membres").select("id, prenom, nom");
      if (error) throw error;
      return data as MembreLite[];
    },
    staleTime: 60_000,
  });

  function toggleIntervenant(id: string) {
    setIntervenants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function reset() {
    setEstConference(false);
    setIntervenants([]);
    setTitre("");
    setDateEvent("");
    setLieu("");
    setDescription("");
    setCapacite("");
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Non connecté");

      if (estConference) {
        // ── Mode conférence ──────────────────────────────────────────────
        if (!dateEvent) throw new Error("Date requise");
        if (intervenants.length === 0) throw new Error("Au moins un intervenant requis");

        // Titre stocké = placeholder ; l'affichage réel est calculé côté UI.
        const { data: ev, error } = await (supabase as any)
          .from("evenements")
          .insert({
            titre: "Conférence hebdo",
            date_event: new Date(dateEvent).toISOString(),
            lieu: null,
            description: null,
            capacite: null,
            createur_id: profile.id,
            est_conference: true,
          })
          .select("id")
          .single();
        if (error) throw error;
        const evId = (ev as { id: number }).id;

        const { error: ciErr } = await (supabase as any)
          .from("conference_intervenants")
          .insert(intervenants.map((membre_id) => ({ evenement_id: evId, membre_id })));
        if (ciErr) throw ciErr;

        // Notifie les conférenciers (créateur exclu). Le rappel du lundi est
        // géré par le cron SQL, pas ici.
        await creerNotificationsSafe({
          typeContenu: "evenement",
          contenuId: evId,
          titre: "Vous êtes conférencier pour la prochaine conférence",
          membreIds: intervenants,
          exclureId: profile.id,
        });
        return;
      }

      // ── Mode événement classique (inchangé) ─────────────────────────────
      if (!titre.trim() || !dateEvent) throw new Error("Titre et date requis");
      const { data: ev, error } = await supabase.from("evenements").insert({
        titre: titre.trim(),
        date_event: new Date(dateEvent).toISOString(),
        lieu: lieu.trim() || null,
        description: description.trim() || null,
        capacite: capacite ? Number(capacite) : null,
        createur_id: profile.id,
      })
        .select("id")
        .single();
      if (error) throw error;

      // Notifier tous les membres actifs (créateur exclu).
      const actifs = await getMembresActifsIds();
      await creerNotificationsSafe({
        typeContenu: "evenement",
        contenuId: (ev as { id: number }).id,
        titre: `Nouvel événement : ${titre.trim()}`,
        membreIds: actifs,
        exclureId: profile.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evenements"] });
      qc.invalidateQueries({ queryKey: ["conference_intervenants"] });
      toast.success(estConference ? "Conférence créée" : "Événement créé");
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = estConference
    ? !!dateEvent && intervenants.length > 0
    : !!titre.trim() && !!dateEvent;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Nouvel événement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {estConference ? "Créer une conférence" : "Créer un événement"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <Checkbox
              checked={estConference}
              onCheckedChange={(v) => setEstConference(v === true)}
            />
            Conférence hebdo
          </label>

          {estConference ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="conf-date">Date et heure</Label>
                <Input
                  id="conf-date"
                  type="datetime-local"
                  value={dateEvent}
                  onChange={(e) => setDateEvent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Intervenants</Label>
                <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-md border p-2">
                  {(membresQ.data ?? []).map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={intervenants.includes(m.id)}
                        onCheckedChange={() => toggleIntervenant(m.id)}
                      />
                      {m.prenom} {m.nom}
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="titre">Titre</Label>
                <Input id="titre" value={titre} onChange={(e) => setTitre(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Date et heure</Label>
                <Input
                  id="date"
                  type="datetime-local"
                  value={dateEvent}
                  onChange={(e) => setDateEvent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lieu">Lieu</Label>
                <Input id="lieu" value={lieu} onChange={(e) => setLieu(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">Description</Label>
                <Textarea
                  id="desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cap">Capacité (optionnelle)</Label>
                <Input
                  id="cap"
                  type="number"
                  min={1}
                  value={capacite}
                  onChange={(e) => setCapacite(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={create.isPending || !canSubmit}
            onClick={() => create.mutate()}
          >
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditConferenceDialog({
  ev,
  intervenantIds,
  membresList,
}: {
  ev: Evenement;
  intervenantIds: string[];
  membresList: MembreLite[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dateEvent, setDateEvent] = useState(toDatetimeLocal(ev.date_event));
  const [intervenants, setIntervenants] = useState<string[]>(intervenantIds);

  // Réinitialise depuis l'état courant à chaque ouverture.
  function resetForm() {
    setDateEvent(toDatetimeLocal(ev.date_event));
    setIntervenants(intervenantIds);
  }

  function toggleIntervenant(id: string) {
    setIntervenants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const update = useMutation({
    mutationFn: async () => {
      if (!dateEvent) throw new Error("Date requise");
      if (intervenants.length === 0) throw new Error("Au moins un intervenant requis");

      const { error } = await (supabase as any)
        .from("evenements")
        .update({ date_event: new Date(dateEvent).toISOString() })
        .eq("id", ev.id);
      if (error) throw error;

      // Intervenants : delete-all puis re-insert la sélection courante.
      // Simple et robuste (la table n'a que 2 colonnes, volume négligeable) ;
      // évite de calculer un diff ajout/suppression.
      const { error: delErr } = await (supabase as any)
        .from("conference_intervenants")
        .delete()
        .eq("evenement_id", ev.id);
      if (delErr) throw delErr;

      const { error: insErr } = await (supabase as any)
        .from("conference_intervenants")
        .insert(intervenants.map((membre_id) => ({ evenement_id: ev.id, membre_id })));
      if (insErr) throw insErr;

      // Pas de notification à l'édition : évite le spam (le conférencier a
      // déjà été notifié à la création, et le rappel du lundi reste géré par le cron).
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evenements"] });
      qc.invalidateQueries({ queryKey: ["conference_intervenants"] });
      toast.success("Conférence modifiée");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) resetForm();
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Modifier la conférence">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier la conférence</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-conf-date-${ev.id}`}>Date et heure</Label>
            <Input
              id={`edit-conf-date-${ev.id}`}
              type="datetime-local"
              value={dateEvent}
              onChange={(e) => setDateEvent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Intervenants</Label>
            <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-md border p-2">
              {membresList.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={intervenants.includes(m.id)}
                    onCheckedChange={() => toggleIntervenant(m.id)}
                  />
                  {m.prenom} {m.nom}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={update.isPending || !dateEvent || intervenants.length === 0}
            onClick={() => update.mutate()}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEvenementDialog({ ev }: { ev: Evenement }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [titre, setTitre] = useState(ev.titre);
  const [dateEvent, setDateEvent] = useState(toDatetimeLocal(ev.date_event));
  const [lieu, setLieu] = useState(ev.lieu ?? "");
  const [description, setDescription] = useState(ev.description ?? "");
  const [capacite, setCapacite] = useState(ev.capacite != null ? String(ev.capacite) : "");

  // Réinitialise le formulaire à chaque ouverture (au cas où l'événement a changé).
  function resetForm() {
    setTitre(ev.titre);
    setDateEvent(toDatetimeLocal(ev.date_event));
    setLieu(ev.lieu ?? "");
    setDescription(ev.description ?? "");
    setCapacite(ev.capacite != null ? String(ev.capacite) : "");
  }

  const update = useMutation({
    mutationFn: async () => {
      if (!titre.trim() || !dateEvent) throw new Error("Titre et date requis");
      const { error } = await supabase
        .from("evenements")
        .update({
          titre: titre.trim(),
          date_event: new Date(dateEvent).toISOString(),
          lieu: lieu.trim() || null,
          description: description.trim() || null,
          capacite: capacite ? Number(capacite) : null,
        })
        .eq("id", ev.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evenements"] });
      toast.success("Événement modifié");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) resetForm();
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Modifier l'événement">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier l'événement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-titre-${ev.id}`}>Titre</Label>
            <Input id={`edit-titre-${ev.id}`} value={titre} onChange={(e) => setTitre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-date-${ev.id}`}>Date et heure</Label>
            <Input
              id={`edit-date-${ev.id}`}
              type="datetime-local"
              value={dateEvent}
              onChange={(e) => setDateEvent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-lieu-${ev.id}`}>Lieu</Label>
            <Input id={`edit-lieu-${ev.id}`} value={lieu} onChange={(e) => setLieu(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-desc-${ev.id}`}>Description</Label>
            <Textarea
              id={`edit-desc-${ev.id}`}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-cap-${ev.id}`}>Capacité (optionnelle)</Label>
            <Input
              id={`edit-cap-${ev.id}`}
              type="number"
              min={1}
              value={capacite}
              onChange={(e) => setCapacite(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={update.isPending || !titre.trim() || !dateEvent}
            onClick={() => update.mutate()}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
