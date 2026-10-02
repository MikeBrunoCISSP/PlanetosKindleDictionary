import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { apiGetDownloads } from "@/lib/api";
import { formatLastModified } from "@/lib/formatLastModified";
import { useMe } from "@/lib/useMe";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { KindleConversionInstructions } from "@/components/KindleConversionInstructions";
import { ReaderDemo } from "@/components/ReaderDemo";

export function DownloadsPageContent() {
  const me = useMe();
  const canCreate = me != null && (me.role === "ADMIN" || me.approvalStatus === "APPROVED");
  const contributeTo = me == null ? "/login" : canCreate ? "/entries/new" : "/get-involved";

  const { data: dictionaries, isLoading, error } = useQuery({
    queryKey: ["downloads"],
    queryFn: () => apiGetDownloads(),
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-8">
      <section className="grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <div>
          <h1 className="text-4xl leading-[1.05] font-semibold sm:text-5xl">
            Every invented word, one press away.
          </h1>
          <p className="mt-6 max-w-[34rem] font-serif text-lg leading-relaxed text-muted-foreground">
            One of the best things about an eReader is having a dictionary at your fingertips. But fantasy
            and science fiction are full of words unique to the world you're exploring, and built-in
            dictionaries rarely cover them, even for the most popular series.
          </p>
          <p className="mt-4 max-w-[34rem] font-serif text-lg leading-relaxed text-muted-foreground">
            eReader Dictionaries offers community-maintained dictionaries for your favorite series. Every one
            is free to download, no account needed, and grows as readers contribute.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#dictionaries" className={buttonVariants({ size: "lg", className: "h-10 px-4 text-base" })}>
              Browse dictionaries
            </a>
            <Link
              to={contributeTo}
              className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 px-4 text-base" })}
            >
              Contribute entries
            </Link>
          </div>
        </div>
        <ReaderDemo />
      </section>

      <section id="dictionaries" aria-labelledby="dictionaries-heading" className="scroll-mt-6 pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
          <h2 id="dictionaries-heading" className="text-3xl font-semibold">
            Dictionaries
          </h2>
          <Link to="/contact" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Don't see your series? Request it
          </Link>
        </div>

        {isLoading && <p className="py-6 text-muted-foreground">Loading dictionaries…</p>}
        {error && <p className="py-6 text-destructive">Couldn't load dictionaries. Refresh to try again.</p>}

        {dictionaries && dictionaries.length === 0 && (
          <p className="py-6 text-muted-foreground">
            No dictionaries yet.{" "}
            <Link to="/contact" className="underline underline-offset-2 hover:text-foreground">
              Request a series
            </Link>
            .
          </p>
        )}

        {dictionaries && dictionaries.length > 0 && (
          <ul className="divide-y">
            {dictionaries.map((dictionary) => {
              const hasTerms = dictionary.entryCount > 0;
              return (
                <li
                  key={dictionary.slug}
                  className="grid items-center gap-x-4 gap-y-3 py-4 sm:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <Link
                      to="/series/$slug"
                      params={{ slug: dictionary.slug }}
                      className={cn(
                        "font-serif text-xl leading-snug hover:underline hover:underline-offset-4",
                        !hasTerms && "text-muted-foreground"
                      )}
                    >
                      {dictionary.title}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                      {hasTerms ? (
                        <>
                          {dictionary.entryCount.toLocaleString()} {dictionary.entryCount === 1 ? "term" : "terms"}
                          {dictionary.lastModifiedAt && (
                            <span className="ml-3">Updated {formatLastModified(dictionary.lastModifiedAt)}</span>
                          )}
                        </>
                      ) : (
                        "No entries yet"
                      )}
                    </p>
                  </div>
                  <div>
                    {hasTerms ? (
                      <a
                        href={`/api/series/${dictionary.slug}/download`}
                        className={buttonVariants({ variant: "outline", className: "h-9 gap-2 px-3" })}
                      >
                        <DownloadIcon />
                        Download .epub
                      </a>
                    ) : (
                      <Link
                        to={contributeTo}
                        className={buttonVariants({ variant: "ghost", className: "h-9 px-3 text-primary" })}
                      >
                        Add the first entries
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="max-w-3xl pb-16">
        <KindleConversionInstructions />
      </div>
    </div>
  );
}
