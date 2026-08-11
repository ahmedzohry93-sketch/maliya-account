import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { restoreRecord, type LifecycleTable } from "@/lib/records";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/archive")({
  head: () => ({
    meta: [
      { title: "الأرشيف وسلة المحذوفات | ماليّة" },
      { name: "description", content: "استعراض واستعادة السجلات المؤرشفة والمحذوفة في نظام ماليّة المحاسبي." },
      { property: "og:title", content: "الأرشيف وسلة المحذوفات | ماليّة" },
      { property: "og:description", content: "استعراض واستعادة السجلات المؤرشفة والمحذوفة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArchivePage,
});

interface TableDef {
  table: LifecycleTable;
  label: string;
  select: string;
  title: (r: Record<string, unknown>) => string;
  sub: (r: Record<string, unknown>) => string;
}

const DEFS: TableDef[] = [
  {
    table: "invoices",
    label: "الفواتير",
    select: "id, invoice_no, invoice_date, total, type, status, is_deleted, is_archived, deleted_at, archived_at",
    title: (r) => `${r["type"] === "sale" ? "فاتورة بيع" : "فاتورة شراء"} #${r["invoice_no"]}`,
    sub: (r) => `${r["invoice_date"]} · ${Number(r["total"] ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  },
  {
    table: "payments",
    label: "السندات",
    select: "id, payment_no, payment_date, amount, kind, is_deleted, is_archived, deleted_at, archived_at",
    title: (r) => `${r["kind"] === "receipt" ? "سند قبض" : "سند صرف"} #${r["payment_no"]}`,
    sub: (r) => `${r["payment_date"]} · ${Number(r["amount"] ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  },
  {
    table: "journal_entries",
    label: "قيود اليومية",
    select: "id, entry_no, entry_date, description, status, is_deleted, is_archived, deleted_at, archived_at",
    title: (r) => `قيد #${r["entry_no"]}`,
    sub: (r) => `${r["entry_date"]} · ${(r["description"] as string) ?? "—"}`,
  },
  {
    table: "partners",
    label: "العملاء والموردون",
    select: "id, code, name, type, is_deleted, is_archived, deleted_at, archived_at",
    title: (r) => String(r["name"] ?? "—"),
    sub: (r) => String(r["code"] ?? "—"),
  },
  {
    table: "products",
    label: "الأصناف",
    select: "id, sku, name, stock_qty, is_deleted, is_archived, deleted_at, archived_at",
    title: (r) => String(r["name"] ?? "—"),
    sub: (r) => String(r["sku"] ?? "—"),
  },
  {
    table: "fixed_assets",
    label: "الأصول الثابتة",
    select: "id, code, name, cost, is_deleted, is_archived, deleted_at, archived_at",
    title: (r) => String(r["name"] ?? "—"),
    sub: (r) => String(r["code"] ?? "—"),
  },
  {
    table: "checks",
    label: "الشيكات",
    select: "id, check_number, amount, due_date, is_deleted, is_archived, deleted_at, archived_at",
    title: (r) => `شيك ${r["check_number"]}`,
    sub: (r) => `${r["due_date"]} · ${Number(r["amount"] ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  },
  {
    table: "recurring_obligations",
    label: "الالتزامات الدورية",
    select: "id, name, amount, next_due_date, is_deleted, is_archived, deleted_at, archived_at",
    title: (r) => String(r["name"] ?? "—"),
    sub: (r) => `${r["next_due_date"]} · ${Number(r["amount"] ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  },
];

function ArchivePage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"archived" | "deleted">("archived");
  const [active, setActive] = useState<LifecycleTable>("invoices");

  const def = DEFS.find((d) => d.table === active)!;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["archive", active, mode],
    queryFn: async () => {
      let q = supabase.from(active).select(def.select);
      q = mode === "deleted" ? q.eq("is_deleted", true) : q.eq("is_archived", true).eq("is_deleted", false);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Record<string, unknown>[];
    },
  });

  const restore = useMutation({
    mutationFn: (id: string) => restoreRecord(active, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive"] });
      qc.invalidateQueries();
      toast.success("تمت الاستعادة");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 mb-6 sm:flex sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="icon-chip shrink-0">
            <Archive className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl md:text-2xl font-bold tracking-tight">الأرشيف وسلة المحذوفات</h1>
            <p className="text-xs text-muted-foreground truncate">استعادة السجلات المؤرشفة أو المحذوفة</p>
          </div>
        </div>
        <div className="inline-flex rounded-lg border p-0.5 shrink-0">
          {(["archived", "deleted"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md",
                mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {m === "archived" ? "مؤرشف" : "محذوف"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {DEFS.map((d) => (
          <button
            key={d.table}
            onClick={() => setActive(d.table)}
            className={cn(
              "px-3 py-1.5 rounded-full border text-xs font-medium",
              active === d.table ? "border-primary/40 bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 grid place-items-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Trash2 className="w-6 h-6 mx-auto mb-2 opacity-40" />
            لا توجد سجلات {mode === "deleted" ? "محذوفة" : "مؤرشفة"}
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={String(r["id"])} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{def.title(r)}</div>
                  <div className="text-[11px] text-muted-foreground truncate num">{def.sub(r)}</div>
                </div>
                <span className="hidden sm:block text-[11px] text-muted-foreground num shrink-0">
                  {String(r[mode === "deleted" ? "deleted_at" : "archived_at"] ?? "").slice(0, 10)}
                </span>
                <button
                  onClick={() => restore.mutate(String(r["id"]))}
                  disabled={restore.isPending}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-muted"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t("common.restore") === "common.restore" ? "استعادة" : t("common.restore")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
