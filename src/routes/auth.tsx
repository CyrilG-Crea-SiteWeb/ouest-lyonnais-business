import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { OlbLogo } from "@/components/OlbLogo";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Connexion — OLB" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Connexion réussie");
        navigate({ to: "/" });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { prenom, nom },
          },
        });
        if (error) throw error;
        toast.success("Compte créé. Vérifiez votre email.");
      } else {
        // mode === "reset" : envoi du lien de réinitialisation.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/definir-mot-de-passe`,
        });
        if (error) throw error;
        toast.success("Si un compte existe, un email de réinitialisation vient d'être envoyé.");
        setMode("signin");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const titre =
    mode === "signin" ? "Connexion" : mode === "signup" ? "Créer un compte" : "Mot de passe oublié";

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <OlbLogo className="h-16" />
        </div>
        <Card className="p-6 space-y-5 shadow-md">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-bold text-foreground">{titre}</h1>
            <p className="text-sm text-muted-foreground">
              {mode === "reset"
                ? "Saisissez votre email pour recevoir un lien de réinitialisation."
                : "Espace réservé aux membres OLB"}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="prenom">Prénom</Label>
                  <Input id="prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nom">Nom</Label>
                  <Input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {mode !== "reset" && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Mot de passe</Label>
                <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
            )}
            {mode === "signin" && (
              <button
                type="button"
                onClick={() => setMode("reset")}
                className="block text-left text-sm text-primary hover:underline"
              >
                Mot de passe oublié ?
              </button>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Veuillez patienter…"
                : mode === "signin"
                ? "Se connecter"
                : mode === "signup"
                ? "Créer mon compte"
                : "Envoyer le lien"}
            </Button>
          </form>
          {mode === "reset" ? (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="block w-full text-center text-sm text-primary hover:underline"
            >
              Retour à la connexion
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="block w-full text-center text-sm text-primary hover:underline"
            >
              {mode === "signin" ? "Pas encore de compte ? S'inscrire" : "Déjà inscrit ? Se connecter"}
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}