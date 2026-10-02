import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// UI gate only. Every admin server function must re-check has_role server-side.
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: "/chat" });
  },
  component: () => <Outlet />,
});
