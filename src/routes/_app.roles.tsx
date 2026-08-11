import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/roles")({ component: RolesPage });

type Role = { id: string; name: string; description: string | null; is_system: boolean };
type Permission = { id: string; key: string; label: string; category: string };

function RolesPage() {
  const qc = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [showNew, setShowNew] = useState(false);

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => { const { data } = await supabase.from("roles").select("*").order("name"); return (data ?? []) as Role[]; },
  });
  const { data: permissions = [] } = useQuery({
    queryKey: ["permissions"],
    queryFn: async () => { const { data } = await supabase.from("permissions").select("*").order("category, key"); return (data ?? []) as Permission[]; },
  });
  const { data: rolePerms = [] } = useQuery({
    queryKey: ["role-permissions", selectedRole],
    enabled: !!selectedRole,
    queryFn: async () => { const { data } = await supabase.from("role_permissions").select("permission_id").eq("role_id", selectedRole!); return (data ?? []).map((r) => r.permission_id); },
  });

  const grouped = useMemo(() => {
    const g: Record<string, Permission[]> = {};
    permissions.forEach((p) => { (g[p.category] ??= []).push(p); });
    return g;
  }, [permissions]);

  const togglePerm = useMutation({
    mutationFn: async ({ permissionId, enabled }: { permissionId: string; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase.from("role_permissions").insert({ role_id: selectedRole!, permission_id: permissionId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("role_permissions").delete().eq("role_id", selectedRole!).eq("permission_id", permissionId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-permissions", selectedRole] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const createRole = useMutation({
    mutationFn: async (name: string) => { const { error } = await supabase.from("roles").insert({ name, is_system: false }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); toast.success("تم إنشاء الدور"); setNewRoleName(""); setShowNew(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRole = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("roles").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); setSelectedRole(null); toast.success("تم الحذف"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><ShieldCheck className="w-6 h-6" /> الأدوار والصلاحيات</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">الأدوار</h2>
            <button onClick={() => setShowNew(true)} className="text-primary text-sm flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> جديد</button>
          </div>
          {showNew && (
            <div className="mb-3 p-2 border rounded">
              <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="اسم الدور" className="w-full px-2 py-1.5 border rounded text-sm bg-background mb-2" />
              <div className="flex gap-2">
                <button onClick={() => createRole.mutate(newRoleName)} className="flex-1 bg-primary text-primary-foreground py-1.5 rounded text-sm">إضافة</button>
                <button onClick={() => { setShowNew(false); setNewRoleName(""); }} className="px-3 border rounded text-sm">إلغاء</button>
              </div>
            </div>
          )}
          <div className="space-y-1">
            {roles.map((r) => (
              <div key={r.id} className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer ${selectedRole === r.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setSelectedRole(r.id)}>
                <div>
                  <div className="text-sm font-medium">{r.name}</div>
                  {r.is_system && <div className="text-[10px] opacity-70">نظامي</div>}
                </div>
                {!r.is_system && (
                  <button onClick={(e) => { e.stopPropagation(); if (confirm("حذف الدور؟")) deleteRole.mutate(r.id); }} className="text-destructive p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-card border rounded-lg p-4">
          <h2 className="font-semibold mb-3">الصلاحيات {selectedRole && `(${rolePerms.length}/${permissions.length})`}</h2>
          {!selectedRole && <div className="text-center py-10 text-muted-foreground text-sm">اختر دوراً لعرض/تعديل صلاحياته</div>}
          {selectedRole && (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {Object.entries(grouped).map(([cat, perms]) => (
                <div key={cat}>
                  <div className="text-xs font-semibold text-muted-foreground mb-2">{cat}</div>
                  <div className="space-y-1">
                    {perms.map((p) => {
                      const enabled = rolePerms.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-muted cursor-pointer">
                          <input type="checkbox" checked={enabled} onChange={(e) => togglePerm.mutate({ permissionId: p.id, enabled: e.target.checked })} className="w-4 h-4" />
                          <div className="flex-1">
                            <div className="text-sm">{p.label}</div>
                            <div className="text-[10px] text-muted-foreground" dir="ltr">{p.key}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
