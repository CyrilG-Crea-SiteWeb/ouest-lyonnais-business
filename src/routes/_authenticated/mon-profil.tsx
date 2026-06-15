import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, hasRole } from "@/hooks/use-profile";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarUpload } from "@/components/AvatarUpload";
import { toast } from "sonner";
import { Shield, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mon-profil")({
  head: () => ({ meta: [{ title: "Mon profil — OLB" }] }),
  component: ProfilPage,
});

function ProfilPage() {
  const { data: profile, isLoading } = useProfile();
  const qc = useQueryClient();
  const [photo_url, setPhotoUrl] = useState("");
  const [entreprise, setEntreprise] = useState("");
  const [categorie, setCategorie] = useState("");
  const [telephone, setTelephone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setPhotoUrl(profile.photo_url ?? "");
    setEntreprise(profile.entreprise ?? "");
    setCategorie(profile.categorie ?? "");
    setTelephone(profile.telephone ?? "");
  }, [profile]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!profile) return <p className="text-sm text-muted-foreground">Profil introuvable.</p>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("membres")
        .update({
          photo_url: photo_url || null,
          entreprise: entreprise || null,
          categorie: categorie || null,
          telephone: telephone || null,
        })
        .eq("id", profile.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["profile", "me"] });
      toast.success("Profil mis à jour");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  const initiales = `${profile.prenom?.[0] ?? ""}${profile.nom?.[0] ?? ""}`.toUpperCase();
  const isBureau = hasRole(profile.role, "bureau");
  const isAdmin = hasRole(profile.role, "admin");

  return (
    <div className="space-y-6 max-w-2xl">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Mon profil</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gérez vos informations personnelles et professionnelles.
          </p>
        </div>
        <Badge variant={isAdmin ? "default" : isBureau ? "secondary" : "outline"} className="capitalize">
          {profile.role}
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identité</CardTitle>
          <CardDescription>Ces informations ne sont modifiables que par le bureau.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={photo_url || undefined} alt={`${profile.prenom} ${profile.nom}`} />
            <AvatarFallback>{initiales || "?"}</AvatarFallback>
          </Avatar>
          <div className="space-y-0.5 text-sm">
            <p className="font-semibold text-foreground">{profile.prenom} {profile.nom}</p>
            <p className="text-muted-foreground">{profile.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations modifiables</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Photo de profil</Label>
              <AvatarUpload
                value={photo_url}
                membreId={profile.id}
                initiales={initiales}
                onChange={setPhotoUrl}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entreprise">Entreprise</Label>
              <Input id="entreprise" value={entreprise} onChange={(e) => setEntreprise(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categorie">Catégorie professionnelle</Label>
              <Input id="categorie" value={categorie} onChange={(e) => setCategorie(e.target.value)} placeholder="Ex. Avocat, Plombier…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telephone">Téléphone</Label>
              <Input id="telephone" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isBureau && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Espace bureau
            </CardTitle>
            <CardDescription>Outils réservés aux membres du bureau.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Validation des recommandations, gestion des semaines et des événements.
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="border-accent/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent-foreground" />
              Espace administrateur
            </CardTitle>
            <CardDescription>Gestion des membres et des rôles.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Promotion d'un membre vers le bureau, désactivation, paramètres généraux.
          </CardContent>
        </Card>
      )}
    </div>
  );
}