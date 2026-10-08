import { pageMeta } from "@/lib/route-meta";
import { createFileRoute } from "@tanstack/react-router";
import { PartnerWorkspace } from "@/components/partner-workspace";

export const Route = createFileRoute("/_app/suppliers")({
  head: () => pageMeta("الموردون وفواتيرهم", "قائمة الموردين وفواتير المشتريات والمدفوعات وكشوف الحساب."),
  component: () => <PartnerWorkspace kind="supplier" />,
});
