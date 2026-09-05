import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Plus, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/journal")({
  component: JournalPage,
  validateSearch: (s: Record<string, unknown>): { account?: string; from?: string; to?: string } => ({
    account: typeof s.account === "string" ? s.account : undefined,
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
  }),
});

type Entry = {
  id: string;
  entry_no: number;
  entry_date: string;
  description: string | null;
  status: string;
  entry_type: string;
  total_amount: number;
  reference: string | null;
  lines_count: number;
  total_debit: number;
  total_credit: number;
  accounts_label: string;
  created_at: string | null;
};
type Account = { id: string; code: string; name: string; parent_id: string | null };
type Line = { account_id: string; partner_id: string | null; debit: number; credit: number; description: string };
type PartnerOpt = { id: string; name: string; type: string };

const entryTypeKeys = [
  "general", "sales", "purchases", "payroll",
  "cash_receipt", "cash_payment", "inventory", "opening", "closing",
] as const;

type TabKey = "all" | "draft" | "posted";

function JournalPage() {
  const { permissions } = useAuth();
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("all");

  const { account: filterAccount, from: filterFrom, to: filterTo } = Route.useSearch();

  const { data: rawEntries = [] } = useQuery({
    queryKey: ["journal-entries", filterAccount, filterFrom, filterTo],
    queryFn: async () => {
      let query = supabase
        .from("journal_entries")
        .select("*, journal_lines(debit, credit, account_id, accounts(code, name))")
        .eq("is_deleted", false)
        .eq("is_archived", false)
        .order("entry_no", { ascending: false });
      if (filterFrom) query = query.gte("entry_date", filterFrom);
      if (filterTo) query = query.lte("entry_date", filterTo);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return filterAccount
        ? rows.filter((e) => (e.journal_lines || []).some((l: any) => l.account_id === filterAccount))
        : rows;
    },
  });

  const entries = useMemo<Entry[]>(() => {
    return rawEntries.map((e: any) => ({
      id: e.id,
      entry_no: e.entry_no,
      entry_date: e.entry_date,
      description: e.description,
      status: e.status,
      entry_type: e.entry_type ?? "general",
      reference: e.reference ?? null,
      created_at: e.created_at ?? null,
      lines_count: (e.journal_lines || []).length,
      total_debit: (e.journal_lines || []).reduce((s: number, l: any) => s + Number(l.debit || 0), 0),
      total_credit: (e.journal_lines || []).reduce((s: number, l: any) => s + Number(l.credit || 0), 0),
      accounts_label: (e.journal_lines || [])
        .map((l: any) => (l.accounts ? `${l.accounts.code} ${l.accounts.name}` : ""))
        .filter(Boolean)
        .join(" / "),
      total_amount: (e.journal_lines || []).reduce(
        (s: number, l: any) => s + Number(l.debit || 0),
        0
      ),
    }));
  }, [rawEntries]);

  const stats = useMemo(() => {
    const draft = entries.filter((e) => e.status === "draft");
    const posted = entries.filter((e) => e.status === "posted");
    return {
      draftCount: draft.length,
      draftTotal: draft.reduce((s, e) => s + e.total_amount, 0),
      postedCount: posted.length,
      postedTotal: posted.reduce((s, e) => s + e.total_amount, 0),
    };
  }, [entries]);

  const visibleEntries = useMemo(() => {
    if (tab === "draft") return entries.filter((e) => e.status === "draft");
    if (tab === "posted") return entries.filter((e) => e.status === "posted");
    return entries;
  }, [entries, tab]);

  const totals = useMemo(() => ({
    debit: visibleEntries.reduce((s2, e) => s2 + e.total_debit, 0),
    credit: visibleEntries.reduce((s2, e) => s2 + e.total_credit, 0),
  }), [visibleEntries]);

  const entryTypeLabel = (type: string) => t(`entry_type.${type}`);

  const tabBtn = (key: TabKey, label: string, count: number) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        tab === key
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label} <span className="num text-xs opacity-70">({count})</span>
    </button>
  );

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("journal.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {entries.length} {t("journal.count")}
          </p>
        </div>
        {permissions.has("journal.create") && (
          <button
            onClick={() => navigate({ to: "/journal-entry/$id", params: { id: "new" } })}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-none text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> {t("journal.new")}
          </button>
        )}
      </header>

      <div className="rpt-sheet overflow-x-auto">
        <div className="flex border-b bg-muted/20">
          {tabBtn("all", t("journal.tab_all"), entries.length)}
          {tabBtn("draft", t("journal.tab_draft"), stats.draftCount)}
          {tabBtn("posted", t("journal.tab_posted"), stats.postedCount)}
        </div>
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr>
              <th className="text-start px-2 py-1.5">{t("journal.no")}</th>
              <th className="text-start px-2 py-1.5">{t("journal.date")}</th>
              <th className="text-start px-2 py-1.5">المرجع</th>
              <th className="text-start px-2 py-1.5">{t("journal.description")}</th>
              <th className="text-start px-2 py-1.5">الحسابات</th>
              <th className="text-start px-2 py-1.5">{t("journal.type")}</th>
              <th className="text-start px-2 py-1.5">البنود</th>
              <th className="text-start px-2 py-1.5">مدين</th>
              <th className="text-start px-2 py-1.5">دائن</th>
              <th className="text-start px-2 py-1.5">{t("journal.status")}</th>
              <th className="text-start px-2 py-1.5">تاريخ الإنشاء</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center py-10 text-muted-foreground">
                  {t("journal.empty")}
                </td>
              </tr>
            )}
            {visibleEntries.map((e) => {
              const isDraft = e.status === "draft";
              const isPosted = e.status === "posted";
              return (
                <tr
                  key={e.id}
                  className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate({ to: "/journal-entry/$id", params: { id: e.id } })}
                >
                  <td className="px-2 py-1.5 num font-medium">#{e.entry_no}</td>
                  <td className="px-2 py-1.5 num">{e.entry_date}</td>
                  <td className="px-2 py-1.5 num text-muted-foreground">{e.reference || "—"}</td>
                  <td className="px-2 py-1.5">{e.description || "—"}</td>
                  <td className="px-2 py-1.5 max-w-[220px] truncate text-xs text-muted-foreground" title={e.accounts_label}>
                    {e.accounts_label || "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      {entryTypeLabel(e.entry_type)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 num text-muted-foreground">{e.lines_count}</td>
                  <td className="px-2 py-1.5 num font-medium">{fmt(e.total_debit)}</td>
                  <td className="px-2 py-1.5 num font-medium">{fmt(e.total_credit)}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        isPosted
                          ? "bg-success/15 text-success"
                          : e.status === "cancelled"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-warning/15 text-warning-foreground"
                      }`}
                    >
                      {isPosted
                        ? t("journal.status.posted")
                        : e.status === "cancelled"
                          ? t("journal.status.cancelled")
                          : t("journal.status.draft")}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 num text-xs text-muted-foreground">
                    {e.created_at ? e.created_at.slice(0, 10) : "—"}
                  </td>
                  <td className="px-2 py-1.5" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => navigate({ to: "/journal-entry/$id", params: { id: e.id } })}
                        className="p-1.5 rounded hover:bg-primary/10 text-primary"
                        title={t("common.open")}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {visibleEntries.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={7} className="px-2 py-1.5">الإجمالي</td>
                <td className="px-2 py-1.5 num">{fmt(totals.debit)}</td>
                <td className="px-2 py-1.5 num">{fmt(totals.credit)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

    </div>
  );
}
