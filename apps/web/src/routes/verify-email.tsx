import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { apiVerifyEmail } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const verifyEmailSearchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/verify-email")({
  validateSearch: verifyEmailSearchSchema,
  component: VerifyEmailPage,
});

type Status = "verifying" | "success" | "invalid";

function VerifyEmailPage() {
  const { token } = Route.useSearch();
  const [status, setStatus] = useState<Status>(token ? "verifying" : "invalid");
  // Guards against React 18 StrictMode's dev-only double-invocation of
  // effects: without this, the verification request could fire twice for
  // the same token, and since the token is single-use, the second call
  // would always come back "invalid" even though the first one succeeded.
  // Deliberately not using a cleanup-set "cancelled" flag here: StrictMode's
  // simulated unmount would run the first invocation's cleanup (the one
  // whose fetch actually survives, since this guard skips the second one),
  // which would then suppress that fetch's own setStatus call on completion
  // and leave the page stuck on "Verifying" forever.
  const requestedTokenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!token || requestedTokenRef.current === token) return;
    requestedTokenRef.current = token;

    (async () => {
      try {
        await apiVerifyEmail({ token });
        setStatus("success");
      } catch {
        // Any failure (invalid/expired/reused token, or a network error)
        // shows the same "invalid or expired" state - there's nothing more
        // specific and actionable to tell the visitor.
        setStatus("invalid");
      }
    })();
  }, [token]);

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          {status === "verifying" && (
            <>
              <CardHeader>
                <CardTitle>Verifying your email…</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">One moment.</p>
              </CardContent>
            </>
          )}
          {status === "success" && (
            <>
              <CardHeader>
                <CardTitle>Email Verified</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="text-sm">Your email address has been verified. You can now sign in.</p>
                <Link
                  to="/login"
                  search={{ mode: "login" }}
                  className="text-sm underline underline-offset-2 hover:no-underline"
                >
                  Go to Sign In
                </Link>
              </CardContent>
            </>
          )}
          {status === "invalid" && (
            <>
              <CardHeader>
                <CardTitle>Invalid or Expired Link</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  This verification link is invalid or has expired. Try signing in — if your email
                  still needs verifying, you'll be able to request a new link from there.
                </p>
                <Link
                  to="/login"
                  search={{ mode: "login" }}
                  className="text-sm underline underline-offset-2 hover:no-underline"
                >
                  Go to Sign In
                </Link>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
