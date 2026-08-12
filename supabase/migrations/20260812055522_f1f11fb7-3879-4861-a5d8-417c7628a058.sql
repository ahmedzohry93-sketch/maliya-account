-- Ensure Admin role has every permission
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Admin'
ON CONFLICT DO NOTHING;

-- Grant Admin role to all existing users
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id FROM auth.users u CROSS JOIN public.roles r
WHERE r.name = 'Admin'
ON CONFLICT DO NOTHING;