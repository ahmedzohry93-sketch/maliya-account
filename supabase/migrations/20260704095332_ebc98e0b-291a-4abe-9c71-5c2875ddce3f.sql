
-- 1. audit_logs: prevent client-side arbitrary insertion
REVOKE INSERT ON public.audit_logs FROM authenticated;
DROP POLICY IF EXISTS audit_insert_self ON public.audit_logs;

CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _entity text,
  _entity_id uuid,
  _details jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, details)
  VALUES (v_uid, _action, _entity, _entity_id, _details);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) TO authenticated;

-- 2. is_admin: identify Admin role via is_system flag + name, not just name
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND r.is_system = true
      AND r.name = 'Admin'
  );
$$;

-- Prevent renaming/altering system roles to close the escalation vector
DROP POLICY IF EXISTS roles_update_manage ON public.roles;
DROP POLICY IF EXISTS roles_delete_manage ON public.roles;
DROP POLICY IF EXISTS roles_insert_manage ON public.roles;

CREATE POLICY roles_insert_manage ON public.roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'roles.manage') AND is_system = false);

CREATE POLICY roles_update_manage ON public.roles
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'roles.manage') AND is_system = false)
  WITH CHECK (public.has_permission(auth.uid(), 'roles.manage') AND is_system = false);

CREATE POLICY roles_delete_manage ON public.roles
  FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'roles.manage') AND is_system = false);

-- 3. user_roles: restrict SELECT to own rows or users.manage
DROP POLICY IF EXISTS ur_select_authed ON public.user_roles;
CREATE POLICY ur_select_own_or_manage ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_permission(auth.uid(), 'users.manage'));

-- role_permissions: restrict SELECT to roles.manage (permission graph reads via SECURITY DEFINER get_user_permissions)
DROP POLICY IF EXISTS rp_select_authed ON public.role_permissions;
CREATE POLICY rp_select_manage ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'roles.manage'));

-- get_user_permissions must run as definer so users can read their own permissions
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS TABLE(key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.key FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role_id = ur.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = _user_id
    AND (auth.uid() = _user_id OR public.has_permission(auth.uid(), 'users.manage'));
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.key = _permission_key
  );
$$;
