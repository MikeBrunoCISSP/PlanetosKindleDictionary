import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AdminUserDto } from "@planetos/shared";
import { apiMe, apiAdminGetUsers, apiAdminUpdateUser, ApiError } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: apiMe,
      staleTime: 30 * 1000,
    });
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "ADMIN") return { forbidden: true as const };
    return { forbidden: false as const };
  },
  component: AdminPage,
});

function AdminPage() {
  const { forbidden } = Route.useRouteContext();
  if (forbidden) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">403 Forbidden</h1>
          <p className="text-muted-foreground">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <UserManagementTable />
    </div>
  );
}

function UserManagementTable() {
  const queryClient = useQueryClient();
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const { data: users, isLoading, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => apiAdminGetUsers(),
  });

  const mutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof apiAdminUpdateUser>[1] }) =>
      apiAdminUpdateUser(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err, variables) => {
      const msg = err instanceof ApiError ? err.message : "An error occurred";
      setRowError((prev) => ({ ...prev, [variables.id]: msg }));
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading users…</p>;
  if (error) return <p className="text-destructive">Failed to load users.</p>;
  if (!users) return null;

  // Determine if there is exactly one active admin (for disabling last-admin UI guard)
  const activeAdminCount = users.filter((u) => u.role === "ADMIN" && u.isActive).length;
  const isLastAdmin = (u: AdminUserDto) =>
    u.role === "ADMIN" && u.isActive && activeAdminCount === 1;

  const act = (id: string, patch: Parameters<typeof apiAdminUpdateUser>[1]) => {
    setRowError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    mutation.mutate({ id, patch });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Display Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const last = isLastAdmin(user);
          const busy = mutation.isPending && mutation.variables?.id === user.id;
          return (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.displayName}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                  {user.role}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={user.isActive ? "default" : "outline"}>
                  {user.isActive ? "Active" : "Disabled"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 flex-wrap">
                  {user.isActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || last}
                      title={last ? "Cannot disable the last active admin" : undefined}
                      onClick={() => act(user.id, { isActive: false })}
                    >
                      Disable
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => act(user.id, { isActive: true })}
                    >
                      Enable
                    </Button>
                  )}
                  {user.role === "MEMBER" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => act(user.id, { role: "ADMIN" })}
                    >
                      Promote
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || last}
                      title={last ? "Cannot demote the last active admin" : undefined}
                      onClick={() => act(user.id, { role: "MEMBER" })}
                    >
                      Demote
                    </Button>
                  )}
                  {rowError[user.id] && (
                    <span className="text-destructive text-xs">{rowError[user.id]}</span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
