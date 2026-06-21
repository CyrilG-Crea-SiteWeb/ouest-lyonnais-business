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
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Shield, ShieldCheck, Globe, ChevronRight } from "lucide-react";

function normaliseUrl(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export const Route = createFileRoute("/_authenticated/mon-profil")({
  head: () => ({ meta: [{ title: "Mon profil — OLB" }] }),
  component: ProfilPage,
});

function ProfilPage() {
  const { data: profile, isLoading, isError } = useProfile();
  const qc = useQueryClient();
  const [photo_url, setPhotoUrl] = useState("");
  const [entreprise, setEntreprise] = useState("");
  const [categorie, setCategorie] = useState("");
  const [telephone, setTelephone] = useState("");
  const [siteInternet, setSiteInternet] = useState("");
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [identiteOpen, setIdentiteOpen] = useState(false);
  const [securiteOpen, setSecuriteOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setPhotoUrl(profile.photo_url ?? "");
    setEntreprise(profile.entreprise ?? "");
    setCategorie(profile.categorie ?? "");
    setTelephone(profile.telephone ?? "");
    setSiteInternet(profile.site_internet ?? "");
  }, [profile]);

  if (isLoading || isError) return <p className="text-sm text-muted-foreground">Chargement…</p>;
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
          site_internet: normaliseUrl(siteInternet),
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

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    setChangingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Mot de passe modifié.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setChangingPwd(false);
    }
  }

  async function handleSendResetLink() {
    if (!profile) return;
    setSendingLink(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/definir-mot-de-passe`,
      });
      if (error) throw error;
      toast.success("Email envoyé. Cliquez sur le lien pour changer votre mot de passe.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSendingLink(false);
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
        <Collapsible open={identiteOpen} onOpenChange={setIdentiteOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full text-left">
              <CardHeader className="flex-row items-start gap-2 space-y-0">
                <ChevronRight className={"h-5 w-5 shrink-0 mt-0.5 transition-transform " + (identiteOpen ? "rotate-90" : "")} />
                <div className="space-y-1">
                  <CardTitle className="text-base">Identité</CardTitle>
                  <CardDescription>Ces informations ne sont pas modifiables</CardDescription>
                </div>
              </CardHeader>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
          </CollapsibleContent>
        </Collapsible>
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
            <div className="space-y-1.5">
              <Label htmlFor="site_internet" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Lien site internet
              </Label>
              <Input
                id="site_internet"
                type="url"
                inputMode="url"
                value={siteInternet}
                onChange={(e) => setSiteInternet(e.target.value)}
                placeholder="https://mon-entreprise.fr"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <Collapsible open={securiteOpen} onOpenChange={setSecuriteOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full text-left">
              <CardHeader className="flex-row items-start gap-2 space-y-0">
                <ChevronRight className={"h-5 w-5 shrink-0 mt-0.5 transition-transform " + (securiteOpen ? "rotate-90" : "")} />
                <div className="space-y-1">
                  <CardTitle className="text-base">Sécurité — mot de passe</CardTitle>
                  <CardDescription>
                    Modifiez votre mot de passe directement, ou recevez un lien par email.
                  </CardDescription>
                </div>
              </CardHeader>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Nouveau mot de passe</Label>
                  <Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                  <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} />
                </div>
                <Button type="submit" disabled={changingPwd || !newPassword}>
                  {changingPwd ? "Modification…" : "Changer mon mot de passe"}
                </Button>
              </form>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Vous préférez confirmer par email ? Recevez un lien sécurisé sur {profile.email}.
                </p>
                <Button type="button" variant="outline" onClick={handleSendResetLink} disabled={sendingLink}>
                  {sendingLink ? "Envoi…" : "Recevoir un lien par email"}
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
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