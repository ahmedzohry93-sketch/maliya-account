import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";
import { ReportShell } from "@/components/report-shell";

export const Route = createFileRoute("/_app/ledger")({ component: LedgerPage });

function LedgerPage() {
  const [accountId, setAccountId] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts-list"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, code, name").order("code");
      return data ?? [];
    },
  });

  const { data: lines = [] } = useQuery({
    queryKey: ["ledger", accountId, from, to],
    enabled: !!accountId,
    queryFn: async () => {
      let q = supabase
        .from("journal_lines")
        .select("id, debit, credit, description, journal_entries!inner(id, entry_no, entry_date, description, status)")
        .eq("account_id", accountId)
        .eq("journal_entries.status", "posted");
      if (from) q = q.gte("journal_entries.entry_date", from);
      if (to) q = q.lte("journal_entries.entry_date", to);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });

  const rows = useMemo(() => {
    let balance = 0;
    return [...lines]
      .sort((a, b) => (a.journal_entries.entry_date > b.journal_entries.entry_date ? 1 : -1))
      .map((l) => {
        balance += Number(l.debit) - Number(l.credit);
        return { ...l, balance };
      });
  }, [lines]);

  const headers = ["التاريخ", "رقم القيد", "البيان", "مدين", "دائن", "الرصيد"];
  const exportRows = (): (string | number)[][] => rows.map((r: any) => [
    r.journal_entries.entry_date, `#${r.journal_entries.entry_no}`,
    r.description || r.journal_entries.description || "",
    Number(r.debit) > 0 ? Number(r.debit) : "",
    Number(r.credit) > 0 ? Number(r.credit) : "",
    Number(r.balance),
  ]);
  const accName = accounts.find((a: any) => a.id === accountId);
  const title = accName ? `دفتر الأستاذ - ${accName.code} ${accName.name}` : "دفتر الأستاذ";
  const totalsRow = (): (string | number)[] => {
    const td = rows.reduce((s, r: any) => s + Number(r.debit), 0);
    const tc = rows.reduce((s, r: any) => s + Number(r.credit), 0);
    return ["الإجمالي", "", "", td, tc, rows.length ? rows[rows.length - 1].balance : 0];
  };
  const sections = () => [{ headers, rows: exportRows(), totals: totalsRow() }];
  const meta = accName ? { subtitle: `${accName.code} - ${accName.name}`, date: from && to ? `${from} → ${to}` : undefined } : undefined;

  return (
    <ReportShell
      title="دفتر الأستاذ"
      subtitle={accName ? `${accName.code} — ${accName.name} · من ${from || "..."} إلى ${to || "..."}` : `من ${from || "..."} إلى ${to || "..."}`}
      onExcel={rows.length ? () => exportToExcel("ledger", title, sections(), meta) : undefined}
      onPdf={rows.length ? () => exportToPDF("ledger", title, sections(), meta) : undefined}
      filters={
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1">الحساب</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="inp w-full">
              <option value="">اختر حساب...</option>
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">من تاريخ</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="inp" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">إلى تاريخ</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="inp" />
          </div>
        </div>
      }
    >
      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-right px-4 py-3">التاريخ</th>
              <th className="text-right px-4 py-3">رقم القيد</th>
              <th className="text-right px-4 py-3">البيان</th>
              <th className="text-right px-4 py-3 w-28">مدين</th>
              <th className="text-right px-4 py-3 w-28">دائن</th>
              <th className="text-right px-4 py-3 w-28">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {!accountId && <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">اختر حساباً لعرض الحركة</td></tr>}
            {accountId && rows.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">لا توجد حركة</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2.5 num">{r.journal_entries.entry_date}</td>
                <td className="px-4 py-2.5 num">
                  <Link
                    to="/journal-entry/$id"
                    params={{ id: r.journal_entries.id }}
                    className="text-primary hover:underline"
                  >
                    #{r.journal_entries.entry_no}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{r.description || r.journal_entries.description || "—"}</td>
                <td className="px-4 py-2.5 num">{Number(r.debit) > 0 ? Number(r.debit).toFixed(2) : ""}</td>
                <td className="px-4 py-2.5 num">{Number(r.credit) > 0 ? Number(r.credit).toFixed(2) : ""}</td>
                <td className="px-4 py-2.5 num font-medium">{r.balance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}
