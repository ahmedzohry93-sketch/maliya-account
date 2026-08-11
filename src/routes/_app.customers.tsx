import { createFileRoute } from "@tanstack/react-router";
import { PartnerWorkspace } from "@/components/partner-workspace";

export const Route = createFileRoute("/_app/customers")({
  component: () => <PartnerWorkspace kind="customer" />,
});
