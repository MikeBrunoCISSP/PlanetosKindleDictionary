import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { normalizeWord, type PendingQueueItemDto } from "@planetos/shared";
import {
  apiMe,
  apiGetReviewQueue,
  apiGetEntry,
  apiApproveEntry,
  apiRejectEntry,
  apiGetEntryEditProposal,
  apiApproveEntryEditProposal,
  apiRejectEntryEditProposal,
  ApiError,
} from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingQueueItemDto | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const {
    data: items,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "review-queue"],
    queryFn: () => apiGetReviewQueue(),
  });

  const approveMutation = useMutation({
    mutationFn: (item: PendingQueueItemDto) =>
      item.type === "NEW_ENTRY" ? apiApproveEntry(item.id) : apiApproveEntryEditProposal(item.id),
    onSuccess: (_data, item) => {
      toast.success(item.type === "EDIT" ? "Edit approved." : "Entry approved.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "review-queue"] });
    },
    onError: (err, item) => {
      const msg = err instanceof ApiError ? err.message : "An error occurred";
      setRowError((prev) => ({ ...prev, [item.id]: msg }));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ item, note }: { item: PendingQueueItemDto; note: string }) => {
      if (item.type === "NEW_ENTRY") {
        await apiRejectEntry(item.id, { note: note.trim() || undefined });
      } else {
        await apiRejectEntryEditProposal(item.id, { note: note.trim() || undefined });
      }
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.item.type === "EDIT" ? "Edit rejected." : "Entry rejected.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "review-queue"] });
      setRejectTarget(null);
      setRejectNote("");
    },
    onError: (err, variables) => {
      const msg = err instanceof ApiError ? err.message : "An error occurred";
      setRowError((prev) => ({ ...prev, [variables.item.id]: msg }));
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading entries…</p>;
  if (error) return <p className="text-destructive">Failed to load entries.</p>;
  if (!items) return null;

  function approve(item: PendingQueueItemDto) {
    setRowError((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    approveMutation.mutate(item);
  }

  return (
    <>
      {items.length === 0 ? (
        <p className="text-muted-foreground">No pending entries.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Headword</TableHead>
              <TableHead>Approve/Reject</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const approveBusy = approveMutation.isPending && approveMutation.variables?.id === item.id;
              const rejectBusy = rejectMutation.isPending && rejectMutation.variables?.item.id === item.id;
              const busy = approveBusy || rejectBusy;
              return (
                <TableRow key={`${item.type}-${item.id}`}>
                  <TableCell>
                    <Badge variant={item.type === "EDIT" ? "secondary" : "default"}>
                      {item.type === "EDIT" ? "Edit" : "New Entry"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="font-medium underline underline-offset-2 hover:no-underline"
                      onClick={() =>
                        item.type === "EDIT" ? setDetailProposalId(item.id) : setDetailEntryId(item.id)
                      }
                    >
                      {item.headword}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => approve(item)}>
                        {approveBusy ? "Approving..." : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setRejectTarget(item);
                          setRejectNote("");
                        }}
                      >
                        Reject
                      </Button>
                      {rowError[item.id] && (
                        <span className="text-destructive text-xs">{rowError[item.id]}</span>
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

      <EntryEditProposalDetailsDialog
        proposalId={detailProposalId}
        onOpenChange={(open) => {
          if (!open) setDetailProposalId(null);
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
            <DialogTitle>{rejectTarget?.type === "EDIT" ? "Reject Edit" : "Reject Entry"}</DialogTitle>
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
                if (rejectTarget) rejectMutation.mutate({ item: rejectTarget, note: rejectNote });
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

function EntryEditProposalDetailsDialog({
  proposalId,
  onOpenChange,
}: {
  proposalId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: proposal, isLoading } = useQuery({
    queryKey: ["admin", "entry-edit-proposals", "detail", proposalId],
    queryFn: () => apiGetEntryEditProposal(proposalId!),
    enabled: proposalId !== null,
  });

  const currentInflections = proposal?.current.inflections.map((i) => i.value) ?? [];
  const proposedInflections = proposal?.proposed.inflections ?? [];
  const currentNormalized = new Set(currentInflections.map(normalizeWord));
  const proposedNormalized = new Set(proposedInflections.map(normalizeWord));
  const added = proposedInflections.filter((value) => !currentNormalized.has(normalizeWord(value)));
  const removed = currentInflections.filter((value) => !proposedNormalized.has(normalizeWord(value)));
  const unchanged = currentInflections.filter((value) => proposedNormalized.has(normalizeWord(value)));
  const definitionChanged =
    proposal !== undefined && normalizeWord(proposal.current.definitionHtml) !== normalizeWord(proposal.proposed.definitionHtml);

  return (
    <Dialog open={proposalId !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{proposal?.current.headword ?? "Edit Details"}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : proposal ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">
                Current Definition{definitionChanged && <span className="text-muted-foreground"> (changed)</span>}
              </p>
              {/* Both sides are already-sanitized definitionHtml - see EntryDetailsDialog's comment above. */}
              <div
                className="text-sm"
                // eslint-disable-next-line react/no-danger -- see comment above
                dangerouslySetInnerHTML={{ __html: proposal.current.definitionHtml }}
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Proposed Definition</p>
              <div
                className="text-sm"
                // eslint-disable-next-line react/no-danger -- see comment above
                dangerouslySetInnerHTML={{ __html: proposal.proposed.definitionHtml }}
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Inflections</p>
              {unchanged.length === 0 && added.length === 0 && removed.length === 0 ? (
                <p className="text-sm text-muted-foreground">No inflections.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {unchanged.map((value) => (
                    <Badge key={`kept-${value}`} variant="secondary">
                      {value}
                    </Badge>
                  ))}
                  {added.map((value) => (
                    <Badge key={`added-${value}`} variant="default">
                      + {value}
                    </Badge>
                  ))}
                  {removed.map((value) => (
                    <Badge key={`removed-${value}`} variant="outline" className="line-through opacity-60">
                      {value}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
