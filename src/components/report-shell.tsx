import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useRouter } from "@tanstack/react-router";
import { Filter, Download, FileSpreadsheet, FileText, ChevronDown, ChevronLeft, ChevronsDownUp, ChevronsUpDown, MoreVertical, ArrowRight } from "lucide-react";
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
      <button type="button" onClick={onExpandAll} className="inline-flex items-center gap-1 rounded-none border px-2.5 py-1.5 hover:bg-muted">
        <ChevronsUpDown className="w-3.5 h-3.5" /> فتح الكل
      </button>
      <button type="button" onClick={onCollapseAll} className="inline-flex items-center gap-1 rounded-none border px-2.5 py-1.5 hover:bg-muted">
        <ChevronsDownUp className="w-3.5 h-3.5" /> طي الكل
      </button>
      <label className="inline-flex items-center gap-1.5 rounded-none border px-2.5 py-1.5 cursor-pointer hover:bg-muted">
        <input type="checkbox" checked={showZero} onChange={(e) => onShowZero(e.target.checked)} className="accent-primary" />
        إظهار الأرصدة الصفرية
      </label>
      {onCompare && (
        <label
          className={cn(
            "inline-flex items-center gap-1.5 rounded-none border px-2.5 py-1.5 cursor-pointer hover:bg-muted",
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

/** Compact stacked From/To fields used inside the small date filter popover. */
export function DateRangeFields({
  from,
  to,
  onFrom,
  onTo,
  children,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-[11px] font-medium text-muted-foreground block mb-1">من تاريخ</label>
        <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="inp h-8 w-full text-xs" />
      </div>
      <div>
        <label className="text-[11px] font-medium text-muted-foreground block mb-1">إلى تاريخ</label>
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="inp h-8 w-full text-xs" />
      </div>
      {children}
    </div>
  );
}

/** Report page frame: fixed-width centered sheet with an Odoo-like toolbar
 *  (back, view switch, export, compact date filter). */
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
  const router = useRouter();

  useEffect(() => {
    if (!openFilters) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-report-filter]")) return;
      setOpenFilters(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [openFilters]);

  return (
    <div className="w-full min-w-0 px-2 md:px-4 py-3 md:py-5">
      <div className="mx-auto w-full max-w-[1000px] min-w-0 space-y-3">
        <div className="sticky top-0 z-30 flex items-center gap-2 rounded-none border bg-card/95 backdrop-blur px-2 py-1.5 shadow-sm">
          <button
            onClick={() => router.history.back()}
            className="h-8 w-8 grid place-items-center rounded-none border text-muted-foreground hover:bg-muted shrink-0"
            title="رجوع"
          >
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="text-sm md:text-base font-bold truncate">{title}</h1>
            {subtitle && <p className="text-[10px] md:text-[11px] text-muted-foreground num truncate">{subtitle}</p>}
          </div>

          {onViewChange && (
            <div className="hidden sm:inline-flex rounded-none bg-muted p-0.5 text-[11px] font-medium shrink-0">
              <button
                onClick={() => onViewChange("detail")}
                className={cn("px-2.5 py-1 rounded-none", view === "detail" ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
              >
                كشف تفصيلي
              </button>
              <button
                onClick={() => onViewChange("report")}
                className={cn("px-2.5 py-1 rounded-none", view === "report" ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
              >
                عرض التقرير
              </button>
            </div>
          )}

          {(onExcel || onPdf) && (
            <div className="flex items-center rounded-none border overflow-hidden shrink-0">
              <span className="hidden md:grid h-8 w-8 place-items-center text-muted-foreground border-e">
                <Download className="w-4 h-4" />
              </span>
              {onExcel && (
                <button onClick={onExcel} className="h-8 px-2 text-[11px] font-medium hover:bg-muted flex items-center gap-1" title="تصدير Excel">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Excel</span>
                </button>
              )}
              {onPdf && (
                <button onClick={onPdf} className="h-8 px-2 text-[11px] font-medium hover:bg-muted flex items-center gap-1 border-s" title="تصدير PDF">
                  <FileText className="w-3.5 h-3.5" /> <span className="hidden sm:inline">PDF</span>
                </button>
              )}
            </div>
          )}

          {filters && (
            <div className="relative shrink-0" data-report-filter>
              <button
                onClick={() => setOpenFilters((o) => !o)}
                className={cn(
                  "h-8 w-8 grid place-items-center rounded-none border text-muted-foreground hover:bg-muted",
                  openFilters && "border-primary/40 bg-primary/10 text-primary",
                )}
                title="فلتر التاريخ"
              >
                <Filter className="w-4 h-4" />
              </button>
              {openFilters && (
                <div className="absolute end-0 top-full mt-1.5 w-56 rounded-none border bg-card p-2.5 shadow-lg z-40">
                  {filters}
                </div>
              )}
            </div>
          )}
        </div>

        {onViewChange && (
          <div className="sm:hidden flex justify-center">
            <div className="inline-flex rounded-none bg-muted p-1 text-xs font-medium">
              <button
                onClick={() => onViewChange("detail")}
                className={cn("px-3 py-1 rounded-none", view === "detail" ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
              >
                كشف تفصيلي
              </button>
              <button
                onClick={() => onViewChange("report")}
                className={cn("px-3 py-1 rounded-none", view === "report" ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
              >
                عرض التقرير
              </button>
            </div>
          </div>
        )}

        <ReportSheet title={title} subtitle={subtitle}>{children}</ReportSheet>

      </div>
    </div>
  );
}

/** Small ⋮ menu shown next to an account row: jump to ledger, journal or account data,
 *  carrying the account and the selected period. */
export function RowMenu({
  accountId,
  code,
  from,
  to,
}: {
  accountId?: string;
  code?: string;
  from?: string;
  to?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-row-menu]")) return;
      close();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 160;
    const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
    setPos({ top: r.bottom + 4, left });
  };

  const search = { account: accountId || undefined, from: from || undefined, to: to || undefined };
  const item = "block w-full text-start px-3 py-1.5 text-[11px] hover:bg-muted";

  return (
    <span className="shrink-0" data-row-menu onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="h-6 w-6 grid place-items-center rounded-none text-muted-foreground hover:bg-muted"
        title="إجراءات الحساب"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-row-menu
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 160 }}
            className="rounded-none border bg-card shadow-lg z-[100] overflow-hidden"
          >
            <Link to="/ledger" search={search} className={item} onClick={() => setPos(null)}>
              دفتر الأستاذ
            </Link>
            <Link to="/journal" search={search} className={item} onClick={() => setPos(null)}>
              قيود اليومية
            </Link>
            <Link to="/accounts" search={{ q: code || undefined }} className={item} onClick={() => setPos(null)}>
              بيانات الحساب
            </Link>
          </div>,
          document.body,
        )}
    </span>
  );
}



/** A statement card: rows of label/value with blue section bands and total lines. */
export function StatementCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-none border bg-card overflow-hidden shadow-sm", className)}>
      <div className="divide-y divide-border">{children}</div>
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
      <span className="w-6 shrink-0" />

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
    <div className="rounded-none border bg-card overflow-hidden shadow-sm">
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
  period,
}: {
  nodes: AccNode[];
  depth?: number;
  compare?: boolean;
  /** Bump with a positive number to expand all, negative to collapse all. */
  expandSignal?: number;
  /** Selected report period, forwarded to the per-row ⋮ actions. */
  period?: { from?: string; to?: string };
}) {
  return (
    <>
      {nodes.map((n) => (
        <AccountTreeRow key={n.id} node={n} depth={depth} compare={compare} expandSignal={expandSignal} period={period} />
      ))}
    </>
  );
}

function AccountTreeRow({
  node,
  depth,
  compare,
  expandSignal,
  period,
}: {
  node: AccNode;
  depth: number;
  compare?: boolean;
  expandSignal?: number;
  period?: { from?: string; to?: string };
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
        <RowMenu accountId={node.id} code={node.code} from={period?.from} to={period?.to} />
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
        <AccountTreeRows nodes={node.children} depth={depth + 1} compare={compare} expandSignal={expandSignal} period={period} />
      )}
    </>

  );
}
