import { createFileRoute, redirect } from "@tanstack/react-router";
import { apiMe } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/preferences")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: apiMe,
      staleTime: 30 * 1000,
    });
    if (!user) throw redirect({ to: "/login" });
  },
  component: PreferencesPage,
});

function PreferencesPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="container max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Preferences</h1>
        <p className="text-muted-foreground text-sm mt-1">Customize your experience.</p>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Appearance</h2>

        <div className="flex items-center justify-between">
          <Label htmlFor="dark-mode" className="flex flex-col gap-1 cursor-pointer items-start">
            <span className="font-medium">Dark Mode</span>
            <span className="text-sm text-muted-foreground">Switch between light and dark themes.</span>
          </Label>
          <Switch
            id="dark-mode"
            checked={theme === "dark"}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          />
        </div>
      </div>
    </div>
  );
}
