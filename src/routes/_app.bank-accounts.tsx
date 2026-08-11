import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, X, Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_app/bank-accounts")({ component: BankAccountsPage });

type BA = {
  id: string;
  name: string;
  bank_name: string | null;
  account_number: string | null;
  iban: string | null;
  currency: string;
  opening_balance: number;
  gl_account_id: string | null;
  is_active: boolean;
  notes: string | null;
};

function BankAccountsPage() {
  const { t, fmt } = useI18n();
  const { permissions } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<BA> | null>(null);

  const canView = permissions.has("bank_recon.view");
  const canManage = permissions.has("bank_recon.manage_accounts");

  const { data: rows = [] } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("*").order("name");
      return (data ?? []) as BA[];
    },
    enabled: canView,
  });

  const { data: accts = [] } = useQuery({
    queryKey: ["accounts-asset"],
    queryFn: async () => {
      const { data } = await supabase
        .from("accounts")
        .select("id, code, name, type")
        .eq("type", "asset")
        .order("code");
      return data ?? [];
    },
    enabled: canManage,
  });

  const save = useMutation({
    mutationFn: async (r: Partial<BA>) => {
      const payload = {
        name: r.name || "",
        bank_name: r.bank_name || null,
        account_number: r.account_number || null,
        iban: r.iban || null,
        currency: r.currency || "SAR",
        opening_balance: Number(r.opening_balance || 0),
        gl_account_id: r.gl_account_id || null,
        is_active: r.is_active ?? true,
        notes: r.notes || null,
      };
      if (r.id) {
        const { error } = await supabase.from("bank_accounts").update(payload).eq("id", r.id);
        if (error) throw error;
        await logAudit("update", "bank_account", r.id, payload);
      } else {
        const { data, error } = await supabase.from("bank_accounts").insert(payload).select("id").single();
        if (error) throw error;
        await logAudit("create", "bank_account", data!.id, payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      setEditing(null);
      toast.success(t("common.save"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
      if (error) throw error;
      await logAudit("delete", "bank_account", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast.success(t("common.delete"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!canView) return <div className="p-8 text-muted-foreground">{t("bank_recon.no_perm")}</div>;

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="w-6 h-6 text-primary" />
          {t("bank_recon.bank_accounts")}
        </h1>
        {canManage && (
          <button
            onClick={() => setEditing({ currency: "SAR", is_active: true, opening_balance: 0 })}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> {t("bank_recon.new_account")}
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-start px-3 py-2">{t("bank_recon.acct_name")}</th>
              <th className="text-start px-3 py-2">{t("bank_recon.bank_name")}</th>
              <th className="text-start px-3 py-2">{t("bank_recon.acct_number")}</th>
              <th className="text-start px-3 py-2">{t("bank_recon.currency")}</th>
              <th className="text-end px-3 py-2">{t("bank_recon.opening_bal")}</th>
              <th className="text-center px-3 py-2">{t("bank_recon.active")}</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">{r.bank_name ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.account_number ?? r.iban ?? "—"}</td>
                <td className="px-3 py-2">{r.currency}</td>
                <td className="px-3 py-2 text-end font-mono">{fmt(Number(r.opening_balance))}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${r.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    {r.is_active ? "✓" : "✕"}
                  </span>
                </td>
                {canManage && (
                  <td className="px-3 py-2 text-end">
                    <div className="inline-flex gap-1">
                      <button onClick={() => setEditing(r)} className="p-1.5 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button
                        onClick={() => confirm(t("common.confirm_delete")) && del.mutate(r.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                      ><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={canManage ? 7 : 6} className="text-center py-8 text-muted-foreground">{t("bank_recon.no_accounts")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-lg border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{editing.id ? t("common.edit") : t("bank_recon.new_account")}</div>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label={t("bank_recon.acct_name")} full><input className="input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></F>
              <F label={t("bank_recon.bank_name")}><input className="input" value={editing.bank_name ?? ""} onChange={(e) => setEditing({ ...editing, bank_name: e.target.value })} /></F>
              <F label={t("bank_recon.currency")}><input className="input" value={editing.currency ?? ""} onChange={(e) => setEditing({ ...editing, currency: e.target.value })} /></F>
              <F label={t("bank_recon.acct_number")}><input className="input" value={editing.account_number ?? ""} onChange={(e) => setEditing({ ...editing, account_number: e.target.value })} /></F>
              <F label="IBAN"><input className="input" value={editing.iban ?? ""} onChange={(e) => setEditing({ ...editing, iban: e.target.value })} /></F>
              <F label={t("bank_recon.opening_bal")}><input className="input font-mono" type="number" step="0.01" value={editing.opening_balance ?? 0} onChange={(e) => setEditing({ ...editing, opening_balance: Number(e.target.value) })} /></F>
              <F label={t("bank_recon.gl_account")} full>
                <select className="input" value={editing.gl_account_id ?? ""} onChange={(e) => setEditing({ ...editing, gl_account_id: e.target.value || null })}>
                  <option value="">—</option>
                  {accts.map((a: { id: string; code: string; name: string }) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </F>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
                {t("bank_recon.active")}
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">{t("common.cancel")}</button>
              <button disabled={save.isPending} onClick={() => save.mutate(editing)} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">{t("common.save")}</button>
            </div>
          </div>
        </div>
      )}
      <style>{`.input { width: 100%; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); border-radius: 6px; padding: 6px 10px; font-size: 13px; }`}</style>
    </div>
  );
}

function F({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1 ${full ? "col-span-2" : ""}`}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
