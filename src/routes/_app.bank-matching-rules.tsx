import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/bank-matching-rules")({ component: RulesPage });

type Category = "outstanding_check" | "deposit_in_transit" | "bank_charge" | "bank_interest" | "direct_deposit" | "returned_check" | "fx_difference" | "other";

type Rule = {
  id: string;
  name: string;
  priority: number;
  condition_field: "description" | "reference" | "amount";
  operator: "contains" | "equals" | "starts_with" | "ends_with" | "regex" | "greater_than" | "less_than";
  value: string;
  target_account_id: string | null;
  category: Category | null;
  auto_create_entry: boolean;
  is_active: boolean;
};

function RulesPage() {
  const { t } = useI18n();
  const { permissions } = useAuth();
  const qc = useQueryClient();
  const canManage = permissions.has("bank_recon.manage_rules");
  const canView = permissions.has("bank_recon.view");
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);

  const { data: rules = [] } = useQuery({
    queryKey: ["bank-rules"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_matching_rules").select("*").order("priority");
      return (data ?? []) as Rule[];
    },
    enabled: canView,
  });

  const { data: accts = [] } = useQuery({
    queryKey: ["accounts-all"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, code, name").order("code");
      return data ?? [];
    },
    enabled: canManage,
  });

  const save = useMutation({
    mutationFn: async (r: Partial<Rule>) => {
      const payload: {
        name: string;
        priority: number;
        condition_field: Rule["condition_field"];
        operator: Rule["operator"];
        value: string;
        target_account_id: string | null;
        category: Rule["category"];
        auto_create_entry: boolean;
        is_active: boolean;
      } = {
        name: r.name || "",
        priority: Number(r.priority ?? 100),
        condition_field: (r.condition_field ?? "description") as Rule["condition_field"],
        operator: (r.operator ?? "contains") as Rule["operator"],
        value: r.value ?? "",
        target_account_id: r.target_account_id || null,
        category: (r.category as Rule["category"]) || null,
        auto_create_entry: r.auto_create_entry ?? false,
        is_active: r.is_active ?? true,
      };
      if (r.id) {
        const { error } = await supabase.from("bank_matching_rules").update(payload).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bank_matching_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-rules"] });
      setEditing(null);
      toast.success(t("common.save"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_matching_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank-rules"] }),
  });

  if (!canView) return <div className="p-8 text-muted-foreground">{t("bank_recon.no_perm")}</div>;

  const categories = ["outstanding_check", "deposit_in_transit", "bank_charge", "bank_interest", "direct_deposit", "returned_check", "fx_difference", "other"];

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings2 className="w-6 h-6 text-primary" /> {t("bank_recon.rules")}</h1>
        {canManage && (
          <button onClick={() => setEditing({ priority: 100, condition_field: "description", operator: "contains", is_active: true })}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm">
            <Plus className="w-4 h-4" /> {t("bank_recon.new_rule")}
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-start px-3 py-2">{t("bank_recon.rule_priority")}</th>
              <th className="text-start px-3 py-2">{t("bank_recon.rule_name")}</th>
              <th className="text-start px-3 py-2">{t("bank_recon.rule_condition")}</th>
              <th className="text-start px-3 py-2">{t("bank_recon.rule_target")}</th>
              <th className="text-center px-3 py-2">{t("bank_recon.active")}</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => {
              const acct = accts.find((a: { id: string }) => a.id === r.target_account_id) as { code: string; name: string } | undefined;
              return (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2">{r.priority}</td>
                  <td className="px-3 py-2 font-medium cursor-pointer" onClick={() => canManage && setEditing(r)}>{r.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.condition_field} {r.operator} "{r.value}"
                  </td>
                  <td className="px-3 py-2 text-xs">{acct ? `${acct.code} — ${acct.name}` : "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${r.is_active ? "bg-success/15 text-success" : "bg-muted"}`}>{r.is_active ? "✓" : "✕"}</span>
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-end">
                      <button onClick={() => confirm(t("common.confirm_delete")) && del.mutate(r.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  )}
                </tr>
              );
            })}
            {rules.length === 0 && (
              <tr><td colSpan={canManage ? 6 : 5} className="text-center py-8 text-muted-foreground">{t("bank_recon.no_rules")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-lg border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{editing.id ? t("common.edit") : t("bank_recon.new_rule")}</div>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Fld label={t("bank_recon.rule_name")} full><input className="rinput" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Fld>
              <Fld label={t("bank_recon.rule_priority")}><input className="rinput" type="number" value={editing.priority ?? 100} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })} /></Fld>
              <Fld label={t("bank_recon.rule_field")}>
                <select className="rinput" value={editing.condition_field ?? "description"} onChange={(e) => setEditing({ ...editing, condition_field: e.target.value as Rule["condition_field"] })}>
                  <option value="description">description</option>
                  <option value="reference">reference</option>
                  <option value="amount">amount</option>
                </select>
              </Fld>
              <Fld label={t("bank_recon.rule_op")}>
                <select className="rinput" value={editing.operator ?? "contains"} onChange={(e) => setEditing({ ...editing, operator: e.target.value as Rule["operator"] })}>
                  {["contains", "equals", "starts_with", "ends_with", "regex", "greater_than", "less_than"].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Fld>
              <Fld label={t("bank_recon.rule_value")}><input className="rinput" value={editing.value ?? ""} onChange={(e) => setEditing({ ...editing, value: e.target.value })} /></Fld>
              <Fld label={t("bank_recon.rule_category")}>
                <select className="rinput" value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: (e.target.value || null) as Rule["category"] })}>
                  <option value="">—</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Fld>
              <Fld label={t("bank_recon.rule_target")} full>
                <select className="rinput" value={editing.target_account_id ?? ""} onChange={(e) => setEditing({ ...editing, target_account_id: e.target.value || null })}>
                  <option value="">—</option>
                  {accts.map((a: { id: string; code: string; name: string }) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </Fld>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.auto_create_entry ?? false} onChange={(e) => setEditing({ ...editing, auto_create_entry: e.target.checked })} />
                {t("bank_recon.rule_auto_entry")}
              </label>
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
      <style>{`.rinput { width: 100%; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); border-radius: 6px; padding: 6px 10px; font-size: 13px; }`}</style>
    </div>
  );
}

function Fld({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1 ${full ? "col-span-2" : ""}`}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
