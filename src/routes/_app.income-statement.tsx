import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF, type Section } from "@/lib/export-utils";
import { ReportShell, StatementCard, BandRow, TotalRow, AccountTreeRows } from "@/components/report-shell";
import { buildAccountTree, pruneEmpty, totalOf, flattenTree, type AccountRow } from "@/lib/account-tree";

export const Route = createFileRoute("/_app/income-statement")({ component: IncomeStatementPage });

function IncomeStatementPage() {
  const { data } = useQuery({
    queryKey: ["income-statement"],
    queryFn: async () => {
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, code, name, type, parent_id")
        .order("code");
      const { data: lines } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit, journal_entries!inner(status)")
        .eq("journal_entries.status", "posted");
      const bal = new Map<string, number>();
      (lines ?? []).forEach((l: any) => {
        bal.set(l.account_id, (bal.get(l.account_id) ?? 0) + Number(l.debit) - Number(l.credit));
      });
      return { accounts: (accounts ?? []) as AccountRow[], bal };
    },
  });

  const accounts = data?.accounts ?? [];
  const bal = data?.bal ?? new Map<string, number>();

  const revenues = useMemo(
    () => pruneEmpty(buildAccountTree(accounts.filter((a) => a.type === "revenue"), (a) => -(bal.get(a.id) ?? 0))),
    [accounts, bal],
  );
  const expenses = useMemo(
    () => pruneEmpty(buildAccountTree(accounts.filter((a) => a.type === "expense"), (a) => bal.get(a.id) ?? 0)),
    [accounts, bal],
  );

  const totalRev = totalOf(revenues);
  const totalExp = totalOf(expenses);
  const netIncome = totalRev - totalExp;

  const sections = (): Section[] => {
    const rowsOf = (nodes: ReturnType<typeof pruneEmpty>) =>
      flattenTree(nodes).map(({ node, depth }) => [node.code, `${"— ".repeat(depth)}${node.name}`, node.amount]);
    return [
      { title: "الإيرادات", headers: ["الكود", "اسم الحساب", "المبلغ"], rows: rowsOf(revenues), totals: ["", "إجمالي الإيرادات", totalRev] },
      { title: "المصروفات", headers: ["الكود", "اسم الحساب", "المبلغ"], rows: rowsOf(expenses), totals: ["", "إجمالي المصروفات", totalExp] },
      { title: "النتيجة", headers: ["البيان", "", "المبلغ"], rows: [], totals: [netIncome >= 0 ? "صافي الربح" : "صافي الخسارة", "", Math.abs(netIncome)] },
    ];
  };

  return (
    <ReportShell
      title="قائمة الدخل"
      subtitle={`حتى ${new Date().toISOString().slice(0, 10)}`}
      onExcel={() => exportToExcel("income-statement", "قائمة الدخل", sections())}
      onPdf={() => exportToPDF("income-statement", "قائمة الدخل", sections())}
    >
      <StatementCard>
        <BandRow label="الإيرادات" />
        {revenues.length === 0 ? (
          <div className="px-4 py-2 text-[13px] text-muted-foreground">لا توجد بيانات</div>
        ) : (
          <AccountTreeRows nodes={revenues} />
        )}
        <TotalRow label="إجمالي الإيرادات" value={totalRev} tone="positive" />

        <BandRow label="المصروفات" />
        {expenses.length === 0 ? (
          <div className="px-4 py-2 text-[13px] text-muted-foreground">لا توجد بيانات</div>
        ) : (
          <AccountTreeRows nodes={expenses} />
        )}
        <TotalRow label="إجمالي المصروفات" value={totalExp} tone="negative" />

        <TotalRow
          label={netIncome >= 0 ? "صافي الربح" : "صافي الخسارة"}
          value={netIncome}
          strong
          tone={netIncome >= 0 ? "positive" : "negative"}
        />
      </StatementCard>
      <p className="text-[11px] text-muted-foreground">اضغط على الحساب الرئيسي لعرض الحسابات الفرعية بالتفصيل.</p>
    </ReportShell>
  );
}
