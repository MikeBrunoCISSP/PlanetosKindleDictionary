import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MenuIcon, ChevronDownIcon } from "lucide-react";
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
        Planetos
      </Link>
      {me && <AppMenu me={me} />}
    </header>
  );
}

function AppMenu({ me }: { me: UserDto }) {
  const isAdmin = me.role === "ADMIN";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openSection, setOpenSection] = useState<"dictionary" | "entries" | "administration" | "settings" | null>(
    null
  );
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

  function toggleSection(section: "dictionary" | "entries" | "administration" | "settings") {
    setOpenSection((prev) => (prev === section ? null : section));
  }

  const handleLogout = async () => {
    await apiLogout();
    queryClient.setQueryData(ME_QUERY_KEY, null);
    void navigate({ to: "/" });
  };

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
          <div className="px-2 py-1.5 text-sm">
            <p className="font-medium truncate">{me.username}</p>
            <p className="text-muted-foreground text-xs truncate">{me.email}</p>
          </div>
          <DropdownMenuSeparator />

          {/* Dictionaries section */}
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
            isAdmin ? (
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
            ) : (
              <div className="pl-6 py-1 text-sm text-muted-foreground select-none" />
            )
          )}

          <DropdownMenuSeparator />

          {/* Entries section */}
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

          <DropdownMenuSeparator />

          {/* Administration section - unlike other sections, hidden entirely for non-admins */}
          {isAdmin && (
            <>
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

              <DropdownMenuSeparator />
            </>
          )}

          {/* Settings section */}
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => toggleSection("settings")}
            className="flex items-center justify-between font-medium"
          >
            Settings
            <ChevronDownIcon
              className={cn("size-4 transition-transform", openSection === "settings" && "rotate-180")}
            />
          </DropdownMenuItem>

          {openSection === "settings" && (
            <>
              <DropdownMenuItem
                className="pl-6"
                onClick={() => { void navigate({ to: "/preferences" }); }}
              >
                Preferences
              </DropdownMenuItem>
              <DropdownMenuItem
                className="pl-6"
                onClick={() => { void handleLogout(); }}
              >
                Log out
              </DropdownMenuItem>
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
