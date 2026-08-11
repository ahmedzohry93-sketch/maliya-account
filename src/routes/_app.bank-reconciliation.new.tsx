import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_app/bank-reconciliation/new")({ component: NewRecon });

function NewRecon() {
  const { t } = useI18n();
  const { permissions } = useAuth();
  const nav = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [stmtBal, setStmtBal] = useState("0");
  const [busy, setBusy] = useState(false);

  const { data: accts = [] } = useQuery({
    queryKey: ["bank-accounts-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("id, name, currency, gl_account_id")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const canCreate = permissions.has("bank_recon.create");
  if (!canCreate) return <div className="p-8 text-muted-foreground">{t("bank_recon.no_perm")}</div>;

  async function submit() {
    if (!accountId) return toast.error(t("bank_recon.pick_account"));
    setBusy(true);
    try {
      const acct = accts.find((a) => a.id === accountId);
      let book = 0;
      if (acct?.gl_account_id) {
        const { data } = await supabase.rpc("get_book_balance", {
          _gl_account_id: acct.gl_account_id,
          _from: from,
          _to: to,
        });
        book = Number(data ?? 0);
      }
      const stmt = Number(stmtBal || 0);
      const { data: created, error } = await supabase
        .from("bank_reconciliations")
        .insert({
          bank_account_id: accountId,
          period_from: from,
          period_to: to,
          book_balance: book,
          statement_balance: stmt,
          difference: stmt - book,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      await logAudit("create", "bank_reconciliation", created!.id, {
        account_id: accountId,
        from,
        to,
      });
      toast.success(t("bank_recon.created"));
      nav({ to: "/bank-reconciliation/$id", params: { id: created!.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">{t("bank_recon.new")}</h1>
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <Field label={t("bank_recon.col_account")}>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">—</option>
            {accts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("bank_recon.from")}>
            <input type="date" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t("bank_recon.to")}>
            <input type="date" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Field label={t("bank_recon.stmt_balance")}>
          <input
            type="number"
            step="0.01"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
            value={stmtBal}
            onChange={(e) => setStmtBal(e.target.value)}
          />
        </Field>
        <div className="flex gap-2 pt-2">
          <button
            disabled={busy}
            onClick={submit}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy ? "…" : t("common.save")}
          </button>
          <button onClick={() => nav({ to: "/bank-reconciliation" })} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
