import { createFileRoute, redirect } from "@tanstack/react-router";
import { apiMe } from "@/lib/api";

export const Route = createFileRoute("/entries/delete")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: apiMe,
      staleTime: 30 * 1000,
    });
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "ADMIN") throw redirect({ to: "/" });
  },
  component: EntryDeletePage,
});

function EntryDeletePage() {
  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Delete Entry</h1>
      <p className="text-muted-foreground">Coming soon.</p>
    </div>
  );
}
