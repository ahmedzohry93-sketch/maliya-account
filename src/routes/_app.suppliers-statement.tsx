import { pageMeta } from "@/lib/route-meta";
import { createFileRoute } from "@tanstack/react-router";
import { PartnerStatement } from "./_app.customers-statement";

export const Route = createFileRoute("/_app/suppliers-statement")({
  head: () => pageMeta("كشوف حساب الموردين", "حركات الموردين والأرصدة وكشوف الحساب التفصيلية حسب الفترة."),
  component: () => <PartnerStatement kind="supplier" />,
});
