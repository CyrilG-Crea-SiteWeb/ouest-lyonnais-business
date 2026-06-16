import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, MapPin, Calendar, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, hasRole } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { creerNotificationsSafe, getMembresActifsIds } from "@/lib/notifications";
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
};
type Inscription = {
  id: number;
  evenement_id: number;
  membre_id: string;
  statut: Statut;
};
type MembreLite = { id: string; prenom: string; nom: string };

function EvenementsPage() {
  const { data: profile } = useProfile();
  const isBureau = hasRole(profile?.role, "bureau");

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

  const membresQ = useQuery({
    queryKey: ["membres", "lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("membres").select("id, prenom, nom");
      if (error) throw error;
      return data as MembreLite[];
    },
    staleTime: 60_000,
  });

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const list = evQ.data ?? [];
    return {
      upcoming: list.filter((e) => new Date(e.date_event).getTime() >= now),
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">Événements</h1>
        {isBureau && <CreateEvenementDialog />}
      </div>

      <Section
        title="À venir"
        events={upcoming}
        inscriptions={insQ.data ?? []}
        membres={membresMap}
        myId={profile?.id}
        isBureau={isBureau}
        past={false}
      />

      <Section
        title="Passés"
        events={past}
        inscriptions={insQ.data ?? []}
        membres={membresMap}
        myId={profile?.id}
        isBureau={isBureau}
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
  isBureau,
  past,
}: {
  title: string;
  events: Evenement[];
  inscriptions: Inscription[];
  membres: Map<string, MembreLite>;
  myId: string | undefined;
  isBureau: boolean;
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
            isBureau={isBureau}
            past={past}
          />
        ))
      )}
    </div>
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
  isBureau,
  past,
}: {
  ev: Evenement;
  inscriptions: Inscription[];
  membres: Map<string, MembreLite>;
  myId: string | undefined;
  isBureau: boolean;
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
          {isBureau && (
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

        {isBureau && (peutEtres.length > 0 || absents.length > 0) && (
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
  const [titre, setTitre] = useState("");
  const [dateEvent, setDateEvent] = useState("");
  const [lieu, setLieu] = useState("");
  const [description, setDescription] = useState("");
  const [capacite, setCapacite] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Non connecté");
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
      toast.success("Événement créé");
      setOpen(false);
      setTitre("");
      setDateEvent("");
      setLieu("");
      setDescription("");
      setCapacite("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Nouvel événement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un événement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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
        </div>
        <DialogFooter>
          <Button
            disabled={create.isPending || !titre.trim() || !dateEvent}
            onClick={() => create.mutate()}
          >
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
