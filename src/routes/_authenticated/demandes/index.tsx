import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, LinkIcon, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/HelpButton";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const Route = createFileRoute("/_authenticated/demandes/")({
  head: () => ({ meta: [{ title: "Demandes spécifiques — OLB" }] }),
  component: DemandesPage,
});

type Statut = "ouverte" | "cloturee";

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
  cloturee: {
    label: "Clôturée",
    className: "bg-muted text-muted-foreground hover:bg-muted",
  },
};

// Ordre de tri des statuts : ouvertes d'abord.
const ORDRE_STATUT: Record<Statut, number> = {
  ouverte: 0,
  cloturee: 1,
};

// Carte d'une demande (réutilisée pour les actives et les clôturées).
function DemandeCard({ d }: { d: DemandeListe }) {
  const meta = STATUT_META[d.statut] ?? STATUT_META.ouverte;
  const auteur = d.membres;
  const initiales = auteur
    ? `${auteur.prenom?.[0] ?? ""}${auteur.nom?.[0] ?? ""}`.toUpperCase()
    : "?";
  return (
    <Link
      to="/demandes/$demandeId"
      params={{ demandeId: String(d.id) }}
      className="block"
    >
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight">{d.titre}</CardTitle>
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
                {auteur?.photo_url && <AvatarImage src={auteur.photo_url} />}
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
}

function DemandesPage() {
  const q = useQuery({
    queryKey: ["demandes", "liste"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demandes")
        .select(
          "id, titre, description, lien, statut, cible_tous, membre_id, created_at, membres!demandes_membre_id_fkey(prenom, nom, photo_url)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DemandeListe[];
    },
  });

  // Actives (ouverte/résolue) : récentes en haut, ouvertes d'abord.
  const actives = (q.data ?? [])
    .filter((d) => d.statut !== "cloturee")
    .slice()
    .sort((a, b) => {
      const s = (ORDRE_STATUT[a.statut] ?? 0) - (ORDRE_STATUT[b.statut] ?? 0);
      if (s !== 0) return s;
      return b.created_at.localeCompare(a.created_at);
    });

  // Clôturées : repliées en bas, plus récentes en haut.
  const cloturees = (q.data ?? [])
    .filter((d) => d.statut === "cloturee")
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold">Demandes spécifiques</h1>
            <HelpButton title="Comment fonctionne cette page" ariaLabel="Aide Demandes">
              <p>
                Publiez une demande visible par le groupe : un besoin, une
                recherche de contact, un service. Choisissez de notifier tout le
                monde ou seulement certains membres.
              </p>
              <p>
                Les membres concernés reçoivent une notification (cloche + email).
                Le statut passe d'<strong>ouverte</strong> à{" "}
                <strong>clôturée</strong>. Les demandes clôturées sont
                ou <strong>clôturée</strong>. Les demandes clôturées sont
                regroupées en bas.
              </p>
              <p>Vous pouvez commenter et répondre sous chaque demande.</p>
            </HelpButton>
          </div>
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

      {q.data && actives.length === 0 && cloturees.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucune demande pour le moment. Soyez le premier à en publier une.
          </CardContent>
        </Card>
      )}

      {actives.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {actives.map((d) => (
            <DemandeCard key={d.id} d={d} />
          ))}
        </div>
      )}

      {q.data && actives.length === 0 && cloturees.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune demande en cours. Les demandes clôturées sont listées
          ci-dessous.
        </p>
      )}

      {cloturees.length > 0 && (
        <Collapsible className="border-t pt-4">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-md py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <span>Demandes clôturées ({cloturees.length})</span>
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {cloturees.map((d) => (
                <DemandeCard key={d.id} d={d} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
