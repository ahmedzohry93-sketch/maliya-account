import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Wallet, Landmark, ArrowDownRight, ArrowUpRight, AlertTriangle, RefreshCw,
  Receipt, TrendingUp, TrendingDown, Activity, FileDown, FileSpreadsheet, Printer,
  X, CheckCircle2, Clock, Calendar, Bell,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import {
  useReceivablesBuckets, usePayablesBuckets,
  useIncomingChecksBuckets, useOutgoingChecksBuckets,
  useRecurringDue, useCashBankBalances, useMonthlyFlow,
  type BucketStats, type Bucket, type DueRow,
} from "@/lib/finance-dashboard";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";
import { QuickActions } from "@/components/quick-actions";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/finance-dashboard")({
  component: FinanceDashboard,
});

const BUCKETS: Bucket[] = ["overdue", "today", "tomorrow", "week", "month", "future"];

const BUCKET_STYLE: Record<Bucket, { bg: string; text: string; ring: string; dot: string }> = {
  overdue:  { bg: "bg-destructive/10",  text: "text-destructive",  ring: "ring-destructive/30",  dot: "bg-destructive" },
  today:    { bg: "bg-orange-500/10",   text: "text-orange-600 dark:text-orange-400",   ring: "ring-orange-500/30",  dot: "bg-orange-500" },
  tomorrow: { bg: "bg-amber-500/10",    text: "text-amber-600 dark:text-amber-400",    ring: "ring-amber-500/30",   dot: "bg-amber-500" },
  week:     { bg: "bg-yellow-500/10",   text: "text-yellow-700 dark:text-yellow-400",  ring: "ring-yellow-500/30",  dot: "bg-yellow-500" },
  month:    { bg: "bg-primary/10",      text: "text-primary",      ring: "ring-primary/30",     dot: "bg-primary" },
  future:   { bg: "bg-emerald-500/10",  text: "text-emerald-600 dark:text-emerald-400",ring: "ring-emerald-500/30", dot: "bg-emerald-500" },
};

function FinanceDashboard() {
  const { t, fmt } = useI18n();
  const { permissions } = useAuth();
  const qc = useQueryClient();

  const canView = permissions.has("finance.dashboard.view");

  const recv = useReceivablesBuckets();
  const pay = usePayablesBuckets();
  const inChecks = useIncomingChecksBuckets();
  const outChecks = useOutgoingChecksBuckets();
  const oblig = useRecurringDue();
  const cashBank = useCashBankBalances();
  const flow = useMonthlyFlow();

  const [drawer, setDrawer] = useState<{
    title: string; rows: DueRow[]; bucket?: Bucket;
  } | null>(null);

  const notifications = useMemo(() => {
    const out: { level: "critical" | "warn" | "soon" | "info"; text: string }[] = [];
    if (recv.data?.overdue.count) {
      out.push({ level: "critical", text: `${recv.data.overdue.count} ${t("fin.overdue_recv")} · ${fmt(recv.data.overdue.amount)}` });
    }
    if (pay.data?.overdue.count) {
      out.push({ level: "critical", text: `${pay.data.overdue.count} ${t("fin.overdue_pay")} · ${fmt(pay.data.overdue.amount)}` });
    }
    if (recv.data?.today.count) {
      out.push({ level: "warn", text: `${recv.data.today.count} ${t("fin.recv_today")} · ${fmt(recv.data.today.amount)}` });
    }
    if (pay.data?.today.count) {
      out.push({ level: "warn", text: `${pay.data.today.count} ${t("fin.pay_today")} · ${fmt(pay.data.today.amount)}` });
    }
    if (inChecks.data?.today.count) {
      out.push({ level: "warn", text: `${inChecks.data.today.count} ${t("fin.incoming_checks")} · ${t("fin.bucket.today")}` });
    }
    if (outChecks.data?.today.count) {
      out.push({ level: "warn", text: `${outChecks.data.today.count} ${t("fin.outgoing_checks")} · ${t("fin.bucket.today")}` });
    }
    if (oblig.data?.tomorrow.count) {
      out.push({ level: "soon", text: `${oblig.data.tomorrow.count} ${t("fin.recurring")} · ${t("fin.bucket.tomorrow")}` });
    }
    if (oblig.data?.week.count) {
      out.push({ level: "info", text: `${oblig.data.week.count} ${t("fin.recurring")} · ${t("fin.bucket.week")}` });
    }
    return out;
  }, [recv.data, pay.data, inChecks.data, outChecks.data, oblig.data, t, fmt]);

  if (!canView) {
    return <div className="p-8 text-muted-foreground">{t("fin.no_perm")}</div>;
  }

  const openDrawer = (title: string, stats: BucketStats | undefined, bucket: Bucket) => {
    if (!stats) return;
    setDrawer({ title: `${title} · ${t(`fin.bucket.${bucket}`)}`, rows: stats[bucket].rows, bucket });
  };
  const openAll = (title: string, stats: BucketStats | undefined) => {
    if (!stats) return;
    const rows = BUCKETS.flatMap((b) => stats[b].rows);
    setDrawer({ title, rows });
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["fin-dash"] });

  return (
    <div className="w-full min-w-0 p-4 md:p-6 space-y-5">

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="w-7 h-7 text-primary" />
            {t("fin.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("fin.subtitle")}</p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-3.5 py-2 text-sm hover:bg-muted"
        >
          <RefreshCw className="w-4 h-4" />
          {t("fin.refresh")}
        </button>
      </header>

      <QuickActions />


      {/* Summary cards */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <SummaryCard label={t("fin.cash_balance")} value={fmt(cashBank.data?.cash ?? 0)} icon={Wallet} tone="primary" />
        <SummaryCard label={t("fin.bank_balance")} value={fmt(cashBank.data?.bank ?? 0)} icon={Landmark} tone="primary" />
        <SummaryCard label={t("fin.recv_today")}
          value={fmt(recv.data?.today.amount ?? 0)}
          sub={`${recv.data?.today.count ?? 0} ${t("fin.col.ref")}`}
          icon={ArrowDownRight} tone="warn"
          onClick={() => openDrawer(t("fin.receivables_due"), recv.data, "today")} />
        <SummaryCard label={t("fin.pay_today")}
          value={fmt(pay.data?.today.amount ?? 0)}
          sub={`${pay.data?.today.count ?? 0} ${t("fin.col.ref")}`}
          icon={ArrowUpRight} tone="warn"
          onClick={() => openDrawer(t("fin.payables_due"), pay.data, "today")} />
        <SummaryCard label={t("fin.overdue_recv")}
          value={fmt(recv.data?.overdue.amount ?? 0)}
          sub={`${recv.data?.overdue.count ?? 0} ${t("fin.col.ref")}`}
          icon={AlertTriangle} tone="danger"
          onClick={() => openDrawer(t("fin.receivables_due"), recv.data, "overdue")} />
        <SummaryCard label={t("fin.overdue_pay")}
          value={fmt(pay.data?.overdue.amount ?? 0)}
          sub={`${pay.data?.overdue.count ?? 0} ${t("fin.col.ref")}`}
          icon={AlertTriangle} tone="danger"
          onClick={() => openDrawer(t("fin.payables_due"), pay.data, "overdue")} />
        <SummaryCard label={t("fin.in_checks")}
          value={fmt(inChecks.data?.total.amount ?? 0)}
          sub={`${inChecks.data?.total.count ?? 0} ${t("fin.col.ref")}`}
          icon={Receipt} tone="primary"
          onClick={() => openAll(t("fin.incoming_checks"), inChecks.data)} />
        <SummaryCard label={t("fin.out_checks")}
          value={fmt(outChecks.data?.total.amount ?? 0)}
          sub={`${outChecks.data?.total.count ?? 0} ${t("fin.col.ref")}`}
          icon={Receipt} tone="primary"
          onClick={() => openAll(t("fin.outgoing_checks"), outChecks.data)} />
        <SummaryCard label={t("fin.monthly_collections")} value={fmt(flow.data?.collections ?? 0)} icon={TrendingUp} tone="success" />
        <SummaryCard label={t("fin.monthly_payments")} value={fmt(flow.data?.payments ?? 0)} icon={TrendingDown} tone="danger" />
        <SummaryCard label={t("fin.net_flow")}
          value={fmt(flow.data?.net ?? 0)}
          icon={Activity}
          tone={(flow.data?.net ?? 0) >= 0 ? "success" : "danger"} />
      </section>

      {/* Widgets */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BucketWidget
          title={t("fin.receivables_due")}
          icon={ArrowDownRight}
          stats={recv.data}
          onOpen={(b) => openDrawer(t("fin.receivables_due"), recv.data, b)}
          onOpenAll={() => openAll(t("fin.receivables_due"), recv.data)}
        />
        <BucketWidget
          title={t("fin.payables_due")}
          icon={ArrowUpRight}
          stats={pay.data}
          onOpen={(b) => openDrawer(t("fin.payables_due"), pay.data, b)}
          onOpenAll={() => openAll(t("fin.payables_due"), pay.data)}
        />
        <BucketWidget
          title={t("fin.incoming_checks")}
          icon={Receipt}
          stats={inChecks.data}
          onOpen={(b) => openDrawer(t("fin.incoming_checks"), inChecks.data, b)}
          onOpenAll={() => openAll(t("fin.incoming_checks"), inChecks.data)}
        />
        <BucketWidget
          title={t("fin.outgoing_checks")}
          icon={Receipt}
          stats={outChecks.data}
          onOpen={(b) => openDrawer(t("fin.outgoing_checks"), outChecks.data, b)}
          onOpenAll={() => openAll(t("fin.outgoing_checks"), outChecks.data)}
        />
      </section>

      <BucketWidget
        title={t("fin.recurring")}
        icon={Calendar}
        stats={oblig.data}
        onOpen={(b) => openDrawer(t("fin.recurring"), oblig.data, b)}
        onOpenAll={() => openAll(t("fin.recurring"), oblig.data)}
      />

      {/* Notification center */}
      <section className="bg-card border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-lg tracking-tight">{t("fin.notifications")}</h2>
        </div>
        {notifications.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            {t("fin.no_notifications")}
          </div>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n, i) => {
              const styles = {
                critical: "bg-destructive/10 text-destructive border-destructive/20",
                warn: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
                soon: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
                info: "bg-primary/10 text-primary border-primary/20",
              }[n.level];
              const icon = { critical: AlertTriangle, warn: Clock, soon: Calendar, info: Bell }[n.level];
              const Icon = icon;
              return (
                <li key={i} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm", styles)}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{n.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {drawer && (
        <DetailDrawer
          title={drawer.title}
          rows={drawer.rows}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label, value, sub, icon: Icon, tone, onClick,
}: {
  label: string; value: string; sub?: string; icon: any;
  tone: "primary" | "success" | "warn" | "danger";
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    primary: "from-primary/15 via-primary/5 to-transparent",
    success: "from-emerald-500/15 via-emerald-500/5 to-transparent",
    warn:    "from-orange-500/15 via-orange-500/5 to-transparent",
    danger:  "from-destructive/15 via-destructive/5 to-transparent",
  };
  const iconTones: Record<string, string> = {
    primary: "bg-primary/15 text-primary",
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    warn:    "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    danger:  "bg-destructive/15 text-destructive",
  };
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "relative rounded-2xl border bg-gradient-to-br p-4 text-start shadow-sm overflow-hidden transition-all",
        tones[tone],
        onClick && "hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
        !onClick && "cursor-default",
      )}
    >
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", iconTones[tone])}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
      <div className="text-xl md:text-2xl font-bold num tracking-tight mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </button>
  );
}

function BucketWidget({
  title, icon: Icon, stats, onOpen, onOpenAll,
}: {
  title: string;
  icon: any;
  stats?: BucketStats;
  onOpen: (b: Bucket) => void;
  onOpenAll: () => void;
}) {
  const { t, fmt } = useI18n();
  return (
    <div className="bg-card border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-base tracking-tight flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </h2>
        <button
          onClick={onOpenAll}
          className="text-xs font-medium text-primary hover:underline"
        >
          {t("fin.bucket.total")} · {fmt(stats?.total.amount ?? 0)}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {BUCKETS.map((b) => {
          const s = stats?.[b] ?? { count: 0, amount: 0 };
          const st = BUCKET_STYLE[b];
          const disabled = s.count === 0;
          return (
            <button
              key={b}
              disabled={disabled}
              onClick={() => onOpen(b)}
              className={cn(
                "rounded-xl ring-1 p-3 text-start transition-all",
                st.bg, st.ring,
                disabled ? "opacity-50 cursor-default" : "hover:shadow hover:-translate-y-0.5",
              )}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={cn("w-1.5 h-1.5 rounded-full", st.dot)} />
                <span className={cn("text-[11px] font-semibold uppercase tracking-wide", st.text)}>
                  {t(`fin.bucket.${b}`)}
                </span>
              </div>
              <div className="text-lg font-bold num">{fmt(s.amount)}</div>
              <div className="text-[11px] text-muted-foreground">{s.count} {t("fin.col.ref")}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DetailDrawer({ title, rows, onClose }: { title: string; rows: DueRow[]; onClose: () => void }) {
  const { t, fmt } = useI18n();

  const headers = [t("fin.col.ref"), t("fin.col.party"), t("fin.col.due"), t("fin.col.days"), t("fin.col.amount"), t("fin.col.status")];
  const dataRows = rows.map((r) => [r.ref, r.partyName, r.dueDate, r.daysLeft, r.amount, r.status ?? ""]);
  const total = rows.reduce((s, r) => s + r.amount, 0);

  const doExcel = () => exportToExcel(
    title.replace(/[·/\\]/g, "-"),
    title,
    [{ headers, rows: dataRows, totals: [t("fin.bucket.total"), "", "", "", total, ""] }],
  );
  const doPDF = () => exportToPDF(
    title.replace(/[·/\\]/g, "-"),
    title,
    [{ headers, rows: dataRows, totals: [t("fin.bucket.total"), "", "", "", total, ""] }],
  );

  return (
    <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-stretch justify-end" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl h-full bg-card border-s shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 border-b flex flex-wrap items-center gap-2">
          <button onClick={doPDF} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
            <FileDown className="w-3.5 h-3.5" /> {t("fin.export.pdf")}
          </button>
          <button onClick={doExcel} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
            <FileSpreadsheet className="w-3.5 h-3.5" /> {t("fin.export.excel")}
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
            <Printer className="w-3.5 h-3.5" /> {t("fin.export.print")}
          </button>
          <div className="ms-auto text-sm">
            <span className="text-muted-foreground me-2">{t("fin.bucket.total")}:</span>
            <span className="font-bold num">{fmt(total)}</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">—</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className={cn("px-3 py-2", i >= 3 ? "text-end" : "text-start")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = BUCKET_STYLE[r.bucket];
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{r.ref}</td>
                      <td className="px-3 py-2">{r.partyName}</td>
                      <td className="px-3 py-2">{r.dueDate}</td>
                      <td className="px-3 py-2 text-end">
                        <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium", st.bg, st.text)}>
                          {r.daysLeft < 0
                            ? t("fin.days_overdue").replace("{n}", String(-r.daysLeft))
                            : r.daysLeft === 0
                            ? t("fin.bucket.today")
                            : t("fin.days_left").replace("{n}", String(r.daysLeft))}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-end font-mono">{fmt(r.amount)}</td>
                      <td className="px-3 py-2 text-end text-xs text-muted-foreground">{r.status ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
