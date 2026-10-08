import { pageMeta } from "@/lib/route-meta";
import { createFileRoute } from "@tanstack/react-router";
import { PartnerWorkspace } from "@/components/partner-workspace";

export const Route = createFileRoute("/_app/customers")({
  head: () => pageMeta("العملاء وفواتيرهم", "قائمة العملاء وفواتير المبيعات والمقبوضات وكشوف الحساب."),
  component: () => <PartnerWorkspace kind="customer" />,
});
