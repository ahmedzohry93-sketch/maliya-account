import { createFileRoute } from "@tanstack/react-router";
import { PartnerStatement } from "./_app.customers-statement";

export const Route = createFileRoute("/_app/suppliers-statement")({
  component: () => <PartnerStatement kind="supplier" />,
});
