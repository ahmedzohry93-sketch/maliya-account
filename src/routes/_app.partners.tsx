import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/partners")({ component: PartnersPage });

type Partner = { id: string; code: string | null; name: string; type: "customer"|"supplier"|"both"; phone: string|null; email: string|null; is_active: boolean };

function PartnersPage() {
  const { permissions } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partner | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: partners = [] } = useQuery({
    queryKey: ["partners"],
    queryFn: async () => { const { data, error } = await supabase.from("partners").select("*").order("name"); if (error) throw error; return data as Partner[]; },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("partners").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["partners"] }); toast.success("تم الحذف"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const labels = { customer: "عميل", supplier: "مورد", both: "عميل ومورد" };

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold">العملاء والموردون</h1><p className="text-sm text-muted-foreground mt-1">{partners.length} طرف</p></div>
        {permissions.has("partners.create") && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium">
            <Plus className="w-4 h-4" /> طرف جديد
          </button>
        )}
      </header>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr><th className="text-right px-4 py-3">الكود</th><th className="text-right px-4 py-3">الاسم</th><th className="text-right px-4 py-3">النوع</th><th className="text-right px-4 py-3">الهاتف</th><th className="text-right px-4 py-3">البريد</th><th className="w-20"></th></tr>
          </thead>
          <tbody>
            {partners.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">لا توجد بيانات</td></tr>}
            {partners.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2.5 num">{p.code || "—"}</td>
                <td className="px-4 py-2.5">{p.name}</td>
                <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded bg-secondary">{labels[p.type]}</span></td>
                <td className="px-4 py-2.5 num text-muted-foreground" dir="ltr">{p.phone || "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground" dir="ltr">{p.email || "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-end">
                    {permissions.has("partners.edit") && <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5" /></button>}
                    {permissions.has("partners.delete") && <button onClick={() => { if (confirm("حذف؟")) del.mutate(p.id); }} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <PartnerForm partner={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { qc.invalidateQueries({ queryKey: ["partners"] }); setShowForm(false); setEditing(null); }} />}
    </div>
  );
}

function PartnerForm({ partner, onClose, onSaved }: { partner: Partner | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: partner?.code ?? "", name: partner?.name ?? "", type: partner?.type ?? "customer" as Partner["type"],
    phone: partner?.phone ?? "", email: partner?.email ?? "", is_active: partner?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, code: form.code || null, phone: form.phone || null, email: form.email || null };
      const { error } = partner ? await supabase.from("partners").update(payload).eq("id", partner.id) : await supabase.from("partners").insert(payload);
      if (error) throw error;
      toast.success(partner ? "تم التحديث" : "تم الإنشاء"); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{partner ? "تعديل" : "طرف جديد"}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium block mb-1">الكود</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background" /></div>
            <div><label className="text-xs font-medium block mb-1">النوع</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Partner["type"] })} className="w-full px-3 py-2 border rounded-md bg-background">
                <option value="customer">عميل</option><option value="supplier">مورد</option><option value="both">عميل ومورد</option>
              </select>
            </div>
          </div>
          <div><label className="text-xs font-medium block mb-1">الاسم</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 border rounded-md bg-background" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium block mb-1">الهاتف</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background" dir="ltr" /></div>
            <div><label className="text-xs font-medium block mb-1">البريد</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background" dir="ltr" /></div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium">{saving ? "..." : "حفظ"}</button>
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}
