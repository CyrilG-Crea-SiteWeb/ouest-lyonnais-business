-- ============================================================
-- Ajout du champ libre `membres.autres_informations`
--
-- Contexte :
--   Chaque membre peut renseigner un texte libre depuis « Mon profil ».
--   Ce texte est affiché sur sa fiche (page Membres) et pris en compte
--   par la recherche de la page Membres.
--
-- Colonne :
--   - `autres_informations` (text, nullable) : saisie libre du membre.
--
-- Sécurité :
--   Aucune modification des politiques RLS n'est nécessaire. La politique
--   `membres_update_self` autorise déjà un membre à mettre à jour ses
--   propres champs tant que `role` et `statut` restent inchangés.
-- ============================================================

ALTER TABLE public.membres ADD COLUMN IF NOT EXISTS autres_informations text;

COMMENT ON COLUMN public.membres.autres_informations IS
  'Informations libres saisies par le membre, affichées sur sa fiche et prises en compte dans la recherche.';
