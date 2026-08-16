import { type ReactNode, useEffect, useState } from "react";
import { Filter, Download, FileSpreadsheet, FileText, ChevronDown, ChevronLeft, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccNode } from "@/lib/account-tree";
import { pctChange } from "@/lib/account-tree";

export function money(n: number) {
  const v = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${v})` : v;
}

export function pctText(cur: number, prev: number) {
  const p = pctChange(cur, prev);
  if (p === null) return "—";
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}

/** Shared controls for tree reports: expand/collapse all, zero balances, period comparison. */
export function TreeToolbar({
  onExpandAll,
  onCollapseAll,
  showZero,
  onShowZero,
  compare,
  onCompare,
  compareDisabled,
}: {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  showZero: boolean;
  onShowZero: (v: boolean) => void;
  compare?: boolean;
  onCompare?: (v: boolean) => void;
  compareDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] md:text-xs">
      <button type="button" onClick={onExpandAll} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 hover:bg-muted">
        <ChevronsUpDown className="w-3.5 h-3.5" /> فتح الكل
      </button>
      <button type="button" onClick={onCollapseAll} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 hover:bg-muted">
        <ChevronsDownUp className="w-3.5 h-3.5" /> طي الكل
      </button>
      <label className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 cursor-pointer hover:bg-muted">
        <input type="checkbox" checked={showZero} onChange={(e) => onShowZero(e.target.checked)} className="accent-primary" />
        إظهار الأرصدة الصفرية
      </label>
      {onCompare && (
        <label
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 cursor-pointer hover:bg-muted",
            compareDisabled && "opacity-50 cursor-not-allowed",
          )}
          title={compareDisabled ? "حدّد من تاريخ وإلى تاريخ لتفعيل المقارنة" : undefined}
        >
          <input
            type="checkbox"
            checked={!!compare}
            disabled={compareDisabled}
            onChange={(e) => onCompare(e.target.checked)}
            className="accent-primary"
          />
          مقارنة بالفترة السابقة
        </label>
      )}
    </div>
  );
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

/** Column captions shown above tree rows when the comparison mode is on. */
export function TreeHeadRow({ compare }: { compare?: boolean }) {
  if (!compare) return null;
  return (
    <div className="flex items-center gap-2 px-3 md:px-4 py-1.5 text-[10px] md:text-[11px] font-semibold text-muted-foreground bg-muted/40">
      <span className="w-3.5 shrink-0" />
      <span className="w-11 md:w-14 shrink-0">الكود</span>
      <span className="flex-1 min-w-0">الحساب</span>
      <span className="shrink-0">الفترة الحالية</span>
      <span className="w-20 md:w-24 shrink-0 text-end">الفترة السابقة</span>
      <span className="w-14 md:w-16 shrink-0 text-end">التغير %</span>
    </div>
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
  prev,
  compare,
}: {
  label: string;
  value: number | string;
  strong?: boolean;
  tone?: "default" | "positive" | "negative" | "brand";
  prev?: number;
  compare?: boolean;
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
      {compare && (
        <>
          <span className="num tabular-nums shrink-0 w-20 md:w-24 text-end">{money(prev ?? 0)}</span>
          <span className="num tabular-nums shrink-0 w-14 md:w-16 text-end">
            {typeof value === "number" ? pctText(value, prev ?? 0) : "—"}
          </span>
        </>
      )}
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
export function AccountTreeRows({
  nodes,
  depth = 0,
  compare,
  expandSignal,
}: {
  nodes: AccNode[];
  depth?: number;
  compare?: boolean;
  /** Bump with a positive number to expand all, negative to collapse all. */
  expandSignal?: number;
}) {
  return (
    <>
      {nodes.map((n) => (
        <AccountTreeRow key={n.id} node={n} depth={depth} compare={compare} expandSignal={expandSignal} />
      ))}
    </>
  );
}

function AccountTreeRow({
  node,
  depth,
  compare,
  expandSignal,
}: {
  node: AccNode;
  depth: number;
  compare?: boolean;
  expandSignal?: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  useEffect(() => {
    if (!expandSignal) return;
    setOpen(expandSignal > 0);
  }, [expandSignal]);
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
        {compare && (
          <>
            <span className="num tabular-nums shrink-0 w-20 md:w-24 text-end text-muted-foreground">{money(node.prev)}</span>
            <span
              className={cn(
                "num tabular-nums shrink-0 w-14 md:w-16 text-end",
                node.amount - node.prev > 0 && "text-success",
                node.amount - node.prev < 0 && "text-destructive",
              )}
            >
              {pctText(node.amount, node.prev)}
            </span>
          </>
        )}
      </div>
      {open && hasKids && (
        <AccountTreeRows nodes={node.children} depth={depth + 1} compare={compare} expandSignal={expandSignal} />
      )}
    </>
  );
}
