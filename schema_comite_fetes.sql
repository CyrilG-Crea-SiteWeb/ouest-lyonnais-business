-- =============================================================================
-- OLB — Rôle "Comité des fêtes" (gestion des événements et des sondages)
-- =============================================================================
-- Fichier SQL autonome à exécuter MANUELLEMENT dans l'éditeur SQL de Lovable
-- Cloud (Supabase). Réutilise les helpers existants : est_bureau().
--
-- Objectif : créer un rôle `comite_fetes` autorisé à CRÉER / MODIFIER /
-- SUPPRIMER des événements et des sondages, au même titre que le bureau et les
-- admins. Les policies ajoutées ici sont PERMISSIVES et ADDITIVES : elles ne
-- retirent aucun droit existant (bureau/admin gardent les leurs).
--
-- ORDRE D'EXÉCUTION : exécuter le bloc (a) SEUL d'abord (l'ajout d'une valeur à
-- un type ENUM doit être validé/committé avant de pouvoir être utilisé), puis
-- exécuter les blocs (b) -> (c).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- (a) Nouvelle valeur d'ENUM : comite_fetes
--     À EXÉCUTER EN PREMIER, SEUL. Relancez ensuite le reste du fichier.
-- -----------------------------------------------------------------------------
ALTER TYPE public.role_membre ADD VALUE IF NOT EXISTS 'comite_fetes';


-- -----------------------------------------------------------------------------
-- (b) Helper de rôle : est_comite_fetes()
--     Vrai pour le comité des fêtes, le bureau et les admins. Sur le même
--     modèle (SECURITY INVOKER) que est_admin() / est_bureau().
--     On compare via role::text pour rester robuste vis-à-vis de l'ENUM.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.est_comite_fetes()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM membres
    WHERE id = auth.uid()
      AND role::text IN ('admin', 'bureau', 'comite_fetes')
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.est_comite_fetes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.est_comite_fetes() TO authenticated;


-- -----------------------------------------------------------------------------
-- (c) RLS additive : autoriser le comité des fêtes à gérer événements/sondages
--     Policies PERMISSIVES distinctes (OR avec les policies bureau/admin déjà
--     en place). Couvrent INSERT / UPDATE / DELETE.
-- -----------------------------------------------------------------------------

-- Événements
DROP POLICY IF EXISTS evenements_comite_fetes_insert ON public.evenements;
CREATE POLICY evenements_comite_fetes_insert ON public.evenements
  FOR INSERT TO authenticated
  WITH CHECK (public.est_comite_fetes());

DROP POLICY IF EXISTS evenements_comite_fetes_update ON public.evenements;
CREATE POLICY evenements_comite_fetes_update ON public.evenements
  FOR UPDATE TO authenticated
  USING (public.est_comite_fetes())
  WITH CHECK (public.est_comite_fetes());

DROP POLICY IF EXISTS evenements_comite_fetes_delete ON public.evenements;
CREATE POLICY evenements_comite_fetes_delete ON public.evenements
  FOR DELETE TO authenticated
  USING (public.est_comite_fetes());

-- Sondages
DROP POLICY IF EXISTS sondages_comite_fetes_insert ON public.sondages;
CREATE POLICY sondages_comite_fetes_insert ON public.sondages
  FOR INSERT TO authenticated
  WITH CHECK (public.est_comite_fetes());

DROP POLICY IF EXISTS sondages_comite_fetes_update ON public.sondages;
CREATE POLICY sondages_comite_fetes_update ON public.sondages
  FOR UPDATE TO authenticated
  USING (public.est_comite_fetes())
  WITH CHECK (public.est_comite_fetes());

DROP POLICY IF EXISTS sondages_comite_fetes_delete ON public.sondages;
CREATE POLICY sondages_comite_fetes_delete ON public.sondages
  FOR DELETE TO authenticated
  USING (public.est_comite_fetes());

-- Options de sondage (créées/supprimées en même temps que le sondage)
DROP POLICY IF EXISTS options_sondage_comite_fetes_insert ON public.options_sondage;
CREATE POLICY options_sondage_comite_fetes_insert ON public.options_sondage
  FOR INSERT TO authenticated
  WITH CHECK (public.est_comite_fetes());

DROP POLICY IF EXISTS options_sondage_comite_fetes_update ON public.options_sondage;
CREATE POLICY options_sondage_comite_fetes_update ON public.options_sondage
  FOR UPDATE TO authenticated
  USING (public.est_comite_fetes())
  WITH CHECK (public.est_comite_fetes());

DROP POLICY IF EXISTS options_sondage_comite_fetes_delete ON public.options_sondage;
CREATE POLICY options_sondage_comite_fetes_delete ON public.options_sondage
  FOR DELETE TO authenticated
  USING (public.est_comite_fetes());


-- =============================================================================
-- RÉCAPITULATIF
--   1. (a) ENUM : ajout de la valeur 'comite_fetes' (à exécuter SEUL d'abord)
--   2. (b) Helper est_comite_fetes() : comite_fetes + bureau + admin
--   3. (c) RLS additive INSERT/UPDATE/DELETE sur evenements, sondages,
--          options_sondage
--   N.B. : penser à attribuer le rôle "Comité des fêtes" aux membres concernés
--          depuis l'écran Membres (réservé aux admins).
-- =============================================================================
