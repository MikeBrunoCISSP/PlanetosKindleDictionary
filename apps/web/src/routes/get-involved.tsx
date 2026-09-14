import { createFileRoute, Link } from "@tanstack/react-router";
import { useMe } from "@/lib/useMe";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/get-involved")({
  component: GetInvolvedPage,
});

function GetInvolvedPage() {
  const me = useMe();
  const isPending = me != null && me.role !== "ADMIN" && me.approvalStatus !== "APPROVED";

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Add and Edit Dictionary Entries</CardTitle>
            <CardDescription>
              Registering an account and being approved lets you add new dictionary entries and edit
              existing ones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <p className="text-sm text-muted-foreground">
                Your account is awaiting administrator approval. Once approved, you'll be able to add and
                edit dictionary entries.
              </p>
            ) : (
              <Link to="/login" className={cn(buttonVariants({ variant: "default" }), "w-full")}>
                Log In / Register
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
