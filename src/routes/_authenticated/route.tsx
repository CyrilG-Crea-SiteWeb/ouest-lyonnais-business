import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // 1) Lire la session locale d'abord (pas d'appel réseau) : plus robuste
    //    qu'un getUser() réseau au tout premier chargement sur mobile.
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) throw redirect({ to: "/auth" });

    // 2) Garde-fou mot de passe : si la requête échoue (réseau), on NE bloque
    //    PAS l'accès — on laisse passer plutôt que de crasher la page.
    try {
      const { data: membre } = await supabase
        .from("membres")
        .select("mdp_defini")
        .eq("id", user.id)
        .maybeSingle();
      if (membre && membre.mdp_defini === false) {
        throw redirect({ to: "/definir-mot-de-passe" });
      }
    } catch (e) {
      // Si c'est une redirection TanStack, on la laisse remonter ;
      // sinon (erreur réseau), on ignore et on laisse l'utilisateur entrer.
      if (e && typeof e === "object" && "to" in e) throw e;
      console.warn("[auth] vérification mdp_defini ignorée (réseau) :", e);
    }

    return { user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});