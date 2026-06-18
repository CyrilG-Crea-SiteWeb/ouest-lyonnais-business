import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { OlbLogo } from "@/components/OlbLogo";
import { toast } from "sonner";
import { MailCheck, Eye, EyeOff } from "lucide-react";

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
  if (m.includes("password") && (m.includes("weak") || m.includes("characters") || m.includes("requirement"))) {
    return "Mot de passe trop faible : il doit contenir des lettres et des chiffres (6 caractères minimum).";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  }
  if (m.includes("signup") || m.includes("not allowed") || m.includes("disabled")) {
    return "Les inscriptions ne sont pas ouvertes. Utilisez le lien d'invitation transmis par le bureau.";
  }
  return "Une erreur est survenue. Réessayez.";
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetEnvoye, setResetEnvoye] = useState(false);
  const [inscriptionEnvoyee, setInscriptionEnvoyee] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  // Active le mode inscription uniquement via le lien privé ?invite=1.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite") === "1") {
      setMode("signup");
    }
  }, []);

  // Réinitialise l'écran de confirmation et l'erreur quand on change de mode.
  function changerMode(nouveau: "signin" | "signup" | "reset") {
    setResetEnvoye(false);
    setErreur(null);
    setInscriptionEnvoyee(false);
    setMode(nouveau);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (mode === "signup" && password !== passwordConfirm) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
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
        setInscriptionEnvoyee(true);
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
          {mode === "signup" && inscriptionEnvoyee ? (
            <div className="space-y-5 text-center">
              <div className="flex justify-center">
                <div className="rounded-full bg-primary/10 p-3">
                  <MailCheck className="h-8 w-8 text-primary" />
                </div>
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-foreground">Compte créé</h1>
                <p className="text-sm text-muted-foreground">
                  Un email de confirmation vient d'être envoyé à{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                </p>
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-left text-sm text-muted-foreground">
                Cliquez sur le lien dans cet email pour activer votre compte,
                puis revenez vous connecter. Pensez à vérifier vos spams ; le
                lien expire après environ une heure.
              </div>
              <Button type="button" className="w-full" onClick={() => changerMode("signin")}>
                Retour à la connexion
              </Button>
            </div>
          ) : mode === "reset" && resetEnvoye ? (
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
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="pr-10" />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {mode === "signup" && (
                      <p className="text-xs text-muted-foreground">
                        Au moins 6 caractères, avec des lettres et des chiffres.
                      </p>
                    )}
                  </div>
                )}
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="passwordConfirm">Confirmer le mot de passe</Label>
                    <Input
                      id="passwordConfirm"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      required
                      minLength={6}
                    />
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
              {mode === "reset" && (
                <button
                  type="button"
                  onClick={() => changerMode("signin")}
                  className="block w-full text-center text-sm text-primary hover:underline"
                >
                  Retour à la connexion
                </button>
              )}
              {mode === "signup" && (
                <button
                  type="button"
                  onClick={() => changerMode("signin")}
                  className="block w-full text-center text-sm text-primary hover:underline"
                >
                  Déjà inscrit ? Se connecter
                </button>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
