import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Landmark, Plus, Settings2, FileBarChart, CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_app/bank-reconciliation/")({ component: BankReconIndex });

type Recon = {
  id: string;
  bank_account_id: string;
  period_from: string;
  period_to: string;
  book_balance: number;
  statement_balance: number;
  difference: number;
  status: string;
  bank_accounts: { name: string; currency: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  imported: "bg-primary/10 text-primary",
  matching: "bg-warning/15 text-warning-foreground",
  matched: "bg-primary/15 text-primary",
  reviewed: "bg-accent/15 text-accent-foreground",
  approved: "bg-success/15 text-success",
  closed: "bg-foreground/10 text-foreground",
};

function BankReconIndex() {
  const { t, fmt } = useI18n();
  const { permissions } = useAuth();
  const canView = permissions.has("bank_recon.view");

  const { data: recons = [] } = useQuery({
    queryKey: ["bank-recons"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_reconciliations")
        .select("*, bank_accounts(name, currency)")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as unknown as Recon[];
    },
    enabled: canView,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts-count"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("id");
      return data ?? [];
    },
    enabled: canView,
  });

  const { data: stats } = useQuery({
    queryKey: ["bank-recon-stats"],
    queryFn: async () => {
      const { data: lines } = await supabase
        .from("bank_statement_lines")
        .select("match_status");
      const rows = lines ?? [];
      return {
        matched: rows.filter((r) => r.match_status === "matched").length,
        unmatched: rows.filter((r) => r.match_status === "unmatched").length,
        total: rows.length,
      };
    },
    enabled: canView,
  });

  if (!canView) {
    return (
      <div className="p-8 text-muted-foreground">{t("bank_recon.no_perm")}</div>
    );
  }

  const totalDiff = recons.reduce((s, r) => s + Number(r.difference || 0), 0);
  const rate = stats && stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" />
            {t("bank_recon.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("bank_recon.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/bank-accounts"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Landmark className="w-4 h-4" /> {t("bank_recon.bank_accounts")}
          </Link>
          <Link
            to="/bank-matching-rules"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Settings2 className="w-4 h-4" /> {t("bank_recon.rules")}
          </Link>
          <Link
            to="/bank-reconciliation/reports"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <FileBarChart className="w-4 h-4" /> {t("bank_recon.reports")}
          </Link>
          {permissions.has("bank_recon.create") && (
            <Link
              to="/bank-reconciliation/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> {t("bank_recon.new")}
            </Link>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label={t("bank_recon.k_matched")} value={fmt(stats?.matched ?? 0)} icon={<CheckCircle2 className="w-4 h-4 text-success" />} />
        <Kpi label={t("bank_recon.k_unmatched")} value={fmt(stats?.unmatched ?? 0)} icon={<AlertTriangle className="w-4 h-4 text-warning-foreground" />} />
        <Kpi label={t("bank_recon.k_diff")} value={fmt(totalDiff)} icon={<TrendingUp className="w-4 h-4 text-primary" />} />
        <Kpi label={t("bank_recon.k_accounts")} value={fmt(accounts.length)} icon={<Landmark className="w-4 h-4 text-primary" />} />
        <Kpi label={t("bank_recon.k_rate")} value={`${rate}%`} icon={<TrendingUp className="w-4 h-4 text-primary" />} />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold">{t("bank_recon.list_title")}</div>
          <div className="text-xs text-muted-foreground">{recons.length}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-start px-3 py-2">{t("bank_recon.col_account")}</th>
                <th className="text-start px-3 py-2">{t("bank_recon.col_period")}</th>
                <th className="text-end px-3 py-2">{t("bank_recon.col_book")}</th>
                <th className="text-end px-3 py-2">{t("bank_recon.col_stmt")}</th>
                <th className="text-end px-3 py-2">{t("bank_recon.col_diff")}</th>
                <th className="text-center px-3 py-2">{t("bank_recon.col_status")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {recons.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{r.bank_accounts?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.period_from} → {r.period_to}</td>
                  <td className="px-3 py-2 text-end font-mono">{fmt(Number(r.book_balance))}</td>
                  <td className="px-3 py-2 text-end font-mono">{fmt(Number(r.statement_balance))}</td>
                  <td className="px-3 py-2 text-end font-mono">
                    <span className={Math.abs(Number(r.difference)) < 0.01 ? "text-success" : "text-warning-foreground"}>
                      {fmt(Number(r.difference))}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[r.status] ?? "bg-muted"}`}>
                      {t(`bank_recon.status.${r.status}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-end">
                    <Link
                      to="/bank-reconciliation/$id"
                      params={{ id: r.id }}
                      className="text-primary hover:underline text-xs"
                    >
                      {t("common.open")}
                    </Link>
                  </td>
                </tr>
              ))}
              {recons.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-8">
                    {t("bank_recon.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon}
      </div>
      <div className="text-xl font-bold mt-1 font-mono">{value}</div>
    </div>
  );
}
