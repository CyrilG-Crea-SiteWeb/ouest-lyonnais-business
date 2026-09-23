-- ═══════════════════════════════════════════════════════════════════════
-- OLB — Photos de profil : liens permanents
-- Script SQL idempotent à COLLER dans l'éditeur SQL de Lovable Cloud,
-- AVANT le déploiement du code qui génère des URL publiques.
-- (Ce fichier est un historique/livrable : il n'est PAS poussé en migration.)
--
-- Problème : les photos du bucket privé `avatars` sont référencées par des
-- URL signées valables 1 an. Passé ce délai, elles ne s'affichent plus
-- (annuaire, aperçus de liens, fiches contact…).
--
-- Solution (validée par le bureau) : rendre le bucket public en LECTURE.
-- Les photos sont déjà visibles sans compte sur l'annuaire public, cela ne
-- change donc rien à leur exposition. L'ÉCRITURE (upload / remplacement /
-- suppression) reste régie par les policies RLS existantes, non modifiées.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- 1. Bucket `avatars` lisible publiquement (URL /object/public/…).
-- ───────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
SET public = true
WHERE id = 'avatars';

-- ───────────────────────────────────────────────────────────────────────
-- 2. Conversion des URL signées déjà enregistrées en URL publiques.
--    …/object/sign/avatars/<chemin>?token=…  →  …/object/public/avatars/<chemin>
--    Les liens externes (collés à la main) ne sont pas touchés.
-- ───────────────────────────────────────────────────────────────────────
UPDATE public.membres
SET photo_url = regexp_replace(
  photo_url,
  '/storage/v1/object/sign/avatars/([^?]+)\?.*$',
  '/storage/v1/object/public/avatars/\1'
)
WHERE photo_url LIKE '%/storage/v1/object/sign/avatars/%';

-- ───────────────────────────────────────────────────────────────────────
-- 3. Vérification : doit renvoyer 0.
-- ───────────────────────────────────────────────────────────────────────
SELECT count(*) AS urls_signees_restantes
FROM public.membres
WHERE photo_url LIKE '%/object/sign/avatars/%';
