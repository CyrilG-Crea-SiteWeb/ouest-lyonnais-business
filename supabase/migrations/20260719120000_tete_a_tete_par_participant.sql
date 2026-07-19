-- -----------------------------------------------------------------------------
-- v_palmares_semaine : comptabiliser un tête-à-tête par participant
--
-- Un tête-à-tête déclaré avec plusieurs membres crée 1 seule ligne dans
-- `recommandations` + N lignes dans la table de liaison `reco_participants`.
-- Jusqu'ici il ne comptait que pour 1 dans les statistiques. On veut désormais
-- qu'il compte pour N (le nombre de participants).
--
-- Règle retenue pour nb_tete_a_tete :
--   * chaque ligne tête-à-tête pèse GREATEST(1, nombre de participants) ;
--     les anciennes saisies sans participant enregistré continuent de compter
--     pour 1. Le recomptage est rétroactif, c'est voulu.
--   * seul l'auteur du tête-à-tête (recommandations.membre_id) est crédité :
--     un membre simplement cité comme participant n'est PAS crédité. Cette
--     logique n'est pas modifiée par la vue (l'agrégat reste groupé par
--     r.membre_id).
--
-- Le reste de la définition est repris à l'identique de la migration
-- 20260630120000_fix_palmares_semaine_view.sql (DROP + CREATE avec
-- security_invoker = true, CTE `agregats`, ROW_NUMBER pour `rang`, mêmes
-- colonnes dans le même ordre).
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
    COALESCE(SUM(
      CASE WHEN r.type = 'tete_a_tete' THEN GREATEST(1, (
        SELECT COUNT(*) FROM public.reco_participants rp
        WHERE rp.recommandation_id = r.id
      )) ELSE 0 END
    ), 0)                                                                   AS nb_tete_a_tete,
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
