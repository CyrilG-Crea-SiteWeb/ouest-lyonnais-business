import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { supabase } from "@/integrations/supabase/client";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        throwOnError: false,
        retry: 3,
        retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
      },
    },
  });

  // --- Purge du cache à chaque changement de session ---
  // Empêche les données d'un compte de "fuiter" sur le compte suivant
  // sans rechargement de page (déconnexion → reconnexion avec un autre compte).
  // S'exécute uniquement côté navigateur.
  if (typeof window !== "undefined") {
    let dernierUserId: string | null = null;

    supabase.auth.onAuthStateChange((event, session) => {
      const userIdActuel = session?.user?.id ?? null;

      // Vraie déconnexion : on purge.
      if (event === "SIGNED_OUT") {
        dernierUserId = null;
        queryClient.clear();
        return;
      }

      // Connexion / restauration de session : on ne purge QUE si
      // l'utilisateur a réellement changé (vrai changement de compte).
      // On ignore TOKEN_REFRESHED et les SIGNED_IN répétés du même
      // utilisateur (fréquents sur mobile au réveil de l'app),
      // qui faisaient disparaître/réapparaître les données.
      if (event === "SIGNED_IN") {
        if (dernierUserId !== null && dernierUserId !== userIdActuel) {
          queryClient.clear();
        }
        dernierUserId = userIdActuel;
      }
    });
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
