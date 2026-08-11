import { Link } from "@tanstack/react-router";
import {
  ShoppingCart, Package2, ArrowDownToLine, ArrowUpFromLine,
  BookOpen, UserPlus, PackagePlus, BarChart3, Zap,
} from "lucide-react";

const ACTIONS: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
  { to: "/customers", label: "فاتورة بيع", icon: ShoppingCart, tone: "text-success bg-success/10" },
  { to: "/suppliers", label: "فاتورة شراء", icon: Package2, tone: "text-warning bg-warning/15" },
  { to: "/checks", label: "سند قبض", icon: ArrowDownToLine, tone: "text-success bg-success/10" },
  { to: "/checks", label: "سند صرف", icon: ArrowUpFromLine, tone: "text-destructive bg-destructive/10" },
  { to: "/journal-entry/new", label: "قيد يومية", icon: BookOpen, tone: "text-primary bg-primary/10" },
  { to: "/customers", label: "إضافة عميل", icon: UserPlus, tone: "text-primary bg-primary/10" },
  { to: "/products", label: "إضافة منتج", icon: PackagePlus, tone: "text-accent-foreground bg-accent/25" },
  { to: "/income-statement", label: "تقرير الأرباح", icon: BarChart3, tone: "text-primary bg-primary/10" },
];

export function QuickActions() {
  return (
    <section className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2.5 px-1">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="w-3.5 h-3.5" />
        </span>
        <span className="text-[13px] font-bold">أزرار الإجراءات السريعة المقترحة</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        {ACTIONS.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="flex items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2.5 text-[12px] font-semibold hover:border-primary/40 hover:shadow-sm transition"
          >
            <span className="truncate">{a.label}</span>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${a.tone}`}>
              <a.icon className="w-4 h-4" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
