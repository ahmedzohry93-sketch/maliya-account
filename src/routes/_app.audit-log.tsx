import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/audit-log")({ component: AuditPage });

function AuditPage() {
  const { data = [] } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => { const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200); return data ?? []; },
  });

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">سجل التدقيق</h1>
      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr><th className="text-right px-4 py-3">الوقت</th><th className="text-right px-4 py-3">العملية</th><th className="text-right px-4 py-3">الكيان</th><th className="text-right px-4 py-3">التفاصيل</th></tr>
          </thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">لا يوجد سجل</td></tr>}
            {data.map((l: any) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-2.5 num text-xs" dir="ltr">{new Date(l.created_at).toLocaleString()}</td>
                <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded bg-secondary">{l.action}</span></td>
                <td className="px-4 py-2.5">{l.entity}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.details ? JSON.stringify(l.details).slice(0, 100) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
