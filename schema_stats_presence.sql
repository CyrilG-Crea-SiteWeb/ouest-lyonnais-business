-- =============================================================================
-- OLB — Statistiques de présence sur une plage de dates (export Excel)
-- =============================================================================
-- Fichier SQL autonome à exécuter MANUELLEMENT dans l'éditeur SQL de Lovable
-- Cloud (Supabase). Prérequis : le module Présences (table presences, colonne
-- semaines.sans_reunion, enum statut_presence) doit déjà exister
-- (cf. schema_presences.sql).
--
-- Réutilise le helper existant est_bureau(). Les deux fonctions sont en
-- SECURITY DEFINER (elles agrègent la table presences protégée par RLS) mais
-- restent réservées au bureau/admin : un garde-fou est_bureau() est intégré
-- directement dans la clause WHERE, donc un appelant non-bureau obtient un
-- résultat vide.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- (1) stats_presence_periode(p_debut, p_fin)
--     Une ligne PAR MEMBRE ACTIF, agrégée sur les semaines ÉLIGIBLES pour CE
--     membre :
--       sans_reunion = false
--       ET date_debut BETWEEN p_debut AND p_fin
--       ET date_debut >= membre.date_entree
--     Taux STRICT : seul 'present' compte.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stats_presence_periode(
  p_debut DATE,
  p_fin DATE
)
RETURNS TABLE (
  membre_id        UUID,
  prenom           TEXT,
  nom              TEXT,
  nb_reunions_dues BIGINT,
  nb_present       BIGINT,
  nb_absent        BIGINT,
  taux_presence    NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;


-- -----------------------------------------------------------------------------
-- (2) detail_presence_periode(p_debut, p_fin)
--     Lignes brutes pour l'onglet "Détail" (le frontend pivote en grille).
--     Produit le CROISEMENT (membre actif x semaine éligible) avec le statut
--     pointé OU NULL si pas de ligne.
--       Semaine éligible = sans_reunion = false ET date_debut BETWEEN p_debut/p_fin
--     FORMAT DE RETOUR (une ligne par couple membre/semaine) :
--       membre_id  UUID            -- identifiant du membre
--       prenom     TEXT
--       nom        TEXT
--       semaine_id BIGINT
--       date_debut DATE            -- le jeudi de la semaine (= entête de colonne)
--       libelle    TEXT            -- libellé de la semaine
--       statut     statut_presence -- 'present' | 'absent' | NULL
--                                  -- NULL = aucune ligne (à afficher "A" = absent)
--     NB : ce détail ne filtre PAS sur date_entree (grille visuelle complète sur
--     la période) ; le calcul officiel du taux reste celui de
--     stats_presence_periode, qui lui tient compte de date_entree.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detail_presence_periode(
  p_debut DATE,
  p_fin DATE
)
RETURNS TABLE (
  membre_id  UUID,
  prenom     TEXT,
  nom        TEXT,
  semaine_id BIGINT,
  date_debut DATE,
  libelle    TEXT,
  statut     statut_presence
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id::uuid        AS membre_id,
    m.prenom::text,
    m.nom::text,
    s.id              AS semaine_id,
    s.date_debut,
    s.libelle::text,
    p.statut
  FROM membres m
  CROSS JOIN semaines s
  LEFT JOIN presences p
         ON p.semaine_id = s.id
        AND p.membre_id = m.id
  WHERE m.statut = 'actif'
    AND est_bureau()             -- garde-fou : réservé au bureau/admin
    AND s.sans_reunion = false
    AND s.date_debut BETWEEN p_debut AND p_fin
  ORDER BY m.nom, m.prenom, s.date_debut;
$$;


-- -----------------------------------------------------------------------------
-- (3) Droits d'exécution : seuls les utilisateurs authentifiés peuvent appeler
--     les fonctions (le garde-fou est_bureau() restreint réellement les données).
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.stats_presence_periode(DATE, DATE)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.detail_presence_periode(DATE, DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.stats_presence_periode(DATE, DATE)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.detail_presence_periode(DATE, DATE) TO authenticated;


-- =============================================================================
-- ORDRE D'EXÉCUTION
-- -----------------------------------------------------------------------------
--   1. (1) CREATE FUNCTION stats_presence_periode
--   2. (2) CREATE FUNCTION detail_presence_periode
--   3. (3) REVOKE / GRANT EXECUTE
--
-- L'ensemble du fichier peut être exécuté d'un seul tenant.
--
-- RAPPEL : les statistiques dépendent d'une date_entree correctement renseignée
-- pour chaque membre, et d'un pointage à jour des présences.
-- =============================================================================
