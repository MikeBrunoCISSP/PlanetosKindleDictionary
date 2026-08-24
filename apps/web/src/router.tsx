import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.js";
import { queryClient } from "./lib/queryClient.js";

export const router = createRouter({
  routeTree,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
