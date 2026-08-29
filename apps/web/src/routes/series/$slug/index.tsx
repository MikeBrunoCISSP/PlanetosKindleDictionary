import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGetSeries } from "@/lib/api";

export const Route = createFileRoute("/series/$slug/")({
  component: SeriesDetailPage,
});

function SeriesDetailPage() {
  const { slug } = Route.useParams();

  const { data: series, isLoading, error } = useQuery({
    queryKey: ["series", slug],
    queryFn: () => apiGetSeries(slug),
  });

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>;

  if (error || !series) {
    return (
      <div className="mx-auto max-w-2xl space-y-2 p-4 text-center sm:p-8">
        <h2 className="text-xl font-semibold">Dictionary not found</h2>
        <p className="text-muted-foreground">The dictionary "{slug}" does not exist.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{series.title}</h1>
        {series.description && <p className="text-muted-foreground">{series.description}</p>}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Download</h2>
        <div className="flex flex-wrap gap-4">
          <a
            href={`/api/series/${series.slug}/download`}
            className="underline underline-offset-2 hover:no-underline"
          >
            Download .epub
          </a>
          <a
            href={`/api/series/${series.slug}/download/source`}
            className="underline underline-offset-2 hover:no-underline"
          >
            Download sources.zip
          </a>
        </div>
        <p className="text-sm text-muted-foreground">
          If no dictionary has been generated for this series yet, the download link will show an
          error instead of a file.
        </p>
      </div>

      <div className="space-y-2 rounded-md bg-muted p-4">
        <h2 className="text-lg font-semibold">Make a .mobi</h2>
        <p className="text-sm text-muted-foreground">
          The .epub above is not directly usable as a Kindle dictionary. To install it on a
          device:
        </p>
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>Download the .epub above.</li>
          <li>
            Open Kindle Previewer 3, <strong>File → Open</strong>, select the .epub, and let it
            convert.
          </li>
          <li>
            <strong>File → Export</strong> the resulting .mobi.
          </li>
          <li>Copy the .mobi to the Kindle's documents/dictionaries/ folder over USB.</li>
          <li>
            On the device: <strong>Settings → Language &amp; Dictionaries → Dictionaries</strong>{" "}
            and set the new dictionary as default for the relevant language.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">
          Lookup behavior cannot be verified in Kindle Previewer — it only renders. Real testing
          requires a device. Enhanced Typesetting is not supported for dictionaries; do not enable
          it.
        </p>
      </div>
    </div>
  );
}
