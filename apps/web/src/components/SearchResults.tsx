import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { SearchResultItemDto } from "@planetos/shared";
import { apiSearchEntries } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export function SearchResults({ query, page }: { query: string; page: number }) {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["search", query, page],
    queryFn: () => apiSearchEntries(query, page),
    enabled: query.length > 0,
  });

  if (isLoading) return <p className="text-muted-foreground">Loading search results…</p>;
  if (error) return <p className="text-destructive">Failed to load search results.</p>;
  if (!data) return null;

  if (data.items.length === 0) {
    return <p className="text-muted-foreground">No results for &quot;{query}&quot;.</p>;
  }

  function goToPage(newPage: number) {
    void navigate({ to: "/", search: (prev) => ({ ...prev, q: query, page: newPage }) });
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dictionary</TableHead>
            <TableHead>Word</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((item) => (
            <SearchResultRow key={item.entryId} item={item} />
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => goToPage(data.page - 1)}>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {data.page} of {data.totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={data.page >= data.totalPages}
          onClick={() => goToPage(data.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function SearchResultRow({ item }: { item: SearchResultItemDto }) {
  return (
    <TableRow>
      <TableCell className="align-top whitespace-normal">{item.seriesTitle}</TableCell>
      <TableCell className="max-w-xl align-top whitespace-normal">
        {item.headwordMatched ? <strong>{item.headword}</strong> : item.headword}
        <p className="mt-1 text-sm text-muted-foreground">{item.definitionExcerpt}</p>
        {item.inflections.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {item.inflections.map((inflection, index) => (
              <span key={inflection.value}>
                {index > 0 && ", "}
                {inflection.matched ? <strong>{inflection.value}</strong> : inflection.value}
              </span>
            ))}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}
