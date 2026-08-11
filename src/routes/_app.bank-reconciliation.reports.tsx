import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileBarChart, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { exportToPDF, exportToExcel, type Section } from "@/lib/export-utils";

export const Route = createFileRoute("/_app/bank-reconciliation/reports")({ component: ReportsPage });

const REPORTS = [
  "reconciliation_statement",
  "outstanding_checks",
  "deposits_in_transit",
  "unmatched",
  "bank_charges",
  "history",
  "audit_trail",
] as const;
type ReportKey = typeof REPORTS[number];

function ReportsPage() {
  const { t, fmt } = useI18n();
  const { permissions } = useAuth();
  const canView = permissions.has("bank_recon.view");
  const [report, setReport] = useState<ReportKey>("reconciliation_statement");
  const [accountId, setAccountId] = useState("");

  const { data: accts = [] } = useQuery({
    queryKey: ["bank-accounts-all"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("id, name, gl_account_id").order("name");
      return data ?? [];
    },
    enabled: canView,
  });

  const { data: recons = [] } = useQuery({
    queryKey: ["all-recons"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_reconciliations")
        .select("*, bank_accounts(name)")
        .order("period_to", { ascending: false });
      return data ?? [];
    },
    enabled: canView,
  });

  const { data: lines = [] } = useQuery({
    queryKey: ["all-stmt-lines", accountId],
    queryFn: async () => {
      let q = supabase
        .from("bank_statement_lines")
        .select("*, bank_reconciliations!inner(bank_account_id, bank_accounts(name))");
      if (accountId) q = q.eq("bank_reconciliations.bank_account_id", accountId);
      const { data } = await q.order("txn_date", { ascending: false });
      return data ?? [];
    },
    enabled: canView,
  });

  const { data: audit = [] } = useQuery({
    queryKey: ["recon-audit"],
    queryFn: async () => {
      const { data } = await supabase.from("audit_logs").select("*").in("entity", ["bank_reconciliation", "bank_account"]).order("created_at", { ascending: false }).limit(200);
      return data ?? [];
    },
    enabled: canView && report === "audit_trail",
  });

  if (!canView) return <div className="p-8 text-muted-foreground">{t("bank_recon.no_perm")}</div>;

  const buildSections = (): Section[] => {
    if (report === "reconciliation_statement") {
      const rows = recons.map((r: any) => [
        r.bank_accounts?.name ?? "—",
        `${r.period_from} → ${r.period_to}`,
        Number(r.book_balance),
        Number(r.statement_balance),
        Number(r.difference),
        r.status,
      ]);
      return [{
        headers: [t("bank_recon.col_account"), t("bank_recon.col_period"), t("bank_recon.k_book"), t("bank_recon.k_stmt"), t("bank_recon.k_diff"), t("bank_recon.col_status")],
        rows,
      }];
    }
    if (report === "outstanding_checks") {
      const rows = lines.filter((l: any) => l.category === "outstanding_check").map((l: any) => [
        l.txn_date, l.description ?? "", l.reference ?? "", Number(l.debit) + Number(l.credit), l.match_status,
      ]);
      return [{ headers: [t("bank_recon.col_date"), t("bank_recon.col_desc"), t("bank_recon.col_ref"), t("bank_recon.amount"), t("bank_recon.col_status")], rows }];
    }
    if (report === "deposits_in_transit") {
      const rows = lines.filter((l: any) => l.category === "deposit_in_transit").map((l: any) => [
        l.txn_date, l.description ?? "", l.reference ?? "", Number(l.credit), l.match_status,
      ]);
      return [{ headers: [t("bank_recon.col_date"), t("bank_recon.col_desc"), t("bank_recon.col_ref"), t("bank_recon.amount"), t("bank_recon.col_status")], rows }];
    }
    if (report === "unmatched") {
      const rows = lines.filter((l: any) => l.match_status !== "matched").map((l: any) => [
        l.txn_date, l.description ?? "", l.reference ?? "",
        Number(l.debit) > 0 ? Number(l.debit) : "",
        Number(l.credit) > 0 ? Number(l.credit) : "",
        l.category ?? "",
      ]);
      return [{ headers: [t("bank_recon.col_date"), t("bank_recon.col_desc"), t("bank_recon.col_ref"), t("journal.debit"), t("journal.credit"), t("bank_recon.col_category")], rows }];
    }
    if (report === "bank_charges") {
      const rows = lines.filter((l: any) => l.category === "bank_charge").map((l: any) => [
        l.txn_date, l.description ?? "", Number(l.debit),
      ]);
      const total = rows.reduce((s, r) => s + Number(r[2] || 0), 0);
      return [{ headers: [t("bank_recon.col_date"), t("bank_recon.col_desc"), t("bank_recon.amount")], rows, totals: [t("journal.total"), "", total] }];
    }
    if (report === "history") {
      const rows = recons.map((r: any) => [
        r.bank_accounts?.name ?? "—", r.period_from, r.period_to, r.status,
        Number(r.book_balance), Number(r.statement_balance), Number(r.difference),
      ]);
      return [{
        headers: [t("bank_recon.col_account"), t("bank_recon.from"), t("bank_recon.to"), t("bank_recon.col_status"), t("bank_recon.k_book"), t("bank_recon.k_stmt"), t("bank_recon.k_diff")],
        rows,
      }];
    }
    if (report === "audit_trail") {
      const rows = audit.map((a: any) => [
        a.created_at?.slice(0, 19).replace("T", " "), a.action, a.entity, String(a.entity_id ?? ""),
      ]);
      return [{ headers: [t("bank_recon.col_date"), "Action", "Entity", "ID"], rows }];
    }
    return [];
  };

  const title = t(`bank_recon.report.${report}`);
  const sections = buildSections();

  return (
    <div className="p-4 md:p-6 max-w-[1300px] mx-auto space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><FileBarChart className="w-6 h-6 text-primary" /> {t("bank_recon.reports")}</h1>

      <div className="rounded-lg border bg-card p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">{t("bank_recon.report_type")}</div>
          <select className="border rounded-md bg-background px-3 py-2 text-sm" value={report} onChange={(e) => setReport(e.target.value as ReportKey)}>
            {REPORTS.map((r) => <option key={r} value={r}>{t(`bank_recon.report.${r}`)}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">{t("bank_recon.col_account")}</div>
          <select className="border rounded-md bg-background px-3 py-2 text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t("bank_recon.all_accounts")}</option>
            {accts.map((a: { id: string; name: string }) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => exportToExcel(title, title, sections)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          ><Download className="w-4 h-4" /> Excel</button>
          <button
            onClick={() => exportToPDF(title, title, sections)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm"
          ><Download className="w-4 h-4" /> PDF</button>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold">{title}</div>
        <div className="overflow-x-auto">
          {sections.map((sec, i) => (
            <table key={i} className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>{sec.headers.map((h, j) => <th key={j} className="text-start px-3 py-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {sec.rows.map((r, ri) => (
                  <tr key={ri} className="border-t">
                    {r.map((c, ci) => (
                      <td key={ci} className={`px-3 py-1.5 ${typeof c === "number" ? "text-end font-mono" : ""}`}>
                        {typeof c === "number" ? fmt(c) : String(c)}
                      </td>
                    ))}
                  </tr>
                ))}
                {sec.totals && (
                  <tr className="border-t-2 border-primary/50 bg-primary/5 font-semibold">
                    {sec.totals.map((c, ci) => (
                      <td key={ci} className={`px-3 py-2 ${typeof c === "number" ? "text-end font-mono" : ""}`}>
                        {typeof c === "number" ? fmt(c) : String(c)}
                      </td>
                    ))}
                  </tr>
                )}
                {sec.rows.length === 0 && (
                  <tr><td colSpan={sec.headers.length} className="text-center py-8 text-muted-foreground">—</td></tr>
                )}
              </tbody>
            </table>
          ))}
        </div>
      </div>
    </div>
  );
}
