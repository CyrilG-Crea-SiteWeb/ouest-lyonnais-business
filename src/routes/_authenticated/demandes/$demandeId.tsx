import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, hasRole } from "@/hooks/use-profile";
import { Comments } from "@/components/Comments";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/demandes/$demandeId")({
  head: () => ({ meta: [{ title: "Demande — OLB" }] }),
  component: DemandeDetailPage,
});

type Statut = "ouverte" | "resolue" | "cloturee";

type DemandeDetail = {
  id: number;
  titre: string;
  description: string;
  lien: string | null;
  statut: Statut;
  cible_tous: boolean;
  membre_id: string;
  created_at: string;
  membres: {
    prenom: string;
    nom: string;
    photo_url: string | null;
  } | null;
};

const STATUT_META: Record<Statut, { label: string; className: string }> = {
  ouverte: {
    label: "Ouverte",
    className: "bg-primary text-primary-foreground hover:bg-primary",
  },
  resolue: {
    label: "Résolue",
    className: "bg-accent text-accent-foreground hover:bg-accent",
  },
  cloturee: {
    label: "Clôturée",
    className: "bg-muted text-muted-foreground hover:bg-muted",
  },
};

function DemandeDetailPage() {
  const { demandeId } = Route.useParams();
  const id = Number(demandeId);
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["demandes", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demandes")
        .select(
          "id, titre, description, lien, statut, cible_tous, membre_id, created_at, membres!demandes_membre_id_fkey(prenom, nom, photo_url)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as DemandeDetail;
    },
  });

  // Cibles spécifiques (si la demande ne vise pas tout le monde).
  const ciblesQ = useQuery({
    queryKey: ["demandes", "cibles", id],
    enabled: !!q.data && q.data.cible_tous === false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demandes_cibles")
        .select("membre_id, membres!demandes_cibles_membre_id_fkey(prenom, nom)")
        .eq("demande_id", id);
      if (error) throw error;
      return data as unknown as {
        membre_id: string;
        membres: { prenom: string; nom: string } | null;
      }[];
    },
  });

  const changerStatut = useMutation({
    mutationFn: async (statut: Statut) => {
      const { error } = await supabase
        .from("demandes")
        .update({ statut })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demandes"] });
      toast.success("Statut mis à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Demande introuvable.</p>
        <Button asChild variant="ghost" size="sm">
          <Link to="/demandes">
            <ArrowLeft className="h-4 w-4" />
            Retour aux demandes
          </Link>
        </Button>
      </div>
    );
  }

  const d = q.data;
  const meta = STATUT_META[d.statut];
  const auteur = d.membres;
  const initiales = auteur
    ? `${auteur.prenom?.[0] ?? ""}${auteur.nom?.[0] ?? ""}`.toUpperCase()
    : "?";

  // Qui peut changer le statut : l'auteur, le bureau ou l'admin.
  const isAuteur = profile?.id === d.membre_id;
  const isBureau = hasRole(profile?.role, "bureau");
  const peutModifierStatut = isAuteur || isBureau;

  return (
    <div className="space-y-6 max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/demandes">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>
      </Button>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-xl md:text-2xl leading-tight">
              {d.titre}
            </CardTitle>
            <Badge className={meta.className}>{meta.label}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              {auteur?.photo_url && <AvatarImage src={auteur.photo_url} />}
              <AvatarFallback className="text-xs">{initiales}</AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground">
              {auteur ? `${auteur.prenom} ${auteur.nom}` : "Membre"} ·{" "}
              {new Date(d.created_at).toLocaleDateString("fr-FR", {
                dateStyle: "long",
              })}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm whitespace-pre-wrap">{d.description}</p>

          {d.lien && (
            <a
              href={d.lien}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              {d.lien}
            </a>
          )}

          {/* Destinataires */}
          <div className="border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Destinataires
            </p>
            {d.cible_tous ? (
              <p className="text-sm">Tous les membres</p>
            ) : (
              <p className="text-sm">
                {(ciblesQ.data ?? [])
                  .map((c) =>
                    c.membres ? `${c.membres.prenom} ${c.membres.nom}` : "Membre",
                  )
                  .join(", ") || "—"}
              </p>
            )}
          </div>

          {/* Changement de statut */}
          {peutModifierStatut && (
            <div className="border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Modifier le statut
              </p>
              <select
                value={d.statut}
                onChange={(e) => changerStatut.mutate(e.target.value as Statut)}
                disabled={changerStatut.isPending}
                className="h-10 w-48 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="ouverte">Ouverte</option>
                <option value="resolue">Résolue</option>
                <option value="cloturee">Clôturée</option>
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commentaires réutilisables (Prompt 7) branchés sur la demande */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discussion</CardTitle>
        </CardHeader>
        <CardContent>
          <Comments typeContenu="demande" contenuId={d.id} />
        </CardContent>
      </Card>
    </div>
  );
}
