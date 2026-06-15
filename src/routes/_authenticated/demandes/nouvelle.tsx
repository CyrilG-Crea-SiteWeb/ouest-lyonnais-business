import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import {
  creerNotificationsSafe,
  getMembresActifsIds,
} from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

// Petite case à cocher native stylée — évite de dépendre de
// @/components/ui/checkbox s'il n'est pas installé dans le projet.
function CaseACocher({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 shrink-0 rounded border-input accent-primary cursor-pointer"
    />
  );
}

export const Route = createFileRoute("/_authenticated/demandes/nouvelle")({
  head: () => ({ meta: [{ title: "Nouvelle demande — OLB" }] }),
  component: NouvelleDemandePage,
});

type MembreOption = {
  id: string;
  prenom: string;
  nom: string;
  photo_url: string | null;
};

function NouvelleDemandePage() {
  const { data: profile } = useProfile();
  const navigate = useNavigate();

  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [lien, setLien] = useState("");
  const [cibleTous, setCibleTous] = useState(true);
  const [ciblesSelection, setCiblesSelection] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Liste des membres actifs (hors soi-même) pour le ciblage spécifique.
  const membresQ = useQuery({
    queryKey: ["membres", "actifs", "selection"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("membres")
        .select("id, prenom, nom, photo_url")
        .eq("statut", "actif")
        .order("prenom", { ascending: true });
      if (error) throw error;
      return data as MembreOption[];
    },
  });

  const membres = (membresQ.data ?? []).filter((m) => m.id !== profile?.id);

  function toggleCible(id: string) {
    setCiblesSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    const t = titre.trim();
    const desc = description.trim();
    if (!t || !desc) {
      toast.error("Le titre et la description sont obligatoires.");
      return;
    }
    if (!cibleTous && ciblesSelection.size === 0) {
      toast.error("Sélectionnez au moins un membre, ou cochez « Tous ».");
      return;
    }

    setSaving(true);
    try {
      // 1. Créer la demande et récupérer son id.
      const { data: demande, error: insErr } = await supabase
        .from("demandes")
        .insert({
          titre: t,
          description: desc,
          lien: lien.trim() || null,
          cible_tous: cibleTous,
          membre_id: profile.id,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      const demandeId = demande.id as number;

      // 2. Déterminer les destinataires.
      let destinataires: string[];
      if (cibleTous) {
        destinataires = await getMembresActifsIds();
      } else {
        destinataires = Array.from(ciblesSelection);
        // Renseigner la table de liaison uniquement pour un ciblage spécifique.
        const rows = destinataires.map((membre_id) => ({
          demande_id: demandeId,
          membre_id,
        }));
        const { error: cibErr } = await supabase
          .from("demandes_cibles")
          .insert(rows);
        if (cibErr) throw cibErr;
      }

      // 3. Notifier (in-app). L'auteur est exclu.
      // Version "safe" : si les notifs échouent, la demande est quand même
      // créée — on ne bloque pas l'utilisateur, on l'avertit seulement.
      const notif = await creerNotificationsSafe({
        typeContenu: "demande",
        contenuId: demandeId,
        titre: `Nouvelle demande : ${t}`,
        membreIds: destinataires,
        exclureId: profile.id,
      });

      if (notif.ok) {
        toast.success("Demande publiée");
      } else {
        toast.success("Demande publiée");
        toast.warning("Les notifications n'ont pas pu être envoyées.");
      }
      navigate({ to: "/demandes/$demandeId", params: { demandeId: String(demandeId) } });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erreur lors de la publication",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link to="/demandes">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold">Nouvelle demande</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1.5">
              <Label htmlFor="titre">Titre *</Label>
              <Input
                id="titre"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Ex. Je cherche un contact chez…"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Décrivez votre demande en quelques lignes."
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lien">Lien (optionnel)</Label>
              <Input
                id="lien"
                value={lien}
                onChange={(e) => setLien(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destinataires</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <CaseACocher checked={cibleTous} onChange={setCibleTous} />
              <span className="text-sm font-medium">Tous les membres</span>
            </label>

            {!cibleTous && (
              <div className="space-y-2 border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  Sélectionnez les membres à notifier :
                </p>
                {membresQ.isLoading && (
                  <p className="text-sm text-muted-foreground">Chargement…</p>
                )}
                <div className="grid gap-1 sm:grid-cols-2 max-h-72 overflow-y-auto">
                  {membres.map((m) => {
                    const checked = ciblesSelection.has(m.id);
                    const initiales = `${m.prenom?.[0] ?? ""}${m.nom?.[0] ?? ""}`.toUpperCase();
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted"
                      >
                        <CaseACocher
                          checked={checked}
                          onChange={() => toggleCible(m.id)}
                        />
                        <Avatar className="h-6 w-6">
                          {m.photo_url && <AvatarImage src={m.photo_url} />}
                          <AvatarFallback className="text-[10px]">
                            {initiales}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">
                          {m.prenom} {m.nom}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {ciblesSelection.size > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {ciblesSelection.size} membre(s) sélectionné(s).
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="ghost" type="button">
            <Link to="/demandes">Annuler</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Publication…" : "Publier la demande"}
          </Button>
        </div>
      </form>
    </div>
  );
}
