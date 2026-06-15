import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Garde-fou : si le membre n'a jamais défini son mot de passe
    // (compte créé par invitation), on le force vers la page dédiée.
    const { data: membre } = await supabase
      .from("membres")
      .select("mdp_defini")
      .eq("id", data.user.id)
      .maybeSingle();
    if (membre && membre.mdp_defini === false) {
      throw redirect({ to: "/definir-mot-de-passe" });
    }

    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});