import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { SearchResultItemDto } from "@planetos/shared";
import { apiSearchEntries } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function SearchResults({
  query,
  page,
  seriesIds,
}: {
  query: string;
  page: number;
  seriesIds: string[];
}) {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["search", query, page, seriesIds],
    queryFn: () => apiSearchEntries(query, page, seriesIds),
    enabled: query.length > 0,
  });

  if (isLoading) return <p className="text-muted-foreground">Searching…</p>;
  if (error) return <p className="text-destructive">Couldn't load results. Try searching again.</p>;
  if (!data) return null;

  if (data.items.length === 0) {
    return (
      <p className="font-serif text-lg text-muted-foreground">
        No entries match &ldquo;{query}&rdquo;. Try a different spelling or another dictionary.
      </p>
    );
  }

  function goToPage(newPage: number) {
    void navigate({ to: "/search", search: (prev) => ({ ...prev, q: query, page: newPage }) });
  }

  return (
    <div className="space-y-8">
      <ol className="divide-y border-y">
        {data.items.map((item) => (
          <SearchResultRow key={item.entryId} item={item} query={query} />
        ))}
      </ol>

      {data.totalPages > 1 && (
        <nav aria-label="Search result pages" className="flex items-center justify-between gap-4">
          <Button variant="outline" disabled={data.page <= 1} onClick={() => goToPage(data.page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            Page {data.page} of {data.totalPages}
          </span>
          <Button variant="outline" disabled={data.page >= data.totalPages} onClick={() => goToPage(data.page + 1)}>
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}

// Marks the part of a matched word that the query hit; falls back to the
// whole word when the server matched it some other way (e.g. normalization).
function MatchedWord({ text, query }: { text: string; query: string }) {
  const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (index < 0) return <mark>{text}</mark>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

function SearchResultRow({ item, query }: { item: SearchResultItemDto; query: string }) {
  return (
    <li className="grid gap-x-6 gap-y-1 py-5 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <Link
          to="/entries/$id"
          params={{ id: item.entryId }}
          className="font-headword text-2xl leading-tight font-medium hover:underline hover:underline-offset-4"
        >
          {item.headwordMatched ? <MatchedWord text={item.headword} query={query} /> : item.headword}
        </Link>
        {item.inflections.length > 0 && (
          <p className="mt-0.5 font-serif text-muted-foreground">
            also{" "}
            {item.inflections.map((inflection, index) => (
              <span key={inflection.value}>
                {index > 0 && ", "}
                <em>{inflection.matched ? <MatchedWord text={inflection.value} query={query} /> : inflection.value}</em>
              </span>
            ))}
          </p>
        )}
        <p className="mt-1.5 line-clamp-2 max-w-[68ch] font-serif text-[1.05rem] leading-relaxed">
          {item.definitionExcerpt}
        </p>
      </div>
      <Link
        to="/series/$slug"
        params={{ slug: item.seriesSlug }}
        className="self-start truncate text-sm text-muted-foreground italic hover:text-foreground sm:max-w-48 sm:pt-1.5"
      >
        {item.seriesTitle}
      </Link>
    </li>
  );
}
