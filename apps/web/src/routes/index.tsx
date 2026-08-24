import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { apiMe, apiLogout } from "@/lib/api";
import { useMe, ME_QUERY_KEY } from "@/lib/useMe";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: apiMe,
      staleTime: 30 * 1000,
    });
    if (!user) throw redirect({ to: "/login" });
  },
  component: IndexPage,
});

function IndexPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();

  const handleLogout = async () => {
    await apiLogout();
    queryClient.setQueryData(ME_QUERY_KEY, null);
    void navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Welcome to Planetos</h1>
        {me ? (
          <>
            <p className="text-muted-foreground">
              Signed in as <strong>{me.displayName}</strong> ({me.email})
            </p>
            <Button variant="outline" onClick={() => void handleLogout()}>
              Log out
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">You are not signed in.</p>
        )}
      </div>
    </div>
  );
}
