import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { apiGetSeriesList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface DictionaryMultiSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function DictionaryMultiSelect({ selectedIds, onChange }: DictionaryMultiSelectProps) {
  const [open, setOpen] = useState(false);

  // 200 = the server's own hard max (apps/api/src/routes/series.ts's listQuerySchema).
  // TODO: revisit once the pre-existing >50-dictionary truncation elsewhere is addressed.
  //
  // Fetch whenever the picker is open OR there's already a selection to
  // resolve into chips (e.g. a page load from a shared/bookmarked URL, or
  // browser back/forward) - otherwise chips can't render titles for a
  // seriesIds already present in the URL until the picker's been opened
  // once, silently violating "selection is visible without opening the
  // picker" (openspec: search/dictionary-search).
  const { data: seriesList = [] } = useQuery({
    queryKey: ["seriesList", "all"],
    queryFn: () => apiGetSeriesList(1, 200),
    staleTime: 60_000,
    enabled: open || selectedIds.length > 0,
  });

  const selectedSeries = seriesList.filter((series) => selectedIds.includes(series.id));

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id]);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((existing) => existing !== id));
  }

  return (
    <div className="space-y-1.5">
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Filter by dictionary...
      </Button>

      {selectedSeries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSeries.map((series) => (
            <Badge key={series.id} variant="secondary" className="gap-1">
              {series.title}
              <button
                type="button"
                onClick={() => remove(series.id)}
                aria-label={`Remove ${series.title}`}
                className="ml-0.5"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <CommandDialog open={open} onOpenChange={setOpen} title="Filter by Dictionary">
        <CommandInput placeholder="Search dictionaries..." />
        <CommandList>
          <CommandEmpty>No dictionaries found.</CommandEmpty>
          <CommandGroup>
            {seriesList.map((series) => (
              <CommandItem
                key={series.id}
                value={series.title}
                data-checked={selectedIds.includes(series.id) ? "true" : undefined}
                onSelect={() => toggle(series.id)}
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
