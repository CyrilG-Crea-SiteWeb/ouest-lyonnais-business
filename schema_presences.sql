-- =============================================================================
-- OLB — Module "Présences" (réservé bureau/admin)
-- =============================================================================
-- Fichier SQL autonome à exécuter MANUELLEMENT dans l'éditeur SQL de Lovable
-- Cloud (Supabase). Réutilise les helpers existants : est_bureau().
--
-- ORDRE D'EXÉCUTION : exécuter les blocs (a) -> (f) dans l'ordre. Si l'éditeur
-- SQL refuse de créer un type ENUM dans la même transaction qu'une table qui
-- l'utilise, exécutez le bloc (a) SEUL d'abord, puis le reste.
-- Un récapitulatif complet figure en bas du fichier.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- (a) ENUM des statuts de présence
--     À EXÉCUTER EN PREMIER. Si l'éditeur SQL le demande, exécutez ce bloc SEUL,
--     puis lancez le reste du fichier.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_presence') THEN
    CREATE TYPE statut_presence AS ENUM ('present', 'excuse', 'absent');
  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- (b) Colonne "semaine sans réunion" (vacances) sur la table existante semaines.
--     Sert à marquer les semaines sans pointage : exclues du calcul du taux.
-- -----------------------------------------------------------------------------
ALTER TABLE public.semaines
  ADD COLUMN IF NOT EXISTS sans_reunion BOOLEAN NOT NULL DEFAULT false;

-- RPC pour basculer sans_reunion réservée au bureau/admin, SANS modifier la RLS
-- de la table semaines. SECURITY DEFINER + contrôle explicite via est_bureau().
CREATE OR REPLACE FUNCTION public.set_semaine_sans_reunion(
  p_semaine_id BIGINT,
  p_sans_reunion BOOLEAN
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NOT est_bureau() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au bureau';
  END IF;
  UPDATE public.semaines SET sans_reunion = p_sans_reunion WHERE id = p_semaine_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_semaine_sans_reunion(BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_semaine_sans_reunion(BIGINT, BOOLEAN) TO authenticated;


-- -----------------------------------------------------------------------------
-- (c) Table presences
--     Convention RETENUE : "absence = pas de ligne". Le bureau ne crée des
--     lignes que pour 'present' et 'excuse' (et 'absent' s'il veut le marquer
--     explicitement, mais ce n'est pas obligatoire). Le calcul du taux ne
--     dépend PAS de lignes 'absent' explicites (voir la vue plus bas).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presences (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  semaine_id  BIGINT NOT NULL REFERENCES public.semaines(id) ON DELETE CASCADE,
  membre_id   UUID   NOT NULL REFERENCES public.membres(id)  ON DELETE CASCADE,
  statut      statut_presence NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT presences_semaine_membre_unique UNIQUE (semaine_id, membre_id)
);

CREATE INDEX IF NOT EXISTS idx_presences_semaine ON public.presences (semaine_id);
CREATE INDEX IF NOT EXISTS idx_presences_membre  ON public.presences (membre_id);

-- Maintien automatique de updated_at sur UPDATE (utile pour l'upsert).
CREATE OR REPLACE FUNCTION public.presences_set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_presences_updated_at ON public.presences;
CREATE TRIGGER trg_presences_updated_at
  BEFORE UPDATE ON public.presences
  FOR EACH ROW EXECUTE FUNCTION public.presences_set_updated_at();


-- -----------------------------------------------------------------------------
-- (d) RLS — TOUT est réservé au bureau/admin, Y COMPRIS LA LECTURE.
--     Les membres simples ne doivent pas voir les présences.
--     Calque du style de schema_bni.sql : policies basées sur est_bureau().
-- -----------------------------------------------------------------------------
ALTER TABLE public.presences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS presences_select_bureau ON public.presences;
CREATE POLICY presences_select_bureau ON public.presences
  FOR SELECT
  TO authenticated
  USING (est_bureau());

DROP POLICY IF EXISTS presences_insert_bureau ON public.presences;
CREATE POLICY presences_insert_bureau ON public.presences
  FOR INSERT
  TO authenticated
  WITH CHECK (est_bureau());

DROP POLICY IF EXISTS presences_update_bureau ON public.presences;
CREATE POLICY presences_update_bureau ON public.presences
  FOR UPDATE
  TO authenticated
  USING (est_bureau())
  WITH CHECK (est_bureau());

DROP POLICY IF EXISTS presences_delete_bureau ON public.presences;
CREATE POLICY presences_delete_bureau ON public.presences
  FOR DELETE
  TO authenticated
  USING (est_bureau());


-- -----------------------------------------------------------------------------
-- (e) Vue de taux de présence par membre : v_taux_presence_membre
--     Pour chaque membre ACTIF, sur les semaines ÉLIGIBLES :
--       semaine éligible = sans_reunion = false
--                          ET date_debut (le jeudi) >= membres.date_entree
--                          ET date_debut <= CURRENT_DATE
--     UN SEUL taux : présence STRICTE. L'excusé n'est PAS valorisé dans le taux
--     (juste affiché à titre indicatif via nb_excuse).
--
--     NOTE : cette vue dépend d'une date_entree correctement renseignée pour
--     chaque membre. Un membre sans date_entree fiable verra un taux faussé.
--
--     SECURITY : la vue agrège la table presences (RLS bureau). On la crée en
--     SECURITY INVOKER (comportement par défaut sur PG15+ ; on force l'option
--     explicitement) afin que la RLS de l'appelant s'applique : seul le bureau
--     peut donc la lire.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_taux_presence_membre;
CREATE VIEW public.v_taux_presence_membre
  WITH (security_invoker = true)
AS
WITH membres_actifs AS (
  SELECT m.id, m.prenom, m.nom, m.date_entree
  FROM public.membres m
  WHERE m.statut = 'actif'
),
-- Semaines éligibles PAR membre (dépend de sa date_entree).
semaines_dues AS (
  SELECT ma.id AS membre_id, s.id AS semaine_id
  FROM membres_actifs ma
  JOIN public.semaines s
    ON s.sans_reunion = false
   AND s.date_debut >= ma.date_entree
   AND s.date_debut <= CURRENT_DATE
)
SELECT
  ma.id                                                    AS membre_id,
  ma.prenom,
  ma.nom,
  COUNT(sd.semaine_id)                                     AS nb_reunions_dues,
  COUNT(*) FILTER (WHERE p.statut = 'present')             AS nb_present,
  COUNT(*) FILTER (WHERE p.statut = 'excuse')              AS nb_excuse,
  -- L'excusé compte comme absent dans le taux strict.
  COUNT(sd.semaine_id) - COUNT(*) FILTER (WHERE p.statut = 'present') AS nb_absent,
  COUNT(*) FILTER (WHERE p.statut = 'present')::numeric
    / NULLIF(COUNT(sd.semaine_id), 0)                      AS taux_presence
FROM membres_actifs ma
LEFT JOIN semaines_dues sd ON sd.membre_id = ma.id
LEFT JOIN public.presences p
       ON p.semaine_id = sd.semaine_id
      AND p.membre_id = ma.id
GROUP BY ma.id, ma.prenom, ma.nom
ORDER BY ma.nom, ma.prenom;

-- La RLS s'applique via la table sous-jacente (security_invoker), mais on
-- restreint quand même l'accès au rôle authenticated par cohérence.
REVOKE ALL ON public.v_taux_presence_membre FROM PUBLIC, anon;
GRANT SELECT ON public.v_taux_presence_membre TO authenticated;


-- =============================================================================
-- (f) RÉCAPITULATIF DE L'ORDRE D'EXÉCUTION
-- -----------------------------------------------------------------------------
--   1. (a) CREATE TYPE statut_presence            <- en premier, seul si besoin
--   2. (b) ALTER TABLE semaines ADD sans_reunion (+ RPC set_semaine_sans_reunion)
--   3. (c) CREATE TABLE presences (+ index + trigger updated_at)
--   4. (d) RLS : ENABLE + policies SELECT/INSERT/UPDATE/DELETE (est_bureau())
--   5. (e) CREATE VIEW v_taux_presence_membre (+ GRANT)
--
-- En pratique : exécuter le bloc (a) d'abord si l'éditeur exige un ENUM dans sa
-- propre transaction, puis lancer le reste du fichier d'un seul tenant.
--
-- RAPPEL IMPORTANT : vérifier que la colonne membres.date_entree est renseignée
-- correctement pour TOUS les membres existants — le taux de présence en dépend.
-- =============================================================================
