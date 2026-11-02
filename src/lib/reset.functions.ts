import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const CONFIRM_PHRASE = "إعادة تهيئة";

// Transactional tables in FK-safe delete order (children before parents).
const RESET_TABLES = [
  "bank_reconciliation_matches",
  "bank_statement_lines",
  "bank_reconciliations",
  "asset_depreciations",
  "invoice_return_lines",
  "invoice_returns",
  "invoice_lines",
  "payments",
  "stock_moves",
  "stock_voucher_lines",
  "stock_vouchers",
  "checks",
  "journal_lines",
  "journal_entries",
] as const;

export const resetTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string; confirm: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) The current caller must be a system admin.
    const { data: callerIsAdmin } = await supabase.rpc("is_admin", { _user_id: userId });
    if (!callerIsAdmin) throw new Error("هذه العملية متاحة لمدير النظام فقط");

    // 2) Confirmation phrase must match exactly.
    if (data.confirm?.trim() !== CONFIRM_PHRASE) {
      throw new Error(`اكتب عبارة "${CONFIRM_PHRASE}" للتأكيد`);
    }

    // 3) Verify the admin credentials by actually signing in with them.
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const authClient = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (signInError || !signIn.user) throw new Error("بيانات دخول مدير النظام غير صحيحة");

    // 4) The signed-in account must itself hold the admin role.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: approverIsAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: signIn.user.id });
    if (!approverIsAdmin) throw new Error("الحساب المدخل ليس حساب مدير نظام");

    // 5) Wipe transactional data only (master data, users and settings stay).
    for (const table of RESET_TABLES) {
      const { error } = await supabaseAdmin.from(table).delete().not("id", "is", null);
      if (error) throw new Error(`فشل حذف ${table}: ${error.message}`);
    }
    const { error: stockError } = await supabaseAdmin.from("products").update({ stock_qty: 0 }).not("id", "is", null);
    if (stockError) throw new Error(`فشل تصفير أرصدة الأصناف: ${stockError.message}`);

    // 6) Audit trail.
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId,
      action: "reset_transactions",
      entity: "system",
      details: { approved_by: signIn.user.id, requested_by: userId, tables: RESET_TABLES.length },
    });

    return { ok: true };
  });
