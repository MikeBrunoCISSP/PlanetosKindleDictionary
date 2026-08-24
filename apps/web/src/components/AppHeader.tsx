import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MenuIcon, ChevronDownIcon } from "lucide-react";
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
import { useMe } from "@/lib/useMe";
import { apiGetSeriesList } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const me = useMe();

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b bg-background">
      <Link to="/" className="font-semibold text-lg">
        Planetos
      </Link>
      {me && <AppMenu isAdmin={me.role === "ADMIN"} />}
    </header>
  );
}

function AppMenu({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate();
  const [openSection, setOpenSection] = useState<"create" | "update" | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);

  const { data: seriesList = [] } = useQuery({
    queryKey: ["series", "list"],
    queryFn: () => apiGetSeriesList(),
    staleTime: 60_000,
    enabled: commandOpen,
  });

  function toggleSection(section: "create" | "update") {
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
          {/* Create section */}
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => toggleSection("create")}
            className="flex items-center justify-between font-medium"
          >
            Create
            <ChevronDownIcon
              className={cn("size-4 transition-transform", openSection === "create" && "rotate-180")}
            />
          </DropdownMenuItem>

          {openSection === "create" && (
            isAdmin ? (
              <DropdownMenuItem
                className="pl-6"
                onClick={() => { void navigate({ to: "/series/new" }); }}
              >
                Dictionary
              </DropdownMenuItem>
            ) : (
              <div className="pl-6 py-1 text-sm text-muted-foreground select-none" />
            )
          )}

          <DropdownMenuSeparator />

          {/* Update section */}
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => toggleSection("update")}
            className="flex items-center justify-between font-medium"
          >
            Update
            <ChevronDownIcon
              className={cn("size-4 transition-transform", openSection === "update" && "rotate-180")}
            />
          </DropdownMenuItem>

          {openSection === "update" && (
            isAdmin ? (
              <DropdownMenuItem
                className="pl-6"
                onClick={() => setCommandOpen(true)}
              >
                Dictionary
              </DropdownMenuItem>
            ) : (
              <div className="pl-6 py-1 text-sm text-muted-foreground select-none" />
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
    </>
  );
}
