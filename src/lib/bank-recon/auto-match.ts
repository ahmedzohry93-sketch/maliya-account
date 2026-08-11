import { supabase } from "@/integrations/supabase/client";

export type StatementLine = {
  id: string;
  txn_date: string;
  description: string | null;
  reference: string | null;
  debit: number;
  credit: number;
  match_status: string;
};

export type JournalCandidate = {
  journal_line_id: string;
  entry_id: string;
  entry_no: number;
  entry_date: string;
  description: string | null;
  reference: string | null;
  debit: number;
  credit: number;
};

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.75;
  const wa = new Set(x.split(/\s+/).filter(Boolean));
  const wb = new Set(y.split(/\s+/).filter(Boolean));
  let hit = 0;
  wa.forEach((w) => wb.has(w) && hit++);
  const union = wa.size + wb.size - hit;
  return union === 0 ? 0 : hit / union;
}

export function scoreMatch(
  sl: StatementLine,
  cand: JournalCandidate,
  opts: { dateTolerance: number; amountTolerance: number },
): number {
  // Amount: statement debit → bank withdrew (need journal credit of same amount on bank account),
  // statement credit → bank deposit (need journal debit). We treat by absolute amount.
  const slAmt = sl.debit + sl.credit;
  const jAmt = cand.debit + cand.credit;
  const amtDiff = Math.abs(slAmt - jAmt);
  if (amtDiff > opts.amountTolerance && amtDiff / Math.max(slAmt, 1) > 0.02) return 0;

  const days = daysBetween(sl.txn_date, cand.entry_date);
  if (days > opts.dateTolerance + 15) return 0;

  const refScore =
    sl.reference && cand.reference && sl.reference.trim() === cand.reference.trim() ? 1 : 0;
  const amtScore = 1 - Math.min(amtDiff / Math.max(slAmt, 1), 1);
  const dateScore = Math.max(0, 1 - days / Math.max(opts.dateTolerance, 1));
  const descScore = similarity(sl.description ?? "", cand.description ?? "");

  return Math.round(
    (refScore * 0.4 + amtScore * 0.3 + dateScore * 0.2 + descScore * 0.1) * 100,
  );
}

export async function fetchJournalCandidates(
  glAccountId: string,
  from: string,
  to: string,
): Promise<JournalCandidate[]> {
  // Widen the search window a bit for tolerance.
  const f = new Date(from);
  f.setDate(f.getDate() - 15);
  const t = new Date(to);
  t.setDate(t.getDate() + 15);
  const { data, error } = await supabase
    .from("journal_lines")
    .select(
      "id, debit, credit, description, entry_id, journal_entries!inner(id, entry_no, entry_date, reference, status)",
    )
    .eq("account_id", glAccountId)
    .gte("journal_entries.entry_date", f.toISOString().slice(0, 10))
    .lte("journal_entries.entry_date", t.toISOString().slice(0, 10))
    .eq("journal_entries.status", "posted");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const je = (r as { journal_entries: { id: string; entry_no: number; entry_date: string; reference: string | null } })
      .journal_entries;
    return {
      journal_line_id: r.id,
      entry_id: je.id,
      entry_no: je.entry_no,
      entry_date: je.entry_date,
      description: r.description,
      reference: je.reference,
      debit: Number(r.debit),
      credit: Number(r.credit),
    };
  });
}

export type MatchResult = {
  statement_line_id: string;
  journal_line_id: string;
  confidence: number;
};

export function runAutoMatch(
  lines: StatementLine[],
  candidates: JournalCandidate[],
  opts: { dateTolerance: number; amountTolerance: number },
): MatchResult[] {
  const used = new Set<string>();
  const results: MatchResult[] = [];
  for (const sl of lines) {
    if (sl.match_status === "matched") continue;
    let best: { c: JournalCandidate; score: number } | null = null;
    for (const c of candidates) {
      if (used.has(c.journal_line_id)) continue;
      const s = scoreMatch(sl, c, opts);
      if (s > 0 && (!best || s > best.score)) best = { c, score: s };
    }
    if (best && best.score >= 85) {
      used.add(best.c.journal_line_id);
      results.push({
        statement_line_id: sl.id,
        journal_line_id: best.c.journal_line_id,
        confidence: best.score,
      });
    }
  }
  return results;
}
