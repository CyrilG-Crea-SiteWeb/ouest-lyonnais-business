-- stats_presence_periode plantait à chaque appel :
--   ERROR: invalid input value for enum statut_presence: "excuse"
-- Le statut « excusé » a été retiré de l'enum (seuls present / absent existent),
-- mais la fonction filtrait encore sur p.statut = 'excuse'. Conséquence : la
-- synthèse de l'export Présences et les colonnes Présences / Taux de présence
-- de l'export Recommandations restaient vides.
--
-- Même calcul qu'avant (et que la vue v_taux_presence_membre) ; nb_excuse est
-- conservé dans la signature pour ne pas casser les appelants et vaut 0.
CREATE OR REPLACE FUNCTION public.stats_presence_periode(p_debut date, p_fin date)
 RETURNS TABLE(membre_id uuid, prenom text, nom text, nb_reunions_dues bigint, nb_present bigint, nb_excuse bigint, nb_absent bigint, taux_presence numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH membres_actifs AS (
    SELECT m.id, m.prenom, m.nom, m.date_entree
    FROM membres m
    WHERE m.statut = 'actif'
      AND est_bureau()           -- garde-fou : réservé au bureau/admin
  ),
  -- Semaines "dues" PAR membre (dépend de sa date_entree).
  semaines_dues AS (
    SELECT ma.id AS membre_id, s.id AS semaine_id
    FROM membres_actifs ma
    JOIN semaines s
      ON s.sans_reunion = false
     AND s.date_debut BETWEEN p_debut AND p_fin
     AND s.date_debut >= ma.date_entree
  )
  SELECT
    ma.id::uuid                                              AS membre_id,
    ma.prenom::text,
    ma.nom::text,
    COUNT(sd.semaine_id)                                     AS nb_reunions_dues,
    COUNT(*) FILTER (WHERE p.statut = 'present')             AS nb_present,
    0::bigint                                                AS nb_excuse,
    COUNT(sd.semaine_id) - COUNT(*) FILTER (WHERE p.statut = 'present') AS nb_absent,
    COUNT(*) FILTER (WHERE p.statut = 'present')::numeric
      / NULLIF(COUNT(sd.semaine_id), 0)                      AS taux_presence
  FROM membres_actifs ma
  LEFT JOIN semaines_dues sd ON sd.membre_id = ma.id
  LEFT JOIN presences p
         ON p.semaine_id = sd.semaine_id
        AND p.membre_id = ma.id
  GROUP BY ma.id, ma.prenom, ma.nom
  ORDER BY ma.nom, ma.prenom;
$function$;
