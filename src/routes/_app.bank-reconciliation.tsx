import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/bank-reconciliation")({
  component: () => <Outlet />,
});
