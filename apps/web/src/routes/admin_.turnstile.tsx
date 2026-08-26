import { useEffect, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiMe, apiGetTurnstileSettings, apiUpdateTurnstileSettings, apiTestTurnstileConfig, ApiError } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin_/turnstile")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: apiMe,
      staleTime: 30 * 1000,
    });
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "ADMIN") throw redirect({ to: "/" });
  },
  component: TurnstileAdminPage,
});

function TurnstileAdminPage() {
  return (
    <div className="p-4 sm:p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Turnstile</h1>
      <TurnstileSettingsForm />
    </div>
  );
}

function TurnstileSettingsForm() {
  const queryClient = useQueryClient();
  const initialized = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState("");
  const [secretKey, setSecretKey] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "turnstile"],
    queryFn: apiGetTurnstileSettings,
  });

  useEffect(() => {
    if (data && !initialized.current) {
      setEnabled(data.enabled);
      setSiteKey(data.siteKey ?? "");
      initialized.current = true;
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiUpdateTurnstileSettings({
        enabled,
        siteKey: siteKey.trim() || null,
        ...(secretKey.trim() ? { secretKey: secretKey.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success("Turnstile settings saved.");
      setSecretKey("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "turnstile"] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Failed to save settings.";
      toast.error(msg);
    },
  });

  const testMutation = useMutation({
    mutationFn: apiTestTurnstileConfig,
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Secret Key is recognized by Cloudflare.");
      } else {
        toast.error("Secret Key could not be verified. Check the configuration.");
      }
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Failed to test configuration.";
      toast.error(msg);
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-destructive">Failed to load Turnstile settings.</p>;

  return (
    <div className="rounded-lg border bg-card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Label htmlFor="turnstile-enabled" className="flex flex-col gap-1 cursor-pointer items-start">
          <span className="font-medium">Enabled</span>
          <span className="text-sm text-muted-foreground">
            Require Cloudflare Turnstile verification on registration.
          </span>
        </Label>
        <Switch id="turnstile-enabled" checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="turnstile-site-key">Site Key</Label>
        <Input
          id="turnstile-site-key"
          value={siteKey}
          onChange={(event) => setSiteKey(event.target.value)}
          placeholder="1x00000000000000000000AA"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="turnstile-secret-key">Secret Key</Label>
        <Input
          id="turnstile-secret-key"
          type="password"
          value={secretKey}
          onChange={(event) => setSecretKey(event.target.value)}
          placeholder={data?.secretConfigured ? "•••••••••• (unchanged)" : "Not configured"}
          autoComplete="off"
        />
        <p className="text-sm text-muted-foreground">
          Secret Key: {data?.secretConfigured ? "Configured" : "Not configured"}
          {data?.updatedAt && ` · Last updated ${new Date(data.updatedAt).toLocaleString()}`}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || !data?.secretConfigured}
        >
          {testMutation.isPending ? "Testing…" : "Test Configuration"}
        </Button>
      </div>
    </div>
  );
}
