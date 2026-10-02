-- Taux de présence visible par tous les membres connectés.
--
-- La vue v_taux_presence_membre s'appuie sur la table presences, dont la RLS
-- ne laisse lire les lignes qu'aux rôles de gestion. Pour un membre sans rôle,
-- la vue ne voit donc aucune présence et renvoie un taux de 0 pour tout le monde.
--
-- Cette fonction relit la vue avec les droits de son propriétaire (bypass RLS)
-- et n'expose que les agrégats (nb présent / absent / dus, taux), pas le détail
-- semaine par semaine. Réservée aux utilisateurs authentifiés.
CREATE OR REPLACE FUNCTION public.taux_presence_membres(p_membre_id uuid DEFAULT NULL)
 RETURNS SETOF public.v_taux_presence_membre
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT v.*
  FROM public.v_taux_presence_membre v
  WHERE auth.uid() IS NOT NULL
    AND (p_membre_id IS NULL OR v.membre_id = p_membre_id);
$function$;

REVOKE EXECUTE ON FUNCTION public.taux_presence_membres(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.taux_presence_membres(uuid) TO authenticated;
