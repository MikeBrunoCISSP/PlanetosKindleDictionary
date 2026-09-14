import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { TopMenuStrip } from "@/components/TopMenuStrip";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <div className="min-h-svh flex flex-col">
      <AppHeader />
      <TopMenuStrip />
      <Outlet />
    </div>
  ),
});
