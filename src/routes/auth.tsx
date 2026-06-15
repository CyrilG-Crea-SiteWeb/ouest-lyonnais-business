import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { OlbLogo } from "@/components/OlbLogo";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Connexion — OLB" }] }),
  component: AuthPage,
});

// Traduit les messages d'erreur Supabase en messages clairs en français.
function messageErreur(brut: string): string {
  const m = brut.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "Adresse email ou mot de passe incorrect.";
  }
  if (m.includes("email not confirmed")) {
    return "Votre adresse email n'est pas encore confirmée. Vérifiez vos emails.";
  }
  if (m.includes("user already registered")) {
    return "Un compte existe déjà avec cette adresse email.";
  }
  if (m.includes("password should be at least")) {
    return "Le mot de passe doit faire au moins 6 caractères.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  }
  return "Une erreur est survenue. Réessayez.";
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetEnvoye, setResetEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  // Réinitialise l'écran de confirmation et l'erreur quand on change de mode.
  function changerMode(nouveau: "signin" | "signup" | "reset") {
    setResetEnvoye(false);
    setErreur(null);
    setMode(nouveau);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
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
        // On reste sur la page et on affiche un écran de confirmation persistant.
        setResetEnvoye(true);
      }
    } catch (err: unknown) {
      setErreur(messageErreur(err instanceof Error ? err.message : ""));
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
          {/* Écran de confirmation après l'envoi du lien de réinitialisation */}
          {mode === "reset" && resetEnvoye ? (
            <div className="space-y-5 text-center">
              <div className="flex justify-center">
                <div className="rounded-full bg-primary/10 p-3">
                  <MailCheck className="h-8 w-8 text-primary" />
                </div>
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-foreground">Email envoyé</h1>
                <p className="text-sm text-muted-foreground">
                  Si un compte est associé à <span className="font-medium text-foreground">{email}</span>,
                  un lien de réinitialisation vient de vous être envoyé.
                </p>
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-left text-sm text-muted-foreground">
                Pensez à vérifier vos spams. Le lien expire après environ une heure :
                cliquez dessus rapidement.
              </div>
              <Button type="button" className="w-full" onClick={() => changerMode("signin")}>
                Retour à la connexion
              </Button>
            </div>
          ) : (
            <>
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
                {erreur && (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {erreur}
                  </div>
                )}
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => changerMode("reset")}
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
                  onClick={() => changerMode("signin")}
                  className="block w-full text-center text-sm text-primary hover:underline"
                >
                  Retour à la connexion
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => changerMode(mode === "signin" ? "signup" : "signin")}
                  className="block w-full text-center text-sm text-primary hover:underline"
                >
                  {mode === "signin" ? "Pas encore de compte ? S'inscrire" : "Déjà inscrit ? Se connecter"}
                </button>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}