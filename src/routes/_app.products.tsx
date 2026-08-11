import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, X, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/confirm-dialog";
import { archiveRecord, softDeleteRecord } from "@/lib/records";
import { useI18n } from "@/lib/i18n";

type Product = { id: string; sku: string | null; name: string; unit: string | null; sale_price: number; cost_price: number; stock_qty: number; tracks_inventory: boolean; is_active: boolean; notes: string | null };

function ProductsPage() {
  const { fmt } = useI18n();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("is_deleted", false).eq("is_archived", false).order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const confirm = useConfirm();
  const del = useMutation({
    mutationFn: async (id: string) => {
      const choice = await confirm({ title: "حذف الصنف", description: "لا يمكن التراجع عن هذه العملية." });
      if (!choice) return null;
      if (choice === "archive") await archiveRecord("products", id);
      else await softDeleteRecord("products", id);
      return choice;
    },
    onSuccess: (r) => {
      if (!r) return;
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(r === "archive" ? "تمت الأرشفة" : "تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? "").toLowerCase().includes(search.toLowerCase()));
  const totalValue = products.reduce((s, p) => s + Number(p.stock_qty) * Number(p.cost_price), 0);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المنتجات والمخزون</h1>
          <p className="text-sm text-muted-foreground mt-1">Products & Inventory · {products.length} منتج · قيمة المخزون: <span className="num font-semibold">{fmt(totalValue)}</span></p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium">
          <Plus className="w-4 h-4" /> منتج جديد
        </button>
      </header>

      <input placeholder="بحث بالاسم أو الكود" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full md:w-80 mb-4 px-3 py-2 border rounded-md bg-background text-sm" />

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-start px-4 py-3">الكود</th>
              <th className="text-start px-4 py-3">الاسم</th>
              <th className="text-start px-4 py-3">الوحدة</th>
              <th className="text-start px-4 py-3 w-24">سعر البيع</th>
              <th className="text-start px-4 py-3 w-24">التكلفة</th>
              <th className="text-start px-4 py-3 w-24">المخزون</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">لا توجد منتجات</td></tr>}
            {filtered.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2.5 num text-muted-foreground">{p.sku || "—"}</td>
                <td className="px-4 py-2.5 font-medium flex items-center gap-2"><Package className="w-3.5 h-3.5 text-muted-foreground" />{p.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.unit || "—"}</td>
                <td className="px-4 py-2.5 num">{fmt(Number(p.sale_price))}</td>
                <td className="px-4 py-2.5 num text-muted-foreground">{fmt(Number(p.cost_price))}</td>
                <td className={`px-4 py-2.5 num font-semibold ${Number(p.stock_qty) <= 0 ? "text-destructive" : ""}`}>{p.tracks_inventory ? Number(p.stock_qty).toLocaleString("en-US") : "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del.mutate(p.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <ProductForm product={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { qc.invalidateQueries({ queryKey: ["products"] }); setShowForm(false); setEditing(null); }} />}
    </div>
  );
}

function ProductForm({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    unit: product?.unit ?? "قطعة",
    sale_price: product?.sale_price ?? 0,
    cost_price: product?.cost_price ?? 0,
    stock_qty: product?.stock_qty ?? 0,
    tracks_inventory: product?.tracks_inventory ?? true,
    is_active: product?.is_active ?? true,
    notes: product?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, sku: form.sku || null, notes: form.notes || null };
      const { error } = product
        ? await supabase.from("products").update(payload).eq("id", product.id)
        : await supabase.from("products").insert(payload);
      if (error) throw error;
      toast.success(product ? "تم التحديث" : "تم الإنشاء");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{product ? "تعديل منتج" : "منتج جديد"}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium block mb-1">الكود</label><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background" /></div>
            <div><label className="text-xs font-medium block mb-1">الوحدة</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background" /></div>
          </div>
          <div><label className="text-xs font-medium block mb-1">الاسم *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 border rounded-md bg-background" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium block mb-1">سعر البيع</label><input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-md bg-background num" /></div>
            <div><label className="text-xs font-medium block mb-1">التكلفة</label><input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-md bg-background num" /></div>
            <div><label className="text-xs font-medium block mb-1">المخزون الحالي</label><input type="number" step="0.001" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-md bg-background num" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.tracks_inventory} onChange={(e) => setForm({ ...form, tracks_inventory: e.target.checked })} /> تتبّع المخزون (منع البيع فوق المتاح)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> نشط</label>
          <div><label className="text-xs font-medium block mb-1">ملاحظات</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-md bg-background" /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium">{saving ? "..." : "حفظ"}</button>
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/products")({
  component: ProductsPage,
});
