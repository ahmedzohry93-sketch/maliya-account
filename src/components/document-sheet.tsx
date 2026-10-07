import type { ReactNode } from "react";
import { ArrowRight, Printer } from "lucide-react";
import { useCompanySettings } from "@/lib/company";
import { Button } from "@/components/ui/button";

export function DocumentHeader({ title, number }: { title: string; number?: string | number }) {
  const { data: c } = useCompanySettings();
  return <div className="rpt-head">
    <div><div className="rpt-company-name">{c?.name ?? "الشركة"}</div>
      <div className="rpt-company">{c?.address && <div>{c.address}</div>}
        {(c?.phone || c?.tax_number) && <div className="num">{[c?.phone, c?.tax_number && `ر.ض ${c.tax_number}`].filter(Boolean).join(" · ")}</div>}
      </div></div>
    <div className="rpt-title-block"><div className="rpt-title">{title}</div>
      {number !== undefined && <div>رقم: <b className="num">{number}</b></div>}
      <div className="num">تاريخ الطباعة: {new Date().toLocaleDateString("en-GB")}</div>
    </div>
  </div>;
}

export function DocumentFooter() {
  const { data: c } = useCompanySettings();
  return <div className="rpt-foot"><span>{c?.footer_note ?? ""}</span><span className="num">{new Date().toLocaleDateString("en-GB")}</span></div>;
}

/** Unified action bar used above every document (same look as the report toolbar). */
export function DocToolbar({ title, onBack, actions }: { title: string; onBack?: () => void; actions?: ReactNode }) {
  return (
    <div className="doc-toolbar doc-noprint">
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack} className="doc-btn" aria-label="رجوع">
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        <h1 className="truncate text-base font-bold sm:text-lg">{title}</h1>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {actions}
         <Button type="button" variant="outline" onClick={() => window.print()} className="doc-btn" aria-label="طباعة">
          <Printer className="h-4 w-4" /> <span className="hidden sm:inline">طباعة</span>
         </Button>
      </div>
    </div>
  );
}

/** Classic white document sheet with company header, meta row and signature footer. Prints as-is. */
export function DocSheet({
  title, number, meta, children, totals, signatures = ["أعدّه", "راجعه", "اعتمده"],
}: {
  title: string; number?: string | number; meta?: { label: string; value: ReactNode }[];
  children: ReactNode; totals?: { label: string; value: ReactNode; strong?: boolean }[]; signatures?: string[];
}) {
  return (
    <div className="document-viewport mx-auto w-full max-w-[1000px] overflow-x-auto">
      <div className="rpt-sheet">
        <DocumentHeader title={title} number={number} />
        {meta && meta.length > 0 && (
          <div className="rpt-meta">
            {meta.map((m) => (
              <div key={m.label}><span>{m.label}: </span><b>{m.value}</b></div>
            ))}
          </div>
        )}
        {children}
        {totals && totals.length > 0 && (
          <table className="document-totals">
            <tbody>
              {totals.map((t) => (
                <tr key={t.label} className={t.strong ? "rpt-grand" : undefined}>
                  <td>{t.label}</td>
                  <td className="num text-left">{t.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {signatures.length > 0 && <div className="document-signatures">
          {signatures.map((s) => (
            <div key={s}>{s}</div>
          ))}
        </div>}
        <DocumentFooter />
      </div>
    </div>
  );
}

/** Classic status chip used in all document lists. */
export function StatusChip({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    draft: ["مسودة", "bg-muted text-muted-foreground"],
    posted: ["مرحّل", "bg-success/15 text-success"],
    sent: ["مُرسل", "bg-warning/20 text-warning-foreground"],
    received: ["مُستلم", "bg-success/15 text-success"],
  };
  const [label, cls] = map[status] ?? [status, "bg-muted"];
  return <span className={`inline-block px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
