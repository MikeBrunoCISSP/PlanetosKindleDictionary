import { useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { MAX_IMPORT_ENTRIES, type SeriesListItemDto } from "@planetos/shared";
import { apiMe, apiGetSeriesList, apiImportEntries, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export const Route = createFileRoute("/entries/import")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: apiMe,
      staleTime: 30 * 1000,
    });
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "ADMIN") throw redirect({ to: "/" });
  },
  component: EntryImportPage,
});

function EntryImportPage() {
  return (
    <div className="p-4 sm:p-8 max-w-3xl w-full mx-auto">
      <h1 className="text-2xl font-bold mb-2">Import Entries</h1>
      <p className="text-muted-foreground mb-6">
        Create entries in bulk from a JSON file mapping headwords to definitions and inflections. Existing headwords
        are skipped, not overwritten.
      </p>
      <ImportEntriesForm />
    </div>
  );
}

interface ImportEntryValue {
  Definition: string;
  Inflections: string[];
}

function ImportEntriesForm() {
  const [selectedSeries, setSelectedSeries] = useState<SeriesListItemDto | null>(null);
  const [dictionaryPickerOpen, setDictionaryPickerOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsedEntries, setParsedEntries] = useState<Record<string, ImportEntryValue> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: seriesList = [] } = useQuery({
    queryKey: ["series", "list"],
    queryFn: () => apiGetSeriesList(),
    staleTime: 60_000,
    enabled: dictionaryPickerOpen,
  });

  const mutation = useMutation({
    mutationFn: () => apiImportEntries(selectedSeries!.slug, parsedEntries!),
    onSuccess: (result) => {
      const parts = [`${result.createdCount} created`];
      if (result.skippedDuplicateCount > 0) parts.push(`${result.skippedDuplicateCount} skipped (already exists)`);
      if (result.skippedInvalidCount > 0) parts.push(`${result.skippedInvalidCount} skipped (invalid)`);
      const message = parts.join(", ") + (result.truncated ? " - list truncated." : ".");
      if (result.droppedInflectionCount > 0) {
        toast.warning(message + " Not all inflections could be included.");
      } else {
        toast.success(message);
      }
      setParsedEntries(null);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Import failed.");
    },
  });

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileError(null);
    setParsedEntries(null);
    setFileName(null);
    if (!file) return;

    let text: string;
    try {
      text = await file.text();
    } catch {
      setFileError("Could not read this file.");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setFileError("This file is not valid JSON.");
      return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setFileError("The file must contain a single JSON object mapping headwords to definitions.");
      return;
    }

    const entries = parsed as Record<string, unknown>;
    const keys = Object.keys(entries);
    if (keys.length === 0) {
      setFileError("The file contains no entries.");
      return;
    }
    if (keys.length > MAX_IMPORT_ENTRIES) {
      setFileError(`An import file can contain at most ${MAX_IMPORT_ENTRIES.toLocaleString()} entries.`);
      return;
    }
    function isShapeValid(value: unknown): boolean {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
      const { Definition, Inflections } = value as { Definition?: unknown; Inflections?: unknown };
      if (typeof Definition !== "string") return false;
      if (Inflections !== undefined && !Array.isArray(Inflections)) return false;
      return true;
    }
    if (!Object.values(entries).every(isShapeValid)) {
      setFileError('Every value in the file must be an object like { "Definition": "...", "Inflections": [...] }.');
      return;
    }

    const normalizedEntries: Record<string, ImportEntryValue> = {};
    for (const [headword, value] of Object.entries(entries)) {
      const { Definition, Inflections } = value as { Definition: string; Inflections?: unknown[] };
      normalizedEntries[headword] = { Definition, Inflections: (Inflections ?? []) as string[] };
    }

    setParsedEntries(normalizedEntries);
    setFileName(file.name);
  }

  const canImport = selectedSeries !== null && parsedEntries !== null && !mutation.isPending;

  return (
    <div className="space-y-6">
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
      </div>

      <div className="space-y-4">
        <Label htmlFor="import-file">Import file (JSON)</Label>

        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <UploadIcon /> Choose file
          </Button>
          <input
            ref={fileInputRef}
            id="import-file"
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => void handleFileChange(event)}
          />
          {!fileError && fileName && (
            <p className="text-sm text-muted-foreground">
              <span className="font-mono font-medium text-foreground">{fileName}</span>
              {" — "}
              {Object.keys(parsedEntries ?? {}).length.toLocaleString()} entries
            </p>
          )}
        </div>
        {fileError && <p className="text-sm text-destructive">{fileError}</p>}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Expected format
          </p>
          <pre className="rounded-md border bg-muted px-3.5 py-3 font-mono text-xs leading-relaxed overflow-x-auto">
            <code>
              {"{\n  "}
              <span className="font-semibold">{'"Abelon"'}</span>
              {": {\n    "}
              {'"Definition": '}
              <span className="text-muted-foreground">{'"Abelon was an archmaester of the Citadel.",'}</span>
              {"\n    "}
              {'"Inflections": '}
              <span className="text-foreground/70 italic">{"[]"}</span>
              {"\n  },\n  "}
              <span className="font-semibold">{'"Braavos"'}</span>
              {": {\n    "}
              {'"Definition": '}
              <span className="text-muted-foreground">
                {'"The wealthiest of the Free Cities.'}
                <span className="font-semibold not-italic text-foreground">{"\\n\\n"}</span>
                {'Located in the Great Lagoon.",'}
              </span>
              {"\n    "}
              {'"Inflections": '}
              <span className="text-foreground/70 italic">{'["Braavosi", "Braavosian"]'}</span>
              {"\n  }\n}"}
            </code>
          </pre>
          <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
            <span>
              <span className="inline-block size-2 rounded-sm bg-foreground mr-1.5 align-middle" />
              headword
            </span>
            <span>
              <span className="inline-block size-2 rounded-sm bg-muted-foreground mr-1.5 align-middle" />
              definition
            </span>
            <span>
              <span className="inline-block size-2 rounded-sm border border-foreground/70 mr-1.5 align-middle" />
              inflections
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Button type="button" disabled={!canImport} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Importing..." : "Import"}
        </Button>

        {mutation.isPending && (
          <div className="space-y-2 max-w-sm">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2Icon className="size-3.5 animate-spin" /> Importing entries&hellip;
            </p>
            <Progress />
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground max-w-prose">
        Rows are skipped, not rejected outright: a headword that already exists (matched case-insensitively),
        contains spaces, or has an empty or oversized definition is left out of the import, and the rest of the file
        is still processed. Newlines in a definition become line breaks. An individual inflection that's invalid,
        duplicates its own headword, or repeats another inflection in the same row is left out rather than skipping
        that row.
      </p>

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
                }}
              >
                {series.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
