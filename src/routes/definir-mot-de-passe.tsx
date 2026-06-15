import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { OlbLogo } from "@/components/OlbLogo";
import { toast } from "sonner";

export const Route = createFileRoute("/definir-mot-de-passe")({
  head: () => ({ meta: [{ title: "Définir mon mot de passe — OLB" }] }),
  component: DefinirMotDePassePage,
});

function DefinirMotDePassePage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionPrete, setSessionPrete] = useState(false);

  // Au chargement, Supabase lit le token présent dans l'URL (#access_token=...)
  // et ouvre une session temporaire. On attend qu'elle soit prête.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessionPrete(true);
      } else {
        // Pas de session : le lien est invalide ou expiré.
        toast.error("Lien invalide ou expiré. Redemandez un email.");
        setTimeout(() => navigate({ to: "/auth" }), 2500);
      }
    });

    // Supabase émet aussi un évènement quand il finit de traiter le token.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setSessionPrete(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 6) {
      toast.error("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Marque le drapeau mdp_defini = true, mais SANS bloquer la suite :
      // dans le contexte d'un lien de reset, cet update peut rester en
      // attente. On le lance "à part" et on ne l'attend pas pour continuer.
      supabase.auth.getUser().then(({ data: u }) => {
        if (u.user) {
          supabase
            .from("membres")
            .update({ mdp_defini: true })
            .eq("id", u.user.id)
            .then(({ error: e2 }) => {
              if (e2) console.error("maj mdp_defini:", e2.message);
            });
        }
      });

      toast.success("Mot de passe défini. Vous pouvez vous connecter partout.");
      navigate({ to: "/" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <OlbLogo className="h-16" />
        </div>
        <Card className="p-6 space-y-5 shadow-md">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-bold text-foreground">
              Définir votre mot de passe
            </h1>
            <p className="text-sm text-muted-foreground">
              Choisissez un mot de passe pour accéder à l'application sur tous vos appareils.
            </p>
          </div>
          {sessionPrete ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Veuillez patienter…" : "Définir mon mot de passe"}
              </Button>
            </form>
          ) : (
            <p className="text-center text-sm text-muted-foreground">Vérification du lien…</p>
          )}
        </Card>
      </div>
    </div>
  );
}