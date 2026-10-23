-- ============================================================
-- Ajout de `recommandations.saisi_par` : qui a réellement saisi la ligne
--
-- Contexte :
--   `membre_id` est l'auteur de la recommandation, qui peut différer de la
--   personne qui l'a saisie (le bureau peut saisir au nom d'un autre membre).
--   La page Recommandations propose un filtre « Voir mes dernières saisies »
--   qui s'appuie sur cette colonne.
--
-- Colonne :
--   - `saisi_par` (uuid, nullable, FK membres) : renseignée automatiquement
--     avec l'utilisateur connecté (`auth.uid()`) à l'insertion. Les lignes
--     existantes restent à NULL (saisisseur inconnu) ; le front retombe alors
--     sur `membre_id`.
--
-- Sécurité :
--   Aucune modification des politiques RLS n'est nécessaire.
-- ============================================================

ALTER TABLE public.recommandations
  ADD COLUMN IF NOT EXISTS saisi_par uuid
  REFERENCES public.membres(id) ON DELETE SET NULL
  DEFAULT auth.uid();

COMMENT ON COLUMN public.recommandations.saisi_par IS
  'Membre ayant réellement saisi la recommandation (auth.uid() à l''insertion). NULL pour les saisies antérieures à la colonne.';
