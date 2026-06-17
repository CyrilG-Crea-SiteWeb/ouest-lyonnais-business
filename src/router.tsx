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
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        queryClient.clear();
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