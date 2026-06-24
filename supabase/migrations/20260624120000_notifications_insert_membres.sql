-- ============================================================
-- Notifications : autoriser un membre à créer une notification
-- destinée à un AUTRE membre.
--
-- Contexte du bug :
--   Quand un membre commente une demande (ou une recommandation),
--   l'app insère côté client une notification pour l'auteur du contenu
--   (cf. notifierCommentaire dans src/components/Comments.tsx).
--   Si la policy RLS d'INSERT sur `notifications` n'autorise que les
--   lignes où membre_id = auth.uid() (notification "pour soi-même"),
--   alors le commentateur ne peut PAS notifier l'auteur : l'insert est
--   rejeté en silence (creerNotificationsSafe avale l'erreur) et
--   l'auteur ne reçoit jamais sa notification.
--
-- Correctif :
--   On ajoute une policy PERMISSIVE d'INSERT autorisant tout membre
--   authentifié à créer une notification. Les policies permissives se
--   combinent en OR : cette policy ne peut donc qu'élargir l'accès,
--   jamais restreindre les flux existants. Le ciblage des destinataires
--   reste entièrement maîtrisé par l'application (auteur exclu, etc.).
-- ============================================================

DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;
CREATE POLICY notifications_insert_authenticated ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
