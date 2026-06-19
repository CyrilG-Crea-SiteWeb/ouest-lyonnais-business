import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Membre = {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  photo_url: string | null;
  entreprise: string | null;
  categorie: string | null;
  telephone: string | null;
  role: "admin" | "bureau" | "membre" | "comite_membres";
  statut: string;
  date_entree: string;
  mdp_defini: boolean | null;
};

export function useProfile() {
  return useQuery({
    queryKey: ["profile", "me"],
    queryFn: async (): Promise<Membre | null> => {
      const { data: auth } = await supabase.auth.getUser();
      // Session pas encore prête : on signale l'absence pour déclencher un retry.
      if (!auth.user) throw new Error("auth-not-ready");
      const { data, error } = await supabase
        .from("membres")
        .select("*")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return data as Membre | null;
    },
    staleTime: 60_000,
    retry: (failureCount, error) => {
      // On retente uniquement le cas "session pas prête", jusqu'à 3 fois.
      if (error instanceof Error && error.message === "auth-not-ready") {
        return failureCount < 3;
      }
      return false;
    },
    retryDelay: 400,
  });
}

export function hasRole(role: Membre["role"] | undefined, min: "membre" | "bureau" | "admin") {
  if (!role) return false;
  const order = { membre: 0, bureau: 1, admin: 2 } as const;
  return order[role] >= order[min];
}
