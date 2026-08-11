import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, X, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/confirm-dialog";
import { archiveRecord, softDeleteRecord } from "@/lib/records";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { logAudit } from "@/lib/audit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/checks")({ component: ChecksPage });

type Direction = "incoming" | "outgoing";
type Status = "pending" | "under_collection" | "cleared" | "returned" | "cancelled";

type Check = {
  id: string;
  direction: Direction;
  check_number: string;
  bank_name: string | null;
  partner_id: string | null;
  amount: number;
  currency: string;
  issue_date: string;
  due_date: string;
  status: Status;
  notes: string | null;
};

function ChecksPage() {
  const { t, fmt } = useI18n();
  const { permissions } = useAuth();
  const qc = useQueryClient();
  const canManage = permissions.has("checks.manage");
  const canView = canManage || permissions.has("finance.dashboard.view");

  const [tab, setTab] = useState<Direction>("incoming");
  const [editing, setEditing] = useState<Partial<Check> | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["checks", tab],
    queryFn: async () => {
      const { data } = await supabase
        .from("checks" as any)
        .select("*")
        .eq("direction", tab)
        .eq("is_deleted", false)
        .eq("is_archived", false)
        .order("due_date", { ascending: true });
      return ((data ?? []) as unknown) as Check[];
    },
    enabled: canView,
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["partners-list"],
    queryFn: async () => {
      const { data } = await supabase.from("partners").select("id, name, type").order("name");
      return data ?? [];
    },
    enabled: canManage,
  });

  const save = useMutation({
    mutationFn: async (r: Partial<Check>) => {
      const payload = {
        direction: r.direction ?? tab,
        check_number: r.check_number || "",
        bank_name: r.bank_name || null,
        partner_id: r.partner_id || null,
        amount: Number(r.amount || 0),
        currency: r.currency || "USD",
        issue_date: r.issue_date || new Date().toISOString().slice(0, 10),
        due_date: r.due_date || new Date().toISOString().slice(0, 10),
        status: r.status || "pending",
        notes: r.notes || null,
      };
      if (r.id) {
        const { error } = await supabase.from("checks" as any).update(payload).eq("id", r.id);
        if (error) throw error;
        await logAudit("update", "check", r.id, payload);
      } else {
        const { data, error } = await supabase.from("checks" as any).insert(payload).select("id").single();
        if (error) throw error;
        await logAudit("create", "check", (data as any)!.id, payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checks"] });
      qc.invalidateQueries({ queryKey: ["fin-dash"] });
      setEditing(null);
      toast.success(t("common.save"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const confirm = useConfirm();
  const del = useMutation({
    mutationFn: async (id: string) => {
      const choice = await confirm({ title: "حذف الشيك", description: "لا يمكن التراجع عن هذه العملية." });
      if (!choice) return null;
      if (choice === "archive") await archiveRecord("checks", id);
      else await softDeleteRecord("checks", id);
      return choice;
    },
    onSuccess: (r) => {
      if (!r) return;
      qc.invalidateQueries({ queryKey: ["checks"] });
      qc.invalidateQueries({ queryKey: ["fin-dash"] });
      toast.success(r === "archive" ? "تمت الأرشفة" : "تم الحذف");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!canView) return <div className="p-8 text-muted-foreground">{t("fin.no_perm")}</div>;

  const partnerName = (id: string | null) => partners.find((p: any) => p.id === id)?.name ?? "—";

  const statusBadge = (s: Status) => {
    const map: Record<Status, string> = {
      pending: "bg-muted text-muted-foreground",
      under_collection: "bg-primary/10 text-primary",
      cleared: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      returned: "bg-destructive/10 text-destructive",
      cancelled: "bg-muted text-muted-foreground line-through",
    };
    return <span className={cn("inline-block rounded px-2 py-0.5 text-[11px]", map[s])}>{t(`checks.status.${s}`)}</span>;
  };

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6 text-primary" />
            {t("checks.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("checks.subtitle")}</p>
        </div>
        {canManage && (
          <button
            onClick={() => setEditing({
              direction: tab, currency: "USD", status: "pending",
              issue_date: new Date().toISOString().slice(0, 10),
              due_date: new Date().toISOString().slice(0, 10),
            })}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> {t("checks.new")}
          </button>
        )}
      </div>

      <div className="inline-flex rounded-lg border bg-card p-1">
        {(["incoming", "outgoing"] as Direction[]).map((d) => (
          <button
            key={d}
            onClick={() => setTab(d)}
            className={cn(
              "px-4 py-1.5 text-sm rounded-md transition-colors",
              tab === d ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {t(`checks.${d}`)}
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-start px-3 py-2">{t("checks.number")}</th>
              <th className="text-start px-3 py-2">{t("checks.partner")}</th>
              <th className="text-start px-3 py-2">{t("checks.bank")}</th>
              <th className="text-start px-3 py-2">{t("checks.due_date")}</th>
              <th className="text-end px-3 py-2">{t("checks.amount")}</th>
              <th className="text-center px-3 py-2">{t("checks.status")}</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">{r.check_number}</td>
                <td className="px-3 py-2">{partnerName(r.partner_id)}</td>
                <td className="px-3 py-2">{r.bank_name ?? "—"}</td>
                <td className="px-3 py-2">{r.due_date}</td>
                <td className="px-3 py-2 text-end font-mono">{fmt(Number(r.amount))}</td>
                <td className="px-3 py-2 text-center">{statusBadge(r.status)}</td>
                {canManage && (
                  <td className="px-3 py-2 text-end">
                    <div className="inline-flex gap-1">
                      <button onClick={() => setEditing(r)} className="p-1.5 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button
                        onClick={() => del.mutate(r.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                      ><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={canManage ? 7 : 6} className="text-center py-8 text-muted-foreground">{t("checks.no_rows")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-lg border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{editing.id ? t("common.edit") : t("checks.new")}</div>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label={t("checks.direction")}>
                <select className="input" value={editing.direction ?? tab} onChange={(e) => setEditing({ ...editing, direction: e.target.value as Direction })}>
                  <option value="incoming">{t("checks.incoming")}</option>
                  <option value="outgoing">{t("checks.outgoing")}</option>
                </select>
              </F>
              <F label={t("checks.number")}><input className="input" value={editing.check_number ?? ""} onChange={(e) => setEditing({ ...editing, check_number: e.target.value })} /></F>
              <F label={t("checks.partner")} full>
                <select className="input" value={editing.partner_id ?? ""} onChange={(e) => setEditing({ ...editing, partner_id: e.target.value || null })}>
                  <option value="">—</option>
                  {partners.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </F>
              <F label={t("checks.bank")}><input className="input" value={editing.bank_name ?? ""} onChange={(e) => setEditing({ ...editing, bank_name: e.target.value })} /></F>
              <F label={t("checks.amount")}><input className="input font-mono" type="number" step="0.01" value={editing.amount ?? 0} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })} /></F>
              <F label={t("checks.issue_date")}><input className="input" type="date" value={editing.issue_date ?? ""} onChange={(e) => setEditing({ ...editing, issue_date: e.target.value })} /></F>
              <F label={t("checks.due_date")}><input className="input" type="date" value={editing.due_date ?? ""} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} /></F>
              <F label={t("checks.status")} full>
                <select className="input" value={editing.status ?? "pending"} onChange={(e) => setEditing({ ...editing, status: e.target.value as Status })}>
                  {(["pending","under_collection","cleared","returned","cancelled"] as Status[]).map((s) =>
                    <option key={s} value={s}>{t(`checks.status.${s}`)}</option>)}
                </select>
              </F>
              <F label={t("checks.notes")} full>
                <textarea className="input" rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </F>
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
