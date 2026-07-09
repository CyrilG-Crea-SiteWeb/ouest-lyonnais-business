-- ═══════════════════════════════════════════════════════════════════════
-- OLB — Mode « Conférence hebdo »
-- Script SQL idempotent à COLLER dans l'éditeur SQL de Lovable Cloud.
-- (Ce fichier est un historique/livrable : il n'est PAS poussé en migration.)
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- 1. Colonne est_conference sur evenements
-- ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.evenements
  ADD COLUMN IF NOT EXISTS est_conference BOOLEAN NOT NULL DEFAULT false;

-- ───────────────────────────────────────────────────────────────────────
-- 2. Table de liaison conference_intervenants
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conference_intervenants (
  evenement_id BIGINT NOT NULL REFERENCES public.evenements(id) ON DELETE CASCADE,
  membre_id    UUID   NOT NULL REFERENCES public.membres(id)    ON DELETE CASCADE,
  PRIMARY KEY (evenement_id, membre_id)
);

CREATE INDEX IF NOT EXISTS idx_conference_intervenants_membre_id
  ON public.conference_intervenants (membre_id);

-- ───────────────────────────────────────────────────────────────────────
-- 3. RLS (aligné sur le pattern existant : lecture ouverte, écriture bureau+)
--    CREATE POLICY n'a pas de « IF NOT EXISTS » → on DROP puis CREATE pour
--    rendre le script rejouable sans erreur.
-- ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.conference_intervenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conf_interv_select_auth"   ON public.conference_intervenants;
DROP POLICY IF EXISTS "conf_interv_insert_bureau" ON public.conference_intervenants;
DROP POLICY IF EXISTS "conf_interv_update_bureau" ON public.conference_intervenants;
DROP POLICY IF EXISTS "conf_interv_delete_bureau" ON public.conference_intervenants;

-- SELECT : tout authentifié.
CREATE POLICY "conf_interv_select_auth"
  ON public.conference_intervenants
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT : bureau + admin.
CREATE POLICY "conf_interv_insert_bureau"
  ON public.conference_intervenants
  FOR INSERT
  TO authenticated
  WITH CHECK (public.est_bureau());

-- UPDATE : bureau + admin.
CREATE POLICY "conf_interv_update_bureau"
  ON public.conference_intervenants
  FOR UPDATE
  TO authenticated
  USING (public.est_bureau())
  WITH CHECK (public.est_bureau());

-- DELETE : bureau + admin.
CREATE POLICY "conf_interv_delete_bureau"
  ON public.conference_intervenants
  FOR DELETE
  TO authenticated
  USING (public.est_bureau());

-- ───────────────────────────────────────────────────────────────────────
-- 4. Fonction de rappel — calquée sur envoyer_rappel_contributions().
--    Déclenchement réel : LUNDI 08h heure de Paris (gardes internes),
--    indépendamment du fuseau du cron.
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.envoyer_rappel_conferences()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now   TIMESTAMPTZ := now() AT TIME ZONE 'Europe/Paris';
  -- v_url / v_key : mêmes valeurs que envoyer_rappel_contributions().
  -- DOIVENT rester synchronisées avec cette fonction de référence.
  v_url   TEXT := 'https://lvodinchqdcxpakmbkwe.supabase.co';
  v_key   TEXT := 'sb_publishable_OnREEM5byDiy2MYXQPMOlw_MFXyFYyD';
  v_titre TEXT := 'Rappel : préparez votre conférence de jeudi';
  conf    RECORD;
  v_ids   UUID[];
BEGIN
  -- Le cron tourne toutes les heures ; ces deux gardes garantissent que
  -- le corps ne s'exécute réellement que le lundi à 08h (heure de Paris).
  IF EXTRACT(ISODOW FROM v_now)::INT <> 1 THEN RETURN; END IF;  -- 1 = lundi
  IF EXTRACT(HOUR  FROM v_now)::INT <> 8 THEN RETURN; END IF;   -- 08h

  -- Notifications in-app : une par (conférence, intervenant) pour toute
  -- conférence à venir dans les 7 jours. Anti-doublon via NOT EXISTS
  -- (même membre_id + même contenu_id + même titre).
  INSERT INTO notifications (membre_id, type_contenu, contenu_id, titre, lu)
  SELECT ci.membre_id, 'evenement', e.id, v_titre, false
  FROM evenements e
  JOIN conference_intervenants ci ON ci.evenement_id = e.id
  WHERE e.est_conference = true
    AND e.date_event::date BETWEEN v_now::date AND v_now::date + 6
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.membre_id  = ci.membre_id
        AND n.contenu_id = e.id
        AND n.titre      = v_titre
    );

  -- Push : un net.http_post PAR conférence, avec la liste des intervenants
  -- de cette conférence uniquement (payload propre, membreIds ciblés).
  FOR conf IN
    SELECT e.id
    FROM evenements e
    WHERE e.est_conference = true
      AND e.date_event::date BETWEEN v_now::date AND v_now::date + 6
  LOOP
    SELECT array_agg(ci.membre_id) INTO v_ids
    FROM conference_intervenants ci
    WHERE ci.evenement_id = conf.id;

    IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url     := v_url || '/functions/v1/send-push',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_key,
                   'apikey',        v_key
                 ),
      body    := jsonb_build_object(
                   'typeContenu', 'evenement',
                   'contenuId',   conf.id,
                   'titre',       v_titre,
                   'membreIds',   to_jsonb(v_ids)
                 )
    );
  END LOOP;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────
-- 5. Planification cron — même approche que « rappel-contributions-horaire » :
--    le job tourne toutes les heures et la fonction filtre l'heure en interne.
--    Aucune dépendance au fuseau UTC du cron.
-- ───────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('rappel-conferences');
EXCEPTION
  WHEN OTHERS THEN NULL;  -- le job n'existait pas encore : on ignore.
END $$;

SELECT cron.schedule(
  'rappel-conferences',
  '0 * * * *',
  $$ SELECT public.envoyer_rappel_conferences(); $$
);

-- ═══════════════════════════════════════════════════════════════════════
-- ORDRE D'EXÉCUTION & VÉRIFICATIONS
--   1) Colonne est_conference (ALTER TABLE)               → idempotent
--   2) Table conference_intervenants + index              → idempotent
--   3) RLS (ENABLE + DROP/CREATE des 4 policies)          → rejouable
--   4) Fonction envoyer_rappel_conferences()              → CREATE OR REPLACE
--   5) cron : unschedule protégé puis schedule            → rejouable
--
-- Prérequis : extensions pg_cron et pg_net actives (déjà utilisées par
-- envoyer_rappel_contributions()), et fonction public.est_bureau() présente.
--
-- Vérifications rapides après exécution :
--   • SELECT column_name FROM information_schema.columns
--       WHERE table_name='evenements' AND column_name='est_conference';
--   • SELECT * FROM pg_policies WHERE tablename='conference_intervenants';
--   • SELECT jobname, schedule FROM cron.job WHERE jobname='rappel-conferences';
--   • Test manuel du rappel (ignore les gardes lundi/08h uniquement si vous
--     les commentez temporairement) : SELECT public.envoyer_rappel_conferences();
-- ═══════════════════════════════════════════════════════════════════════
