import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, X, CalendarClock, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/confirm-dialog";
import { archiveRecord, softDeleteRecord } from "@/lib/records";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { logAudit } from "@/lib/audit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/recurring-obligations")({ component: ObligPage });

type Freq = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
type Cat = "rent" | "loan" | "utility" | "payroll" | "insurance" | "subscription" | "fees" | "other";

type Oblig = {
  id: string;
  name: string;
  vendor: string | null;
  category: Cat;
  amount: number;
  currency: string;
  frequency: Freq;
  start_date: string;
  next_due_date: string;
  end_date: string | null;
  payment_method: string | null;
  active: boolean;
  notes: string | null;
};

function ObligPage() {
  const { t, fmt } = useI18n();
  const { permissions } = useAuth();
  const qc = useQueryClient();
  const canManage = permissions.has("obligations.manage");
  const canView = canManage || permissions.has("finance.dashboard.view");

  const [editing, setEditing] = useState<Partial<Oblig> | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["obligations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("recurring_obligations" as any)
        .select("*")
        .eq("is_deleted", false)
        .eq("is_archived", false)
        .order("next_due_date", { ascending: true });
      return ((data ?? []) as unknown) as Oblig[];
    },
    enabled: canView,
  });

  const save = useMutation({
    mutationFn: async (r: Partial<Oblig>) => {
      const payload = {
        name: r.name || "",
        vendor: r.vendor || null,
        category: r.category || "other",
        amount: Number(r.amount || 0),
        currency: r.currency || "USD",
        frequency: r.frequency || "monthly",
        start_date: r.start_date || new Date().toISOString().slice(0, 10),
        next_due_date: r.next_due_date || new Date().toISOString().slice(0, 10),
        end_date: r.end_date || null,
        payment_method: r.payment_method || null,
        active: r.active ?? true,
        notes: r.notes || null,
      };
      if (r.id) {
        const { error } = await supabase.from("recurring_obligations" as any).update(payload).eq("id", r.id);
        if (error) throw error;
        await logAudit("update", "obligation", r.id, payload);
      } else {
        const { data, error } = await supabase.from("recurring_obligations" as any).insert(payload).select("id").single();
        if (error) throw error;
        await logAudit("create", "obligation", (data as any)!.id, payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obligations"] });
      qc.invalidateQueries({ queryKey: ["fin-dash"] });
      setEditing(null);
      toast.success(t("common.save"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const confirm = useConfirm();
  const del = useMutation({
    mutationFn: async (id: string) => {
      const choice = await confirm({ title: "حذف الالتزام", description: "لا يمكن التراجع عن هذه العملية." });
      if (!choice) return null;
      if (choice === "archive") await archiveRecord("recurring_obligations", id);
      else await softDeleteRecord("recurring_obligations", id);
      return choice;
    },
    onSuccess: (r) => {
      if (!r) return;
      qc.invalidateQueries({ queryKey: ["obligations"] });
      qc.invalidateQueries({ queryKey: ["fin-dash"] });
      toast.success(r === "archive" ? "تمت الأرشفة" : "تم الحذف");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("advance_recurring_due" as any, { _id: id });
      if (error) throw error;
      await logAudit("mark_paid", "obligation", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obligations"] });
      qc.invalidateQueries({ queryKey: ["fin-dash"] });
      toast.success(t("oblig.marked_paid"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!canView) return <div className="p-8 text-muted-foreground">{t("fin.no_perm")}</div>;

  const daysLeft = (dueDate: string) => {
    const d = new Date(dueDate); d.setHours(0, 0, 0, 0);
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - t0.getTime()) / 86400000);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-primary" />
            {t("oblig.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("oblig.subtitle")}</p>
        </div>
        {canManage && (
          <button
            onClick={() => setEditing({
              currency: "USD", frequency: "monthly", category: "other", active: true,
              start_date: new Date().toISOString().slice(0, 10),
              next_due_date: new Date().toISOString().slice(0, 10),
            })}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> {t("oblig.new")}
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-start px-3 py-2">{t("oblig.name")}</th>
              <th className="text-start px-3 py-2">{t("oblig.vendor")}</th>
              <th className="text-start px-3 py-2">{t("oblig.category")}</th>
              <th className="text-start px-3 py-2">{t("oblig.frequency")}</th>
              <th className="text-start px-3 py-2">{t("oblig.next_due")}</th>
              <th className="text-end px-3 py-2">{t("oblig.amount")}</th>
              <th className="text-center px-3 py-2">{t("oblig.active")}</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dl = daysLeft(r.next_due_date);
              const overdue = dl < 0;
              const today = dl === 0;
              return (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">{r.vendor ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{t(`oblig.cat.${r.category}`)}</td>
                  <td className="px-3 py-2 text-xs">{t(`oblig.freq.${r.frequency}`)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span>{r.next_due_date}</span>
                      <span className={cn(
                        "text-[11px]",
                        overdue ? "text-destructive" : today ? "text-orange-600" : "text-muted-foreground",
                      )}>
                        {overdue
                          ? t("fin.days_overdue").replace("{n}", String(-dl))
                          : today ? t("fin.bucket.today")
                          : t("fin.days_left").replace("{n}", String(dl))}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-end font-mono">{fmt(Number(r.amount))}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn("inline-block rounded px-2 py-0.5 text-[11px]",
                      r.active ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                      {r.active ? "✓" : "✕"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-end">
                      <div className="inline-flex gap-1">
                        <button
                          title={t("oblig.mark_paid")}
                          onClick={() => markPaid.mutate(r.id)}
                          className="p-1.5 rounded hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        ><CheckCircle2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditing(r)} className="p-1.5 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={() => del.mutate(r.id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                        ><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={canManage ? 8 : 7} className="text-center py-8 text-muted-foreground">{t("oblig.no_rows")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-lg border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{editing.id ? t("common.edit") : t("oblig.new")}</div>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label={t("oblig.name")} full><input className="input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></F>
              <F label={t("oblig.vendor")}><input className="input" value={editing.vendor ?? ""} onChange={(e) => setEditing({ ...editing, vendor: e.target.value })} /></F>
              <F label={t("oblig.category")}>
                <select className="input" value={editing.category ?? "other"} onChange={(e) => setEditing({ ...editing, category: e.target.value as Cat })}>
                  {(["rent","loan","utility","payroll","insurance","subscription","fees","other"] as Cat[]).map((c) =>
                    <option key={c} value={c}>{t(`oblig.cat.${c}`)}</option>)}
                </select>
              </F>
              <F label={t("oblig.amount")}><input className="input font-mono" type="number" step="0.01" value={editing.amount ?? 0} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })} /></F>
              <F label={t("oblig.frequency")}>
                <select className="input" value={editing.frequency ?? "monthly"} onChange={(e) => setEditing({ ...editing, frequency: e.target.value as Freq })}>
                  {(["daily","weekly","monthly","quarterly","yearly"] as Freq[]).map((f) =>
                    <option key={f} value={f}>{t(`oblig.freq.${f}`)}</option>)}
                </select>
              </F>
              <F label={t("oblig.start_date")}><input className="input" type="date" value={editing.start_date ?? ""} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} /></F>
              <F label={t("oblig.next_due")}><input className="input" type="date" value={editing.next_due_date ?? ""} onChange={(e) => setEditing({ ...editing, next_due_date: e.target.value })} /></F>
              <F label={t("oblig.end_date")}><input className="input" type="date" value={editing.end_date ?? ""} onChange={(e) => setEditing({ ...editing, end_date: e.target.value || null })} /></F>
              <F label={t("oblig.method")}><input className="input" value={editing.payment_method ?? ""} onChange={(e) => setEditing({ ...editing, payment_method: e.target.value })} /></F>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                {t("oblig.active")}
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
