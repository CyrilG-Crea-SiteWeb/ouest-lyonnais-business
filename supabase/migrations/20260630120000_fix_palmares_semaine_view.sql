-- -----------------------------------------------------------------------------
-- Correction de la vue v_palmares_semaine
--
-- Sur le tableau de bord ("Palmarès de la semaine"), le tri par chiffre
-- d'affaires était correct mais les colonnes nb_recos et nb_tete_a_tete
-- renvoyaient des statistiques erronées.
--
-- On redéfinit donc la vue pour aligner ses agrégats sur la logique des KPI
-- du tableau de bord :
--   * nb_recos        = recommandations internes + externes combinées
--                       (type IN ('reco_interne', 'reco_externe'))
--   * nb_tete_a_tete  = tête-à-tête (type = 'tete_a_tete')
--   * ca_valide       = somme des "merci business" validés (inchangé)
--
-- security_invoker = true : la RLS de l'appelant s'applique, comme pour les
-- autres vues du tableau de bord.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_palmares_semaine;

CREATE VIEW public.v_palmares_semaine
  WITH (security_invoker = true)
AS
WITH agregats AS (
  SELECT
    r.semaine_id,
    r.membre_id,
    (m.prenom || ' ' || m.nom)                                              AS membre,
    COUNT(*) FILTER (WHERE r.type IN ('reco_interne', 'reco_externe'))      AS nb_recos,
    COUNT(*) FILTER (WHERE r.type = 'tete_a_tete')                          AS nb_tete_a_tete,
    COALESCE(
      SUM(r.montant) FILTER (WHERE r.type = 'merci_business' AND r.valide),
      0
    )                                                                       AS ca_valide
  FROM public.recommandations r
  JOIN public.membres m ON m.id = r.membre_id
  GROUP BY r.semaine_id, r.membre_id, m.prenom, m.nom
)
SELECT
  a.semaine_id,
  a.membre_id,
  a.membre,
  a.nb_recos,
  a.nb_tete_a_tete,
  a.ca_valide,
  ROW_NUMBER() OVER (
    PARTITION BY a.semaine_id
    ORDER BY a.ca_valide DESC, a.nb_recos DESC, a.nb_tete_a_tete DESC
  ) AS rang
FROM agregats a;
