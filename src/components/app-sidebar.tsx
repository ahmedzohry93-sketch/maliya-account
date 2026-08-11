import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, BookOpen, ListTree, ScrollText, Scale, ShieldCheck, UserCog,
  Activity,
  Archive, LogOut, Wallet, TrendingUp, Landmark, Users, Truck, Droplets,
  ShoppingCart, Settings, Package, Building2, DatabaseBackup, Boxes, LifeBuoy,
  Calendar, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import logoUrl from "@/assets/logo.png";

type Item = { to: string; labelKey: string; icon: React.ComponentType<{ className?: string }>; perm?: string };
type Group = { titleKey: string; items: Item[] };

const GROUPS: Group[] = [
  {
    titleKey: "nav.group.main",
    items: [
      { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { to: "/finance-dashboard", labelKey: "nav.finance_dashboard", icon: Wallet, perm: "finance.dashboard.view" },
      { to: "/accounts", labelKey: "nav.accounts", icon: ListTree, perm: "accounts.view" },
      { to: "/journal", labelKey: "nav.journal", icon: BookOpen, perm: "journal.view" },
    ],
  },
  {
    titleKey: "nav.group.sales",
    items: [
      { to: "/customers", labelKey: "nav.customers", icon: Users, perm: "partners.view" },
      { to: "/suppliers", labelKey: "nav.suppliers", icon: Truck, perm: "partners.view" },
      { to: "/products", labelKey: "nav.products", icon: Package },
      { to: "/assets", labelKey: "nav.assets", icon: Boxes, perm: "assets.view" },
    ],
  },
  {
    titleKey: "nav.group.reports",
    items: [
      { to: "/ledger", labelKey: "nav.ledger", icon: ScrollText, perm: "ledger.view" },
      { to: "/trial-balance", labelKey: "nav.trial_balance", icon: Scale, perm: "trial_balance.view" },
      { to: "/trading-account", labelKey: "nav.trading_account", icon: ShoppingCart, perm: "trial_balance.view" },
      { to: "/income-statement", labelKey: "nav.income_statement", icon: TrendingUp, perm: "trial_balance.view" },
      { to: "/balance-sheet", labelKey: "nav.balance_sheet", icon: Landmark, perm: "trial_balance.view" },
      { to: "/cash-flow", labelKey: "nav.cash_flow", icon: Droplets, perm: "trial_balance.view" },
      { to: "/customers-statement", labelKey: "nav.customers_statement", icon: Users, perm: "partners.view" },
      { to: "/suppliers-statement", labelKey: "nav.suppliers_statement", icon: Truck, perm: "partners.view" },
    ],
  },
  {
    titleKey: "nav.group.banking",
    items: [
      { to: "/checks", labelKey: "nav.checks", icon: Wallet, perm: "checks.manage" },
      { to: "/recurring-obligations", labelKey: "nav.obligations", icon: Calendar, perm: "obligations.manage" },
      { to: "/bank-reconciliation", labelKey: "nav.bank_recon", icon: Building2, perm: "bank_recon.view" },
      { to: "/bank-accounts", labelKey: "nav.bank_accounts", icon: Landmark, perm: "bank_recon.view" },
      { to: "/bank-matching-rules", labelKey: "nav.bank_rules", icon: Settings, perm: "bank_recon.view" },
      { to: "/bank-reconciliation/reports", labelKey: "nav.bank_reports", icon: ScrollText, perm: "bank_recon.view" },
    ],
  },
  {
    titleKey: "nav.group.admin",
    items: [
      { to: "/settings", labelKey: "nav.settings", icon: Settings },
      { to: "/users", labelKey: "nav.users", icon: UserCog, perm: "users.manage" },
      { to: "/roles", labelKey: "nav.roles", icon: ShieldCheck, perm: "roles.manage" },
      { to: "/archive", labelKey: "nav.archive", icon: Archive },
      { to: "/audit-log", labelKey: "nav.audit", icon: Activity, perm: "audit.view" },
      { to: "/backup", labelKey: "nav.backup", icon: DatabaseBackup, perm: "backup.view" },
    ],
  },
];

export function AppSidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const { permissions, signOut } = useAuth();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || permissions.has(i.perm)) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 z-50 flex w-[264px] shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          "start-0 lg:z-auto",
          open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5">
          <img
            src={logoUrl}
            alt={t("app.title")}
            width={60}
            height={60}
            className="rounded-2xl scale-[1.06] object-cover ring-1 ring-sidebar-primary/40 shadow-lg shadow-black/30"
            style={{ width: 60, height: 60 }}
          />
          <div className="min-w-0 leading-tight">
            <div className="text-xl font-extrabold tracking-tight text-sidebar-primary">{t("app.title")}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/55 truncate">
              {t("app.subtitle")}
            </div>
          </div>
          <button onClick={onClose} className="ms-auto lg:hidden p-1.5 rounded-md hover:bg-sidebar-accent">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
          {groups.map((g) => (
            <div key={g.titleKey}>
              <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40">
                {t(g.titleKey)}
              </div>
              <div className="space-y-px">
                {g.items.map((it) => {
                  const active = pathname === it.to || pathname.startsWith(it.to + "/");
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      onClick={onClose}
                      className={cn(
                        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-primary font-semibold"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                      )}
                    >
                      {active && (
                        <span className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-sidebar-primary" />
                      )}
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{t(it.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 space-y-1.5">
          <div className="flex items-center justify-between rounded-xl bg-sidebar-accent/60 px-3 py-2 text-[11px] text-sidebar-foreground/70">
            <span>{t("common.fiscal_year")}</span>
            <span className="num font-semibold text-sidebar-primary">{new Date().getFullYear()}</span>
          </div>
          <Link
            to="/settings"
            className="flex items-center gap-3 rounded-xl bg-sidebar-accent/40 px-3 py-2.5 text-[13px] hover:bg-sidebar-accent"
          >
            <LifeBuoy className="w-4 h-4" />
            {t("nav.help")}
          </Link>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 rounded-xl bg-sidebar-accent/40 px-3 py-2.5 text-[13px] hover:bg-destructive/20 hover:text-destructive-foreground"
          >
            <LogOut className="w-4 h-4" />
            {t("common.logout")}
          </button>
        </div>
      </aside>
    </>
  );
}
