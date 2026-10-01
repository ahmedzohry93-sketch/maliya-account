import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { compareCode, isRootAccount } from "@/lib/account-tree";

export const Route = createFileRoute("/_app/account-settings")({
  head: () => ({ meta: [
    { title: "إعدادات شجرة الحسابات | مالية" },
    { name: "description", content: "إدارة رموز الحسابات وتصنيفها وربط الحسابات الفرعية بالأقسام المحاسبية." },
    { property: "og:title", content: "إعدادات شجرة الحسابات | مالية" },
    { property: "og:description", content: "إدارة رموز الحسابات وتصنيفها وربط الحسابات الفرعية بالأقسام المحاسبية." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AccountSettings,
});

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
type Account = { id: string; code: string; name: string; type: AccountType; parent_id: string | null; is_active: boolean };
const labels: Record<AccountType, string> = {
  asset: "الأصول", liability: "الالتزامات", equity: "حقوق الملكية", revenue: "الإيرادات", expense: "المصروفات",
};
const order: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];

function AccountSettings() {
  const { permissions } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [code, setCode] = useState("");
  const [type, setType] = useState<AccountType>("asset");
  const [parentId, setParentId] = useState("");

  const { data: accounts = [], isPending, error } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id, code, name, type, parent_id, is_active");
      if (error) throw error;
      return data as Account[];
    },
  });
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const children = useMemo(() => {
    const map = new Map<string | null, Account[]>();
    for (const a of accounts) map.set(a.parent_id, [...(map.get(a.parent_id) ?? []), a]);
    for (const list of map.values()) list.sort((a, b) => compareCode(a.code, b.code));
    return map;
  }, [accounts]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const isHeading = selected ? isRootAccount(selected) : false;
  const hasChildren = selected ? (children.get(selected.id)?.length ?? 0) > 0 : false;
  const matching = search.trim().toLocaleLowerCase();

  const choose = (a: Account) => {
    setSelectedId(a.id);
    setCode(a.code);
    setType(a.type);
    setParentId(a.parent_id ?? "");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!selected || !permissions.has("accounts.edit")) throw new Error("لا تملك صلاحية تعديل الحسابات");
      const nextCode = code.trim();
      if (!nextCode || !/^\d+$/.test(nextCode)) throw new Error("أدخل رمز حساب رقميًا صالحًا");
      if (accounts.some((a) => a.id !== selected.id && a.code === nextCode)) throw new Error("رمز الحساب مستخدم بالفعل");
      if (isHeading && (nextCode !== selected.code || type !== selected.type || parentId)) {
        throw new Error("رؤوس الأقسام الخمسة ثابتة؛ عدّل الحسابات التابعة لها فقط");
      }
      if (hasChildren && type !== selected.type) throw new Error("انقل الحسابات الفرعية أولًا قبل تغيير تصنيف هذا الحساب");
      const parent = parentId ? byId.get(parentId) : undefined;
      if (parentId && !parent) throw new Error("الحساب الأب غير موجود");
      if (parent && parent.type !== type) throw new Error("تصنيف الحساب يجب أن يطابق تصنيف الحساب الأب");
      let ancestor = parent;
      const seen = new Set<string>();
      while (ancestor) {
        if (ancestor.id === selected.id || seen.has(ancestor.id)) throw new Error("لا يمكن ربط الحساب بأحد حساباته الفرعية");
        seen.add(ancestor.id);
        ancestor = ancestor.parent_id ? byId.get(ancestor.parent_id) : undefined;
      }
      const { error } = await supabase.from("accounts")
        .update({ code: nextCode, type, parent_id: parentId || null })
        .eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success("تم حفظ الحساب وتحديث التقارير");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => setCollapsed((old) => {
    const next = new Set(old);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const renderNode = (a: Account, depth: number, visited: Set<string>): React.ReactNode => {
    if (visited.has(a.id)) return null;
    const nextVisited = new Set(visited).add(a.id);
    const kids = children.get(a.id) ?? [];
    const visible = !matching || `${a.code} ${a.name}`.toLocaleLowerCase().includes(matching)
      || kids.some((child) => includesMatch(child, nextVisited));
    if (!visible) return null;
    const heading = isRootAccount(a);
    const opened = matching || !collapsed.has(a.id);
    return (
      <div key={a.id}>
        <div className={`flex items-center gap-2 border-b border-border px-3 py-2 text-sm ${heading ? "bg-muted/60 font-semibold" : ""} ${selectedId === a.id ? "bg-primary/10" : ""}`}
          style={{ paddingInlineStart: `${12 + Math.min(depth, 8) * 16}px` }}>
          {kids.length ? (
            <Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label={opened ? "طي الحسابات الفرعية" : "عرض الحسابات الفرعية"} onClick={() => toggle(a.id)}>
              {opened ? <ChevronDown /> : <ChevronLeft />}
            </Button>
          ) : <span className="w-6 shrink-0" />}
          <button type="button" onClick={() => choose(a)} className="min-w-0 flex-1 text-start hover:text-primary" aria-label={`إعداد ${a.name}`}>
            <span className="num inline-block min-w-12 text-muted-foreground" dir="ltr">{a.code}</span>
            <span>{a.name}</span>
          </button>
          <span className="hidden sm:inline text-xs text-muted-foreground">{heading ? "رئيسي" : kids.length ? "مجموعة" : "فرعي"}</span>
          <span className="hidden md:inline text-xs text-muted-foreground">{a.parent_id ? byId.get(a.parent_id)?.name ?? "—" : labels[a.type]}</span>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`تعديل ${a.name}`} onClick={() => choose(a)}><Pencil /></Button>
        </div>
        {opened && kids.map((child) => renderNode(child, depth + 1, nextVisited))}
      </div>
    );
  };

  const includesMatch = (a: Account, visited: Set<string>): boolean => {
    if (visited.has(a.id)) return false;
    if (`${a.code} ${a.name}`.toLocaleLowerCase().includes(matching)) return true;
    const next = new Set(visited).add(a.id);
    return (children.get(a.id) ?? []).some((child) => includesMatch(child, next));
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8" dir="rtl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">إعدادات شجرة الحسابات</h1>
        <p className="mt-1 text-sm text-muted-foreground">تصنيف الحساب ورمزه وارتباطه بالحساب الأب</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 border border-border bg-card" aria-label="شجرة الحسابات">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالرمز أو اسم الحساب" aria-label="بحث الحسابات" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            <span className="text-xs text-muted-foreground num">{accounts.length}</span>
          </div>
          {isPending && <p className="p-5 text-sm text-muted-foreground">جارٍ تحميل الحسابات...</p>}
          {error && <p className="p-5 text-sm text-destructive">تعذر تحميل الحسابات: {error.message}</p>}
          {!isPending && !error && order.map((category) => {
            const roots = accounts.filter((a) => a.type === category && (!a.parent_id || !byId.has(a.parent_id))).sort((a, b) => compareCode(a.code, b.code));
            return <div key={category}>
              <h2 className="border-b border-border bg-muted px-3 py-2 text-sm font-bold">{labels[category]}</h2>
              {roots.map((a) => renderNode(a, 0, new Set()))}
            </div>;
          })}
        </section>
        <aside className="h-fit border border-border bg-card p-4 lg:sticky lg:top-32" aria-label="تعديل الحساب">
          <h2 className="mb-4 font-semibold">بيانات الحساب</h2>
          {!selected ? <p className="text-sm text-muted-foreground">اختر حسابًا من الشجرة لعرض ارتباطه وتعديل بياناته.</p> : (
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
              <p className="text-sm font-medium">{selected.name}</p>
              <label className="block text-sm">رمز الحساب
                <input dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} disabled={isHeading || !permissions.has("accounts.edit")}
                  className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm disabled:opacity-60" />
              </label>
              <label className="block text-sm">التصنيف المحاسبي
                <select value={type} onChange={(e) => { const next = e.target.value as AccountType; setType(next); if (parentId && byId.get(parentId)?.type !== next) setParentId(""); }}
                  disabled={isHeading || hasChildren || !permissions.has("accounts.edit")}
                  className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm disabled:opacity-60">
                  {order.map((key) => <option key={key} value={key}>{labels[key]}</option>)}
                </select>
              </label>
              <label className="block text-sm">الحساب الأب
                <select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={isHeading || !permissions.has("accounts.edit")}
                  className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm disabled:opacity-60">
                  <option value="">بدون حساب أب ({labels[type]})</option>
                  {accounts.filter((a) => a.type === type && a.id !== selected.id && !isDescendant(a, selected.id, byId))
                    .sort((a, b) => compareCode(a.code, b.code)).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </label>
              <p className="text-xs text-muted-foreground">تغيير التصنيف أو الارتباط يعيد عرض أرصدة هذا الحساب في التقارير السابقة والحالية، دون تغيير القيود المسجلة.</p>
              {permissions.has("accounts.edit") && !isHeading && <Button type="submit" disabled={save.isPending || (code === selected.code && type === selected.type && parentId === (selected.parent_id ?? ""))} className="w-full">{save.isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}</Button>}
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}

function isDescendant(candidate: Account, accountId: string, byId: Map<string, Account>) {
  let current: Account | undefined = candidate;
  const visited = new Set<string>();
  while (current?.parent_id && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.parent_id === accountId) return true;
    current = byId.get(current.parent_id);
  }
  return false;
}