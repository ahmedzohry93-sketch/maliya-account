import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, BookOpen, ListTree, ScrollText, Scale, ShieldCheck, UserCog,
  Activity, Archive, LogOut, Wallet, TrendingUp, Landmark, Users, Truck, Droplets,
  ShoppingCart, Settings, Package, Building2, DatabaseBackup, Boxes,
  Calendar, ChevronDown, Menu, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Item = { to: string; labelKey: string; icon: React.ComponentType<{ className?: string }>; perm?: string };
type Group = { titleKey: string; icon: React.ComponentType<{ className?: string }>; items: Item[] };

/** Re-organised from the existing sidebar groups. No new routes are introduced. */
export const NAV_GROUPS: Group[] = [
  {
    titleKey: "nav.group.main",
    icon: LayoutDashboard,
    items: [
      { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { to: "/finance-dashboard", labelKey: "nav.finance_dashboard", icon: Wallet, perm: "finance.dashboard.view" },
    ],
  },
  {
    titleKey: "nav.group.accounting",
    icon: BookOpen,
    items: [
      { to: "/accounts", labelKey: "nav.accounts", icon: ListTree, perm: "accounts.view" },
      { to: "/journal", labelKey: "nav.journal", icon: BookOpen, perm: "journal.view" },
      { to: "/ledger", labelKey: "nav.ledger", icon: ScrollText, perm: "ledger.view" },
      { to: "/assets", labelKey: "nav.assets", icon: Boxes, perm: "assets.view" },
    ],
  },
  {
    titleKey: "nav.group.customers",
    icon: Users,
    items: [
      { to: "/customers", labelKey: "nav.customers", icon: Users, perm: "partners.view" },
      { to: "/customers-statement", labelKey: "nav.customers_statement", icon: ScrollText, perm: "partners.view" },
    ],
  },
  {
    titleKey: "nav.group.suppliers",
    icon: Truck,
    items: [
      { to: "/suppliers", labelKey: "nav.suppliers", icon: Truck, perm: "partners.view" },
      { to: "/suppliers-statement", labelKey: "nav.suppliers_statement", icon: ScrollText, perm: "partners.view" },
    ],
  },
  {
    titleKey: "nav.group.inventory",
    icon: Package,
    items: [
      { to: "/products", labelKey: "nav.products", icon: Package },
    ],
  },
  {
    titleKey: "nav.group.banks",
    icon: Landmark,
    items: [
      { to: "/checks", labelKey: "nav.checks", icon: Wallet, perm: "checks.manage" },
      { to: "/recurring-obligations", labelKey: "nav.obligations", icon: Calendar, perm: "obligations.manage" },
      { to: "/bank-accounts", labelKey: "nav.bank_accounts", icon: Landmark, perm: "bank_recon.view" },
      { to: "/bank-reconciliation", labelKey: "nav.bank_recon", icon: Building2, perm: "bank_recon.view" },
      { to: "/bank-matching-rules", labelKey: "nav.bank_rules", icon: Settings, perm: "bank_recon.view" },
      { to: "/bank-reconciliation/reports", labelKey: "nav.bank_reports", icon: ScrollText, perm: "bank_recon.view" },
    ],
  },
  {
    titleKey: "nav.group.reports",
    icon: TrendingUp,
    items: [
      { to: "/trial-balance", labelKey: "nav.trial_balance", icon: Scale, perm: "trial_balance.view" },
      { to: "/trading-account", labelKey: "nav.trading_account", icon: ShoppingCart, perm: "trial_balance.view" },
      { to: "/income-statement", labelKey: "nav.income_statement", icon: TrendingUp, perm: "trial_balance.view" },
      { to: "/balance-sheet", labelKey: "nav.balance_sheet", icon: Landmark, perm: "trial_balance.view" },
      { to: "/cash-flow", labelKey: "nav.cash_flow", icon: Droplets, perm: "trial_balance.view" },
    ],
  },
  {
    titleKey: "nav.group.settings",
    icon: Settings,
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

export function AppTopNav() {
  const { permissions, signOut } = useAuth();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || permissions.has(i.perm)) }))
    .filter((g) => g.items.length > 0);

  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(groups.length);
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const measure = measureRef.current;
    if (!bar || !measure) return;
    const recompute = () => {
      const widths = Array.from(measure.children).map((c) => (c as HTMLElement).offsetWidth + 4);
      const avail = bar.clientWidth;
      const moreW = 110;
      let used = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        const remaining = widths.length - i - 1;
        const need = used + widths[i] + (remaining > 0 ? moreW : 0);
        if (need <= avail) {
          used += widths[i];
          count++;
        } else break;
      }
      setVisibleCount(count);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [groups.length, t]);

  useEffect(() => {
    const close = () => setOpen(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    setOpen(null);
    setMobileOpen(false);
  }, [pathname]);

  const isActiveItem = (to: string) => pathname === to || pathname.startsWith(to + "/");
  const isActiveGroup = (g: Group) => g.items.some((i) => isActiveItem(i.to));

  const visible = groups.slice(0, visibleCount);
  const overflow = groups.slice(visibleCount);

  return (
    <div className="border-b bg-card">
      {/* Hidden measurement row */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute -z-10 flex whitespace-nowrap"
      >
        {groups.map((g) => (
          <span key={g.titleKey} className="px-3 py-2 text-[13px] font-medium inline-flex items-center gap-2">
            <span className="w-4 h-4" />
            {t(g.titleKey)}
            <span className="w-3.5 h-3.5" />
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1 px-2 md:px-4">
        {/* Mobile toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setMobileOpen((v) => !v); }}
          className="lg:hidden my-1.5 grid h-9 w-9 place-items-center rounded-lg border hover:bg-muted"
          aria-label={t("nav.more")}
        >
          {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        <div ref={barRef} className="hidden lg:flex min-w-0 flex-1 items-center overflow-hidden">
          {visible.map((g) => (
            <GroupButton
              key={g.titleKey}
              group={g}
              open={open === g.titleKey}
              active={isActiveGroup(g)}
              isActiveItem={isActiveItem}
              onToggle={() => setOpen((o) => (o === g.titleKey ? null : g.titleKey))}
            />
          ))}
          {overflow.length > 0 && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setOpen((o) => (o === "__more" ? null : "__more")); }}
                className={cn(
                  "inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  overflow.some(isActiveGroup)
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/75 hover:bg-muted",
                )}
              >
                <MoreHorizontal className="w-4 h-4" />
                {t("nav.more")}
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </button>
              {open === "__more" && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-full z-50 mt-1 end-0 min-w-[240px] rounded-xl border bg-popover p-1.5 shadow-lg"
                >
                  {overflow.map((g) => (
                    <div key={g.titleKey} className="py-1">
                      <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {t(g.titleKey)}
                      </div>
                      {g.items.map((it) => (
                        <NavItemLink key={it.to} item={it} active={isActiveItem(it.to)} />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 lg:hidden" />

        <button
          onClick={() => signOut()}
          className="my-1.5 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden md:inline">{t("common.logout")}</span>
        </button>
      </div>

      {/* Mobile stacked menu */}
      {mobileOpen && (
        <div className="lg:hidden max-h-[70vh] overflow-y-auto border-t px-3 py-2 space-y-3">
          {groups.map((g) => (
            <div key={g.titleKey}>
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t(g.titleKey)}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {g.items.map((it) => (
                  <NavItemLink key={it.to} item={it} active={isActiveItem(it.to)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupButton({
  group, open, active, isActiveItem, onToggle,
}: {
  group: Group;
  open: boolean;
  active: boolean;
  isActiveItem: (to: string) => boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const Icon = group.icon;
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={cn(
          "relative inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
          active ? "text-primary" : "text-foreground/75 hover:bg-muted",
          open && "bg-muted",
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {t(group.titleKey)}
        <ChevronDown className={cn("w-3.5 h-3.5 opacity-60 transition-transform", open && "rotate-180")} />
        {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full z-50 mt-1 start-0 min-w-[240px] rounded-xl border bg-popover p-1.5 shadow-lg"
        >
          {group.items.map((it) => (
            <NavItemLink key={it.to} item={it} active={isActiveItem(it.to)} />
          ))}
        </div>
      )}
    </div>
  );
}

function NavItemLink({ item, active }: { item: Item; active: boolean }) {
  const { t } = useI18n();
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
        active ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted",
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{t(item.labelKey)}</span>
    </Link>
  );
}
