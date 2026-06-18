import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Trash2, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, hasRole } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { creerNotificationsSafe, getMembresActifsIds } from "@/lib/notifications";

// MODIF OLB : ajout de "demande" pour brancher les commentaires sous les demandes.
export type TypeContenu = "recommandation" | "sondage" | "evenement" | "demande";

type Commentaire = {
  id: number;
  type_contenu: TypeContenu;
  contenu_id: number;
  parent_id: number | null;
  membre_id: string;
  texte: string;
  created_at: string;
};

type Auteur = {
  id: string;
  prenom: string;
  nom: string;
  photo_url: string | null;
};

export function Comments({
  typeContenu,
  contenuId,
}: {
  typeContenu: TypeContenu;
  contenuId: number;
}) {
  const [open, setOpen] = useState(false);
  const key = ["commentaires", typeContenu, contenuId] as const;

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commentaires")
        .select("*")
        .eq("type_contenu", typeContenu)
        .eq("contenu_id", contenuId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Commentaire[];
    },
  });

  const count = q.data?.length ?? 0;

  return (
    <div className="pt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="h-8 px-2 text-muted-foreground"
      >
        <MessageSquare className="h-4 w-4" />
        Commentaires ({count})
      </Button>
      {open && (
        <CommentsThread
          typeContenu={typeContenu}
          contenuId={contenuId}
          comments={q.data ?? []}
          queryKey={key as unknown as readonly unknown[]}
        />
      )}
    </div>
  );
}

function CommentsThread({
  typeContenu,
  contenuId,
  comments,
  queryKey,
}: {
  typeContenu: TypeContenu;
  contenuId: number;
  comments: Commentaire[];
  queryKey: readonly unknown[];
}) {
  const authorIds = useMemo(
    () => Array.from(new Set(comments.map((c) => c.membre_id))),
    [comments],
  );

  const authorsQ = useQuery({
    queryKey: ["membres", "auteurs", authorIds.sort().join(",")],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, prenom, nom, photo_url")
        .in("id", authorIds);
      if (error) throw error;
      return data as Auteur[];
    },
    staleTime: 60_000,
  });

  const authors = useMemo(() => {
    const m = new Map<string, Auteur>();
    (authorsQ.data ?? []).forEach((a) => m.set(a.id, a));
    return m;
  }, [authorsQ.data]);

  const roots = comments.filter((c) => c.parent_id == null);
  const repliesByParent = useMemo(() => {
    const m = new Map<number, Commentaire[]>();
    comments
      .filter((c) => c.parent_id != null)
      .forEach((c) => {
        const arr = m.get(c.parent_id!) ?? [];
        arr.push(c);
        m.set(c.parent_id!, arr);
      });
    return m;
  }, [comments]);

  return (
    <div className="mt-3 space-y-4 border-t pt-3">
      {roots.length === 0 && (
        <p className="text-xs text-muted-foreground">Aucun commentaire.</p>
      )}
      {roots.map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          author={authors.get(c.membre_id)}
          replies={repliesByParent.get(c.id) ?? []}
          authors={authors}
          typeContenu={typeContenu}
          contenuId={contenuId}
          queryKey={queryKey}
          comments={comments}
        />
      ))}
      <CommentForm
        typeContenu={typeContenu}
        contenuId={contenuId}
        parentId={null}
        queryKey={queryKey}
        placeholder="Écrire un commentaire…"
        comments={comments}
      />
    </div>
  );
}

function CommentItem({
  comment,
  author,
  replies,
  authors,
  typeContenu,
  contenuId,
  queryKey,
}: {
  comment: Commentaire;
  author: Auteur | undefined;
  replies: Commentaire[];
  authors: Map<string, Auteur>;
  typeContenu: TypeContenu;
  contenuId: number;
  queryKey: readonly unknown[];
}) {
  const [replying, setReplying] = useState(false);
  return (
    <div className="space-y-3">
      <CommentRow
        comment={comment}
        author={author}
        onReplyClick={() => setReplying((r) => !r)}
        replyOpen={replying}
        queryKey={queryKey}
        canReply
      />
      {(replies.length > 0 || replying) && (
        <div className="ml-10 space-y-3 border-l pl-3">
          {replies.map((r) => (
            <CommentRow
              key={r.id}
              comment={r}
              author={authors.get(r.membre_id)}
              queryKey={queryKey}
            />
          ))}
          {replying && (
            <CommentForm
              typeContenu={typeContenu}
              contenuId={contenuId}
              parentId={comment.id}
              queryKey={queryKey}
              autoFocus
              onDone={() => setReplying(false)}
              placeholder="Votre réponse…"
              comments={comments}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  author,
  onReplyClick,
  replyOpen,
  canReply,
  queryKey,
}: {
  comment: Commentaire;
  author: Auteur | undefined;
  onReplyClick?: () => void;
  replyOpen?: boolean;
  canReply?: boolean;
  queryKey: readonly unknown[];
}) {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const isBureau = hasRole(profile?.role, "bureau");
  const isOwner = profile?.id === comment.membre_id;
  const canEdit = isOwner;
  const canDelete = isOwner || isBureau;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.texte);

  const save = useMutation({
    mutationFn: async () => {
      const t = draft.trim();
      if (!t) throw new Error("Texte requis");
      const { error } = await supabase
        .from("commentaires")
        .update({ texte: t })
        .eq("id", comment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setEditing(false);
      toast.success("Commentaire mis à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("commentaires").delete().eq("id", comment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Commentaire supprimé");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const name = author ? `${author.prenom} ${author.nom}` : "Membre";
  const initials = author
    ? `${author.prenom[0] ?? ""}${author.nom[0] ?? ""}`.toUpperCase()
    : "?";

  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        {author?.photo_url && <AvatarImage src={author.photo_url} alt={name} />}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(comment.created_at).toLocaleString("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        </div>
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                <Check className="h-4 w-4" />
                Enregistrer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft(comment.texte);
                }}
              >
                <X className="h-4 w-4" />
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{comment.texte}</p>
        )}
        {!editing && (
          <div className="flex items-center gap-1 -ml-2">
            {canReply && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={onReplyClick}
              >
                {replyOpen ? "Annuler" : "Répondre"}
              </Button>
            )}
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3 w-3" />
                Modifier
              </Button>
            )}
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground"
                  >
                    <Trash2 className="h-3 w-3" />
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce commentaire ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible.
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentForm({
  typeContenu,
  contenuId,
  parentId,
  queryKey,
  placeholder,
  autoFocus,
  onDone,
  comments,
}: {
  typeContenu: TypeContenu;
  contenuId: number;
  parentId: number | null;
  queryKey: readonly unknown[];
  placeholder?: string;
  autoFocus?: boolean;
  onDone?: () => void;
  comments: Commentaire[];
}) {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [texte, setTexte] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Non connecté");
      const t = texte.trim();
      if (!t) throw new Error("Texte requis");

      // 1) Insère le commentaire et récupère la ligne créée (besoin de l'id).
      const { data: insere, error } = await supabase
        .from("commentaires")
        .insert({
          type_contenu: typeContenu,
          contenu_id: contenuId,
          parent_id: parentId,
          membre_id: profile.id,
          texte: t,
        })
        .select("id")
        .single();
      if (error) throw error;

      // 2) Notifications (best-effort : ne bloque jamais la publication).
      await notifierCommentaire({
        typeContenu,
        contenuId,
        parentId,
        auteurCommentaireId: profile.id,
        commentaires: comments,
      });

      return insere;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setTexte("");
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <Textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder={placeholder ?? "Écrire un commentaire…"}
        rows={2}
        autoFocus={autoFocus}
      />
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => send.mutate()}
          disabled={send.isPending || !texte.trim()}
        >
          Publier
        </Button>
      </div>
    </div>
  );
}
/**
 * Notifie les bonnes personnes après la publication d'un commentaire.
 *
 * - Commentaire racine (parentId == null) :
 *     • recommandation / demande -> l'AUTEUR du contenu
 *     • evenement / sondage      -> TOUS les membres actifs
 * - Réponse (parentId != null) :
 *     • l'AUTEUR du commentaire parent
 *
 * Best-effort : ne bloque jamais la publication (creerNotificationsSafe).
 */
async function notifierCommentaire(opts: {
  typeContenu: TypeContenu;
  contenuId: number;
  parentId: number | null;
  auteurCommentaireId: string;
  commentaires: Commentaire[];
}) {
  const { typeContenu, contenuId, parentId, auteurCommentaireId, commentaires } = opts;

  // CAS 1 — Réponse à un commentaire : notifier l'auteur du parent.
  if (parentId != null) {
    const parent = commentaires.find((c) => c.id === parentId);
    if (!parent) return;
    await creerNotificationsSafe({
      typeContenu,
      contenuId,
      titre: "Nouvelle réponse à votre commentaire",
      membreIds: [parent.membre_id],
      exclureId: auteurCommentaireId, // si je me réponds à moi-même, pas de notif
    });
    return;
  }

  // CAS 2 — Commentaire racine.
  // 2a) Événement ou sondage : tous les membres actifs.
  if (typeContenu === "evenement" || typeContenu === "sondage") {
    const tousActifs = await getMembresActifsIds();
    const label = typeContenu === "evenement" ? "un événement" : "un sondage";
    await creerNotificationsSafe({
      typeContenu,
      contenuId,
      titre: `Nouveau commentaire sur ${label}`,
      membreIds: tousActifs,
      exclureId: auteurCommentaireId,
    });
    return;
  }

  // 2b) Recommandation ou demande : l'auteur du contenu.
  const table = typeContenu === "recommandation" ? "recommandations" : "demandes";
  const { data, error } = await supabase
    .from(table)
    .select("membre_id")
    .eq("id", contenuId)
    .single();
  if (error || !data) return;

  await creerNotificationsSafe({
    typeContenu,
    contenuId,
    titre: "Nouveau commentaire sur votre publication",
    membreIds: [data.membre_id as string],
    exclureId: auteurCommentaireId,
  });
}