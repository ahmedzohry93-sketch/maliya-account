import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";
import { ReportShell, DateRangeFields, money } from "@/components/report-shell";
import { defaultPeriod, dayBefore, periodLabel } from "@/lib/report-period";

type LedgerSearch = { account?: string; from?: string; to?: string };

export const Route = createFileRoute("/_app/ledger")({
  component: LedgerPage,
  validateSearch: (s: Record<string, unknown>): LedgerSearch => ({
    account: typeof s.account === "string" ? s.account : undefined,
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
  }),
});

function LedgerPage() {
  const sp = Route.useSearch();
  const dp = defaultPeriod();
  const [accountId, setAccountId] = useState<string>(sp.account ?? "");
  const [from, setFrom] = useState<string>(sp.from ?? dp.from);
  const [to, setTo] = useState<string>(sp.to ?? dp.to);

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
        .select("id, debit, credit, description, journal_entries!inner(id, entry_no, entry_date, description, reference, status)")
        .eq("account_id", accountId)
        .eq("journal_entries.status", "posted");
      if (from) q = q.gte("journal_entries.entry_date", from);
      if (to) q = q.lte("journal_entries.entry_date", to);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });

  /** Balance carried over from all posted movement before the period start. */
  const { data: opening = 0 } = useQuery({
    queryKey: ["ledger-opening", accountId, from],
    enabled: !!accountId && !!from,
    queryFn: async () => {
      const cut = dayBefore(from);
      if (!cut) return 0;
      const { data } = await supabase
        .from("journal_lines")
        .select("debit, credit, journal_entries!inner(status, entry_date)")
        .eq("account_id", accountId)
        .eq("journal_entries.status", "posted")
        .lte("journal_entries.entry_date", cut);
      return (data ?? []).reduce((s: number, l: any) => s + Number(l.debit) - Number(l.credit), 0);
    },
  });

  const rows = useMemo(() => {
    let balance = Number(opening) || 0;
    return [...lines]
      .sort((a, b) =>
        a.journal_entries.entry_date === b.journal_entries.entry_date
          ? a.journal_entries.entry_no - b.journal_entries.entry_no
          : a.journal_entries.entry_date > b.journal_entries.entry_date ? 1 : -1,
      )
      .map((l) => {
        balance += Number(l.debit) - Number(l.credit);
        return { ...l, balance };
      });
  }, [lines, opening]);

  const totalDebit = rows.reduce((s, r: any) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r: any) => s + Number(r.credit), 0);
  const closing = rows.length ? rows[rows.length - 1].balance : Number(opening) || 0;

  const headers = ["التاريخ", "رقم القيد", "المرجع", "البيان", "مدين", "دائن", "الرصيد"];
  const exportRows = (): (string | number)[][] => [
    ["", "", "", "الرصيد الافتتاحي", "", "", Number(opening) || 0],
    ...rows.map((r: any) => [
      r.journal_entries.entry_date, `#${r.journal_entries.entry_no}`,
      r.journal_entries.reference || "",
      r.description || r.journal_entries.description || "",
      Number(r.debit) > 0 ? Number(r.debit) : "",
      Number(r.credit) > 0 ? Number(r.credit) : "",
      Number(r.balance),
    ]),
  ];
  const accName = accounts.find((a: any) => a.id === accountId);
  const title = accName ? `دفتر الأستاذ - ${accName.code} ${accName.name}` : "دفتر الأستاذ";
  const totalsRow = (): (string | number)[] => ["الإجمالي", "", "", "", totalDebit, totalCredit, closing];
  const sections = () => [{ headers, rows: exportRows(), totals: totalsRow() }];
  const meta = accName ? { subtitle: `${accName.code} - ${accName.name}`, date: `${from} → ${to}` } : undefined;

  return (
    <ReportShell
      title="دفتر الأستاذ"
      subtitle={accName ? `${accName.code} — ${accName.name} · ${periodLabel(from, to)}` : periodLabel(from, to)}
      onExcel={rows.length ? () => exportToExcel("ledger", title, sections(), meta) : undefined}
      onPdf={rows.length ? () => exportToPDF("ledger", title, sections(), meta) : undefined}
      filters={
        <DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo}>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">الحساب</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="inp h-8 w-full text-xs">
              <option value="">اختر حساب...</option>
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
        </DateRangeFields>
      }
    >
      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full text-[12px] md:text-[13px] min-w-[640px]">
          <thead className="bg-primary/8 text-[11px] font-bold text-primary">
            <tr>
              <th className="text-start px-3 py-2.5 border-b border-border">التاريخ</th>
              <th className="text-start px-3 py-2.5 border-b border-border">رقم القيد</th>
              <th className="text-start px-3 py-2.5 border-b border-border">المرجع</th>
              <th className="text-start px-3 py-2.5 border-b border-border">البيان</th>
              <th className="text-start px-3 py-2.5 border-b border-border w-24">مدين</th>
              <th className="text-start px-3 py-2.5 border-b border-border w-24">دائن</th>
              <th className="text-start px-3 py-2.5 border-b border-border w-28">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {!accountId && <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">اختر حساباً لعرض الحركة</td></tr>}
            {accountId && (
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td className="px-3 py-2" colSpan={4}>الرصيد الافتتاحي {from ? `(حتى ${dayBefore(from)})` : ""}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 num">{money(Number(opening) || 0)}</td>
              </tr>
            )}
            {accountId && rows.length === 0 && <tr className="border-t border-border"><td colSpan={7} className="text-center py-10 text-muted-foreground">لا توجد حركة خلال الفترة</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 num">{r.journal_entries.entry_date}</td>
                <td className="px-3 py-2 num">
                  <Link
                    to="/journal-entry/$id"
                    params={{ id: r.journal_entries.id }}
                    className="text-primary hover:underline"
                  >
                    #{r.journal_entries.entry_no}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.journal_entries.reference || "—"}</td>
                <td className="px-3 py-2">{r.description || r.journal_entries.description || "—"}</td>
                <td className="px-3 py-2 num">{Number(r.debit) > 0 ? money(Number(r.debit)) : ""}</td>
                <td className="px-3 py-2 num">{Number(r.credit) > 0 ? money(Number(r.credit)) : ""}</td>
                <td className="px-3 py-2 num font-medium">{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          {accountId && (
            <tfoot className="bg-primary/10 font-bold text-primary border-t-2 border-border">
              <tr>
                <td className="px-3 py-2.5" colSpan={4}>الإجمالي / الرصيد الختامي</td>
                <td className="px-3 py-2.5 num">{money(totalDebit)}</td>
                <td className="px-3 py-2.5 num">{money(totalCredit)}</td>
                <td className="px-3 py-2.5 num">{money(closing)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ReportShell>
  );
}
