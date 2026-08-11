import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, X, ToggleLeft, ToggleRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";


export const Route = createFileRoute("/_app/accounts")({
  component: AccountsPage,
});

type Account = {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  parent_id: string | null;
  is_active: boolean;
};

const TYPE_LABEL: Record<Account["type"], string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
};

const TYPE_COLOR: Record<Account["type"], string> = {
  asset: "bg-primary/10 text-primary",
  liability: "bg-destructive/10 text-destructive",
  equity: "bg-accent/15 text-accent-foreground",
  revenue: "bg-success/10 text-success",
  expense: "bg-warning/15 text-warning-foreground",
};

function AccountsPage() {
  const { permissions } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Account | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sortBy, setSortBy] = useState<"code" | "name" | "type">("code");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("code");
      if (error) throw error;
      return data as Account[];
    },
  });

  const parentIds = (() => {
    const s = new Set<string>();
    accounts.forEach((a) => a.parent_id && s.add(a.parent_id));
    return s;
  })();

  const filtered = accounts.filter((a) => {
    if (statusFilter === "active" && !a.is_active) return false;
    if (statusFilter === "inactive" && a.is_active) return false;
    const q = search.trim().toLowerCase();
    if (q && !(`${a.code} ${a.name}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name, "ar");
    if (sortBy === "type") {
      const c = a.type.localeCompare(b.type);
      return c !== 0 ? c : a.code.localeCompare(b.code);
    }
    return a.code.localeCompare(b.code);
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActive = useMutation({
    mutationFn: async ({ ids, value }: { ids: string[]; value: boolean }) => {
      const { error } = await supabase.from("accounts").update({ is_active: value }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setSelected(new Set());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canCreate = permissions.has("accounts.create");
  const canEdit = permissions.has("accounts.edit");
  const canDelete = permissions.has("accounts.delete");

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected = sorted.length > 0 && sorted.every((a) => selected.has(a.id));

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">شجرة الحسابات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="num">{accounts.length}</span> حساب · نشط <span className="num">{accounts.filter((a) => a.is_active).length}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("accounts.search")}
            className="px-3 py-2 border rounded-md bg-background text-sm w-52"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            className="px-3 py-2 border rounded-md bg-background text-sm"
          >
            <option value="all">{t("accounts.filter.all")}</option>
            <option value="active">{t("accounts.filter.active")}</option>
            <option value="inactive">{t("accounts.filter.inactive")}</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "code" | "name" | "type")}
            className="px-3 py-2 border rounded-md bg-background text-sm"
            title="فرز"
          >
            <option value="code">فرز: الكود</option>
            <option value="name">فرز: الاسم</option>
            <option value="type">فرز: النوع</option>
          </select>
          {canCreate && (
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> حساب جديد
            </button>
          )}
        </div>
      </header>

      {canEdit && selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-3 rounded-md border bg-muted/40 text-sm">
          <span className="num">{selected.size}</span>
          <span>{t("accounts.selected")}</span>
          <div className="flex-1" />
          <button
            onClick={() => setActive.mutate({ ids: [...selected], value: true })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs"
          >
            <ToggleRight className="w-3.5 h-3.5" /> {t("accounts.activate_selected")}
          </button>
          <button
            onClick={() => setActive.mutate({ ids: [...selected], value: false })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs"
          >
            <ToggleLeft className="w-3.5 h-3.5" /> {t("accounts.deactivate_selected")}
          </button>
        </div>
      )}

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              {canEdit && (
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => setSelected(e.target.checked ? new Set(sorted.map((a) => a.id)) : new Set())}
                  />
                </th>
              )}
              <th className="text-right px-4 py-3 font-medium">الكود</th>
              <th className="text-right px-4 py-3 font-medium">الاسم</th>
              <th className="text-right px-4 py-3 font-medium">النوع</th>
              <th className="text-right px-4 py-3 font-medium">الحساب الأب</th>
              <th className="text-right px-4 py-3 font-medium">الحالة</th>
              <th className="text-right px-4 py-3 font-medium w-24"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={canEdit ? 7 : 6} className="text-center py-10 text-muted-foreground">لا توجد حسابات مطابقة.</td></tr>
            )}
            {sorted.map((a) => {
              const parent = accounts.find((p) => p.id === a.parent_id);
              const isGroup = parentIds.has(a.id);
              return (
                <tr key={a.id} className={`border-t hover:bg-muted/30 ${a.is_active ? "" : "opacity-60"}`}>
                  {canEdit && (
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSel(a.id)} />
                    </td>
                  )}
                  <td className="px-4 py-2.5 num font-medium">{a.code}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span>{a.name}</span>
                      {isGroup && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          مجموعة
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded ${TYPE_COLOR[a.type]}`}>
                      {TYPE_LABEL[a.type]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{parent ? `${parent.code} — ${parent.name}` : "—"}</td>
                  <td className="px-4 py-2.5">
                    {canEdit ? (
                      <button
                        onClick={() => setActive.mutate({ ids: [a.id], value: !a.is_active })}
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border ${a.is_active ? "text-emerald-600 border-emerald-300 bg-emerald-500/10" : "text-muted-foreground"}`}
                        title={a.is_active ? t("accounts.deactivate") : t("accounts.activate")}
                      >
                        {a.is_active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                        {a.is_active ? "نشط" : "غير نشط"}
                      </button>
                    ) : a.is_active ? (
                      <span className="text-success text-xs">نشط</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">غير نشط</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 justify-end">
                      {canEdit && (
                        <button onClick={() => { setEditing(a); setShowForm(true); }} className="p-1.5 rounded hover:bg-muted">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => { if (confirm("تأكيد الحذف؟")) del.mutate(a.id); }} className="p-1.5 rounded hover:bg-destructive/10 text-destructive">
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
        <AccountForm
          account={editing}
          accounts={accounts}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["accounts"] }); setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}


function computeNextCode(parentId: string, accounts: Account[], excludeId?: string): string {
  const parent = accounts.find((a) => a.id === parentId);
  const base = parent ? Number(parent.code) * 10 : 0;
  const step = 100;
  const siblings = accounts
    .filter((a) => a.parent_id === (parentId || null) && a.id !== excludeId)
    .map((a) => Number(a.code))
    .filter((n) => !Number.isNaN(n) && n > base && n < base + 10000);
  return String(siblings.length ? Math.max(...siblings) + step : base + step);
}

function AccountForm({ account, accounts, onClose, onSaved }: { account: Account | null; accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const [parentId, setParentId] = useState<string>(account?.parent_id ?? "");
  const [code, setCode] = useState(account?.code ?? computeNextCode("", accounts));
  const [codeTouched, setCodeTouched] = useState(!!account);
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<Account["type"]>(account?.type ?? "asset");
  const [isActive, setIsActive] = useState(account?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const onParentChange = (newParent: string) => {
    setParentId(newParent);
    if (!codeTouched && !account) {
      setCode(computeNextCode(newParent, accounts));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { code, name, type, parent_id: parentId || null, is_active: isActive };
      const { error } = account
        ? await supabase.from("accounts").update(payload).eq("id", account.id)
        : await supabase.from("accounts").insert(payload);
      if (error) throw error;
      toast.success(account ? "تم التحديث" : "تم الإنشاء");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{account ? "تعديل حساب" : "حساب جديد"}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">الكود (تلقائي)</label>
              <input value={code} onChange={(e) => { setCode(e.target.value); setCodeTouched(true); }} required className="w-full px-3 py-2 border rounded-md bg-background" dir="ltr" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">النوع</label>
              <select value={type} onChange={(e) => setType(e.target.value as Account["type"])} className="w-full px-3 py-2 border rounded-md bg-background">
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">الاسم</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 border rounded-md bg-background" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">الحساب الأب (اختياري)</label>
            <select value={parentId} onChange={(e) => onParentChange(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background">
              <option value="">— لا يوجد —</option>
              {accounts.filter((a) => a.id !== account?.id).map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            نشط
          </label>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium">
              {saving ? "..." : "حفظ"}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}
