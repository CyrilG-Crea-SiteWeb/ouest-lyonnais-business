import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, LinkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/demandes/")({
  head: () => ({ meta: [{ title: "Demandes spécifiques — OLB" }] }),
  component: DemandesPage,
});

type Statut = "ouverte" | "resolue" | "cloturee";

type DemandeListe = {
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

// Libellé + style de badge par statut (charte OLB).
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

// Ordre de tri des statuts : ouvertes d'abord.
const ORDRE_STATUT: Record<Statut, number> = {
  ouverte: 0,
  resolue: 1,
  cloturee: 2,
};

function DemandesPage() {
  const q = useQuery({
    queryKey: ["demandes", "liste"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demandes")
        .select(
          "id, titre, description, lien, statut, cible_tous, membre_id, created_at, membres(prenom, nom, photo_url)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DemandeListe[];
    },
  });

  const demandes = (q.data ?? [])
    .slice()
    .sort((a, b) => {
      const s = ORDRE_STATUT[a.statut] - ORDRE_STATUT[b.statut];
      if (s !== 0) return s;
      return b.created_at.localeCompare(a.created_at);
    });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Demandes spécifiques</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Publiez une demande au groupe et suivez les réponses.
          </p>
        </div>
        <Button asChild>
          <Link to="/demandes/nouvelle">
            <Plus className="h-4 w-4" />
            Nouvelle demande
          </Link>
        </Button>
      </header>

      {q.isLoading && (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      )}

      {q.isError && (
        <p className="text-sm text-destructive">
          Erreur lors du chargement des demandes.
        </p>
      )}

      {q.data && demandes.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucune demande pour le moment. Soyez le premier à en publier une.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {demandes.map((d) => {
          const meta = STATUT_META[d.statut];
          const auteur = d.membres;
          const initiales = auteur
            ? `${auteur.prenom?.[0] ?? ""}${auteur.nom?.[0] ?? ""}`.toUpperCase()
            : "?";
          return (
            <Link
              key={d.id}
              to="/demandes/$demandeId"
              params={{ demandeId: String(d.id) }}
              className="block"
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">
                      {d.titre}
                    </CardTitle>
                    <Badge className={meta.className}>{meta.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {d.description}
                  </p>
                  {d.lien && (
                    <span className="inline-flex items-center gap-1 text-xs text-primary">
                      <LinkIcon className="h-3 w-3" />
                      Lien joint
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-6 w-6">
                        {auteur?.photo_url && (
                          <AvatarImage src={auteur.photo_url} />
                        )}
                        <AvatarFallback className="text-[10px]">
                          {initiales}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground truncate">
                        {auteur ? `${auteur.prenom} ${auteur.nom}` : "Membre"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(d.created_at).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
