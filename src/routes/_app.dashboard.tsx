import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import {
  TrendingUp, TrendingDown, Wallet, Receipt, ShoppingCart, Users, Package, FileText,
  ArrowUpRight, ArrowDownRight, Activity,
} from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

type MonthAgg = { key: string; label: string; sales: number; expenses: number; invoices: number };

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function last12Months(): MonthAgg[] {
  const now = new Date();
  const out: MonthAgg[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: monthKey(d),
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      sales: 0,
      expenses: 0,
      invoices: 0,
    });
  }
  return out;
}

function Dashboard() {
  const { user } = useAuth();
  const { t, fmt } = useI18n();

  const startDate = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - 11, 1).toISOString().slice(0, 10);
  }, []);

  // Invoices over last 12 months (sales + purchase)
  const { data: invoiceStats } = useQuery({
    queryKey: ["dash-invoice-stats", startDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("type, invoice_date, total, status")
        .eq("status", "posted")
        .gte("invoice_date", startDate);
      const buckets = last12Months();
      const map = new Map(buckets.map((b) => [b.key, b]));
      let totalSales = 0;
      let totalExpenses = 0;
      let postedInvoices = 0;
      let draftInvoices = 0;
      (data ?? []).forEach((r: any) => {
        const d = new Date(r.invoice_date);
        const k = monthKey(d);
        const bucket = map.get(k);
        const amt = Number(r.total || 0);
        if (bucket) {
          if (r.type === "sale") bucket.sales += amt;
          else if (r.type === "purchase") bucket.expenses += amt;
          bucket.invoices += 1;
        }
        if (r.type === "sale") totalSales += amt;
        if (r.type === "purchase") totalExpenses += amt;
        if (r.status === "posted") postedInvoices += 1;
        else draftInvoices += 1;
      });
      return { series: buckets, totalSales, totalExpenses, postedInvoices, draftInvoices };
    },
  });

  // Counts
  const { data: counts } = useQuery({
    queryKey: ["dash-counts"],
    queryFn: async () => {
      const [partners, products, entries] = await Promise.all([
        supabase.from("partners").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("status", "posted"),
      ]);
      return {
        partners: partners.count ?? 0,
        products: products.count ?? 0,
        entries: entries.count ?? 0,
      };
    },
  });

  // Activity: entry_type distribution
  const { data: activity } = useQuery({
    queryKey: ["dash-activity", startDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("entry_type")
        .eq("status", "posted")
        .gte("entry_date", startDate);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        const k = r.entry_type || "general";
        counts[k] = (counts[k] || 0) + 1;
      });
      return Object.entries(counts).map(([k, v]) => ({
        key: k,
        label: t(`entry_type.${k}`) || k,
        value: v,
      }));
    },
  });

  const totalSales = invoiceStats?.totalSales ?? 0;
  const totalExpenses = invoiceStats?.totalExpenses ?? 0;
  const netProfit = totalSales - totalExpenses;
  const margin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
  const series = invoiceStats?.series ?? last12Months();

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
      {/* Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border bg-card px-4 py-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{t("dashboard.welcome")}</p>
          <h1 className="truncate text-lg font-bold tracking-tight md:text-xl">
            {(user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email}
          </h1>
        </div>

        <div className="flex shrink-0 gap-2">
          <Link
            to="/customers"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Receipt className="w-4 h-4" />
            {t("dashboard.new_sale")}
          </Link>
          <Link
            to="/journal"
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-[13px] font-medium hover:bg-muted"
          >
            <FileText className="w-4 h-4" />
            {t("dashboard.journal")}
          </Link>
        </div>
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t("dashboard.total_sales")}
          value={fmt(totalSales)}
          icon={TrendingUp}
          tone="success"
          hint={t("dashboard.last_12m")}
        />
        <KpiCard
          label={t("dashboard.total_expenses")}
          value={fmt(totalExpenses)}
          icon={TrendingDown}
          tone="destructive"
          hint={t("dashboard.last_12m")}
        />
        <KpiCard
          label={t("dashboard.net_profit")}
          value={fmt(netProfit)}
          icon={Wallet}
          tone={netProfit >= 0 ? "primary" : "destructive"}
          hint={`${margin.toFixed(1)}% ${t("dashboard.margin")}`}
        />
        <KpiCard
          label={t("dashboard.invoices_count")}
          value={fmt((invoiceStats?.postedInvoices ?? 0) + (invoiceStats?.draftInvoices ?? 0))}
          icon={Receipt}
          tone="accent"
          hint={`${fmt(invoiceStats?.postedInvoices ?? 0)} ${t("dashboard.posted_short")} · ${fmt(invoiceStats?.draftInvoices ?? 0)} ${t("dashboard.draft_short")}`}
        />
      </section>

      {/* Sales vs Expenses chart */}
      <Panel
        title={t("dashboard.sales_vs_expenses")}
        subtitle={t("dashboard.monthly_analysis")}
        right={
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
              {t("dashboard.sales")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-destructive" />
              {t("dashboard.expenses")}
            </span>
          </div>
        }
      >
        <div className="h-[300px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={60} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => fmt(v)}
              />
              <Bar dataKey="sales" name={t("dashboard.sales")} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={34} />
              <Bar dataKey="expenses" name={t("dashboard.expenses")} fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* Two column: activity + monthly invoices */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          title={t("dashboard.project_activity")}
          subtitle={t("dashboard.by_entry_type")}
          icon={Activity}
        >
          <div className="h-[280px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity ?? []} layout="vertical" margin={{ top: 5, right: 20, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={95}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" name={t("journal.count")} radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {(activity ?? []).map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        [
                          "hsl(var(--primary))",
                          "hsl(var(--accent))",
                          "hsl(var(--success, 142 71% 45%))",
                          "hsl(var(--destructive))",
                          "hsl(var(--warning, 38 92% 50%))",
                          "hsl(var(--muted-foreground))",
                        ][i % 6]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {(activity ?? []).length === 0 && (
            <p className="-mt-8 text-center text-xs text-muted-foreground">
              {t("dashboard.no_activity")}
            </p>
          )}
        </Panel>

        <Panel
          title={t("dashboard.invoices_per_month")}
          subtitle={t("dashboard.last_12m")}
          icon={Receipt}
        >
          <div className="h-[280px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={40} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="invoices" name={t("dashboard.invoices_count")} fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </section>

      {/* Bottom mini stats */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MiniStat label={t("dashboard.partners")} value={fmt(counts?.partners ?? 0)} icon={Users} />
        <MiniStat label={t("nav.products")} value={fmt(counts?.products ?? 0)} icon={Package} />
        <MiniStat label={t("dashboard.entries")} value={fmt(counts?.entries ?? 0)} icon={FileText} />
        <MiniStat
          label={t("dashboard.avg_invoice")}
          value={fmt(
            (invoiceStats?.postedInvoices ?? 0) + (invoiceStats?.draftInvoices ?? 0) > 0
              ? totalSales /
                  Math.max(1, (invoiceStats?.postedInvoices ?? 0) + (invoiceStats?.draftInvoices ?? 0))
              : 0,
          )}
          icon={ShoppingCart}
        />
      </section>
    </div>
  );
}

function Panel({
  title, subtitle, icon: Icon, right, children,
}: {
  title: string; subtitle?: string; icon?: any; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-muted/40 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="flex min-w-0 items-center gap-2 truncate text-[13px] font-bold tracking-tight">
            {Icon && <Icon className="w-4 h-4 shrink-0 text-primary" />}
            {title}
          </h2>
          {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function KpiCard({
  label, value, icon: Icon, tone, hint,
}: {
  label: string; value: string; icon: any;
  tone: "primary" | "success" | "destructive" | "accent"; hint?: string;
}) {
  const tones: Record<string, { bar: string; icon: string }> = {
    primary: { bar: "bg-primary", icon: "bg-primary/10 text-primary" },
    success: { bar: "bg-success", icon: "bg-success/10 text-success" },
    destructive: { bar: "bg-destructive", icon: "bg-destructive/10 text-destructive" },
    accent: { bar: "bg-accent", icon: "bg-accent/20 text-accent-foreground" },
  };
  const s = tones[tone];
  const isPositive = tone === "success" || tone === "primary";
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm">
      <span className={`absolute inset-y-0 start-0 w-1 ${s.bar}`} />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="num mt-1.5 text-xl font-bold tracking-tight md:text-2xl">{value}</div>
          {hint && <div className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</div>}
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${s.icon}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] text-muted-foreground">{label}</div>
        <div className="num truncate text-base font-bold">{value}</div>
      </div>
    </div>
  );
}
