import { supabase } from "@/integrations/supabase/client";

/** Create a 2-line journal entry from an unmatched statement line and link it back. */
export async function createEntryForStatementLine(params: {
  statement_line_id: string;
  txn_date: string;
  description: string;
  amount: number;
  is_debit_on_bank: boolean; // true → bank withdrawal (charge/fees); false → deposit (interest)
  bank_gl_account_id: string;
  counter_account_id: string;
  entry_type?: string;
}): Promise<string> {
  const desc = params.description || "Bank reconciliation adjustment";
  const { data: entry, error: e1 } = await supabase
    .from("journal_entries")
    .insert({
      entry_date: params.txn_date,
      description: desc,
      status: "posted",
      entry_type: params.entry_type ?? "general",
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (e1 || !entry) throw e1 ?? new Error("failed to create entry");

  // Bank withdrawal → credit bank / debit counter (expense).
  // Bank deposit → debit bank / credit counter (income).
  const bankDebit = params.is_debit_on_bank ? 0 : params.amount;
  const bankCredit = params.is_debit_on_bank ? params.amount : 0;
  const counterDebit = params.is_debit_on_bank ? params.amount : 0;
  const counterCredit = params.is_debit_on_bank ? 0 : params.amount;

  const { data: jlRows, error: e2 } = await supabase
    .from("journal_lines")
    .insert([
      {
        entry_id: entry.id,
        account_id: params.bank_gl_account_id,
        debit: bankDebit,
        credit: bankCredit,
        description: desc,
        line_order: 0,
      },
      {
        entry_id: entry.id,
        account_id: params.counter_account_id,
        debit: counterDebit,
        credit: counterCredit,
        description: desc,
        line_order: 1,
      },
    ])
    .select("id, account_id");
  if (e2) throw e2;

  // Link the bank-side journal line to the statement line as a match
  const bankLineRow = (jlRows ?? []).find((r) => r.account_id === params.bank_gl_account_id);
  if (bankLineRow) {
    await supabase.from("bank_reconciliation_matches").insert({
      statement_line_id: params.statement_line_id,
      journal_line_id: bankLineRow.id,
      amount: params.amount,
      match_type: "auto",
      confidence: 100,
    });
    await supabase
      .from("bank_statement_lines")
      .update({
        match_status: "matched",
        match_confidence: 100,
        journal_entry_id: entry.id,
      })
      .eq("id", params.statement_line_id);
  }

  return entry.id;
}
