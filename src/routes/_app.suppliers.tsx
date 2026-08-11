import { createFileRoute } from "@tanstack/react-router";
import { PartnerWorkspace } from "@/components/partner-workspace";

export const Route = createFileRoute("/_app/suppliers")({
  component: () => <PartnerWorkspace kind="supplier" />,
});
