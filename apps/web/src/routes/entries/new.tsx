import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { XIcon } from "lucide-react";
import { createEntrySchema, normalizeWord, DUPLICATE_WORD_MESSAGE, type CreateEntryDto } from "@planetos/shared";
import type { SeriesListItemDto } from "@planetos/shared";
import { apiMe, apiGetSeriesList, apiGetSeriesWords, apiCreateEntry, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export const Route = createFileRoute("/entries/new")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: apiMe,
      staleTime: 30 * 1000,
    });
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "ADMIN" && user.approvalStatus !== "APPROVED") throw redirect({ to: "/" });
  },
  component: EntryNewPage,
});

function EntryNewPage() {
  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Add Entry</h1>
      <CreateEntryForm />
    </div>
  );
}

function CreateEntryForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);
  const [dictionaryError, setDictionaryError] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<SeriesListItemDto | null>(null);
  const [dictionaryPickerOpen, setDictionaryPickerOpen] = useState(false);
  const [inflectionDraft, setInflectionDraft] = useState("");

  const { data: seriesList = [] } = useQuery({
    queryKey: ["series", "list"],
    queryFn: () => apiGetSeriesList(),
    staleTime: 60_000,
    enabled: dictionaryPickerOpen,
  });

  const { data: existingWords = [] } = useQuery({
    queryKey: ["series", selectedSeries?.slug, "entries", "words"],
    queryFn: () => apiGetSeriesWords(selectedSeries!.slug),
    enabled: selectedSeries !== null,
    staleTime: 30_000,
  });
  const existingNormalized = new Set(existingWords.map(normalizeWord));

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<CreateEntryDto>({
    resolver: zodResolver(createEntrySchema),
    defaultValues: { headword: "", definitionHtml: "", inflections: [] },
  });

  const headword = watch("headword");
  const inflections = watch("inflections") ?? [];

  const mutation = useMutation({
    mutationFn: (data: CreateEntryDto) => apiCreateEntry(selectedSeries!.slug, data),
    onSuccess: async (entry) => {
      toast.success(
        entry.approvalStatus === "APPROVED"
          ? "Your entry has been saved and is now live."
          : "Your entry has been saved. It must be approved before it can be included in the generated Kindle dictionary."
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "entries", "pending"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "review-queue"] });
      await navigate({ to: "/" });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setError("headword", { message: DUPLICATE_WORD_MESSAGE });
        return;
      }
      setApiError(err instanceof ApiError ? err.message : "An error occurred");
    },
  });

  function checkHeadwordDuplicate() {
    if (!headword) return;
    if (existingNormalized.has(normalizeWord(headword))) {
      setError("headword", { message: DUPLICATE_WORD_MESSAGE });
    } else {
      clearErrors("headword");
    }
  }

  function addInflection() {
    const trimmed = inflectionDraft.trim();
    if (!trimmed) return;
    const normalized = normalizeWord(trimmed);

    const isDuplicate =
      normalized === normalizeWord(headword ?? "") ||
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

  return (
    <form
      onSubmit={handleSubmit((data) => {
        if (!selectedSeries) {
          setDictionaryError("Please select a dictionary.");
          return;
        }
        setDictionaryError(null);
        setApiError(null);
        mutation.mutate(data);
      })}
      className="space-y-4"
    >
      <div className="space-y-1">
        <Label>Dictionary</Label>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={() => setDictionaryPickerOpen(true)}
        >
          {selectedSeries ? selectedSeries.title : "Select a dictionary..."}
        </Button>
        {dictionaryError && <p className="text-sm text-destructive">{dictionaryError}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="headword">Headword</Label>
        <Input
          id="headword"
          {...register("headword")}
          onBlur={checkHeadwordDuplicate}
          aria-invalid={!!errors.headword}
          placeholder="Headword"
        />
        {errors.headword && <p className="text-sm text-destructive">{errors.headword.message}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="definitionHtml">Definition</Label>
        <Textarea
          id="definitionHtml"
          {...register("definitionHtml")}
          aria-invalid={!!errors.definitionHtml}
          placeholder="Definition"
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

      <Button type="submit" disabled={isSubmitting || mutation.isPending}>
        {mutation.isPending ? "Saving..." : "Add Entry"}
      </Button>

      <CommandDialog open={dictionaryPickerOpen} onOpenChange={setDictionaryPickerOpen} title="Select Dictionary">
        <CommandInput placeholder="Search dictionaries..." />
        <CommandList>
          <CommandEmpty>No dictionaries found.</CommandEmpty>
          <CommandGroup>
            {seriesList.map((series) => (
              <CommandItem
                key={series.id}
                value={series.title}
                onSelect={() => {
                  setDictionaryPickerOpen(false);
                  setSelectedSeries(series);
                  setDictionaryError(null);
                }}
              >
                {series.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </form>
  );
}
