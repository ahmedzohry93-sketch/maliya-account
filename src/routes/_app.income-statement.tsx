import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF, type Section } from "@/lib/export-utils";
import { ReportShell, StatementCard, BandRow, LineRow, TotalRow } from "@/components/report-shell";


export const Route = createFileRoute("/_app/income-statement")({ component: IncomeStatementPage });

function IncomeStatementPage() {
  const { data } = useQuery({
    queryKey: ["income-statement"],
    queryFn: async () => {
      const { data: accounts } = await supabase.from("accounts").select("id, code, name, type, parent_id").order("code");
      const { data: lines } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit, journal_entries!inner(status)")
        .eq("journal_entries.status", "posted");
      const parentIds = new Set((accounts ?? []).map((a) => a.parent_id).filter(Boolean));
      const balByAcc = new Map<string, number>();
      (lines ?? []).forEach((l: any) => {
        balByAcc.set(l.account_id, (balByAcc.get(l.account_id) ?? 0) + Number(l.debit) - Number(l.credit));
      });
      const rows = (accounts ?? [])
        .filter((a) => !parentIds.has(a.id))
        .map((a) => {
          const debitMinusCredit = balByAcc.get(a.id) ?? 0;
          const bal = a.type === "revenue" ? -debitMinusCredit : debitMinusCredit;
          return { ...a, balance: bal };
        })
        .filter((a) => (a.type === "revenue" || a.type === "expense") && a.balance !== 0);
      return rows;
    },
  });

  const revenues = useMemo(() => (data ?? []).filter((a) => a.type === "revenue"), [data]);
  const expenses = useMemo(() => (data ?? []).filter((a) => a.type === "expense"), [data]);
  const totalRev = revenues.reduce((s, r) => s + r.balance, 0);
  const totalExp = expenses.reduce((s, r) => s + r.balance, 0);
  const netIncome = totalRev - totalExp;

  const sections = (): Section[] => [
    {
      title: "الإيرادات",
      headers: ["الكود", "اسم الحساب", "المبلغ"],
      rows: revenues.map((r) => [r.code, r.name, r.balance]),
      totals: ["", "إجمالي الإيرادات", totalRev],
    },
    {
      title: "المصروفات",
      headers: ["الكود", "اسم الحساب", "المبلغ"],
      rows: expenses.map((r) => [r.code, r.name, r.balance]),
      totals: ["", "إجمالي المصروفات", totalExp],
    },
    {
      title: "النتيجة",
      headers: ["البيان", "", "المبلغ"],
      rows: [],
      totals: [netIncome >= 0 ? "صافي الربح" : "صافي الخسارة", "", Math.abs(netIncome)],
    },
  ];

  return (
    <ReportShell
      title="قائمة الدخل"
      subtitle={`حتى ${new Date().toISOString().slice(0, 10)}`}
      onExcel={() => exportToExcel("income-statement", "قائمة الدخل", sections())}
      onPdf={() => exportToPDF("income-statement", "قائمة الدخل", sections())}
    >
      <StatementCard>
        <BandRow label="الإيرادات" />
        {revenues.length === 0 && <LineRow label="لا توجد بيانات" value="—" muted />}
        {revenues.map((r) => (
          <LineRow key={r.id} code={r.code} label={r.name} value={r.balance} />
        ))}
        <TotalRow label="إجمالي الإيرادات" value={totalRev} tone="positive" />

        <BandRow label="المصروفات" />
        {expenses.length === 0 && <LineRow label="لا توجد بيانات" value="—" muted />}
        {expenses.map((r) => (
          <LineRow key={r.id} code={r.code} label={r.name} value={-r.balance} />
        ))}
        <TotalRow label="إجمالي المصروفات" value={-totalExp} tone="negative" />

        <TotalRow
          label={netIncome >= 0 ? "صافي الربح" : "صافي الخسارة"}
          value={netIncome}
          strong
          tone={netIncome >= 0 ? "positive" : "negative"}
        />
      </StatementCard>
    </ReportShell>
  );
}

