import { Fragment } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, ChevronDown, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF, type Section } from "@/lib/export-utils";
import { ReportShell, DateRangeFields } from "@/components/report-shell";
import { defaultPeriod, periodLabel } from "@/lib/report-period";

export const Route = createFileRoute("/_app/customers-statement")({ component: Page });

type Partner = { id: string; code: string | null; name: string; type: "customer" | "supplier" | "both"; phone: string | null; email: string | null };
type LineRow = { id: string; partner_id: string | null; debit: number; credit: number; description: string | null; journal_entries: { id: string; entry_no: number; entry_date: string; description: string | null; status: string } };

function Page() {
  return <PartnerStatement kind="customer" />;
}

export function PartnerStatement({ kind }: { kind: "customer" | "supplier" }) {
  const dp = defaultPeriod();
  const [from, setFrom] = useState(dp.from);
  const [to, setTo] = useState(dp.to);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: partners = [] } = useQuery({
    queryKey: ["partners", kind],
    queryFn: async () => {
      const { data } = await supabase
        .from("partners")
        .select("id, code, name, type, phone, email")
        .in("type", kind === "customer" ? ["customer", "both"] : ["supplier", "both"])
        .order("name");
      return (data ?? []) as Partner[];
    },
  });

  const { data: lines = [] } = useQuery({
    queryKey: ["partner-lines", kind, from, to],
    queryFn: async () => {
      let q = supabase
        .from("journal_lines")
        .select("id, partner_id, debit, credit, description, journal_entries!inner(id, entry_no, entry_date, description, status)")
        .not("partner_id", "is", null)
        .eq("journal_entries.status", "posted");
      if (from) q = q.gte("journal_entries.entry_date", from);
      if (to) q = q.lte("journal_entries.entry_date", to);
      const { data } = await q;
      return (data ?? []) as unknown as LineRow[];
    },
  });

  const partnerIds = useMemo(() => new Set(partners.map((p) => p.id)), [partners]);

  const grouped = useMemo(() => {
    const byPartner = new Map<string, LineRow[]>();
    for (const l of lines) {
      if (!l.partner_id || !partnerIds.has(l.partner_id)) continue;
      const arr = byPartner.get(l.partner_id) ?? [];
      arr.push(l);
      byPartner.set(l.partner_id, arr);
    }
    return partners.map((p) => {
      const rows = (byPartner.get(p.id) ?? []).sort((a, b) =>
        a.journal_entries.entry_date > b.journal_entries.entry_date ? 1 : -1,
      );
      let bal = 0;
      const enriched = rows.map((r) => {
        const delta = kind === "customer"
          ? Number(r.debit) - Number(r.credit)
          : Number(r.credit) - Number(r.debit);
        bal += delta;
        return { ...r, running: bal };
      });
      const totDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
      const totCredit = rows.reduce((s, r) => s + Number(r.credit), 0);
      return { partner: p, rows: enriched, totDebit, totCredit, balance: bal };
    });
  }, [partners, lines, partnerIds, kind]);

  const grandBalance = grouped.reduce((s, g) => s + g.balance, 0);
  const grandDebit = grouped.reduce((s, g) => s + g.totDebit, 0);
  const grandCredit = grouped.reduce((s, g) => s + g.totCredit, 0);

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const title = kind === "customer" ? "كشف حساب العملاء" : "كشف حساب الموردين";
  const dateMeta = from || to ? { date: `${from || "..."} → ${to || "..."}` } : {};

  const summarySection = (): Section => ({
    title: "ملخص الأرصدة",
    headers: ["الكود", "اسم الطرف", "إجمالي مدين", "إجمالي دائن", "الرصيد"],
    rows: grouped.map((g) => [g.partner.code || "—", g.partner.name, g.totDebit, g.totCredit, g.balance]),
    totals: ["", "الإجمالي", grandDebit, grandCredit, grandBalance],
  });

  const detailSection = (g: typeof grouped[number]): Section => ({
    title: `${g.partner.code ? g.partner.code + " - " : ""}${g.partner.name}`,
    headers: ["التاريخ", "رقم القيد", "البيان", "مدين", "دائن", "الرصيد"],
    rows: g.rows.map((r) => [
      r.journal_entries.entry_date,
      `#${r.journal_entries.entry_no}`,
      r.description || r.journal_entries.description || "",
      Number(r.debit) > 0 ? Number(r.debit) : "",
      Number(r.credit) > 0 ? Number(r.credit) : "",
      r.running,
    ]),
    totals: ["", "", "الإجمالي", g.totDebit, g.totCredit, g.balance],
  });

  const sections = (): Section[] => [summarySection(), ...grouped.filter((g) => g.rows.length > 0).map(detailSection)];

  const exportPartner = (g: typeof grouped[number], kindOf: "excel" | "pdf") => {
    const t = `${title} - ${g.partner.name}`;
    const fname = `${kind}-${g.partner.code || g.partner.id}`;
    const meta = { subtitle: g.partner.name, ...dateMeta };
    if (kindOf === "excel") exportToExcel(fname, t, [detailSection(g)], meta);
    else exportToPDF(fname, t, [detailSection(g)], meta);
  };

  return (
    <ReportShell
      title={title}
      subtitle={periodLabel(from, to)}
      onExcel={() => exportToExcel(kind + "s-statement", title, sections(), dateMeta)}
      onPdf={() => exportToPDF(kind + "s-statement", title, sections(), dateMeta)}
      filters={<DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} />}
    >
      <div className="rpt-block overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>

              <th className="w-8"></th>
              <th className="text-start px-4 py-3">الكود</th>
              <th className="text-start px-4 py-3">الاسم</th>
              <th className="text-start px-4 py-3 w-28">مدين</th>
              <th className="text-start px-4 py-3 w-28">دائن</th>
              <th className="text-start px-4 py-3 w-32">الرصيد</th>
              <th className="w-24 px-2 text-xs text-muted-foreground">تصدير</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">لا توجد بيانات</td></tr>
            )}
            {grouped.map((g) => {
              const open = openId === g.partner.id;
              const toggle = () => setOpenId(open ? null : g.partner.id);
              return (
                <Fragment key={g.partner.id}>
                  <tr className="border-t hover:bg-muted/30">
                    <td className="px-2 text-muted-foreground cursor-pointer" onClick={toggle}>{open ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}</td>
                    <td className="px-3 py-1.5 num text-muted-foreground cursor-pointer" onClick={toggle}>{g.partner.code || "—"}</td>
                    <td className="px-3 py-1.5 font-medium cursor-pointer" onClick={toggle}>{g.partner.name}</td>
                    <td className="px-3 py-1.5 num">{fmt(g.totDebit)}</td>
                    <td className="px-3 py-1.5 num">{fmt(g.totCredit)}</td>
                    <td className={`px-3 py-1.5 num font-semibold ${g.balance > 0 ? "text-emerald-600" : g.balance < 0 ? "text-red-600" : ""}`}>{fmt(g.balance)}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => exportPartner(g, "excel")} disabled={g.rows.length === 0} title="Excel" className="p-1.5 rounded hover:bg-muted disabled:opacity-30 text-emerald-700">
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => exportPartner(g, "pdf")} disabled={g.rows.length === 0} title="PDF" className="p-1.5 rounded hover:bg-muted disabled:opacity-30 text-rose-700">
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open && g.rows.length === 0 && (
                    <tr className="bg-muted/10"><td></td><td colSpan={6} className="px-4 py-3 text-center text-xs text-muted-foreground">لا حركة على هذا الطرف</td></tr>
                  )}
                  {open && g.rows.length > 0 && (
                    <tr className="bg-muted/10"><td></td>
                      <td colSpan={6} className="p-0">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40">
                            <tr>
                              <th className="text-start px-3 py-2">التاريخ</th>
                              <th className="text-start px-3 py-2">رقم القيد</th>
                              <th className="text-start px-3 py-2">البيان</th>
                              <th className="text-start px-3 py-2 w-24">مدين</th>
                              <th className="text-start px-3 py-2 w-24">دائن</th>
                              <th className="text-start px-3 py-2 w-28">الرصيد</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.rows.map((r) => (
                              <tr key={r.id} className="border-t border-border/50">
                                <td className="px-3 py-1.5 num">{r.journal_entries.entry_date}</td>
                                <td className="px-3 py-1.5 num">#{r.journal_entries.entry_no}</td>
                                <td className="px-3 py-1.5">{r.description || r.journal_entries.description || "—"}</td>
                                <td className="px-3 py-1.5 num">{Number(r.debit) > 0 ? fmt(Number(r.debit)) : ""}</td>
                                <td className="px-3 py-1.5 num">{Number(r.credit) > 0 ? fmt(Number(r.credit)) : ""}</td>
                                <td className="px-3 py-1.5 num font-medium">{fmt(r.running)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {grouped.length > 0 && (
            <tfoot className="bg-muted/40 font-bold border-t-2">
              <tr>
                <td></td>
                <td colSpan={2} className="px-3 py-2">إجمالي {kind === "customer" ? "العملاء" : "الموردين"}</td>
                <td className="px-4 py-3 num">{fmt(grandDebit)}</td>
                <td className="px-4 py-3 num">{fmt(grandCredit)}</td>
                <td className={`px-4 py-3 num ${grandBalance > 0 ? "text-emerald-600" : grandBalance < 0 ? "text-red-600" : ""}`}>{fmt(grandBalance)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ReportShell>
  );
}
