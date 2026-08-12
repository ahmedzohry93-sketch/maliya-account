import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-nav-group]")) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("pointerdown", onDown as EventListener);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown as EventListener);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    setOpen(null);
    setMobileOpen(false);
    setMobileGroup(null);
  }, [pathname]);

  const isActiveItem = (to: string) => pathname === to || pathname.startsWith(to + "/");
  const isActiveGroup = (g: Group) => g.items.some((i) => isActiveItem(i.to));

  return (
    <div className="border-b bg-card">
      <div className="flex items-center gap-1 px-2 md:px-4">
        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden my-1.5 grid h-9 w-9 place-items-center rounded-lg border hover:bg-muted"
          aria-label={t("nav.more")}
        >
          {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        <div className="hidden md:flex min-w-0 flex-1 flex-wrap items-center gap-0.5 py-0.5">
          {groups.map((g) => (
            <GroupButton
              key={g.titleKey}
              group={g}
              open={open === g.titleKey}
              active={isActiveGroup(g)}
              isActiveItem={isActiveItem}
              onToggle={() => setOpen((o) => (o === g.titleKey ? null : g.titleKey))}
            />
          ))}
        </div>

        <div className="flex-1 md:hidden" />

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
        <div className="md:hidden max-h-[70vh] overflow-y-auto border-t px-3 py-2 space-y-1">
          {groups.map((g) => {
            const GIcon = g.icon;
            const isOpen = mobileGroup === g.titleKey;
            return (
              <div key={g.titleKey} className="rounded-lg border">
                <button
                  onClick={() => setMobileGroup((o) => (o === g.titleKey ? null : g.titleKey))}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] font-medium"
                >
                  <GIcon className="w-4 h-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-start">{t(g.titleKey)}</span>
                  <ChevronDown className={cn("w-4 h-4 shrink-0 opacity-60 transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="border-t p-1 space-y-0.5">
                    {g.items.map((it) => (
                      <NavItemLink key={it.to} item={it} active={isActiveItem(it.to)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = 250;
      const rtl = document.documentElement.dir === "rtl";
      let left = rtl ? r.right - width : r.left;
      left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
      setPos({ top: r.bottom + 4, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <div className="relative" data-nav-group>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
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
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            data-nav-group
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 250 }}
            className="z-[100] max-h-[70vh] overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-lg"
          >
            {group.items.map((it) => (
              <NavItemLink key={it.to} item={it} active={isActiveItem(it.to)} />
            ))}
          </div>,
          document.body,
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
