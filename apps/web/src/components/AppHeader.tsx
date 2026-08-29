import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MenuIcon, ChevronDownIcon, UserIcon } from "lucide-react";
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
import { apiGetSeriesList, apiDeleteSeries, apiLogout, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const me = useMe();

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b bg-background">
      <Link to="/" className="font-semibold text-lg">
        eReader Dictionaries
      </Link>
      <div className="flex items-center gap-1">
        {me ? (
          <AccountMenu me={me} />
        ) : (
          <Link to="/login" className="rounded-md px-2 py-2 text-sm font-medium hover:bg-accent">
            Log In
          </Link>
        )}
        <AppMenu me={me ?? null} />
      </div>
    </header>
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
  const [openSection, setOpenSection] = useState<"dictionary" | "entries" | "administration" | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [deleteCommandOpen, setDeleteCommandOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SeriesListItemDto | null>(null);

  const { data: seriesList = [] } = useQuery({
    queryKey: ["series", "list"],
    queryFn: () => apiGetSeriesList(),
    staleTime: 60_000,
    enabled: commandOpen || deleteCommandOpen,
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

  function toggleSection(section: "dictionary" | "entries" | "administration") {
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
