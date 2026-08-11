import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string; full_name: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // permission check
    const { data: perm } = await supabase.rpc("has_permission", {
      _user_id: userId,
      _permission_key: "users.manage",
    });
    if (!perm) throw new Error("ليس لديك صلاحية إدارة المستخدمين");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    return { id: created.user?.id };
  });
