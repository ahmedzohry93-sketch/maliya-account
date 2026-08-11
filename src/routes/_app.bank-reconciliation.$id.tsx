import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Upload, Wand2, Link2, Link2Off, PlusCircle, CheckCircle2, Lock, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { logAudit } from "@/lib/audit";
import { parseFile, type ParsedLine } from "@/lib/bank-recon/parsers";
import { runAutoMatch, fetchJournalCandidates, type JournalCandidate, type StatementLine } from "@/lib/bank-recon/auto-match";
import { applyRules, fetchRules } from "@/lib/bank-recon/rules-engine";
import { createEntryForStatementLine } from "@/lib/bank-recon/journal-generator";

export const Route = createFileRoute("/_app/bank-reconciliation/$id")({ component: ReconWorkspace });

type Recon = {
  id: string;
  bank_account_id: string;
  period_from: string;
  period_to: string;
  book_balance: number;
  statement_balance: number;
  difference: number;
  status: string;
  notes: string | null;
  bank_accounts: { name: string; currency: string; gl_account_id: string | null } | null;
};

const TABS = ["import", "auto", "manual", "unmatched", "summary"] as const;
type Tab = typeof TABS[number];

const WORKFLOW_ORDER = ["draft", "imported", "matching", "matched", "reviewed", "approved", "closed"];

function ReconWorkspace() {
  const { t, fmt } = useI18n();
  const { permissions } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { id } = Route.useParams();
  const [tab, setTab] = useState<Tab>("import");

  const canMatch = permissions.has("bank_recon.match");
  const canImport = permissions.has("bank_recon.import");
  const canCreateEntry = permissions.has("bank_recon.create_entries");
  const canApprove = permissions.has("bank_recon.approve");
  const canClose = permissions.has("bank_recon.close");
  const canReopen = permissions.has("bank_recon.reopen");

  const { data: recon } = useQuery({
    queryKey: ["recon", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_reconciliations")
        .select("*, bank_accounts(name, currency, gl_account_id)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as Recon;
    },
  });

  const { data: lines = [] } = useQuery({
    queryKey: ["recon-lines", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_statement_lines")
        .select("*")
        .eq("reconciliation_id", id)
        .order("txn_date")
        .order("line_order");
      return (data ?? []) as unknown as (StatementLine & { category: string | null; journal_entry_id: string | null; match_confidence: number })[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["recon-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_reconciliation_settings").select("*").limit(1).single();
      return data;
    },
  });

  const isLocked = recon?.status === "approved" || recon?.status === "closed";

  const setStatus = useMutation({
    mutationFn: async (status: Recon["status"]) => {
      const patch: { status: Recon["status"]; approved_at?: string; closed_at?: string } = { status };
      if (status === "approved") { patch.approved_at = new Date().toISOString(); }
      if (status === "closed") { patch.closed_at = new Date().toISOString(); }
      const { error } = await supabase.from("bank_reconciliations").update(patch as never).eq("id", id);
      if (error) throw error;
      await logAudit("workflow", "bank_reconciliation", id, { status });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recon", id] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const refreshBookBalance = useMutation({
    mutationFn: async () => {
      if (!recon?.bank_accounts?.gl_account_id) return;
      const { data } = await supabase.rpc("get_book_balance", {
        _gl_account_id: recon.bank_accounts.gl_account_id,
        _from: recon.period_from,
        _to: recon.period_to,
      });
      const book = Number(data ?? 0);
      await supabase
        .from("bank_reconciliations")
        .update({ book_balance: book, difference: Number(recon.statement_balance) - book })
        .eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recon", id] }),
  });

  const importFile = useMutation({
    mutationFn: async (file: File) => {
      const parsed = await parseFile(file);
      if (parsed.length === 0) throw new Error("No lines detected in file");
      const rules = await fetchRules();
      const rows = parsed.map((p, i) => {
        const r = applyRules(p, rules);
        return {
          reconciliation_id: id,
          txn_date: p.txn_date,
          description: p.description || null,
          reference: p.reference || null,
          debit: p.debit,
          credit: p.credit,
          balance: p.balance,
          category: r.category ?? null,
          line_order: i,
        };
      });
      // Delete existing then insert (idempotent import)
      await supabase.from("bank_statement_lines").delete().eq("reconciliation_id", id);
      const { error } = await supabase.from("bank_statement_lines").insert(rows as never);
      if (error) throw error;
      await supabase.from("bank_reconciliations").update({ status: "imported" }).eq("id", id);
      await logAudit("import", "bank_reconciliation", id, { count: parsed.length });
      return parsed.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["recon-lines", id] });
      qc.invalidateQueries({ queryKey: ["recon", id] });
      toast.success(`${n} ${t("bank_recon.lines_imported")}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const autoMatch = useMutation({
    mutationFn: async () => {
      if (!recon?.bank_accounts?.gl_account_id) throw new Error("Bank account has no GL link");
      const cands = await fetchJournalCandidates(recon.bank_accounts.gl_account_id, recon.period_from, recon.period_to);
      const opts = {
        dateTolerance: settings?.date_tolerance_days ?? 3,
        amountTolerance: Number(settings?.amount_tolerance ?? 0),
      };
      const matches = runAutoMatch(lines as unknown as StatementLine[], cands, opts);
      for (const m of matches) {
        await supabase.from("bank_reconciliation_matches").insert({
          statement_line_id: m.statement_line_id,
          journal_line_id: m.journal_line_id,
          amount: (lines.find((l) => l.id === m.statement_line_id)?.debit ?? 0) +
                  (lines.find((l) => l.id === m.statement_line_id)?.credit ?? 0),
          match_type: "auto",
          confidence: m.confidence,
        });
        await supabase.from("bank_statement_lines").update({
          match_status: "matched",
          match_confidence: m.confidence,
        }).eq("id", m.statement_line_id);
      }
      await supabase.from("bank_reconciliations").update({ status: "matching" }).eq("id", id);
      return matches.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["recon-lines", id] });
      qc.invalidateQueries({ queryKey: ["recon", id] });
      toast.success(`${n} ${t("bank_recon.auto_matched")}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const unmatch = useMutation({
    mutationFn: async (lineId: string) => {
      await supabase.from("bank_reconciliation_matches").delete().eq("statement_line_id", lineId);
      await supabase
        .from("bank_statement_lines")
        .update({ match_status: "unmatched", match_confidence: 0, journal_entry_id: null })
        .eq("id", lineId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recon-lines", id] }),
  });

  const matched = useMemo(() => lines.filter((l) => l.match_status === "matched"), [lines]);
  const unmatched = useMemo(() => lines.filter((l) => l.match_status !== "matched"), [lines]);
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);

  if (!recon) {
    return <div className="p-8 text-muted-foreground">…</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => nav({ to: "/bank-reconciliation" })} className="p-2 rounded-md hover:bg-muted">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{recon.bank_accounts?.name} — {recon.period_from} → {recon.period_to}</h1>
            <div className="text-xs text-muted-foreground">{recon.bank_accounts?.currency}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isLocked && recon.status !== "reviewed" && (
            <button disabled={setStatus.isPending} onClick={() => setStatus.mutate("reviewed")}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t("bank_recon.mark_reviewed")}
            </button>
          )}
          {canApprove && !isLocked && (
            <button onClick={() => setStatus.mutate("approved")}
              className="inline-flex items-center gap-1 rounded-md bg-success/15 text-success border border-success/30 px-3 py-1.5 text-xs">
              <Lock className="w-3.5 h-3.5" /> {t("bank_recon.approve")}
            </button>
          )}
          {canClose && recon.status === "approved" && (
            <button onClick={() => setStatus.mutate("closed")}
              className="inline-flex items-center gap-1 rounded-md bg-foreground/10 text-foreground border px-3 py-1.5 text-xs">
              <Lock className="w-3.5 h-3.5" /> {t("bank_recon.close_recon")}
            </button>
          )}
          {canReopen && isLocked && (
            <button onClick={() => setStatus.mutate("matching")}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs">
              <RotateCcw className="w-3.5 h-3.5" /> {t("bank_recon.reopen")}
            </button>
          )}
        </div>
      </div>

      {/* Workflow chips */}
      <div className="flex items-center gap-2 text-xs overflow-x-auto pb-1">
        {WORKFLOW_ORDER.map((s) => {
          const idx = WORKFLOW_ORDER.indexOf(recon.status);
          const cur = WORKFLOW_ORDER.indexOf(s);
          const active = cur <= idx;
          return (
            <div key={s} className={`px-2 py-1 rounded ${active ? "bg-primary/15 text-primary font-medium" : "bg-muted text-muted-foreground"}`}>
              {t(`bank_recon.status.${s}`)}
            </div>
          );
        })}
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label={t("bank_recon.k_book")} value={fmt(Number(recon.book_balance))} />
        <Kpi label={t("bank_recon.k_stmt")} value={fmt(Number(recon.statement_balance))} />
        <Kpi label={t("bank_recon.k_diff")} value={fmt(Number(recon.difference))}
             tone={Math.abs(Number(recon.difference)) < 0.01 ? "success" : "warn"} />
        <Kpi label={t("bank_recon.k_matched")} value={fmt(matched.length)} />
        <Kpi label={t("bank_recon.k_unmatched")} value={fmt(unmatched.length)} />
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-1 overflow-x-auto">
        {TABS.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${tab === k ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t(`bank_recon.tab_${k}`)}
          </button>
        ))}
      </div>

      {tab === "import" && (
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <div className="text-sm text-muted-foreground">{t("bank_recon.import_hint")}</div>
          <label className={`inline-flex items-center gap-2 rounded-md border-2 border-dashed px-6 py-8 cursor-pointer hover:bg-muted/50 ${importFile.isPending ? "opacity-50" : ""}`}>
            <Upload className="w-5 h-5" />
            <span className="text-sm">{importFile.isPending ? "…" : t("bank_recon.upload_file")}</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.ofx,.qfx,.qif"
              className="hidden"
              disabled={!canImport || isLocked}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile.mutate(f);
                e.target.value = "";
              }}
            />
          </label>
          <div className="text-xs text-muted-foreground">CSV · XLSX · OFX · QIF</div>
          {lines.length > 0 && (
            <>
              <div className="flex items-center justify-between pt-3 border-t">
                <div className="text-sm font-medium">{lines.length} {t("bank_recon.lines")}</div>
                <button
                  onClick={() => refreshBookBalance.mutate()}
                  className="text-xs text-primary hover:underline"
                >{t("bank_recon.refresh_book")}</button>
              </div>
              <StatementTable lines={lines} onUnmatch={(l) => canMatch && !isLocked && unmatch.mutate(l)} />
            </>
          )}
        </div>
      )}

      {tab === "auto" && (
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <div className="text-sm">{t("bank_recon.auto_hint")}</div>
          <div className="text-xs text-muted-foreground">
            {t("bank_recon.tolerance_days")}: {settings?.date_tolerance_days ?? 3} · {t("bank_recon.tolerance_amount")}: {fmt(Number(settings?.amount_tolerance ?? 0))}
          </div>
          <button
            disabled={autoMatch.isPending || !canMatch || isLocked || lines.length === 0}
            onClick={() => autoMatch.mutate()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
          >
            <Wand2 className="w-4 h-4" /> {autoMatch.isPending ? "…" : t("bank_recon.run_auto")}
          </button>
          <StatementTable lines={matched} onUnmatch={(l) => canMatch && !isLocked && unmatch.mutate(l)} showConfidence />
        </div>
      )}

      {tab === "manual" && (
        <ManualMatchPane
          reconId={id}
          bankGlAccountId={recon.bank_accounts?.gl_account_id ?? null}
          from={recon.period_from}
          to={recon.period_to}
          lines={unmatched}
          disabled={!canMatch || isLocked}
        />
      )}

      {tab === "unmatched" && (
        <UnmatchedPane
          reconId={id}
          bankGl={recon.bank_accounts?.gl_account_id ?? null}
          lines={unmatched}
          settings={settings}
          disabled={!canCreateEntry || isLocked}
        />
      )}

      {tab === "summary" && (
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <h3 className="font-semibold">{t("bank_recon.summary")}</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <SumRow label={t("bank_recon.total_debits")} value={fmt(totalDebit)} />
            <SumRow label={t("bank_recon.total_credits")} value={fmt(totalCredit)} />
            <SumRow label={t("bank_recon.k_matched")} value={fmt(matched.length)} />
            <SumRow label={t("bank_recon.k_unmatched")} value={fmt(unmatched.length)} />
            <SumRow label={t("bank_recon.k_book")} value={fmt(Number(recon.book_balance))} />
            <SumRow label={t("bank_recon.k_stmt")} value={fmt(Number(recon.statement_balance))} />
            <SumRow label={t("bank_recon.k_diff")} value={fmt(Number(recon.difference))}
                    tone={Math.abs(Number(recon.difference)) < 0.01 ? "success" : "warn"} />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "success" | "warn" }) {
  const cls = tone === "success" ? "text-success" : tone === "warn" ? "text-warning-foreground" : "";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold mt-1 font-mono ${cls}`}>{value}</div>
    </div>
  );
}

function SumRow({ label, value, tone }: { label: string; value: string; tone?: "success" | "warn" }) {
  const cls = tone === "success" ? "text-success" : tone === "warn" ? "text-warning-foreground" : "";
  return (
    <div className="flex justify-between border-b py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${cls}`}>{value}</span>
    </div>
  );
}

function StatementTable({
  lines,
  onUnmatch,
  showConfidence,
}: {
  lines: Array<StatementLine & { match_confidence?: number; category?: string | null }>;
  onUnmatch?: (id: string) => void;
  showConfidence?: boolean;
}) {
  const { t, fmt } = useI18n();
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className="text-start px-2 py-2">{t("bank_recon.col_date")}</th>
            <th className="text-start px-2 py-2">{t("bank_recon.col_desc")}</th>
            <th className="text-start px-2 py-2">{t("bank_recon.col_ref")}</th>
            <th className="text-end px-2 py-2">{t("journal.debit")}</th>
            <th className="text-end px-2 py-2">{t("journal.credit")}</th>
            {showConfidence && <th className="text-center px-2 py-2">%</th>}
            <th className="text-center px-2 py-2">{t("bank_recon.col_status")}</th>
            {onUnmatch && <th></th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t hover:bg-muted/30">
              <td className="px-2 py-1.5 whitespace-nowrap">{l.txn_date}</td>
              <td className="px-2 py-1.5">{l.description}</td>
              <td className="px-2 py-1.5 font-mono">{l.reference}</td>
              <td className="px-2 py-1.5 text-end font-mono">{Number(l.debit) > 0 ? fmt(Number(l.debit)) : ""}</td>
              <td className="px-2 py-1.5 text-end font-mono">{Number(l.credit) > 0 ? fmt(Number(l.credit)) : ""}</td>
              {showConfidence && <td className="px-2 py-1.5 text-center">{l.match_confidence ?? "—"}</td>}
              <td className="px-2 py-1.5 text-center">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${
                  l.match_status === "matched" ? "bg-success/15 text-success" :
                  l.match_status === "partial" ? "bg-warning/15 text-warning-foreground" :
                  "bg-muted text-muted-foreground"
                }`}>{l.match_status}</span>
              </td>
              {onUnmatch && (
                <td className="px-2 py-1.5 text-end">
                  {l.match_status === "matched" && (
                    <button onClick={() => onUnmatch(l.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive">
                      <Link2Off className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
          {lines.length === 0 && (
            <tr><td colSpan={onUnmatch ? 8 : 7} className="text-center py-6 text-muted-foreground">—</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ManualMatchPane({
  reconId, bankGlAccountId, from, to, lines, disabled,
}: {
  reconId: string;
  bankGlAccountId: string | null;
  from: string;
  to: string;
  lines: Array<StatementLine & { id: string }>;
  disabled: boolean;
}) {
  const { t, fmt } = useI18n();
  const qc = useQueryClient();
  const [selectedLine, setSelectedLine] = useState<string | null>(null);

  const { data: cands = [] } = useQuery({
    queryKey: ["manual-cands", bankGlAccountId, from, to],
    queryFn: async () => bankGlAccountId ? await fetchJournalCandidates(bankGlAccountId, from, to) : [],
    enabled: !!bankGlAccountId,
  });

  const link = useMutation({
    mutationFn: async ({ lineId, jl }: { lineId: string; jl: JournalCandidate }) => {
      const line = lines.find((l) => l.id === lineId);
      if (!line) throw new Error("line not found");
      const amt = Number(line.debit) + Number(line.credit);
      await supabase.from("bank_reconciliation_matches").insert({
        statement_line_id: lineId,
        journal_line_id: jl.journal_line_id,
        amount: amt,
        match_type: "manual",
        confidence: 100,
      });
      await supabase.from("bank_statement_lines").update({
        match_status: "matched",
        match_confidence: 100,
        journal_entry_id: jl.entry_id,
      }).eq("id", lineId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recon-lines", reconId] });
      setSelectedLine(null);
      toast.success(t("bank_recon.linked"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Filter journal candidates that already have a match
  const usedJl = new Set<string>();

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="rounded-lg border bg-card">
        <div className="px-3 py-2 border-b font-medium text-sm">{t("bank_recon.bank_side")}</div>
        <div className="max-h-[500px] overflow-y-auto">
          {lines.map((l) => (
            <button
              key={l.id}
              disabled={disabled}
              onClick={() => setSelectedLine(l.id === selectedLine ? null : l.id)}
              className={`w-full text-start px-3 py-2 text-xs border-b hover:bg-muted/50 disabled:opacity-50 ${selectedLine === l.id ? "bg-primary/10" : ""}`}
            >
              <div className="flex justify-between">
                <span>{l.txn_date} — {l.description}</span>
                <span className="font-mono">{fmt(Number(l.debit) || Number(l.credit))}</span>
              </div>
              {l.reference && <div className="text-muted-foreground font-mono">{l.reference}</div>}
            </button>
          ))}
          {lines.length === 0 && <div className="p-4 text-center text-muted-foreground text-xs">—</div>}
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="px-3 py-2 border-b font-medium text-sm">{t("bank_recon.book_side")}</div>
        <div className="max-h-[500px] overflow-y-auto">
          {cands.filter((c) => !usedJl.has(c.journal_line_id)).map((c) => (
            <div key={c.journal_line_id} className="px-3 py-2 text-xs border-b flex justify-between items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex justify-between">
                  <span className="truncate">#{c.entry_no} {c.entry_date} — {c.description}</span>
                  <span className="font-mono">{fmt(c.debit || c.credit)}</span>
                </div>
                {c.reference && <div className="text-muted-foreground font-mono truncate">{c.reference}</div>}
              </div>
              {selectedLine && (
                <button
                  onClick={() => link.mutate({ lineId: selectedLine, jl: c })}
                  className="shrink-0 inline-flex items-center gap-1 rounded bg-primary text-primary-foreground px-2 py-1 text-[10px]"
                >
                  <Link2 className="w-3 h-3" /> {t("bank_recon.link")}
                </button>
              )}
            </div>
          ))}
          {cands.length === 0 && <div className="p-4 text-center text-muted-foreground text-xs">—</div>}
        </div>
      </div>
    </div>
  );
}

function UnmatchedPane({
  reconId, bankGl, lines, settings, disabled,
}: {
  reconId: string;
  bankGl: string | null;
  lines: Array<StatementLine & { id: string; category?: string | null }>;
  settings: { default_charges_account_id?: string | null; default_interest_account_id?: string | null; default_fx_diff_account_id?: string | null } | null | undefined;
  disabled: boolean;
}) {
  const { t, fmt } = useI18n();
  const qc = useQueryClient();

  const { data: accts = [] } = useQuery({
    queryKey: ["accounts-all-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, code, name").order("code");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async ({ line, counter }: { line: StatementLine; counter: string }) => {
      if (!bankGl) throw new Error("Bank GL account not set");
      const amount = Number(line.debit) + Number(line.credit);
      const isDebit = Number(line.credit) > 0; // statement credit ⇒ bank withdrawal ⇒ credit bank
      // wait - statement credit means BANK increased? convention varies. Common:
      //   statement debit column = money OUT of bank (withdrawal) ⇒ credit bank GL
      //   statement credit column = money INTO bank (deposit)   ⇒ debit bank GL
      // is_debit_on_bank => true means credit bank (withdrawal)
      const isBankOut = Number(line.debit) > 0;
      await createEntryForStatementLine({
        statement_line_id: line.id,
        txn_date: line.txn_date,
        description: line.description ?? "",
        amount,
        is_debit_on_bank: isBankOut,
        bank_gl_account_id: bankGl,
        counter_account_id: counter,
        entry_type: "general",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recon-lines", reconId] });
      toast.success(t("bank_recon.entry_created"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const buckets: Record<string, typeof lines> = {
    outstanding_check: [], deposit_in_transit: [], bank_charge: [], bank_interest: [],
    direct_deposit: [], returned_check: [], fx_difference: [], other: [],
  };
  lines.forEach((l) => {
    const k = l.category && buckets[l.category] ? l.category : "other";
    buckets[k].push(l);
  });

  const defaultFor = (cat: string) =>
    cat === "bank_charge" ? settings?.default_charges_account_id :
    cat === "bank_interest" ? settings?.default_interest_account_id :
    cat === "fx_difference" ? settings?.default_fx_diff_account_id : null;

  return (
    <div className="space-y-3">
      {Object.entries(buckets).map(([cat, arr]) => (
        arr.length > 0 && (
          <div key={cat} className="rounded-lg border bg-card overflow-hidden">
            <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
              <div className="font-medium text-sm">{t(`bank_recon.cat.${cat}`)}</div>
              <div className="text-xs text-muted-foreground">{arr.length}</div>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-start px-2 py-1.5">{t("bank_recon.col_date")}</th>
                  <th className="text-start px-2 py-1.5">{t("bank_recon.col_desc")}</th>
                  <th className="text-end px-2 py-1.5">{t("bank_recon.amount")}</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {arr.map((l) => {
                  const def = defaultFor(cat);
                  return (
                    <UnmatchedRow key={l.id} l={l} accts={accts as { id: string; code: string; name: string }[]}
                                  defaultAccount={def ?? undefined}
                                  disabled={disabled}
                                  onCreate={(counter) => create.mutate({ line: l, counter })} />
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ))}
      {lines.length === 0 && <div className="p-6 text-center text-muted-foreground text-sm">—</div>}
    </div>
  );
}

function UnmatchedRow({
  l, accts, defaultAccount, disabled, onCreate,
}: {
  l: StatementLine;
  accts: { id: string; code: string; name: string }[];
  defaultAccount?: string;
  disabled: boolean;
  onCreate: (counter: string) => void;
}) {
  const { t, fmt } = useI18n();
  const [counter, setCounter] = useState(defaultAccount ?? "");
  return (
    <tr className="border-t">
      <td className="px-2 py-1.5">{l.txn_date}</td>
      <td className="px-2 py-1.5">{l.description}</td>
      <td className="px-2 py-1.5 text-end font-mono">{fmt(Number(l.debit) + Number(l.credit))}</td>
      <td className="px-2 py-1.5">
        <div className="flex gap-1 items-center">
          <select className="border rounded px-1 py-0.5 text-[11px] bg-background" value={counter} onChange={(e) => setCounter(e.target.value)}>
            <option value="">{t("bank_recon.pick_counter")}</option>
            {accts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
          <button
            disabled={disabled || !counter}
            onClick={() => onCreate(counter)}
            className="inline-flex items-center gap-0.5 rounded bg-primary text-primary-foreground px-2 py-0.5 text-[10px] disabled:opacity-40"
          >
            <PlusCircle className="w-3 h-3" /> {t("bank_recon.create_entry")}
          </button>
        </div>
      </td>
    </tr>
  );
}
