import { Link, useRouterState } from "@tanstack/react-router";
import { Languages, Moon, Settings, Sun } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useCompanySettings } from "@/lib/company";
import { cn } from "@/lib/utils";
import logoUrl from "@/assets/logo.png";

const TITLES: Record<string, string> = {
  "/dashboard": "nav.dashboard",
  "/finance-dashboard": "nav.finance_dashboard",
  "/accounts": "nav.accounts",
  "/journal": "nav.journal",
  "/products": "nav.products",
  "/customers": "nav.customers",
  "/suppliers": "nav.suppliers",
  "/ledger": "nav.ledger",
  "/trial-balance": "nav.trial_balance",
  "/trading-account": "nav.trading_account",
  "/income-statement": "nav.income_statement",
  "/balance-sheet": "nav.balance_sheet",
  "/cash-flow": "nav.cash_flow",
  "/assets": "nav.assets",
  "/settings": "nav.settings",
};

export function AppTopbar() {
  const { user, permissions } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const company = useCompanySettings();

  const titleKey = TITLES[pathname];
  const name = (user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email || "—";

  return (
    <header className="border-b bg-card/95 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-3 md:px-6">
        <Link to="/dashboard" className="flex min-w-0 items-center gap-3">
          <img
            src={logoUrl}
            alt={t("app.title")}
            width={44}
            height={44}
            className="shrink-0 rounded-xl object-cover ring-1 ring-primary/25"
            style={{ width: 44, height: 44 }}
          />
          <div className="hidden min-w-0 leading-tight sm:block">
            <div className="truncate text-lg font-extrabold tracking-tight text-primary">{t("app.title")}</div>
            <div className="truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {company.data?.name || t("app.subtitle")}
            </div>
          </div>
        </Link>

        <div className="mx-2 hidden h-8 w-px bg-border md:block" />

        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold tracking-tight md:text-base">
            {titleKey ? t(titleKey) : company.data?.name || t("app.title")}
          </h1>
          <p className="num hidden text-[11px] text-muted-foreground md:block">
            {t("common.fiscal_year")} {new Date().getFullYear()}
          </p>
        </div>

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={toggle} className="grid h-9 w-9 place-items-center rounded-full border transition-colors hover:bg-muted" title="Theme">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="grid h-9 w-9 place-items-center rounded-full border transition-colors hover:bg-muted"
            title="Language"
          >
            <Languages className="w-4 h-4" />
          </button>
          <Link
            to="/settings"
            className={cn(
              "grid h-9 w-9 place-items-center rounded-full border transition-colors hover:bg-muted",
              pathname === "/settings" && "border-primary/40 bg-primary/10 text-primary",
            )}
            title={t("nav.settings")}
          >
            <Settings className="w-4 h-4" />
          </Link>

          <div className="ms-1 hidden items-center gap-2.5 border-s ps-2 md:flex">
            <div className="text-end leading-tight">
              <div className="max-w-[150px] truncate text-xs font-semibold">{name}</div>
              <div className="num text-[10px] text-muted-foreground">
                {permissions.size} {t("common.permissions")}
              </div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {name[0]?.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
