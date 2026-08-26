import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { AdminUserDto, PendingUserDto } from "@planetos/shared";
import {
  apiMe,
  apiAdminGetUsers,
  apiAdminUpdateUser,
  apiGetPendingUsers,
  apiApproveRegistration,
  apiDenyRegistration,
  ApiError,
} from "@/lib/api";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: apiMe,
      staleTime: 30 * 1000,
    });
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "ADMIN") throw redirect({ to: "/" });
  },
  component: AdminPage,
});

function AdminPage() {
  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <h2 className="text-lg font-semibold mb-3">Pending Registrations</h2>
      <PendingRegistrationsTable />
      <h2 className="text-lg font-semibold mt-8 mb-3">Users</h2>
      <UserManagementTable />
    </div>
  );
}

function PendingRegistrationsTable() {
  const queryClient = useQueryClient();
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [reasonTarget, setReasonTarget] = useState<PendingUserDto | null>(null);
  const [denyTarget, setDenyTarget] = useState<PendingUserDto | null>(null);

  const {
    data: pendingUsers,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "users", "pending"],
    queryFn: () => apiGetPendingUsers(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiApproveRegistration(id),
    onSuccess: () => {
      toast.success("Registration approved.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err, id) => {
      const msg = err instanceof ApiError ? err.message : "An error occurred";
      setRowError((prev) => ({ ...prev, [id]: msg }));
    },
  });

  const denyMutation = useMutation({
    mutationFn: (id: string) => apiDenyRegistration(id),
    onSuccess: () => {
      toast.success("Registration denied.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setDenyTarget(null);
    },
    onError: (err, id) => {
      const msg = err instanceof ApiError ? err.message : "An error occurred";
      setRowError((prev) => ({ ...prev, [id]: msg }));
      setDenyTarget(null);
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading pending registrations…</p>;
  if (error) return <p className="text-destructive">Failed to load pending registrations.</p>;
  if (!pendingUsers) return null;

  function approve(id: string) {
    setRowError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    approveMutation.mutate(id);
  }

  return (
    <>
      {pendingUsers.length === 0 ? (
        <p className="text-muted-foreground mb-4">No pending registrations.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Reason for Joining</TableHead>
              <TableHead>Approve/Deny</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingUsers.map((user) => {
              const approveBusy = approveMutation.isPending && approveMutation.variables === user.id;
              const denyBusy = denyMutation.isPending && denyMutation.variables === user.id;
              const busy = approveBusy || denyBusy;
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell className="max-w-xs">
                    <button
                      type="button"
                      className="truncate block max-w-xs text-left underline underline-offset-2 hover:no-underline"
                      onClick={() => setReasonTarget(user)}
                    >
                      {user.reasonForJoining ?? "—"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => approve(user.id)}>
                        {approveBusy ? "Approving..." : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setDenyTarget(user)}
                      >
                        Deny
                      </Button>
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
      )}

      <Dialog
        open={reasonTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReasonTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonTarget?.username}'s Reason for Joining</DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap">{reasonTarget?.reasonForJoining}</p>
        </DialogContent>
      </Dialog>

      <Dialog
        open={denyTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDenyTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny Registration</DialogTitle>
            <DialogDescription>
              Are you sure you want to deny this registration? The user account will be permanently
              deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenyTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={denyMutation.isPending}
              onClick={() => {
                if (denyTarget) denyMutation.mutate(denyTarget.id);
              }}
            >
              {denyMutation.isPending ? "Denying..." : "Deny"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
          <TableHead>Username</TableHead>
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
              <TableCell className="font-medium">{user.username}</TableCell>
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
