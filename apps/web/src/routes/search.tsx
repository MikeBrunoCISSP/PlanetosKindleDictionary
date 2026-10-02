import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { SearchIcon } from "lucide-react";
import { seriesIdsFilterSchema } from "@planetos/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchResults } from "@/components/SearchResults";
import { DictionaryMultiSelect } from "@/components/DictionaryMultiSelect";

const searchPageSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  seriesIds: seriesIdsFilterSchema,
});

export const Route = createFileRoute("/search")({
  validateSearch: searchPageSearchSchema,
  component: SearchPage,
});

function SearchPage() {
  const { q, page, seriesIds } = Route.useSearch();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState(q ?? "");

  // Keep local input state in sync when the URL changes externally
  // (e.g. browser back/forward).
  useEffect(() => {
    setInputValue(q ?? "");
  }, [q]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = inputValue.trim();
    void navigate({ to: "/search", search: (prev) => ({ ...prev, q: trimmed || undefined, page: 1 }) });
  }

  function handleSeriesIdsChange(ids: string[]) {
    void navigate({
      to: "/search",
      search: (prev) => ({ ...prev, seriesIds: ids.length > 0 ? ids : undefined, page: 1 }),
    });
  }

  const hasQuery = Boolean(q && q.length > 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      {!hasQuery && (
        <div className="mb-8">
          <h1 className="text-4xl font-semibold sm:text-5xl">Look up a word</h1>
          <p className="mt-3 font-serif text-lg text-muted-foreground">
            Search headwords and their forms across every dictionary, or narrow it to the series you're reading.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-2">
        <form onSubmit={handleSubmit} role="search" className="flex min-w-56 flex-1 gap-2">
          <Input
            autoFocus={!hasQuery}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Search dictionary entries…"
            aria-label="Search dictionary entries"
            className={hasQuery ? "h-10 text-base" : "h-12 font-serif text-xl md:text-xl"}
          />
          <Button
            type="submit"
            size="icon"
            className={hasQuery ? "size-10" : "size-12"}
            aria-label="Search"
          >
            <SearchIcon className="size-5" />
          </Button>
        </form>
        <DictionaryMultiSelect
          selectedIds={seriesIds ?? []}
          onChange={handleSeriesIdsChange}
          triggerClassName={hasQuery ? "h-10 px-3" : "h-12 px-4 text-base"}
        />
      </div>
      {hasQuery ? (
        <div className="mt-8">
          <SearchResults query={q ?? ""} page={page} seriesIds={seriesIds ?? []} />
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Looking for a whole dictionary instead?{" "}
          <Link to="/downloads" className="underline underline-offset-2 hover:text-foreground">
            Download one
          </Link>
          .
        </p>
      )}
    </div>
  );
}
