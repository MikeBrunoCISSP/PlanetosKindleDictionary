import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
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
      <TopMenuStrip placement="strip" />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <footer className="border-t px-4 py-6 text-sm text-muted-foreground sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <p>Dictionaries built by readers, for readers.</p>
          <Link to="/contact" className="underline underline-offset-2 hover:text-foreground">
            Contact us
          </Link>
        </div>
      </footer>
    </div>
  ),
});
