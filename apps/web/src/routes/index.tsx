import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { ArrowRightIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchResults } from "@/components/SearchResults";

const homeSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const Route = createFileRoute("/")({
  validateSearch: homeSearchSchema,
  component: IndexPage,
});

function IndexPage() {
  const { q, page } = Route.useSearch();
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
    void navigate({ to: "/", search: (prev) => ({ ...prev, q: trimmed || undefined, page: 1 }) });
  }

  const hasQuery = Boolean(q && q.length > 0);

  if (!hasQuery) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <div className="w-full max-w-xl text-center space-y-6">
          <h1 className="text-4xl font-bold">Planetos</h1>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              autoFocus
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Search dictionary entries…"
              className="h-12 text-lg"
            />
            <Button type="submit" size="icon" className="h-12 w-12" aria-label="Search">
              <ArrowRightIcon className="size-5" />
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Search dictionary entries…"
        />
        <Button type="submit" size="icon" aria-label="Search">
          <ArrowRightIcon className="size-4" />
        </Button>
      </form>
      <SearchResults query={q ?? ""} page={page} />
    </div>
  );
}
