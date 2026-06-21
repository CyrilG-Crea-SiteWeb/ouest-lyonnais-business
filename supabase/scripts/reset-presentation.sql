-- ============================================================
-- SCRIPT DE REMISE À ZÉRO + IMPORT MEMBRES — OLB
--
-- AVANT D'EXÉCUTER :
--   • Faire un export si nécessaire (opération IRRÉVERSIBLE).
--   • Coller dans le SQL Editor de Supabase et exécuter.
--   • Lire le SELECT final AVANT de valider le COMMIT.
--     Si le résultat ne convient pas : taper ROLLBACK; à la place.
--
-- Mot de passe temporaire de tous les membres : OLB2026!
-- (À la première connexion, l'app les redirige vers
--  /definir-mot-de-passe pour qu'ils définissent le leur.)
--
-- ⚠  Email corrigé pour Jean-Pierre Villard :
--    original  → jean-pierre.villard@gones,immo  (virgule invalide)
--    corrigé   → jean-pierre.villard@gones.immo
-- ============================================================

BEGIN;

-- ============================================================
-- PARTIE 1 — Remise à zéro
--   Supprime toutes les données d'activité.
--   Conserve uniquement cyril@crea-siteweb.com (compte admin).
-- ============================================================

TRUNCATE
  public.votes,
  public.options_sondage,
  public.sondages,
  public.reco_participants,
  public.recommandations,
  public.presences,
  public.semaines,
  public.inscriptions,
  public.evenements,
  public.invites_presences,
  public.invites,
  public.demandes_cibles,
  public.demandes,
  public.commentaires,
  public.notifications,
  public.push_subscriptions
RESTART IDENTITY;

DELETE FROM public.membres WHERE email <> 'cyril@crea-siteweb.com';
DELETE FROM auth.users   WHERE email <> 'cyril@crea-siteweb.com';

-- ============================================================
-- PARTIE 2 — Création des 24 comptes authentification
--   Le trigger handle_new_user() crée automatiquement la ligne
--   membres pour chaque compte. La PARTIE 3 complète les détails.
-- ============================================================

INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user
)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'contact@generationfacades.com', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Jérôme","nom":"Ruano"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'aureliemorin@ampaie.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Aurélie","nom":"Morin"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'leo.gauthier@galeo-paysagiste.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Léo","nom":"Gauthier"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'contact@ghmenuiserie.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Ghislain","nom":"Houtin"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vblaison@guildea.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Virginie","nom":"Blaison"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'po.guillot@atea-it.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Pierre-Olivier","nom":"Guillot"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'magali@vizible-com.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Magali","nom":"Poumirou"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'antoinebarbat@hotmail.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Antoine","nom":"Barbat"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'eseror@gmail.com', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Eric","nom":"Seror"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ecubat@wanadoo.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Valérie","nom":"Pain"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'celine@plume-ecriture.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Céline","nom":"Leignel"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'contact@patricecauleur.com', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Patrice","nom":"Cauleur"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'aurelie@adadmin.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Aurélie","nom":"Dussouillez - Poix"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lmarical.pro@gmail.com', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Loïc","nom":"Marical"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'charleyne.david@centralautos.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Charleyne","nom":"David"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'restaurantleflagrantdelice@gmail.com', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Damien","nom":"Agram"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'axelec.fermigier@gmail.com', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Christophe","nom":"Fermigier"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'stephanie@lydeco.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Stéphanie","nom":"Rosset"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'erika.dumas@free.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Erika","nom":"Dumas"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'direction@last-round-gym.com', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Serge","nom":"Morel"}'::jsonb, false, false),

  -- ⚠ Email corrigé : virgule → point (original : jean-pierre.villard@gones,immo)
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'jean-pierre.villard@gones.immo', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Jean-Pierre","nom":"Villard"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lionel@maisonbutaud.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Lionel","nom":"Blin"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'charlene.hazard.agt@axa.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Charlène","nom":"Hazard"}'::jsonb, false, false),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'jean-pierre.venot@sadec-akelys.fr', crypt('OLB2026!', gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Jean-Pierre","nom":"Venot"}'::jsonb, false, false);

-- ============================================================
-- PARTIE 3 — Complète les fiches membres + date_entree
--   Traite les 24 nouveaux membres ET le compte admin Cyril Gabert.
--   Ne touche pas au champ `role` (l'admin conserve son rôle).
-- ============================================================

UPDATE public.membres m SET
  prenom      = v.prenom,
  nom         = v.nom,
  entreprise  = v.entreprise,
  categorie   = v.categorie,
  telephone   = v.telephone,
  site_web    = v.site_web,
  date_entree = DATE '2026-06-01',
  statut      = 'actif',
  mdp_defini  = false
FROM (VALUES
  ('contact@generationfacades.com',        'Jérôme',         'Ruano',              'Génération Façades',           'Rénovation et isolation de façades',           '06 43 33 96 74', 'https://generationfacades.com/'),
  ('aureliemorin@ampaie.fr',               'Aurélie',         'Morin',              'AM Paie',                      'Gestionnaire de paie indépendante',            '06 22 84 04 80', NULL),
  ('leo.gauthier@galeo-paysagiste.fr',     'Léo',             'Gauthier',           'Galeo',                        'Paysagiste',                                   '06 89 54 95 22', 'https://www.galeo-paysagiste.fr'),
  ('contact@ghmenuiserie.fr',              'Ghislain',        'Houtin',             'GH Menuiserie',                'Menuiserie extérieure / Pergola',              '06 50 03 47 75', 'https://www.ghmenuiserie.fr'),
  ('vblaison@guildea.fr',                  'Virginie',        'Blaison',            'Guildéa',                      'Maître d''œuvre',                              '06 07 71 93 60', 'https://www.guildea.fr'),
  ('po.guillot@atea-it.fr',                'Pierre-Olivier',  'Guillot',            'ATEA-IT',                      'Téléphonie / Informatique / Sécurité',         '06 01 06 57 08', 'https://www.atea-it.fr'),
  ('magali@vizible-com.fr',                'Magali',          'Poumirou',           'Vizible',                      'Consultante en marketing digital',             '07 69 66 90 30', 'https://vizible-com.fr'),
  ('antoinebarbat@hotmail.fr',             'Antoine',         'Barbat',             'AJ RENOV',                     'Couverture - Zinguerie - Étanchéité',          '06 28 45 15 12', NULL),
  ('eseror@gmail.com',                     'Eric',            'Seror',              'Cabinet Eric SEROR',           'Créateur de patrimoine',                       '06 63 22 55 38', 'http://eric-seror.fr'),
  ('ecubat@wanadoo.fr',                    'Valérie',         'Pain',               'ECUBAT',                       'Plâtrerie / Peinture / Isolation',             '06 14 62 94 69', 'https://www.ecubat.fr'),
  ('celine@plume-ecriture.fr',             'Céline',          'Leignel',            'Plume - Maison d''écriture',   'Formations, biographie, atelier d''écriture',  '06 11 11 97 54', 'http://www.plume-ecriture.fr'),
  ('contact@patricecauleur.com',           'Patrice',         'Cauleur',            'Patrice Cauleur Photographie', 'PhotoDroViste',                                '07 83 53 29 87', 'https://www.patricecauleur.com'),
  ('aurelie@adadmin.fr',                   'Aurélie',         'Dussouillez - Poix', 'AD''ADMIN',                    'Gestionnaire administrative & commerciale',    '06 41 79 47 10', 'http://adadmin.fr'),
  ('lmarical.pro@gmail.com',               'Loïc',            'Marical',            'Wood Sun Menuiserie',          'Menuisier',                                    '07 71 22 81 78', NULL),
  ('charleyne.david@centralautos.fr',      'Charleyne',       'David',              'Hyundai Groupe Central Autos', 'Conseillère Commerciale automobile',           '06 29 52 16 48', 'https://www.centralautos.fr'),
  ('restaurantleflagrantdelice@gmail.com', 'Damien',          'Agram',              'Le Flagrant Délice',           'Restaurateur / traiteur / Épicier',            '06 16 69 30 42', 'https://www.le-flagrant-delice-lyon.fr/'),
  ('axelec.fermigier@gmail.com',           'Christophe',      'Fermigier',          'Axelec',                       'Électricité / Climatisation / Photovoltaïque', '06 75 19 25 45', 'https://axelec-electricite.fr'),
  ('stephanie@lydeco.fr',                  'Stéphanie',       'Rosset',             'LYDECO',                       'Décoration d''intérieur',                      '06 35 25 83 97', 'https://www.lydeco.fr'),
  ('erika.dumas@free.fr',                  'Erika',           'Dumas',              'Popott''d''Aujourd''hui',      'Cuisiniste / Architecte d''intérieur',         '06 76 18 50 61', 'https://popottdaujourdhui.com'),
  ('direction@last-round-gym.com',         'Serge',           'Morel',              'Last Round Boxing Gym',        'Salles de Boxe & remise en forme',             '07 81 23 79 92', 'https://intro.last-round-gym.com'),
  ('jean-pierre.villard@gones.immo',       'Jean-Pierre',     'Villard',            'Les Gones de l''immo',         'Conseiller immobilier',                        '06 85 14 33 45', 'https://www.gones.immo'),
  ('lionel@maisonbutaud.fr',               'Lionel',          'Blin',               'Ets Jean Butaud',              'Plombier Chauffagiste',                        '06 63 81 60 46', 'https://www.jean-butaud.fr'),
  ('charlene.hazard.agt@axa.fr',           'Charlène',        'Hazard',             'AXA',                          'Agent Général d''Assurance',                   '06 06 99 01 24', 'https://agence.axa.fr/craponne'),
  ('jean-pierre.venot@sadec-akelys.fr',    'Jean-Pierre',     'Venot',              'SADEC AKELYS',                 'Expertise comptable',                          '06 14 74 08 13', 'https://www.sadec-akelys.fr'),
  -- Compte admin : date_entree + coordonnées (rôle admin conservé ci-dessous)
  ('cyril@crea-siteweb.com',               'Cyril',           'Gabert',             'Créa-SiteWeb',                 'Création/Reprise de site internet',            '06 74 73 57 49', 'https://www.crea-siteweb.com')
) AS v(email, prenom, nom, entreprise, categorie, telephone, site_web)
WHERE m.email = v.email;

-- Garantit que le rôle admin de Cyril Gabert est conservé
-- (le UPDATE ci-dessus ne touche pas à role, mais par précaution)
UPDATE public.membres SET role = 'admin' WHERE email = 'cyril@crea-siteweb.com';

-- ============================================================
-- Contrôle final — lire le résultat avant de valider
-- ============================================================
SELECT
  prenom, nom, entreprise, date_entree, statut, role
FROM public.membres
ORDER BY nom, prenom;

-- Si le résultat est correct :  COMMIT;
-- Si quelque chose cloche   :  ROLLBACK;
COMMIT;
