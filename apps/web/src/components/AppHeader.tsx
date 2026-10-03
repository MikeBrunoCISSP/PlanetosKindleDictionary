import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MenuIcon, ChevronDownIcon, UserIcon } from "lucide-react";
import { toast } from "sonner";
import type { SeriesListItemDto, UserDto } from "@planetos/shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMe, ME_QUERY_KEY } from "@/lib/useMe";
import { apiGetSeriesList, apiDeleteSeries, apiRebuildSeries, apiLogout, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SiteLogo } from "@/components/SiteLogo";
import { TopMenuStrip } from "@/components/TopMenuStrip";

export function AppHeader() {
  const me = useMe();

  return (
    <header className="flex items-center gap-4 border-b bg-background px-4 py-2.5 sm:px-6">
      <Wordmark />
      <TopMenuStrip placement="inline" />
      <div className="ml-auto flex items-center gap-1">
        {me ? (
          <AccountMenu me={me} />
        ) : (
          <Link to="/login" className="rounded-md px-2 py-2 text-sm font-medium hover:bg-accent">
            Log In/Register
          </Link>
        )}
        <AppMenu me={me ?? null} />
      </div>
    </header>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md font-serif text-xl italic focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <SiteLogo size={30} />
      eReader Dictionaries
    </Link>
  );
}

function AccountMenu({ me }: { me: UserDto }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await apiLogout();
    queryClient.setQueryData(ME_QUERY_KEY, null);
    void navigate({ to: "/" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <UserIcon className="size-5" />
        <span className="max-w-32 truncate">{me.username}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => { void navigate({ to: "/preferences" }); }}>
          Preferences
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { void handleLogout(); }}>
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppMenu({ me }: { me: UserDto | null }) {
  const isAdmin = me?.role === "ADMIN";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openSection, setOpenSection] = useState<"dictionary" | "entries" | "administration" | "help" | null>(
    null
  );
  const [commandOpen, setCommandOpen] = useState(false);
  const [deleteCommandOpen, setDeleteCommandOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SeriesListItemDto | null>(null);
  const [regenerateCommandOpen, setRegenerateCommandOpen] = useState(false);

  const { data: seriesList = [] } = useQuery({
    queryKey: ["series", "list"],
    queryFn: () => apiGetSeriesList(),
    staleTime: 60_000,
    enabled: commandOpen || deleteCommandOpen || regenerateCommandOpen,
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => apiDeleteSeries(slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["series", "list"] });
      setDeleteTarget(null);
    },
    onError: (err) => {
      console.error(err instanceof ApiError ? err.message : "Delete failed");
      setDeleteTarget(null);
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: (series: SeriesListItemDto) => apiRebuildSeries(series.slug),
    onSuccess: (_result, series) => {
      toast.success(`Regenerating ${series.title}. The new file will be ready in a few minutes.`);
    },
    onError: (err, series) => {
      const reason = err instanceof ApiError ? (err.detail ?? err.message) : "Try again.";
      toast.error(`Couldn't regenerate ${series.title}. ${reason}`);
    },
  });

  // One request per dictionary - the rebuild endpoint is per-series. allSettled
  // (not all) so one failure can't hide the others that were queued.
  const regenerateAllMutation = useMutation({
    mutationFn: async (allSeries: SeriesListItemDto[]) => {
      const results = await Promise.allSettled(allSeries.map((series) => apiRebuildSeries(series.slug)));
      const failed = results.filter((result) => result.status === "rejected").length;
      return { queued: results.length - failed, failed };
    },
    onSuccess: ({ queued, failed }) => {
      if (failed > 0) {
        toast.warning(`${queued} queued, ${failed} failed.`);
      } else {
        toast.success(`Regenerating ${queued} ${queued === 1 ? "dictionary" : "dictionaries"}.`);
      }
    },
  });

  function toggleSection(section: "dictionary" | "entries" | "administration" | "help") {
    setOpenSection((prev) => (prev === section ? null : section));
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (!open) setOpenSection(null); }}>
        <DropdownMenuTrigger
          aria-label="Open menu"
          className="rounded-md p-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MenuIcon className="size-5" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48">
          {me && (
            <>
              <div className="px-2 py-1.5 text-sm">
                <p className="font-medium truncate">{me.username}</p>
                <p className="text-muted-foreground text-xs truncate">{me.email}</p>
              </div>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Dictionaries section - visible to every visitor, authenticated or not */}
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => toggleSection("dictionary")}
            className="flex items-center justify-between font-medium"
          >
            Dictionaries
            <ChevronDownIcon
              className={cn("size-4 transition-transform", openSection === "dictionary" && "rotate-180")}
            />
          </DropdownMenuItem>

          {openSection === "dictionary" && (
            <>
              {isAdmin && (
                <>
                  <DropdownMenuItem
                    className="pl-6"
                    onClick={() => { void navigate({ to: "/series/new" }); }}
                  >
                    Create
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="pl-6"
                    onClick={() => setCommandOpen(true)}
                  >
                    Update
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="pl-6"
                    onClick={() => setDeleteCommandOpen(true)}
                  >
                    Delete
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="pl-6"
                    onClick={() => setRegenerateCommandOpen(true)}
                  >
                    Regenerate
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                className="pl-6"
                onClick={() => { void navigate({ to: "/downloads" }); }}
              >
                Download
              </DropdownMenuItem>
            </>
          )}

          {/* Help section - visible to every visitor, authenticated or not */}
          <DropdownMenuSeparator />

          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => toggleSection("help")}
            className="flex items-center justify-between font-medium"
          >
            Help
            <ChevronDownIcon
              className={cn("size-4 transition-transform", openSection === "help" && "rotate-180")}
            />
          </DropdownMenuItem>

          {openSection === "help" && (
            <DropdownMenuItem className="pl-6" onClick={() => { void navigate({ to: "/contact" }); }}>
              Contact
            </DropdownMenuItem>
          )}

          {/* Entries section - hidden entirely for an anonymous visitor */}
          {me && (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => toggleSection("entries")}
                className="flex items-center justify-between font-medium"
              >
                Entries
                <ChevronDownIcon
                  className={cn("size-4 transition-transform", openSection === "entries" && "rotate-180")}
                />
              </DropdownMenuItem>

              {openSection === "entries" && (
                <>
                  <DropdownMenuItem
                    className="pl-6"
                    onClick={() => { void navigate({ to: "/search" }); }}
                  >
                    Search
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="pl-6"
                    onClick={() => { void navigate({ to: "/entries/new" }); }}
                  >
                    Add
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem
                      className="pl-6"
                      onClick={() => { void navigate({ to: "/entries/delete" }); }}
                    >
                      Delete
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem
                      className="pl-6"
                      onClick={() => { void navigate({ to: "/entries/import" }); }}
                    >
                      Import
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </>
          )}

          {/* Administration section - unlike other sections, hidden entirely for non-admins */}
          {isAdmin && (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => toggleSection("administration")}
                className="flex items-center justify-between font-medium"
              >
                Administration
                <ChevronDownIcon
                  className={cn(
                    "size-4 transition-transform",
                    openSection === "administration" && "rotate-180"
                  )}
                />
              </DropdownMenuItem>

              {openSection === "administration" && (
                <>
                  <DropdownMenuItem
                    className="pl-6"
                    onClick={() => { void navigate({ to: "/admin/approval-queue" }); }}
                  >
                    Approval Queue
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="pl-6"
                    onClick={() => { void navigate({ to: "/admin" }); }}
                  >
                    User Management
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="pl-6"
                    onClick={() => { void navigate({ to: "/admin/turnstile" }); }}
                  >
                    Turnstile
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Update dictionary selection dialog */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen} title="Update Dictionary">
        <CommandInput placeholder="Search dictionaries..." />
        <CommandList>
          <CommandEmpty>No dictionaries found.</CommandEmpty>
          <CommandGroup>
            {seriesList.map((s) => (
              <CommandItem
                key={s.id}
                value={s.title}
                onSelect={() => {
                  setCommandOpen(false);
                  void navigate({ to: "/series/$slug/edit", params: { slug: s.slug } });
                }}
              >
                {s.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Delete dictionary selection dialog */}
      <CommandDialog open={deleteCommandOpen} onOpenChange={setDeleteCommandOpen} title="Delete Dictionary">
        <CommandInput placeholder="Search dictionaries..." />
        <CommandList>
          <CommandEmpty>No dictionaries found.</CommandEmpty>
          <CommandGroup>
            {seriesList.map((s) => (
              <CommandItem
                key={s.id}
                value={s.title}
                onSelect={() => {
                  setDeleteCommandOpen(false);
                  setDeleteTarget(s);
                }}
              >
                {s.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Regenerate dictionary selection dialog - no confirmation step, since a
          rebuild never removes or changes content */}
      <CommandDialog
        open={regenerateCommandOpen}
        onOpenChange={setRegenerateCommandOpen}
        title="Regenerate Dictionary"
      >
        <CommandInput placeholder="Search dictionaries..." />
        <CommandList>
          <CommandEmpty>No dictionaries found.</CommandEmpty>
          <CommandGroup>
            <CommandItem
              value="All dictionaries"
              disabled={seriesList.length === 0}
              onSelect={() => {
                setRegenerateCommandOpen(false);
                regenerateAllMutation.mutate(seriesList);
              }}
            >
              All dictionaries
            </CommandItem>
          </CommandGroup>
          <CommandGroup>
            {seriesList.map((s) => (
              <CommandItem
                key={s.id}
                value={s.title}
                onSelect={() => {
                  setRegenerateCommandOpen(false);
                  regenerateMutation.mutate(s);
                }}
              >
                {s.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Dictionary</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.title}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.slug);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
