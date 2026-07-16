-- ═══════════════════════════════════════════════════════════════════════
-- OLB — Annuaire public (page /annuaire accessible sans compte)
-- Script SQL à COLLER **UNE SEULE FOIS** dans l'éditeur SQL de Lovable Cloud.
--
-- Ce script :
--   • N'ALTÈRE AUCUNE table existante (il ne crée qu'une vue en lecture seule).
--   • Ne modifie AUCUNE policy RLS existante.
--   • Est idempotent (rejouable sans erreur) grâce à CREATE OR REPLACE.
--
-- Objectif : exposer au rôle `anon` (visiteurs non connectés) uniquement les
-- colonnes publiques des membres ACTIFS, pour la page publique /annuaire.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- 1. Vue publique : uniquement les colonnes non sensibles des membres actifs.
--    NE PAS exposer : statut, mdp_defini, date_entree, created_at, etc.
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_annuaire_public AS
SELECT
  m.id,
  m.nom,
  m.prenom,
  m.photo_url,
  m.entreprise,
  m.categorie,
  m.email,
  m.telephone,
  m.site_web,
  m.role
FROM public.membres AS m
WHERE m.statut = 'actif';

-- ───────────────────────────────────────────────────────────────────────
-- 2. security_invoker = false : la vue s'exécute avec les droits de son
--    propriétaire (SECURITY DEFINER, comportement par défaut des vues
--    Postgres). Ainsi le simple GRANT SELECT à `anon` ci-dessous suffit
--    pour la lire : la vue ne se heurte PAS à la RLS de la table `membres`
--    pour le rôle `anon` (qui n'a normalement aucun accès à `membres`).
-- ───────────────────────────────────────────────────────────────────────
ALTER VIEW public.v_annuaire_public SET (security_invoker = false);

-- ───────────────────────────────────────────────────────────────────────
-- 3. Autoriser la lecture de la vue au rôle anonyme (visiteurs sans compte)
--    ET aux membres connectés (authenticated), sans toucher à `membres`.
-- ───────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.v_annuaire_public TO anon;
GRANT SELECT ON public.v_annuaire_public TO authenticated;
