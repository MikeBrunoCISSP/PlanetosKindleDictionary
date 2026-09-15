import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon, UserIcon, MailIcon } from "lucide-react";
import { apiGetDownloads } from "@/lib/api";
import { formatLastModified } from "@/lib/formatLastModified";
import { cn } from "@/lib/utils";
import { KindleConversionInstructions } from "@/components/KindleConversionInstructions";

export function DownloadsPageContent() {
  const { data: dictionaries, isLoading, error } = useQuery({
    queryKey: ["downloads"],
    queryFn: () => apiGetDownloads(),
  });

  return (
    <div className="mx-auto max-w-2xl w-full space-y-6 p-4 sm:p-8">
      <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-background p-6 dark:border-teal-900 dark:from-teal-950/30 sm:p-7">
        <p className="mb-2 text-xs font-bold tracking-wide text-teal-700 uppercase dark:text-teal-400">
          Dictionaries built by the community
        </p>
        <h1 className="mb-4 text-2xl font-extrabold text-balance">Put your phone away and read!</h1>
        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
          One of the best things about an eReader is having a dictionary at your fingertips: press and hold
          a word, and its definition pops up. But if you read fantasy or science fiction, you've probably
          come across an unfamiliar—or half-forgotten—word unique to the world you're exploring. Built-in
          dictionaries rarely cover these fictional terms, even those from the most popular series.
        </p>
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
          That's where eReader Dictionaries comes in. We offer community-maintained custom dictionaries for
          your favorite books and series, with entries that grow and improve as readers contribute.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">
              <DownloadIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">Browse below</p>
              <p className="text-xs text-muted-foreground">
                Every dictionary is downloadable right here, no account needed.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">
              <UserIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                <Link
                  to="/login"
                  className="text-teal-700 underline underline-offset-2 hover:no-underline dark:text-teal-400"
                >
                  Sign in / register
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                Help create and edit entries for the worlds you know best.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">
              <MailIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">Request one</p>
              <p className="text-xs text-muted-foreground">
                Don't see your series?{" "}
                <span className="inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium">
                  Help → Contact
                </span>{" "}
                us.
              </p>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-3xl font-bold">Download Dictionaries</h2>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">Failed to load dictionaries.</p>}

      {dictionaries && dictionaries.length === 0 && (
        <p className="text-muted-foreground">No dictionaries are available for download yet.</p>
      )}

      {dictionaries && dictionaries.length > 0 && (
        <div className="rounded-md border">
          <div className="hidden items-center gap-x-4 border-b p-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:flex">
            <span className="min-w-0 flex-1">Dictionary</span>
            <span className="w-16 shrink-0 text-right">Terms</span>
            <span className="w-36 shrink-0 text-right">Last Modified</span>
            <span className="w-28 shrink-0" />
          </div>
          <ul className="divide-y divide-border">
            {dictionaries.map((dictionary) => {
              const hasTerms = dictionary.entryCount > 0;
              return (
                <li key={dictionary.slug} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                  <span
                    className={cn(
                      "w-full font-medium sm:w-auto sm:min-w-0 sm:flex-1",
                      !hasTerms && "font-normal text-muted-foreground"
                    )}
                  >
                    {dictionary.title}
                  </span>
                  <span
                    className={cn(
                      "w-16 shrink-0 text-right text-sm tabular-nums",
                      hasTerms ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {hasTerms ? dictionary.entryCount.toLocaleString() : "—"}
                  </span>
                  <span className="w-36 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {hasTerms && dictionary.lastModifiedAt ? formatLastModified(dictionary.lastModifiedAt) : "—"}
                  </span>
                  <span className="w-full text-left sm:w-28 sm:shrink-0 sm:text-right">
                    {hasTerms ? (
                      <a
                        href={`/api/series/${dictionary.slug}/download`}
                        className="text-sm underline underline-offset-2 hover:no-underline"
                      >
                        Download .epub
                      </a>
                    ) : (
                      <Link
                        to="/login"
                        className="text-sm font-semibold underline underline-offset-2 hover:no-underline"
                      >
                        Contribute Now!
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <KindleConversionInstructions />
    </div>
  );
}
