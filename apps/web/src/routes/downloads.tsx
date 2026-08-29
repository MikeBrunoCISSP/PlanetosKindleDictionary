import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGetDownloads } from "@/lib/api";

export const Route = createFileRoute("/downloads")({
  component: DownloadsPage,
});

function DownloadsPage() {
  const { data: dictionaries, isLoading, error } = useQuery({
    queryKey: ["downloads"],
    queryFn: () => apiGetDownloads(),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <h1 className="text-3xl font-bold">Download Dictionaries</h1>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">Failed to load dictionaries.</p>}

      {dictionaries && dictionaries.length === 0 && (
        <p className="text-muted-foreground">No dictionaries are available for download yet.</p>
      )}

      {dictionaries && dictionaries.length > 0 && (
        <ul className="divide-y divide-border rounded-md border">
          {dictionaries.map((dictionary) => (
            <li key={dictionary.slug} className="flex items-center justify-between p-4">
              <span className="font-medium">{dictionary.title}</span>
              <a
                href={`/api/series/${dictionary.slug}/download`}
                className="underline underline-offset-2 hover:no-underline"
              >
                Download .epub
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
