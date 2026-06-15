import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // On NE remonte PAS les erreurs de requête jusqu'au boundary racine :
        // une requête en échec affiche son propre état, sans crasher la page.
        throwOnError: false,
        // Quelques tentatives espacées : absorbe les coupures réseau brèves (mobile).
        retry: 3,
        retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
        // Évite de re-déclencher des requêtes (et des erreurs) à chaque
        // retour de focus sur iOS quand l'onglet sort de veille.
        refetchOnWindowFocus: false,
        staleTime: 30_000,

        // --- Rafraîchissement automatique des listes ---
        // Toutes les 45 s, en arrière-plan, sans action de l'utilisateur.
        // Couvre recos, sondages, événements, demandes (et la cloche).
        refetchInterval: 30_000,
        // Ne poll PAS quand l'onglet est en arrière-plan : économise la
        // batterie/données sur iPhone et évite les requêtes inutiles.
        refetchIntervalInBackground: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
