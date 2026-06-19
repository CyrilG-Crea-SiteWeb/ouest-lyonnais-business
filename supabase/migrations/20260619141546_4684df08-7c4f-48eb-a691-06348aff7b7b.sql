
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supprime_notifs_demande() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.marque_invite_accepte() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.marque_invite_accepte_connexion() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protege_champs_sensibles_membre() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.envoyer_rappel_contributions() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.est_comite() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.est_comite() TO authenticated;
