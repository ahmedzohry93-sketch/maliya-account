import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X, Edit2, Trash2, Calculator, FileSpreadsheet, FileText, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/confirm-dialog";
import { archiveRecord, softDeleteRecord } from "@/lib/records";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { exportToExcel, exportToPDF, type Section } from "@/lib/export-utils";

export const Route = createFileRoute("/_app/assets")({ component: AssetsPage });

type Acc = { id: string; code: string; name: string; type: string; is_active: boolean };

type Asset = {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  acquisition_date: string;
  in_service_date: string | null;
  cost: number;
  salvage_value: number;
  useful_life_months: number;
  method: "straight_line" | "declining_balance" | "none";
  declining_rate: number;
  status: "draft" | "running" | "fully_depreciated" | "disposed";
  asset_account_id: string | null;
  accum_dep_account_id: string | null;
  dep_expense_account_id: string | null;
  disposal_date: string | null;
  disposal_amount: number | null;
  notes: string | null;
};

type Dep = { id: string; asset_id: string; period_date: string; amount: number; book_value_after: number; posted: boolean };

const fmt = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

const STATUS_STYLE: Record<Asset["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  running: "bg-emerald-500/10 text-emerald-600",
  fully_depreciated: "bg-amber-500/10 text-amber-600",
  disposed: "bg-red-500/10 text-red-600",
};

function AssetsPage() {
  const { t } = useI18n();
  const { permissions } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [detail, setDetail] = useState<Asset | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | Asset["status"]>("all");

  const canManage = permissions.has("assets.manage");
  const canDepreciate = permissions.has("assets.depreciate");

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts-for-assets"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, code, name, type, is_active").order("code");
      return (data ?? []) as Acc[];
    },
  });

  const { data: assets = [] } = useQuery({
    queryKey: ["fixed-assets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fixed_assets").select("*").eq("is_deleted", false).eq("is_archived", false).order("code", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Asset[];
    },
  });

  const { data: deps = [] } = useQuery({
    queryKey: ["asset-deps"],
    queryFn: async () => {
      const { data } = await supabase.from("asset_depreciations").select("*").order("period_date");
      return (data ?? []) as unknown as Dep[];
    },
  });

  const accumByAsset = useMemo(() => {
    const m = new Map<string, number>();
    deps.forEach((d) => m.set(d.asset_id, (m.get(d.asset_id) ?? 0) + Number(d.amount || 0)));
    return m;
  }, [deps]);

  const rows = assets.filter((a) => statusFilter === "all" || a.status === statusFilter);

  const totals = rows.reduce(
    (s, a) => {
      const accum = accumByAsset.get(a.id) ?? 0;
      s.cost += Number(a.cost || 0);
      s.accum += accum;
      s.book += Number(a.cost || 0) - accum;
      return s;
    },
    { cost: 0, accum: 0, book: 0 },
  );

  const confirm = useConfirm();
  const del = useMutation({
    mutationFn: async (id: string) => {
      const choice = await confirm({ title: "حذف الأصل", description: "لا يمكن التراجع عن هذه العملية." });
      if (!choice) return null;
      if (choice === "archive") await archiveRecord("fixed_assets", id);
      else await softDeleteRecord("fixed_assets", id);
      return choice;
    },
    onSuccess: (r) => {
      if (!r) return;
      qc.invalidateQueries({ queryKey: ["fixed-assets"] });
      toast.success(r === "archive" ? "تمت الأرشفة" : "تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sections = (): Section[] => [
    {
      title: t("assets.title"),
      headers: [t("assets.code"), t("assets.name"), t("assets.category"), t("assets.acq_date"), t("assets.cost"), t("assets.accum_dep"), t("assets.book_value"), t("assets.status")],
      rows: rows.map((a) => {
        const accum = accumByAsset.get(a.id) ?? 0;
        return [a.code ?? "—", a.name, a.category ?? "—", a.acquisition_date, Number(a.cost), accum, Number(a.cost) - accum, t(`assets.status.${a.status}`)];
      }),
      totals: ["", "", "", t("common.total"), totals.cost, totals.accum, totals.book, ""],
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("assets.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("assets.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 border rounded-md bg-background text-sm"
          >
            <option value="all">{t("assets.filter.all")}</option>
            <option value="draft">{t("assets.status.draft")}</option>
            <option value="running">{t("assets.status.running")}</option>
            <option value="fully_depreciated">{t("assets.status.fully_depreciated")}</option>
            <option value="disposed">{t("assets.status.disposed")}</option>
          </select>
          <button
            disabled={!rows.length}
            onClick={() => exportToExcel("assets", t("assets.title"), sections())}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button
            disabled={!rows.length}
            onClick={() => exportToPDF("assets", t("assets.title"), sections())}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
          {canManage && (
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> {t("assets.new")}
            </button>
          )}
        </div>
      </header>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard label={t("assets.total_cost")} value={totals.cost} />
        <StatCard label={t("assets.accum_dep")} value={totals.accum} tone="red" />
        <StatCard label={t("assets.book_value")} value={totals.book} tone="emerald" />
      </div>

      <div className="bg-card border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-start px-3 py-3 font-medium">{t("assets.code")}</th>
              <th className="text-start px-3 py-3 font-medium">{t("assets.name")}</th>
              <th className="text-start px-3 py-3 font-medium">{t("assets.category")}</th>
              <th className="text-start px-3 py-3 font-medium">{t("assets.acq_date")}</th>
              <th className="text-start px-3 py-3 font-medium">{t("assets.cost")}</th>
              <th className="text-start px-3 py-3 font-medium">{t("assets.accum_dep")}</th>
              <th className="text-start px-3 py-3 font-medium">{t("assets.book_value")}</th>
              <th className="text-start px-3 py-3 font-medium">{t("assets.status")}</th>
              <th className="px-3 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">{t("assets.empty")}</td></tr>
            )}
            {rows.map((a) => {
              const accum = accumByAsset.get(a.id) ?? 0;
              return (
                <tr key={a.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2.5 num">{a.code ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <button className="text-primary hover:underline" onClick={() => setDetail(a)}>{a.name}</button>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{a.category ?? "—"}</td>
                  <td className="px-3 py-2.5 num">{a.acquisition_date}</td>
                  <td className="px-3 py-2.5 num">{fmt(a.cost)}</td>
                  <td className="px-3 py-2.5 num text-red-600">{fmt(accum)}</td>
                  <td className="px-3 py-2.5 num font-medium">{fmt(Number(a.cost) - accum)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded ${STATUS_STYLE[a.status]}`}>{t(`assets.status.${a.status}`)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 justify-end">
                      {(canDepreciate || canManage) && (
                        <button onClick={() => setDetail(a)} className="p-1.5 rounded hover:bg-muted" title={t("assets.schedule")}>
                          <Calculator className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => { setEditing(a); setShowForm(true); }} className="p-1.5 rounded hover:bg-muted">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canManage && a.status === "draft" && (
                        <button
                          onClick={() => del.mutate(a.id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <AssetForm
          asset={editing}
          accounts={accounts}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["fixed-assets"] });
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {detail && (
        <AssetDetail
          asset={detail}
          deps={deps.filter((d) => d.asset_id === detail.id)}
          canDepreciate={canDepreciate}
          canManage={canManage}
          onClose={() => setDetail(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["asset-deps"] });
            qc.invalidateQueries({ queryKey: ["fixed-assets"] });
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "red" | "emerald" }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-bold num ${tone === "red" ? "text-red-600" : tone === "emerald" ? "text-emerald-600" : ""}`}>{fmt(value)}</div>
    </div>
  );
}

function AssetForm({ asset, accounts, onClose, onSaved }: { asset: Asset | null; accounts: Acc[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({
    code: asset?.code ?? "",
    name: asset?.name ?? "",
    category: asset?.category ?? "",
    acquisition_date: asset?.acquisition_date ?? new Date().toISOString().slice(0, 10),
    in_service_date: asset?.in_service_date ?? new Date().toISOString().slice(0, 10),
    cost: String(asset?.cost ?? ""),
    salvage_value: String(asset?.salvage_value ?? "0"),
    useful_life_months: String(asset?.useful_life_months ?? 60),
    method: asset?.method ?? "straight_line",
    declining_rate: String(asset?.declining_rate ?? "0"),
    status: asset?.status ?? "draft",
    asset_account_id: asset?.asset_account_id ?? "",
    accum_dep_account_id: asset?.accum_dep_account_id ?? "",
    dep_expense_account_id: asset?.dep_expense_account_id ?? "",
    notes: asset?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const assetAccounts = accounts.filter((a) => a.type === "asset");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        code: f.code || null,
        name: f.name,
        category: f.category || null,
        acquisition_date: f.acquisition_date,
        in_service_date: f.in_service_date || null,
        cost: Number(f.cost || 0),
        salvage_value: Number(f.salvage_value || 0),
        useful_life_months: Number(f.useful_life_months || 0),
        method: f.method,
        declining_rate: Number(f.declining_rate || 0),
        status: f.status,
        asset_account_id: f.asset_account_id || null,
        accum_dep_account_id: f.accum_dep_account_id || null,
        dep_expense_account_id: f.dep_expense_account_id || null,
        notes: f.notes || null,
      };
      const { error } = asset
        ? await supabase.from("fixed_assets").update(payload).eq("id", asset.id)
        : await supabase.from("fixed_assets").insert(payload);
      if (error) throw error;
      toast.success(asset ? t("common.updated") : t("common.created"));
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "error");
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto" onClick={onClose}>
      <div className="bg-card rounded-lg max-w-2xl w-full p-6 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{asset ? t("assets.edit") : t("assets.new")}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="grid md:grid-cols-2 gap-3">
          <Field label={t("assets.code")}><input value={f.code} onChange={set("code")} className="inp" dir="ltr" /></Field>
          <Field label={t("assets.name")}><input value={f.name} onChange={set("name")} required className="inp" /></Field>
          <Field label={t("assets.category")}><input value={f.category} onChange={set("category")} className="inp" /></Field>
          <Field label={t("assets.acq_date")}><input type="date" value={f.acquisition_date} onChange={set("acquisition_date")} required className="inp" /></Field>
          <Field label={t("assets.in_service")}><input type="date" value={f.in_service_date} onChange={set("in_service_date")} className="inp" /></Field>
          <Field label={t("assets.cost")}><input type="number" step="0.01" value={f.cost} onChange={set("cost")} required className="inp num" /></Field>
          <Field label={t("assets.salvage")}><input type="number" step="0.01" value={f.salvage_value} onChange={set("salvage_value")} className="inp num" /></Field>
          <Field label={t("assets.life_months")}><input type="number" value={f.useful_life_months} onChange={set("useful_life_months")} className="inp num" /></Field>
          <Field label={t("assets.method")}>
            <select value={f.method} onChange={set("method")} className="inp">
              <option value="straight_line">{t("assets.method.straight_line")}</option>
              <option value="declining_balance">{t("assets.method.declining_balance")}</option>
              <option value="none">{t("assets.method.none")}</option>
            </select>
          </Field>
          {f.method === "declining_balance" && (
            <Field label={t("assets.declining_rate")}><input type="number" step="0.01" value={f.declining_rate} onChange={set("declining_rate")} className="inp num" /></Field>
          )}
          <Field label={t("assets.status")}>
            <select value={f.status} onChange={set("status")} className="inp">
              <option value="draft">{t("assets.status.draft")}</option>
              <option value="running">{t("assets.status.running")}</option>
              <option value="fully_depreciated">{t("assets.status.fully_depreciated")}</option>
              <option value="disposed">{t("assets.status.disposed")}</option>
            </select>
          </Field>
          <Field label={t("assets.acc.asset")}>
            <select value={f.asset_account_id} onChange={set("asset_account_id")} className="inp">
              <option value="">—</option>
              {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </Field>
          <Field label={t("assets.acc.accum")}>
            <select value={f.accum_dep_account_id} onChange={set("accum_dep_account_id")} className="inp">
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </Field>
          <Field label={t("assets.acc.expense")}>
            <select value={f.dep_expense_account_id} onChange={set("dep_expense_account_id")} className="inp">
              <option value="">—</option>
              {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label={t("assets.notes")}><textarea value={f.notes} onChange={set("notes")} rows={2} className="inp" /></Field>
          </div>
          <div className="md:col-span-2 flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium">
              {saving ? "..." : t("common.save")}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">{t("common.cancel")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1">{label}</label>
      {children}
    </div>
  );
}

function monthlyAmount(asset: Asset, accumSoFar: number): number {
  const depreciable = Number(asset.cost || 0) - Number(asset.salvage_value || 0);
  const remaining = depreciable - accumSoFar;
  if (remaining <= 0.005) return 0;
  if (asset.method === "none") return 0;
  if (asset.method === "declining_balance") {
    const rate = Number(asset.declining_rate || 0) / 100 / 12;
    return Math.min(remaining, (Number(asset.cost) - accumSoFar) * rate);
  }
  const months = Number(asset.useful_life_months || 0);
  if (months <= 0) return 0;
  return Math.min(remaining, depreciable / months);
}

function AssetDetail({
  asset,
  deps,
  canDepreciate,
  canManage,
  onClose,
  onChanged,
}: {
  asset: Asset;
  deps: Dep[];
  canDepreciate: boolean;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [until, setUntil] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);

  const accum = deps.reduce((s, d) => s + Number(d.amount || 0), 0);
  const book = Number(asset.cost || 0) - accum;

  // forecast remaining schedule
  const forecast = useMemo(() => {
    const out: { period: string; amount: number; book: number }[] = [];
    let acc = accum;
    const start = new Date(asset.in_service_date ?? asset.acquisition_date);
    start.setDate(1);
    start.setMonth(start.getMonth() + deps.length);
    for (let i = 0; i < 240; i++) {
      const amt = monthlyAmount(asset, acc);
      if (amt <= 0.005) break;
      acc += amt;
      out.push({ period: monthKey(start), amount: amt, book: Number(asset.cost) - acc });
      start.setMonth(start.getMonth() + 1);
    }
    return out;
  }, [asset, deps.length, accum]);

  const runDepreciation = async () => {
    if (!asset.dep_expense_account_id || !asset.accum_dep_account_id) {
      toast.error(t("assets.need_accounts"));
      return;
    }
    setBusy(true);
    try {
      const done = new Set(deps.map((d) => d.period_date));
      const start = new Date(asset.in_service_date ?? asset.acquisition_date);
      start.setDate(1);
      const limit = new Date(`${until}-01T00:00:00`);
      let acc = accum;
      const pending: { period_date: string; amount: number; book_value_after: number }[] = [];
      const cursor = new Date(start);
      while (cursor <= limit) {
        const key = monthKey(cursor);
        if (!done.has(key)) {
          const amt = monthlyAmount(asset, acc);
          if (amt > 0.005) {
            acc += amt;
            pending.push({ period_date: key, amount: Number(amt.toFixed(2)), book_value_after: Number((Number(asset.cost) - acc).toFixed(2)) });
          }
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
      if (!pending.length) {
        toast.info(t("assets.nothing_to_post"));
        return;
      }
      const total = Number(pending.reduce((s, p) => s + p.amount, 0).toFixed(2));

      const { data: entry, error: e1 } = await supabase
        .from("journal_entries")
        .insert({
          entry_date: `${until}-01`,
          description: `${t("assets.dep_entry")} - ${asset.name}`,
          status: "posted",
          entry_type: "depreciation",
          approved_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (e1 || !entry) throw e1 ?? new Error("entry failed");

      const { error: e2 } = await supabase.from("journal_lines").insert([
        { entry_id: entry.id, account_id: asset.dep_expense_account_id, debit: total, credit: 0, description: asset.name, line_order: 0 },
        { entry_id: entry.id, account_id: asset.accum_dep_account_id, debit: 0, credit: total, description: asset.name, line_order: 1 },
      ]);
      if (e2) throw e2;

      const { error: e3 } = await supabase
        .from("asset_depreciations")
        .insert(pending.map((p) => ({ ...p, asset_id: asset.id, posted: true, journal_entry_id: entry.id })));
      if (e3) throw e3;

      const fullyDone = Number(asset.cost) - acc <= Number(asset.salvage_value) + 0.005;
      await supabase
        .from("fixed_assets")
        .update({ status: fullyDone ? "fully_depreciated" : "running" })
        .eq("id", asset.id);

      toast.success(`${t("assets.posted")} — ${fmt(total)}`);
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  };

  const dispose = async () => {
    const amountStr = prompt(t("assets.disposal_amount"), "0");
    if (amountStr === null) return;
    const { error } = await supabase
      .from("fixed_assets")
      .update({ status: "disposed", disposal_date: new Date().toISOString().slice(0, 10), disposal_amount: Number(amountStr || 0) })
      .eq("id", asset.id);
    if (error) toast.error(error.message);
    else {
      toast.success(t("assets.disposed_done"));
      onChanged();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto" onClick={onClose}>
      <div className="bg-card rounded-lg max-w-3xl w-full p-6 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-semibold text-lg">{asset.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("assets.cost")}: <span className="num">{fmt(asset.cost)}</span> · {t("assets.accum_dep")}: <span className="num">{fmt(accum)}</span> · {t("assets.book_value")}: <span className="num">{fmt(book)}</span>
            </p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        {canDepreciate && asset.status !== "disposed" && (
          <div className="flex flex-wrap items-end gap-2 p-3 border rounded-md mb-4 bg-muted/30">
            <div>
              <label className="text-xs font-medium block mb-1">{t("assets.until_month")}</label>
              <input type="month" value={until} onChange={(e) => setUntil(e.target.value)} className="px-3 py-2 border rounded-md bg-background text-sm" />
            </div>
            <button onClick={runDepreciation} disabled={busy} className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">
              <Calculator className="w-4 h-4" /> {busy ? "..." : t("assets.run_dep")}
            </button>
            {canManage && (
              <button onClick={dispose} className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm text-destructive hover:bg-destructive/10">
                <Ban className="w-4 h-4" /> {t("assets.dispose")}
              </button>
            )}
          </div>
        )}

        <h4 className="text-sm font-semibold mb-2">{t("assets.posted_dep")}</h4>
        <div className="border rounded-md overflow-hidden mb-5">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-start px-3 py-2">{t("assets.period")}</th>
                <th className="text-start px-3 py-2">{t("assets.amount")}</th>
                <th className="text-start px-3 py-2">{t("assets.book_value")}</th>
              </tr>
            </thead>
            <tbody>
              {deps.length === 0 && <tr><td colSpan={3} className="text-center py-5 text-xs text-muted-foreground">{t("assets.no_dep")}</td></tr>}
              {deps.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-3 py-1.5 num">{d.period_date.slice(0, 7)}</td>
                  <td className="px-3 py-1.5 num">{fmt(d.amount)}</td>
                  <td className="px-3 py-1.5 num">{fmt(d.book_value_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="text-sm font-semibold mb-2">{t("assets.forecast")}</h4>
        <div className="border rounded-md overflow-hidden max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs sticky top-0">
              <tr>
                <th className="text-start px-3 py-2">{t("assets.period")}</th>
                <th className="text-start px-3 py-2">{t("assets.amount")}</th>
                <th className="text-start px-3 py-2">{t("assets.book_value")}</th>
              </tr>
            </thead>
            <tbody>
              {forecast.length === 0 && <tr><td colSpan={3} className="text-center py-5 text-xs text-muted-foreground">{t("assets.no_forecast")}</td></tr>}
              {forecast.map((r) => (
                <tr key={r.period} className="border-t">
                  <td className="px-3 py-1.5 num">{r.period.slice(0, 7)}</td>
                  <td className="px-3 py-1.5 num">{fmt(r.amount)}</td>
                  <td className="px-3 py-1.5 num">{fmt(r.book)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
