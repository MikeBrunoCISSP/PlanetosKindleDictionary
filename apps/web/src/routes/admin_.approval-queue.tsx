import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { EntrySummaryDto } from "@planetos/shared";
import {
  apiMe,
  apiGetPendingEntries,
  apiGetEntry,
  apiApproveEntry,
  apiRejectEntry,
  ApiError,
} from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin_/approval-queue")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: apiMe,
      staleTime: 30 * 1000,
    });
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "ADMIN") throw redirect({ to: "/" });
  },
  component: ApprovalQueuePage,
});

function ApprovalQueuePage() {
  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Approval Queue</h1>
      <ApprovalQueueTable />
    </div>
  );
}

function ApprovalQueueTable() {
  const queryClient = useQueryClient();
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<EntrySummaryDto | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const {
    data: entries,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "entries", "pending"],
    queryFn: () => apiGetPendingEntries(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiApproveEntry(id),
    onSuccess: () => {
      toast.success("Entry approved.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "entries", "pending"] });
    },
    onError: (err, id) => {
      const msg = err instanceof ApiError ? err.message : "An error occurred";
      setRowError((prev) => ({ ...prev, [id]: msg }));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiRejectEntry(id, { note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success("Entry rejected.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "entries", "pending"] });
      setRejectTarget(null);
      setRejectNote("");
    },
    onError: (err, variables) => {
      const msg = err instanceof ApiError ? err.message : "An error occurred";
      setRowError((prev) => ({ ...prev, [variables.id]: msg }));
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading entries…</p>;
  if (error) return <p className="text-destructive">Failed to load entries.</p>;
  if (!entries) return null;

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
      {entries.length === 0 ? (
        <p className="text-muted-foreground">No pending entries.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Headword</TableHead>
              <TableHead>Approve/Reject</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const approveBusy = approveMutation.isPending && approveMutation.variables === entry.id;
              const rejectBusy = rejectMutation.isPending && rejectMutation.variables?.id === entry.id;
              const busy = approveBusy || rejectBusy;
              return (
                <TableRow key={entry.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="font-medium underline underline-offset-2 hover:no-underline"
                      onClick={() => setDetailEntryId(entry.id)}
                    >
                      {entry.headword}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => approve(entry.id)}>
                        {approveBusy ? "Approving..." : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setRejectTarget(entry);
                          setRejectNote("");
                        }}
                      >
                        Reject
                      </Button>
                      {rowError[entry.id] && (
                        <span className="text-destructive text-xs">{rowError[entry.id]}</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <EntryDetailsDialog
        entryId={detailEntryId}
        onOpenChange={(open) => {
          if (!open) setDetailEntryId(null);
        }}
      />

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Entry</DialogTitle>
            <DialogDescription>
              Optionally explain why <strong>{rejectTarget?.headword}</strong> is being rejected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="reject-note">Note</Label>
            <Textarea
              id="reject-note"
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
              placeholder="Optional note"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={() => {
                if (rejectTarget) rejectMutation.mutate({ id: rejectTarget.id, note: rejectNote });
              }}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EntryDetailsDialog({
  entryId,
  onOpenChange,
}: {
  entryId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: entry, isLoading } = useQuery({
    queryKey: ["admin", "entries", "detail", entryId],
    queryFn: () => apiGetEntry(entryId!),
    enabled: entryId !== null,
  });

  return (
    <Dialog open={entryId !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry?.headword ?? "Entry Details"}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : entry ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Definition</p>
              {/*
                definitionHtml is sanitized to a strict allowlist server-side
                on save (SPEC.md §5.4, packages/shared/sanitize.ts) before it
                can ever reach storage - there is no path for unsanitized
                markup to appear here.
              */}
              <div
                className="text-sm"
                // eslint-disable-next-line react/no-danger -- see comment above
                dangerouslySetInnerHTML={{ __html: entry.definitionHtml }}
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Inflections</p>
              {entry.inflections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No inflections.</p>
              ) : (
                <ul className="list-disc list-inside text-sm">
                  {entry.inflections.map((inflection) => (
                    <li key={inflection.id}>{inflection.value}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
