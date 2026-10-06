import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DocSheet, DocToolbar } from "@/components/document-sheet";

export const Route = createFileRoute("/_app/warehouses")({
  head: () => ({
    meta: [
      { title: "المخازن والفروع — أرصدة المخزون" },
      { name: "description", content: "إدارة المخازن والفروع وعرض رصيد كل صنف في كل مخزن." },
      { property: "og:title", content: "المخازن والفروع" },
      { property: "og:description", content: "أرصدة المخزون حسب المخزن والفرع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WarehousesPage,
});

function WarehousesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"warehouse" | "branch">("warehouse");
  const { data } = useQuery({
    queryKey: ["warehouses", "stock"],
    queryFn: async () => {
      const [{ data: wh }, { data: moves }, { data: products }] = await Promise.all([
        supabase.from("warehouses").select("*").order("created_at"),
        supabase.from("stock_moves").select("product_id, warehouse_id, qty"),
        supabase.from("products").select("id, name, unit").eq("is_deleted", false).order("name"),
      ]);
      const main = wh?.[0]?.id;
      const bal: Record<string, Record<string, number>> = {};
      for (const m of moves ?? []) {
        const w = m.warehouse_id ?? main;
        if (!w) continue;
        bal[m.product_id] ??= {};
        bal[m.product_id][w] = (bal[m.product_id][w] ?? 0) + Number(m.qty);
      }
      return { wh: wh ?? [], products: products ?? [], bal };
    },
  });

  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("warehouses").insert({ name: name.trim(), kind });
    if (error) return toast.error(error.message);
    setName("");
    qc.invalidateQueries({ queryKey: ["warehouses"] });
    toast.success("تمت الإضافة");
  }

  const wh = data?.wh ?? [];
  return (
    <div className="p-3 md:p-6">
      <DocToolbar title="المخازن والفروع" />
      <div className="doc-noprint mx-auto mb-3 grid max-w-[1000px] grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
        <input className="inp" placeholder="اسم المخزن أو الفرع" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="inp" value={kind} onChange={(e) => setKind(e.target.value as "warehouse" | "branch")}>
          <option value="warehouse">مخزن</option><option value="branch">فرع</option>
        </select>
        <button className="doc-btn doc-btn-primary" onClick={add}><Plus className="h-4 w-4" />إضافة</button>
      </div>
      <DocSheet title="أرصدة المخزون حسب المخزن" signatures={[]}>
        <table>
          <thead><tr><th>الصنف</th><th>الوحدة</th>{wh.map((w) => <th key={w.id}>{w.name}{w.kind === "branch" ? " (فرع)" : ""}</th>)}<th>الإجمالي</th></tr></thead>
          <tbody>
            {(data?.products ?? []).map((p) => {
              const b = data!.bal[p.id] ?? {};
              const tot = Object.values(b).reduce((s, v) => s + v, 0);
              return <tr key={p.id}><td>{p.name}</td><td>{p.unit ?? ""}</td>{wh.map((w) => <td key={w.id} className="num">{b[w.id] ?? 0}</td>)}<td className="num"><b>{tot}</b></td></tr>;
            })}
          </tbody>
        </table>
      </DocSheet>
    </div>
  );
}
