import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Lock, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, peutGererEvenementsSondages } from "@/hooks/use-profile";
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

export const Route = createFileRoute("/_authenticated/sondages")({
  head: () => ({ meta: [{ title: "Sondages — OLB" }] }),
  component: SondagesPage,
});

type Sondage = {
  id: number;
  titre: string;
  question: string;
  date_limite: string | null;
  statut: "ouvert" | "cloture";
  createur_id: string;
  created_at: string;
};
type Option = { id: number; sondage_id: number; libelle: string };
type Vote = { id: number; sondage_id: number; option_id: number; membre_id: string };

// Convertit une date ISO en valeur acceptée par <input type="datetime-local">.
function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SondagesPage() {
  const { data: profile } = useProfile();
  const canManage = peutGererEvenementsSondages(profile?.role);

  const sondagesQ = useQuery({
    queryKey: ["sondages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sondages")
        .select("*")
        .order("statut", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Sondage[];
    },
  });

  const optionsQ = useQuery({
    queryKey: ["options_sondage"],
    queryFn: async () => {
      const { data, error } = await supabase.from("options_sondage").select("*");
      if (error) throw error;
      return data as Option[];
    },
  });

  const votesQ = useQuery({
    queryKey: ["votes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("votes").select("*");
      if (error) throw error;
      return data as Vote[];
    },
  });

  const loading = sondagesQ.isLoading || optionsQ.isLoading || votesQ.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">Sondages</h1>
        {canManage && <CreateSondageDialog />}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}

      <div className="space-y-4">
        {sondagesQ.data?.map((s) => (
          <SondageCard
            key={s.id}
            sondage={s}
            options={optionsQ.data?.filter((o) => o.sondage_id === s.id) ?? []}
            votes={votesQ.data?.filter((v) => v.sondage_id === s.id) ?? []}
            myId={profile?.id}
            canManage={canManage}
          />
        ))}
        {sondagesQ.data?.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Aucun sondage pour le moment.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function SondageCard({
  sondage,
  options,
  votes,
  myId,
  canManage,
}: {
  sondage: Sondage;
  options: Option[];
  votes: Vote[];
  myId: string | undefined;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const isOpen = sondage.statut === "ouvert";
  const expired = sondage.date_limite ? new Date(sondage.date_limite) < new Date() : false;
  const canVote = isOpen && !expired && !!myId;
  const myVote = useMemo(() => votes.find((v) => v.membre_id === myId), [votes, myId]);
  const total = votes.length;

  const vote = useMutation({
    mutationFn: async (optionId: number) => {
      if (!myId) throw new Error("Non connecté");
      // upsert by (sondage_id, membre_id)
      if (myVote) {
        const { error } = await supabase
          .from("votes")
          .update({ option_id: optionId })
          .eq("id", myVote.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("votes")
          .insert({ sondage_id: sondage.id, option_id: optionId, membre_id: myId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["votes"] });
      toast.success("Vote enregistré");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("sondages")
        .update({ statut: "cloture" })
        .eq("id", sondage.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sondages"] });
      toast.success("Sondage clôturé");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sondages").delete().eq("id", sondage.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sondages"] });
      toast.success("Sondage supprimé");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg">{sondage.titre}</CardTitle>
              <Badge variant={isOpen && !expired ? "default" : "secondary"}>
                {isOpen && !expired ? "Ouvert" : "Clôturé"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{sondage.question}</p>
            {sondage.date_limite && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Jusqu'au {new Date(sondage.date_limite).toLocaleDateString("fr-FR")}
              </p>
            )}
          </div>
          {canManage && (
            <div className="flex gap-2">
              {isOpen && (
                <Button size="sm" variant="outline" onClick={() => close.mutate()}>
                  <Lock className="h-4 w-4" />
                  Clôturer
                </Button>
              )}
              <EditSondageDialog sondage={sondage} />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce sondage ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible et supprimera également tous les votes.
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
      <CardContent className="space-y-2">
        {options.map((opt) => {
          const count = votes.filter((v) => v.option_id === opt.id).length;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const mine = myVote?.option_id === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!canVote || vote.isPending}
              onClick={() => vote.mutate(opt.id)}
              className={`relative w-full text-left rounded-md border p-3 overflow-hidden transition-colors ${
                canVote ? "hover:bg-accent cursor-pointer" : "cursor-default"
              } ${mine ? "border-primary" : ""}`}
            >
              <div
                className={`absolute inset-y-0 left-0 ${
                  mine ? "bg-primary/20" : "bg-muted"
                }`}
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <span className="font-medium text-sm">
                  {opt.libelle}
                  {mine && <span className="ml-2 text-xs text-primary">• votre vote</span>}
                </span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {pct}% ({count})
                </span>
              </div>
            </button>
          );
        })}
        <p className="text-xs text-muted-foreground pt-1">
          {total} vote{total > 1 ? "s" : ""}
          {canVote && myVote && " — cliquez sur une autre option pour changer votre vote"}
        </p>
        <Comments typeContenu="sondage" contenuId={sondage.id} />
      </CardContent>
    </Card>
  );
}

function CreateSondageDialog() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [titre, setTitre] = useState("");
  const [question, setQuestion] = useState("");
  const [dateLimite, setDateLimite] = useState("");
  const [optionsTxt, setOptionsTxt] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Non connecté");
      const opts = optionsTxt
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (opts.length < 2) throw new Error("Au moins 2 options requises");
      const { data: s, error: e1 } = await supabase
        .from("sondages")
        .insert({
          titre: titre.trim(),
          question: question.trim(),
          date_limite: dateLimite ? new Date(dateLimite).toISOString() : null,
          statut: "ouvert",
          createur_id: profile.id,
        })
        .select()
        .single();
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("options_sondage")
        .insert(opts.map((libelle) => ({ sondage_id: (s as Sondage).id, libelle })));
      if (e2) throw e2;
      // Notifier tous les membres actifs (créateur exclu).
      const actifs = await getMembresActifsIds();
      await creerNotificationsSafe({
        typeContenu: "sondage",
        contenuId: (s as Sondage).id,
        titre: `Nouveau sondage : ${titre.trim()}`,
        membreIds: actifs,
        exclureId: profile.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sondages"] });
      qc.invalidateQueries({ queryKey: ["options_sondage"] });
      toast.success("Sondage créé");
      setOpen(false);
      setTitre("");
      setQuestion("");
      setDateLimite("");
      setOptionsTxt("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Nouveau sondage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un sondage</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="titre">Titre</Label>
            <Input id="titre" value={titre} onChange={(e) => setTitre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="question">Question</Label>
            <Textarea
              id="question"
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opts">Options (une par ligne)</Label>
            <Textarea
              id="opts"
              rows={4}
              placeholder={"Oui\nNon\nPeut-être"}
              value={optionsTxt}
              onChange={(e) => setOptionsTxt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Date limite (optionnelle)</Label>
            <Input
              id="date"
              type="datetime-local"
              value={dateLimite}
              onChange={(e) => setDateLimite(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={create.isPending || !titre.trim() || !question.trim()}
            onClick={() => create.mutate()}
          >
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSondageDialog({ sondage }: { sondage: Sondage }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [titre, setTitre] = useState(sondage.titre);
  const [question, setQuestion] = useState(sondage.question);
  const [dateLimite, setDateLimite] = useState(
    sondage.date_limite ? toDatetimeLocal(sondage.date_limite) : "",
  );

  // Réinitialise le formulaire à chaque ouverture.
  function resetForm() {
    setTitre(sondage.titre);
    setQuestion(sondage.question);
    setDateLimite(sondage.date_limite ? toDatetimeLocal(sondage.date_limite) : "");
  }

  const update = useMutation({
    mutationFn: async () => {
      if (!titre.trim() || !question.trim()) throw new Error("Titre et question requis");
      const { error } = await supabase
        .from("sondages")
        .update({
          titre: titre.trim(),
          question: question.trim(),
          date_limite: dateLimite ? new Date(dateLimite).toISOString() : null,
        })
        .eq("id", sondage.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sondages"] });
      toast.success("Sondage modifié");
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
        <Button size="icon" variant="ghost" aria-label="Modifier le sondage">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le sondage</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-titre-${sondage.id}`}>Titre</Label>
            <Input
              id={`edit-titre-${sondage.id}`}
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-question-${sondage.id}`}>Question</Label>
            <Textarea
              id={`edit-question-${sondage.id}`}
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-date-${sondage.id}`}>Date limite (optionnelle)</Label>
            <Input
              id={`edit-date-${sondage.id}`}
              type="datetime-local"
              value={dateLimite}
              onChange={(e) => setDateLimite(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Les options de réponse ne sont pas modifiables après création afin de préserver les votes déjà exprimés.
          </p>
        </div>
        <DialogFooter>
          <Button
            disabled={update.isPending || !titre.trim() || !question.trim()}
            onClick={() => update.mutate()}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
