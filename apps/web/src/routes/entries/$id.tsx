import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { XIcon } from "lucide-react";
import {
  submitEntryEditProposalSchema,
  normalizeWord,
  DUPLICATE_WORD_MESSAGE,
  type SubmitEntryEditProposalDto,
  type PublicEntryDto,
} from "@planetos/shared";
import { apiGetEntryPublic, apiGetSeriesWords, apiSubmitEntryEditProposal, ApiError } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/entries/$id")({
  component: EntryDetailPage,
});

function EntryDetailPage() {
  const { id } = Route.useParams();
  const me = useMe();
  const [mode, setMode] = useState<"view" | "edit">("view");

  const { data: entry, isLoading, error } = useQuery({
    queryKey: ["entries", id],
    queryFn: () => apiGetEntryPublic(id),
  });

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>;
  if (error || !entry) return <p className="p-8 text-destructive">Entry not found.</p>;

  const canEdit = Boolean(me) && entry.approvalStatus === "APPROVED";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      {mode === "edit" ? (
        <EntryEditForm entry={entry} onCancel={() => setMode("view")} onSubmitted={() => setMode("view")} />
      ) : (
        <>
          {canEdit && (
            <Button variant="outline" onClick={() => setMode("edit")}>
              Edit
            </Button>
          )}
          {entry.approvalStatus === "PENDING" && (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              This entry is awaiting administrator approval.
            </p>
          )}
          <EntryReadOnlyView entry={entry} />
        </>
      )}
    </div>
  );
}

function EntryReadOnlyView({ entry }: { entry: PublicEntryDto }) {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">{entry.headword}</h1>
      <div
        className="text-sm"
        // definitionHtml is sanitized to a strict allowlist server-side on save
        // (SPEC.md §5.4, packages/shared/sanitize.ts) before it can ever reach
        // storage - there is no path for unsanitized markup to appear here.
        // eslint-disable-next-line react/no-danger -- see comment above
        dangerouslySetInnerHTML={{ __html: entry.definitionHtml }}
      />
      <div>
        <p className="mb-1 text-sm font-medium">Inflections</p>
        {entry.inflections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No inflections.</p>
        ) : (
          <ul className="list-inside list-disc text-sm">
            {entry.inflections.map((inflection) => (
              <li key={inflection.id}>{inflection.value}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EntryEditForm({
  entry,
  onCancel,
  onSubmitted,
}: {
  entry: PublicEntryDto;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);
  const [inflectionDraft, setInflectionDraft] = useState("");

  const { data: existingWords = [] } = useQuery({
    queryKey: ["series", entry.seriesSlug, "entries", "words"],
    queryFn: () => apiGetSeriesWords(entry.seriesSlug),
    staleTime: 30_000,
  });

  const ownWords = new Set([
    normalizeWord(entry.headword),
    ...entry.inflections.map((inflection) => normalizeWord(inflection.value)),
  ]);
  const existingNormalized = new Set(existingWords.map(normalizeWord).filter((word) => !ownWords.has(word)));

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<SubmitEntryEditProposalDto>({
    resolver: zodResolver(submitEntryEditProposalSchema),
    defaultValues: {
      definitionHtml: entry.definitionHtml,
      inflections: entry.inflections.map((inflection) => inflection.value),
    },
    mode: "onChange",
  });

  const definitionHtml = watch("definitionHtml");
  const inflections = watch("inflections") ?? [];

  // Normalized baseline captured once, when edit mode is entered - used for
  // real (non-cosmetic) dirty-state detection instead of react-hook-form's
  // own formState.isDirty, which compares raw string equality against
  // defaultValues and can't tell "retyped the same text" from a real edit.
  const baselineRef = useRef({
    definition: normalizeWord(entry.definitionHtml),
    inflections: entry.inflections.map((inflection) => normalizeWord(inflection.value)).sort(),
  });

  const currentNormalizedInflections = [...inflections].map(normalizeWord).sort();
  const isReallyDirty =
    normalizeWord(definitionHtml ?? "") !== baselineRef.current.definition ||
    JSON.stringify(currentNormalizedInflections) !== JSON.stringify(baselineRef.current.inflections);

  const mutation = useMutation({
    mutationFn: (data: SubmitEntryEditProposalDto) => apiSubmitEntryEditProposal(entry.id, data),
    onSuccess: async (result) => {
      toast.success(
        result.status === "APPROVED"
          ? "Your edit has been applied and is now live."
          : "Your edit has been submitted for approval."
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "review-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["entries", entry.id] });
      onSubmitted();
    },
    onError: (err) => {
      setApiError(err instanceof ApiError ? err.message : "An error occurred");
    },
  });

  function addInflection() {
    const trimmed = inflectionDraft.trim();
    if (!trimmed) return;
    const normalized = normalizeWord(trimmed);

    const isDuplicate =
      normalized === normalizeWord(entry.headword) ||
      existingNormalized.has(normalized) ||
      inflections.some((value) => normalizeWord(value) === normalized);

    if (isDuplicate) {
      toast.error(DUPLICATE_WORD_MESSAGE);
      return;
    }

    setValue("inflections", [...inflections, trimmed], { shouldValidate: true });
    setInflectionDraft("");
  }

  function removeInflection(value: string) {
    setValue(
      "inflections",
      inflections.filter((existing) => existing !== value),
      { shouldValidate: true }
    );
  }

  const canSubmit = isReallyDirty && isValid && !mutation.isPending;

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setApiError(null);
        mutation.mutate(data);
      })}
      className="space-y-4"
    >
      <div className="space-y-1">
        <Label htmlFor="headword">Headword</Label>
        <Input id="headword" value={entry.headword} disabled readOnly />
      </div>

      <div className="space-y-1">
        <Label htmlFor="definitionHtml">Definition</Label>
        <Textarea
          id="definitionHtml"
          {...register("definitionHtml")}
          aria-invalid={!!errors.definitionHtml}
          rows={6}
        />
        {errors.definitionHtml && <p className="text-sm text-destructive">{errors.definitionHtml.message}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="inflection-draft">Inflections</Label>
        <div className="flex gap-2">
          <Input
            id="inflection-draft"
            value={inflectionDraft}
            onChange={(event) => setInflectionDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addInflection();
              }
            }}
            placeholder="Add an inflection"
          />
          <Button type="button" variant="outline" onClick={addInflection}>
            Add
          </Button>
        </div>
        {inflections.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {inflections.map((value) => (
              <Badge key={value} variant="secondary" className="gap-1">
                {value}
                <button
                  type="button"
                  onClick={() => removeInflection(value)}
                  aria-label={`Remove ${value}`}
                  className="ml-0.5"
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {errors.inflections && <p className="text-sm text-destructive">{errors.inflections.message}</p>}
      </div>

      {apiError && <p className="text-sm text-destructive">{apiError}</p>}

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {mutation.isPending ? "Submitting..." : "Submit"}
        </Button>
      </div>
    </form>
  );
}
