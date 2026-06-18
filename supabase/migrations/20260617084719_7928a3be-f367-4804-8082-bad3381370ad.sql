
-- 1) Replace membres_update_self to prevent role/statut self-escalation at RLS level
DROP POLICY IF EXISTS membres_update_self ON public.membres;
CREATE POLICY membres_update_self ON public.membres
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT m.role FROM public.membres m WHERE m.id = auth.uid())
    AND statut = (SELECT m.statut FROM public.membres m WHERE m.id = auth.uid())
  );

-- 2) Convert role-check helpers to SECURITY INVOKER (they only read membres, which has a permissive select policy)
CREATE OR REPLACE FUNCTION public.est_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path = public
AS $function$
  SELECT EXISTS (SELECT 1 FROM membres WHERE id = auth.uid() AND role = 'admin');
$function$;

CREATE OR REPLACE FUNCTION public.est_bureau()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path = public
AS $function$
  SELECT EXISTS (SELECT 1 FROM membres WHERE id = auth.uid() AND role IN ('admin','bureau'));
$function$;

-- 3) Lock down SECURITY DEFINER trigger functions: only the trigger system needs to call them
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protege_champs_sensibles_membre() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.supprime_notifs_demande() FROM PUBLIC, anon, authenticated;

-- Also tighten est_admin/est_bureau exposure: only authenticated needs them (used by RLS policies)
REVOKE EXECUTE ON FUNCTION public.est_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.est_bureau() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.est_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.est_bureau() TO authenticated;
