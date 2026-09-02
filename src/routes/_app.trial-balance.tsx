import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";
import { DateRangeFields, ReportShell, ReportTable, RowMenu, money } from "@/components/report-shell";


export const Route = createFileRoute("/_app/trial-balance")({ component: TrialBalancePage });

function TrialBalancePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["trial-balance", from, to],
    queryFn: async () => {
      const { data: accounts } = await supabase.from("accounts").select("id, code, name, type").order("code");
      let q = supabase
        .from("journal_lines")
        .select("account_id, debit, credit, journal_entries!inner(status, entry_date)")
        .eq("journal_entries.status", "posted");
      if (from) q = q.gte("journal_entries.entry_date", from);
      if (to) q = q.lte("journal_entries.entry_date", to);
      const { data: lines } = await q;
      const map = new Map<string, { debit: number; credit: number }>();
      (lines ?? []).forEach((l: any) => {
        const cur = map.get(l.account_id) ?? { debit: 0, credit: 0 };
        cur.debit += Number(l.debit);
        cur.credit += Number(l.credit);
        map.set(l.account_id, cur);
      });
      return (accounts ?? []).map((a) => {
        const v = map.get(a.id) ?? { debit: 0, credit: 0 };
        const balance = v.debit - v.credit;
        return { ...a, debit: v.debit, credit: v.credit, balance };
      }).filter((r) => r.debit !== 0 || r.credit !== 0);
    },
  });

  const totals = useMemo(() => {
    return data.reduce((acc, r: any) => ({
      debit: acc.debit + r.debit,
      credit: acc.credit + r.credit,
      dr: acc.dr + (r.balance > 0 ? r.balance : 0),
      cr: acc.cr + (r.balance < 0 ? -r.balance : 0),
    }), { debit: 0, credit: 0, dr: 0, cr: 0 });
  }, [data]);

  const headers = ["الكود", "اسم الحساب", "مدين", "دائن", "رصيد مدين", "رصيد دائن"];
  const exportRows = (): (string | number)[][] => data.map((r: any) => [
    r.code, r.name, r.debit, r.credit,
    r.balance > 0 ? r.balance : "", r.balance < 0 ? -r.balance : "",
  ]);
  const totalsRow: (string | number)[] = ["", "الإجمالي", totals.debit, totals.credit, totals.dr, totals.cr];
  const sections = () => [{ headers, rows: exportRows(), totals: totalsRow }];

  return (
    <ReportShell
      title="ميزان المراجعة"
      subtitle={`كما في ${to || new Date().toISOString().slice(0, 10)} · من ${from || "..."}`}
      onExcel={() => exportToExcel("trial-balance", "ميزان المراجعة", sections())}
      onPdf={() => exportToPDF("trial-balance", "ميزان المراجعة", sections())}
      filters={
        <DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} />
      }
    >
      <ReportTable
        head={
          <tr>
            <th className="text-start px-4 py-2.5">رقم الحساب</th>
            <th className="text-start px-4 py-2.5">اسم الحساب</th>
            <th className="text-start px-4 py-2.5 w-28">مدين</th>
            <th className="text-start px-4 py-2.5 w-28">دائن</th>
            <th className="text-start px-4 py-2.5 w-28">رصيد مدين</th>
            <th className="text-start px-4 py-2.5 w-28">رصيد دائن</th>
          </tr>
        }
      >
        <tbody className="divide-y divide-border/60">
          {data.length === 0 && (
            <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">لا توجد بيانات (اعتمد قيوداً أولاً)</td></tr>
          )}
          {data.map((r: any) => (
            <tr key={r.id} className="hover:bg-muted/40">
              <td className="px-4 py-2 num text-muted-foreground">{r.code}</td>
              <td className="px-4 py-2">
                <span className="inline-flex items-center gap-1">
                  <RowMenu accountId={r.id} code={r.code} from={from} to={to} />
                  {r.name}
                </span>
              </td>
              <td className="px-4 py-2 num">{r.debit ? money(r.debit) : "-"}</td>
              <td className="px-4 py-2 num">{r.credit ? money(r.credit) : "-"}</td>
              <td className="px-4 py-2 num">{r.balance > 0 ? money(r.balance) : "-"}</td>
              <td className="px-4 py-2 num">{r.balance < 0 ? money(-r.balance) : "-"}</td>
            </tr>
          ))}
        </tbody>
        {data.length > 0 && (
          <tfoot className="bg-primary/10 font-bold text-primary border-t-2">
            <tr>
              <td colSpan={2} className="px-4 py-2.5">الإجمالي</td>
              <td className="px-4 py-2.5 num">{money(totals.debit)}</td>
              <td className="px-4 py-2.5 num">{money(totals.credit)}</td>
              <td className="px-4 py-2.5 num">{money(totals.dr)}</td>
              <td className="px-4 py-2.5 num">{money(totals.cr)}</td>
            </tr>
          </tfoot>
        )}
      </ReportTable>
    </ReportShell>
  );
}

