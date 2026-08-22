CREATE TABLE IF NOT EXISTS private.admin_users (
  user_id uuid PRIMARY KEY
);

INSERT INTO private.admin_users (user_id)
SELECT user_id
FROM public.user_roles
WHERE role = 'admin'::public.app_role
ON CONFLICT (user_id) DO NOTHING;

REVOKE ALL ON private.admin_users FROM public, anon;
GRANT SELECT ON private.admin_users TO authenticated;
GRANT ALL ON private.admin_users TO service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = _user_id
        AND ur.role IN ('admin'::public.app_role, 'cashier'::public.app_role)
        AND (ur.role = 'admin'::public.app_role OR p.status = 'approved'::public.account_status)
    )
$$;

DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM private.admin_users a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM private.admin_users a WHERE a.user_id = auth.uid()));

GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated;