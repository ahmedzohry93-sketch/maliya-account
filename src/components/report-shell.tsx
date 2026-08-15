import { type ReactNode, useState } from "react";
import { Filter, Download, FileSpreadsheet, FileText, ChevronDown, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccNode } from "@/lib/account-tree";

export function money(n: number) {
  const v = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${v})` : v;
}

/** Report page frame: title on one side, export/filter controls on the other,
 *  plus a report/detail view switch — matching the classic ERP statement layout. */
export function ReportShell({
  title,
  subtitle,
  view,
  onViewChange,
  onExcel,
  onPdf,
  filters,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  view?: "report" | "detail";
  onViewChange?: (v: "report" | "detail") => void;
  onExcel?: () => void;
  onPdf?: () => void;
  filters?: ReactNode;
  children: ReactNode;
}) {
  const [openFilters, setOpenFilters] = useState(false);
  return (
    <div className="w-full min-w-0 p-3 md:p-6 space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 order-2 sm:order-1 flex items-center gap-2">
          {filters && (
            <button
              onClick={() => setOpenFilters((o) => !o)}
              className={cn(
                "h-9 w-9 grid place-items-center rounded-lg border text-muted-foreground hover:bg-muted",
                openFilters && "border-primary/40 bg-primary/10 text-primary",
              )}
              title="تصفية"
            >
              <Filter className="w-4 h-4" />
            </button>
          )}
          {(onExcel || onPdf) && (
            <div className="flex items-center rounded-lg border overflow-hidden">
              <span className="grid h-9 w-9 place-items-center text-muted-foreground border-e">
                <Download className="w-4 h-4" />
              </span>
              {onExcel && (
                <button onClick={onExcel} className="h-9 px-3 text-xs font-medium hover:bg-muted flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
              )}
              {onPdf && (
                <button onClick={onPdf} className="h-9 px-3 text-xs font-medium hover:bg-muted flex items-center gap-1.5 border-s">
                  <FileText className="w-3.5 h-3.5" /> PDF
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 order-1 sm:order-2 text-start sm:text-end min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 num">{subtitle}</p>}
        </div>
      </header>

      {onViewChange && (
        <div className="flex justify-center">
          <div className="inline-flex rounded-lg bg-muted p-1 text-xs font-medium">
            <button
              onClick={() => onViewChange("detail")}
              className={cn("px-4 py-1.5 rounded-md", view === "detail" ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
            >
              كشف تفصيلي
            </button>
            <button
              onClick={() => onViewChange("report")}
              className={cn("px-4 py-1.5 rounded-md", view === "report" ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
            >
              عرض التقرير
            </button>
          </div>
        </div>
      )}

      {filters && openFilters && <div className="rounded-xl border bg-card p-3 md:p-4">{filters}</div>}

      {children}
    </div>
  );
}

/** A statement card: rows of label/value with blue section bands and total lines. */
export function StatementCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden shadow-sm", className)}>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

export function BandRow({ label }: { label: string }) {
  return (
    <div className="bg-primary/8 px-3 md:px-4 py-2 text-[12px] md:text-[13px] font-bold text-primary">{label}</div>
  );
}

export function LineRow({
  label,
  value,
  code,
  muted,
  indent,
  tone = "default",
}: {
  label: string;
  value: number | string;
  code?: string;
  muted?: boolean;
  indent?: boolean;
  tone?: "default" | "positive" | "negative";
}) {
  const v = typeof value === "number" ? money(value) : value;
  const neg = typeof value === "number" && value < 0;
  return (
    <div className={cn("flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 text-[12px] md:text-[13px]", muted && "text-muted-foreground")}>
      {code && <span className="num text-[10px] md:text-[11px] text-muted-foreground w-10 md:w-12 shrink-0">{code}</span>}
      <span className={cn("flex-1 min-w-0 truncate", indent && "ps-3 md:ps-4")}>{label}</span>
      <span
        className={cn(
          "num tabular-nums shrink-0",
          tone === "positive" && "text-success",
          (tone === "negative" || neg) && "text-destructive",
        )}
      >
        {v}
      </span>
    </div>
  );
}

export function TotalRow({
  label,
  value,
  strong,
  tone = "default",
}: {
  label: string;
  value: number | string;
  strong?: boolean;
  tone?: "default" | "positive" | "negative" | "brand";
}) {
  const v = typeof value === "number" ? money(value) : value;
  return (
    <div
      className={cn(
        "flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 text-[12px] md:text-[13px] font-bold border-t-2 border-border",
        strong ? "bg-primary/10 text-primary" : "bg-muted/50",
      )}
    >
      <span className="flex-1 min-w-0 truncate">{label}</span>
      <span
        className={cn(
          "num tabular-nums shrink-0",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
          tone === "brand" && "text-primary",
        )}
      >
        {v}
      </span>
    </div>
  );
}

/** Classic bordered data table used by detail views (trial balance, cash flow…). */
export function ReportTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] md:text-[13px] min-w-[640px]">
          <thead className="bg-primary/8 text-[11px] font-bold text-primary">{head}</thead>
          {children}
        </table>
      </div>
    </div>
  );
}

/** Collapsible account tree rows: a main account (e.g. Sales) expands into its sub-accounts. */
export function AccountTreeRows({ nodes, depth = 0 }: { nodes: AccNode[]; depth?: number }) {
  return (
    <>
      {nodes.map((n) => (
        <AccountTreeRow key={n.id} node={n} depth={depth} />
      ))}
    </>
  );
}

function AccountTreeRow({ node, depth }: { node: AccNode; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const hasKids = node.children.length > 0;
  const Chevron = open ? ChevronDown : ChevronLeft;
  return (
    <>
      <div
        role={hasKids ? "button" : undefined}
        onClick={hasKids ? () => setOpen((o) => !o) : undefined}
        className={cn(
          "flex items-center gap-2 px-3 md:px-4 py-2 text-[12px] md:text-[13px]",
          hasKids && "cursor-pointer hover:bg-muted/50",
          depth === 0 && "font-bold",
          depth === 1 && "font-semibold",
        )}
        style={{ paddingInlineStart: 12 + depth * 12 }}
      >
        {hasKids ? (
          <Chevron className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="num w-11 md:w-14 shrink-0 text-[10px] md:text-[11px] text-muted-foreground">{node.code}</span>
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className={cn("num tabular-nums shrink-0", node.amount < 0 && "text-destructive")}>
          {money(node.amount)}
        </span>
      </div>
      {open && hasKids && <AccountTreeRows nodes={node.children} depth={depth + 1} />}
    </>
  );
}
