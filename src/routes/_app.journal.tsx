import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Plus, Trash2, FileText, FileCheck, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { logAudit } from "@/lib/audit";
import { useConfirm } from "@/components/confirm-dialog";
import { archiveRecord, softDeleteRecord } from "@/lib/records";
import { createReversalEntry } from "@/lib/posting";

export const Route = createFileRoute("/_app/journal")({ component: JournalPage });

type Entry = {
  id: string;
  entry_no: number;
  entry_date: string;
  description: string | null;
  status: string;
  entry_type: string;
  total_amount: number;
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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("all");

  const { data: balances } = useQuery({
    queryKey: ["journal-balances"],
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_lines")
        .select("debit, credit, accounts!inner(type), journal_entries!inner(status)")
        .eq("journal_entries.status", "posted");
      const tot: Record<string, number> = { asset: 0, liability: 0, equity: 0 };
      (data ?? []).forEach((l: any) => {
        const type = l.accounts?.type;
        const d = Number(l.debit || 0), c = Number(l.credit || 0);
        if (type === "asset") tot.asset += d - c;
        else if (type === "liability") tot.liability += c - d;
        else if (type === "equity") tot.equity += c - d;
      });
      return tot;
    },
  });

  const { data: rawEntries = [] } = useQuery({
    queryKey: ["journal-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("*, journal_lines(debit, credit)")
        .eq("is_deleted", false)
        .eq("is_archived", false)
        .order("entry_no", { ascending: false });
      if (error) throw error;
      return data as any[];
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

  const confirm = useConfirm();

  const del = useMutation({
    mutationFn: async (e: Entry) => {
      const choice = await confirm({
        title: `${t("common.delete")} — ${t("journal.entry")} #${e.entry_no}`,
        description: t("common.cannot_undo"),
        allowReverse: e.status === "posted",
      });
      if (!choice) return null;

      const snapshot = {
        entry_no: e.entry_no,
        entry_date: e.entry_date,
        status: e.status,
        total_amount: e.total_amount,
      };

      if (choice === "reverse") {
        await createReversalEntry(e.id);
        await logAudit("reverse", "journal_entries", e.id, snapshot);
        return "reverse" as const;
      }
      if (choice === "archive") {
        await archiveRecord("journal_entries", e.id, snapshot);
        return "archive" as const;
      }
      await softDeleteRecord("journal_entries", e.id, snapshot);
      return "delete" as const;
    },
    onSuccess: (result) => {
      if (!result) return;
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      qc.invalidateQueries({ queryKey: ["journal-balances"] });
      toast.success(
        result === "reverse"
          ? t("common.create_reversal")
          : result === "archive"
            ? t("common.archive_success")
            : t("common.delete_success"),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });


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
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> {t("journal.new")}
          </button>
        )}
      </header>

      {/* Balance sheet snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border bg-gradient-to-br from-primary/15 to-primary/5 p-4">
          <div className="text-xs text-muted-foreground font-medium">{t("dashboard.assets")}</div>
          <div className="text-2xl font-bold num mt-1">{fmt(balances?.asset ?? 0)}</div>
        </div>
        <div className="rounded-xl border bg-gradient-to-br from-destructive/15 to-destructive/5 p-4">
          <div className="text-xs text-muted-foreground font-medium">{t("dashboard.liabilities")}</div>
          <div className="text-2xl font-bold num mt-1">{fmt(balances?.liability ?? 0)}</div>
        </div>
        <div className="rounded-xl border bg-gradient-to-br from-accent/25 to-accent/5 p-4">
          <div className="text-xs text-muted-foreground font-medium">{t("dashboard.equity")}</div>
          <div className="text-2xl font-bold num mt-1">{fmt(balances?.equity ?? 0)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-warning-foreground" />
            <span className="text-xs text-muted-foreground">{t("journal.draft_count")}</span>
          </div>
          <div className="text-xl font-bold num">{fmt(stats.draftCount)}</div>
          <div className="text-xs text-muted-foreground mt-1 num">{fmt(stats.draftTotal)}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileCheck className="w-4 h-4 text-success" />
            <span className="text-xs text-muted-foreground">{t("journal.posted_count")}</span>
          </div>
          <div className="text-xl font-bold num">{fmt(stats.postedCount)}</div>
          <div className="text-xs text-muted-foreground mt-1 num">{fmt(stats.postedTotal)}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <span className="text-xs text-muted-foreground">{t("journal.total_draft_amount")}</span>
          <div className="text-xl font-bold num text-warning-foreground mt-2">{fmt(stats.draftTotal)}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <span className="text-xs text-muted-foreground">{t("journal.total_posted_amount")}</span>
          <div className="text-xl font-bold num text-success mt-2">{fmt(stats.postedTotal)}</div>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="flex border-b bg-muted/20">
          {tabBtn("all", t("journal.tab_all"), entries.length)}
          {tabBtn("draft", t("journal.tab_draft"), stats.draftCount)}
          {tabBtn("posted", t("journal.tab_posted"), stats.postedCount)}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-start px-4 py-3">{t("journal.no")}</th>
              <th className="text-start px-4 py-3">{t("journal.date")}</th>
              <th className="text-start px-4 py-3">{t("journal.description")}</th>
              <th className="text-start px-4 py-3">{t("journal.type")}</th>
              <th className="text-start px-4 py-3">{t("journal.amount")}</th>
              <th className="text-start px-4 py-3">{t("journal.status")}</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-muted-foreground">
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
                  <td className="px-4 py-2.5 num font-medium">#{e.entry_no}</td>
                  <td className="px-4 py-2.5 num">{e.entry_date}</td>
                  <td className="px-4 py-2.5">{e.description || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      {entryTypeLabel(e.entry_type)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 num font-medium">{fmt(e.total_amount)}</td>
                  <td className="px-4 py-2.5">
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
                  <td className="px-4 py-2.5" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => navigate({ to: "/journal-entry/$id", params: { id: e.id } })}
                        className="p-1.5 rounded hover:bg-primary/10 text-primary"
                        title={t("common.open")}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {permissions.has("journal.delete") && (
                        <button
                          onClick={() => del.mutate(e)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                          title={t("common.delete")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
