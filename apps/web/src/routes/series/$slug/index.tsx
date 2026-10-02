import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DownloadIcon } from "lucide-react";
import { apiGetSeries } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";

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
      <div className="mx-auto max-w-3xl w-full space-y-2 px-4 py-14 sm:px-8">
        <h1 className="text-3xl font-semibold">Dictionary not found</h1>
        <p className="text-muted-foreground">
          There's no dictionary at &ldquo;{slug}&rdquo;.{" "}
          <Link to="/downloads" className="underline underline-offset-2 hover:text-foreground">
            Browse all dictionaries
          </Link>
          .
        </p>
      </div>
    );
  }

  const steps: ReactNode[] = [
    <>Download the .epub above.</>,
    <>
      Open Kindle Previewer 3, <strong>File → Open</strong>, select the .epub, and let it convert.
    </>,
    <>
      <strong>File → Export</strong> the resulting .mobi.
    </>,
    <>Copy the .mobi to the Kindle's documents/dictionaries/ folder over USB.</>,
    <>
      On the device: <strong>Settings → Language &amp; Dictionaries → Dictionaries</strong> and set the new
      dictionary as default for the relevant language.
    </>,
  ];

  return (
    <div className="mx-auto max-w-3xl w-full space-y-10 px-4 py-10 sm:px-8 sm:py-14">
      <header>
        <div className="space-y-2">
          <h1 className="text-4xl leading-tight font-semibold">{series.title}</h1>
          {series.description && (
            <p className="font-serif text-lg text-muted-foreground">{series.description}</p>
          )}
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Download</h2>
        <div className="flex flex-wrap gap-3">
          <a href={`/api/series/${series.slug}/download`} className={buttonVariants({ className: "h-10 gap-2 px-4" })}>
            <DownloadIcon />
            Download .epub
          </a>
          <a
            href={`/api/series/${series.slug}/download/source`}
            className={buttonVariants({ variant: "outline", className: "h-10 gap-2 px-4" })}
          >
            Download sources.zip
          </a>
        </div>
        <p className="text-sm text-muted-foreground">
          If no dictionary has been generated for this series yet, the download link will show an error
          instead of a file.
        </p>
      </section>

      <section className="space-y-4 border-t pt-8">
        <h2 className="text-2xl font-semibold">Make a .mobi</h2>
        <p className="text-muted-foreground">
          The .epub above is not directly usable as a Kindle dictionary. To install it on a device:
        </p>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={index} className="flex items-baseline gap-3">
              <span aria-hidden="true" className="w-6 shrink-0 text-right font-serif text-xl text-primary [font-variant-numeric:oldstyle-nums]">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">
          Lookup behavior cannot be verified in Kindle Previewer — it only renders. Real testing requires a
          device. Enhanced Typesetting is not supported for dictionaries; do not enable it.
        </p>
      </section>
    </div>
  );
}
