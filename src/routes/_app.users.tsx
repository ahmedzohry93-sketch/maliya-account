import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createUser } from "@/lib/users.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/users")({ component: UsersPage });

function UsersPage() {
  const qc = useQueryClient();
  const { permissions } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const canManage = permissions.has("users.manage");

  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => { const { data } = await supabase.from("profiles").select("*").order("created_at"); return data ?? []; },
  });
  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => { const { data } = await supabase.from("roles").select("*").order("name"); return data ?? []; },
  });
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => { const { data } = await supabase.from("user_roles").select("user_id, role_id"); return data ?? []; },
  });

  const toggle = useMutation({
    mutationFn: async ({ userId, roleId, enabled }: { userId: string; roleId: string; enabled: boolean }) => {
      if (enabled) { const { error } = await supabase.from("user_roles").insert({ user_id: userId, role_id: roleId }); if (error) throw error; }
      else { const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role_id", roleId); if (error) throw error; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-roles"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">المستخدمون</h1>
        {canManage && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90">
            <Plus className="w-4 h-4" /> مستخدم جديد
          </button>
        )}
      </header>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-right px-4 py-3">الاسم</th>
              <th className="text-right px-4 py-3">البريد</th>
              {roles.map((r: any) => <th key={r.id} className="text-center px-3 py-3">{r.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {profiles.map((u: any) => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-2.5">{u.full_name || "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground" dir="ltr">{u.email}</td>
                {roles.map((r: any) => {
                  const has = userRoles.some((ur: any) => ur.user_id === u.id && ur.role_id === r.id);
                  return (
                    <td key={r.id} className="px-3 py-2.5 text-center">
                      <input type="checkbox" disabled={!canManage} checked={has} onChange={(e) => toggle.mutate({ userId: u.id, roleId: r.id, enabled: e.target.checked })} className="w-4 h-4" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <NewUserForm onClose={() => setShowForm(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["all-profiles"] }); setShowForm(false); }} />}
    </div>
  );
}

function NewUserForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const create = useServerFn(createUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await create({ data: { email, password, full_name: fullName } });
      toast.success("تم إنشاء المستخدم");
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
          <h3 className="font-semibold text-lg">مستخدم جديد</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1">الاسم الكامل</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-3 py-2 border rounded-md bg-background" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">البريد الإلكتروني</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 border rounded-md bg-background" dir="ltr" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">كلمة المرور</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full px-3 py-2 border rounded-md bg-background" dir="ltr" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium">
              {saving ? "..." : "إنشاء"}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">إلغاء</button>
          </div>
        </form>
        <p className="text-[11px] text-muted-foreground mt-3">سيُنشأ الحساب فوراً ومُفعّلاً. يمكنك تعيين الأدوار بعد الإنشاء.</p>
      </div>
    </div>
  );
}
