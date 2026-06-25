-- ============================================================
-- Suppression de la colonne redondante `membres.site_internet`
--
-- Contexte :
--   La table `membres` portait deux colonnes pour le site internet :
--     - `site_web`        : utilisée partout (page Membres, invitations,
--                           import, et désormais Mon profil)
--     - `site_internet`   : ancienne colonne, lue/écrite uniquement par
--                           la page Mon profil avant correctif. Plus
--                           référencée nulle part dans l'application.
--
--   Cette redondance provoquait un bug : un site renseigné dans
--   `site_web` n'apparaissait pas dans Mon profil (qui lisait
--   `site_internet`), et inversement.
--
-- Correctif applicatif :
--   Mon profil lit/écrit désormais `site_web`.
--
-- Cette migration :
--   1. Recopie dans `site_web` toute valeur encore présente dans
--      `site_internet` lorsque `site_web` est vide (au cas où des
--      membres auraient enregistré leur site via l'ancienne page).
--   2. Supprime définitivement la colonne `site_internet`.
-- ============================================================

UPDATE public.membres
SET site_web = site_internet
WHERE site_web IS NULL
  AND site_internet IS NOT NULL
  AND btrim(site_internet) <> '';

ALTER TABLE public.membres DROP COLUMN IF EXISTS site_internet;
