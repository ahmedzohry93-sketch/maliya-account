import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "مالية — النظام المحاسبي" },
    { name: "description", content: "إدارة الحسابات والفواتير والمخزون والتقارير المالية." },
    { property: "og:title", content: "مالية — النظام المحاسبي" },
    { property: "og:description", content: "نظام موحد للحسابات والفواتير والمخزون والتقارير المالية." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
    throw redirect({ to: "/login" });
  },
  component: () => (
    <div className="min-h-screen flex items-center justify-center">
      <span className="text-primary">انتقال...</span>
    </div>
  ),
});
