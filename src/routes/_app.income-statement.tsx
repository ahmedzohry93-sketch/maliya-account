import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF, type Section } from "@/lib/export-utils";
import { ReportShell, StatementCard, BandRow, TotalRow, TreeHeadRow, TreeToolbar, AccountTreeRows, pctText } from "@/components/report-shell";
import {
  buildAccountTree, pruneEmpty, totalOf, totalPrevOf, flattenTree, sortByCode, type AccountRow,
} from "@/lib/account-tree";
import { prevRange, periodLabel } from "@/lib/report-period";

export const Route = createFileRoute("/_app/income-statement")({ component: IncomeStatementPage });

async function balancesFor(from: string, to: string) {
  let q = supabase
    .from("journal_lines")
    .select("account_id, debit, credit, journal_entries!inner(status, entry_date)")
    .eq("journal_entries.status", "posted");
  if (from) q = q.gte("journal_entries.entry_date", from);
  if (to) q = q.lte("journal_entries.entry_date", to);
  const { data: lines } = await q;
  const bal = new Map<string, number>();
  (lines ?? []).forEach((l: any) => {
    bal.set(l.account_id, (bal.get(l.account_id) ?? 0) + Number(l.debit) - Number(l.credit));
  });
  return bal;
}

function IncomeStatementPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showZero, setShowZero] = useState(false);
  const [compare, setCompare] = useState(false);
  const [expandSignal, setExpandSignal] = useState(0);

  const prev = prevRange(from, to);
  const compareOn = compare && !!prev;

  const { data } = useQuery({
    queryKey: ["income-statement", from, to, compareOn],
    queryFn: async () => {
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, code, name, type, parent_id");
      const bal = await balancesFor(from, to);
      const prevBal = compareOn && prev ? await balancesFor(prev.from, prev.to) : new Map<string, number>();
      return { accounts: sortByCode((accounts ?? []) as AccountRow[]), bal, prevBal };
    },
  });

  const accounts = data?.accounts ?? [];
  const bal = data?.bal ?? new Map<string, number>();
  const prevBal = data?.prevBal ?? new Map<string, number>();

  const revenues = useMemo(() => {
    const t = buildAccountTree(
      accounts.filter((a) => a.type === "revenue"),
      (a) => -(bal.get(a.id) ?? 0),
      (a) => -(prevBal.get(a.id) ?? 0),
    );
    return showZero ? t : pruneEmpty(t);
  }, [accounts, bal, prevBal, showZero]);

  const expenses = useMemo(() => {
    const t = buildAccountTree(
      accounts.filter((a) => a.type === "expense"),
      (a) => bal.get(a.id) ?? 0,
      (a) => prevBal.get(a.id) ?? 0,
    );
    return showZero ? t : pruneEmpty(t);
  }, [accounts, bal, prevBal, showZero]);

  const totalRev = totalOf(revenues);
  const totalExp = totalOf(expenses);
  const netIncome = totalRev - totalExp;
  const prevRev = totalPrevOf(revenues);
  const prevExp = totalPrevOf(expenses);
  const prevNet = prevRev - prevExp;

  const headers = compareOn
    ? ["الكود", "اسم الحساب", "الفترة الحالية", "الفترة السابقة", "التغير %"]
    : ["الكود", "اسم الحساب", "المبلغ"];

  const rowsOf = (nodes: ReturnType<typeof pruneEmpty>) =>
    flattenTree(nodes).map(({ node, depth }) =>
      compareOn
        ? [node.code, `${"— ".repeat(depth)}${node.name}`, node.amount, node.prev, pctText(node.amount, node.prev)]
        : [node.code, `${"— ".repeat(depth)}${node.name}`, node.amount],
    );

  const totalsRow = (label: string, cur: number, p: number) =>
    compareOn ? ["", label, cur, p, pctText(cur, p)] : ["", label, cur];

  const sections = (): Section[] => [
    { title: "الإيرادات", headers, rows: rowsOf(revenues), totals: totalsRow("إجمالي الإيرادات", totalRev, prevRev) },
    { title: "المصروفات", headers, rows: rowsOf(expenses), totals: totalsRow("إجمالي المصروفات", totalExp, prevExp) },
    {
      title: "النتيجة",
      headers,
      rows: [],
      totals: totalsRow(netIncome >= 0 ? "صافي الربح" : "صافي الخسارة", netIncome, prevNet),
    },
  ];

  const meta = { subtitle: periodLabel(from, to) };

  return (
    <ReportShell
      title="قائمة الدخل"
      subtitle={periodLabel(from, to)}
      onExcel={() => exportToExcel("income-statement", "قائمة الدخل", sections(), meta)}
      onPdf={() => exportToPDF("income-statement", "قائمة الدخل", sections(), meta)}
      filters={
        <DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo}>
          {compareOn && prev && (
            <p className="text-[10px] text-muted-foreground num">الفترة السابقة: {prev.from} → {prev.to}</p>
          )}
        </DateRangeFields>
      }

    >
      <TreeToolbar
        onExpandAll={() => setExpandSignal((s) => Math.abs(s) + 1)}
        onCollapseAll={() => setExpandSignal((s) => -(Math.abs(s) + 1))}
        showZero={showZero}
        onShowZero={setShowZero}
        compare={compareOn}
        onCompare={setCompare}
        compareDisabled={!prev}
      />

      <StatementCard>
        <BandRow label="الإيرادات" />
        <TreeHeadRow compare={compareOn} />
        {revenues.length === 0 ? (
          <div className="px-4 py-2 text-[13px] text-muted-foreground">لا توجد بيانات</div>
        ) : (
          <AccountTreeRows nodes={revenues} compare={compareOn} expandSignal={expandSignal} />
        )}
        <TotalRow label="إجمالي الإيرادات" value={totalRev} tone="positive" compare={compareOn} prev={prevRev} />

        <BandRow label="المصروفات" />
        <TreeHeadRow compare={compareOn} />
        {expenses.length === 0 ? (
          <div className="px-4 py-2 text-[13px] text-muted-foreground">لا توجد بيانات</div>
        ) : (
          <AccountTreeRows nodes={expenses} compare={compareOn} expandSignal={expandSignal} />
        )}
        <TotalRow label="إجمالي المصروفات" value={totalExp} tone="negative" compare={compareOn} prev={prevExp} />

        <TotalRow
          label={netIncome >= 0 ? "صافي الربح" : "صافي الخسارة"}
          value={netIncome}
          strong
          tone={netIncome >= 0 ? "positive" : "negative"}
          compare={compareOn}
          prev={prevNet}
        />
      </StatementCard>
      <p className="text-[11px] text-muted-foreground">اضغط على الحساب الرئيسي لعرض الحسابات الفرعية بالتفصيل.</p>
    </ReportShell>
  );
}
