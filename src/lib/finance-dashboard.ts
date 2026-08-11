import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Bucket = "overdue" | "today" | "tomorrow" | "week" | "month" | "future";

export interface DueRow {
  id: string;
  ref: string;
  partyName: string;
  amount: number;
  dueDate: string;
  daysLeft: number;
  bucket: Bucket;
  status?: string;
  extra?: string;
}

export interface BucketStats {
  overdue: { count: number; amount: number; rows: DueRow[] };
  today: { count: number; amount: number; rows: DueRow[] };
  tomorrow: { count: number; amount: number; rows: DueRow[] };
  week: { count: number; amount: number; rows: DueRow[] };
  month: { count: number; amount: number; rows: DueRow[] };
  future: { count: number; amount: number; rows: DueRow[] };
  total: { count: number; amount: number };
}

const emptyStats = (): BucketStats => ({
  overdue: { count: 0, amount: 0, rows: [] },
  today: { count: 0, amount: 0, rows: [] },
  tomorrow: { count: 0, amount: 0, rows: [] },
  week: { count: 0, amount: 0, rows: [] },
  month: { count: 0, amount: 0, rows: [] },
  future: { count: 0, amount: 0, rows: [] },
  total: { count: 0, amount: 0 },
});

function today0(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function bucketFor(dueDate: string): { bucket: Bucket; daysLeft: number } {
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today0().getTime()) / 86400000);
  let bucket: Bucket;
  if (days < 0) bucket = "overdue";
  else if (days === 0) bucket = "today";
  else if (days === 1) bucket = "tomorrow";
  else if (days <= 7) bucket = "week";
  else if (days <= 30) bucket = "month";
  else bucket = "future";
  return { bucket, daysLeft: days };
}

function pushRow(stats: BucketStats, row: DueRow) {
  stats[row.bucket].rows.push(row);
  stats[row.bucket].count += 1;
  stats[row.bucket].amount += row.amount;
  stats.total.count += 1;
  stats.total.amount += row.amount;
}

async function fetchInvoiceBuckets(type: "sale" | "purchase"): Promise<BucketStats> {
  const stats = emptyStats();
  const { data: invs } = await supabase
    .from("invoices")
    .select("id, invoice_no, total, due_date, invoice_date, status, partner_id")
    .eq("type", type)
    .eq("status", "posted")
    .eq("is_deleted", false)
    .eq("is_archived", false)
    .not("due_date", "is", null);

  if (!invs || invs.length === 0) return stats;

  const ids = invs.map((i: any) => i.id);
  const partnerIds = Array.from(new Set(invs.map((i: any) => i.partner_id).filter(Boolean)));

  const [{ data: pays }, { data: partners }] = await Promise.all([
    supabase.from("payments").select("invoice_id, amount, status").in("invoice_id", ids),
    partnerIds.length
      ? supabase.from("partners").select("id, name").in("id", partnerIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const paidMap = new Map<string, number>();
  (pays ?? []).forEach((p: any) => {
    if (p.status === "posted" || p.status === "draft") {
      paidMap.set(p.invoice_id, (paidMap.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
    }
  });
  const partnerMap = new Map<string, string>((partners ?? []).map((p: any) => [p.id, p.name]));

  invs.forEach((inv: any) => {
    const paid = paidMap.get(inv.id) ?? 0;
    const remaining = Number(inv.total || 0) - paid;
    if (remaining <= 0.005) return;
    const { bucket, daysLeft } = bucketFor(inv.due_date);
    pushRow(stats, {
      id: inv.id,
      ref: String(inv.invoice_no),
      partyName: partnerMap.get(inv.partner_id) ?? "—",
      amount: remaining,
      dueDate: inv.due_date,
      daysLeft,
      bucket,
      status: inv.status,
    });
  });

  return stats;
}

export function useReceivablesBuckets() {
  return useQuery({
    queryKey: ["fin-dash", "receivables"],
    queryFn: () => fetchInvoiceBuckets("sale"),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
export function usePayablesBuckets() {
  return useQuery({
    queryKey: ["fin-dash", "payables"],
    queryFn: () => fetchInvoiceBuckets("purchase"),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

async function fetchChecksBuckets(direction: "incoming" | "outgoing"): Promise<BucketStats> {
  const stats = emptyStats();
  const { data } = await supabase
    .from("checks" as any)
    .select("id, check_number, bank_name, partner_id, amount, due_date, status")
    .eq("direction", direction)
    .eq("is_deleted", false)
    .eq("is_archived", false)
    .not("status", "in", "(cleared,cancelled)");
  if (!data) return stats;

  const partnerIds = Array.from(new Set((data as any[]).map((c: any) => c.partner_id).filter(Boolean)));
  const { data: partners } = partnerIds.length
    ? await supabase.from("partners").select("id, name").in("id", partnerIds)
    : { data: [] as any[] };
  const partnerMap = new Map<string, string>((partners ?? []).map((p: any) => [p.id, p.name]));

  (data as any[]).forEach((c: any) => {
    const { bucket, daysLeft } = bucketFor(c.due_date);
    pushRow(stats, {
      id: c.id,
      ref: c.check_number,
      partyName: partnerMap.get(c.partner_id) ?? "—",
      amount: Number(c.amount || 0),
      dueDate: c.due_date,
      daysLeft,
      bucket,
      status: c.status,
      extra: c.bank_name ?? "",
    });
  });
  return stats;
}

export function useIncomingChecksBuckets() {
  return useQuery({
    queryKey: ["fin-dash", "checks-in"],
    queryFn: () => fetchChecksBuckets("incoming"),
    staleTime: 30_000,
  });
}
export function useOutgoingChecksBuckets() {
  return useQuery({
    queryKey: ["fin-dash", "checks-out"],
    queryFn: () => fetchChecksBuckets("outgoing"),
    staleTime: 30_000,
  });
}

export function useRecurringDue() {
  return useQuery({
    queryKey: ["fin-dash", "obligations"],
    queryFn: async (): Promise<BucketStats> => {
      const stats = emptyStats();
      const { data } = await supabase
        .from("recurring_obligations" as any)
        .select("id, name, vendor, category, amount, frequency, next_due_date, active")
        .eq("active", true)
        .eq("is_deleted", false)
        .eq("is_archived", false);
      (data as any[] | null)?.forEach((r: any) => {
        const { bucket, daysLeft } = bucketFor(r.next_due_date);
        pushRow(stats, {
          id: r.id,
          ref: r.name,
          partyName: r.vendor ?? "—",
          amount: Number(r.amount || 0),
          dueDate: r.next_due_date,
          daysLeft,
          bucket,
          status: r.category,
          extra: r.frequency,
        });
      });
      return stats;
    },
    staleTime: 30_000,
  });
}

export function useCashBankBalances() {
  return useQuery({
    queryKey: ["fin-dash", "cash-bank"],
    queryFn: async () => {
      const from = "1900-01-01";
      const to = new Date().toISOString().slice(0, 10);
      const [{ data: cashAccts }, { data: banks }] = await Promise.all([
        supabase.from("accounts").select("id, name, code").ilike("name", "%cash%"),
        supabase.from("bank_accounts").select("id, name, gl_account_id, opening_balance"),
      ]);
      let cash = 0;
      for (const a of cashAccts ?? []) {
        const { data } = await supabase.rpc("get_book_balance" as any, {
          _gl_account_id: (a as any).id,
          _from: from,
          _to: to,
        });
        cash += Number(data ?? 0);
      }
      let bank = 0;
      for (const b of banks ?? []) {
        let bal = Number((b as any).opening_balance || 0);
        if ((b as any).gl_account_id) {
          const { data } = await supabase.rpc("get_book_balance" as any, {
            _gl_account_id: (b as any).gl_account_id,
            _from: from,
            _to: to,
          });
          bal += Number(data ?? 0);
        }
        bank += bal;
      }
      return { cash, bank };
    },
    staleTime: 60_000,
  });
}

export function useMonthlyFlow() {
  return useQuery({
    queryKey: ["fin-dash", "monthly-flow"],
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const from = start.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("payments")
        .select("kind, amount, status, payment_date")
        .gte("payment_date", from)
        .eq("status", "posted")
        .eq("is_deleted", false)
        .eq("is_archived", false);
      let collections = 0;
      let paymentsOut = 0;
      (data ?? []).forEach((p: any) => {
        const amt = Number(p.amount || 0);
        if (p.kind === "receipt") collections += amt;
        else if (p.kind === "payment") paymentsOut += amt;
      });
      return { collections, payments: paymentsOut, net: collections - paymentsOut };
    },
    staleTime: 30_000,
  });
}
