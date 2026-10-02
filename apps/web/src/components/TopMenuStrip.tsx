import { Link } from "@tanstack/react-router";
import { useMe } from "@/lib/useMe";
import { cn } from "@/lib/utils";

const linkClassName =
  "relative rounded-md px-3 py-1.5 text-[0.95rem] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const activeProps = {
  className:
    "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
};

/**
 * Primary navigation. Rendered inline inside the header at `sm` and up,
 * and as its own scrollable row below the header on small screens.
 */
export function TopMenuStrip({ placement }: { placement: "inline" | "strip" }) {
  const me = useMe();
  const canCreate = me != null && (me.role === "ADMIN" || me.approvalStatus === "APPROVED");

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex items-center gap-1",
        placement === "inline" && "hidden sm:flex",
        placement === "strip" && "overflow-x-auto border-b px-2 py-1.5 sm:hidden"
      )}
    >
      <Link to="/downloads" className={linkClassName} activeProps={activeProps}>
        Downloads
      </Link>
      <Link to="/search" className={linkClassName} activeProps={activeProps}>
        Search
      </Link>
      <Link to={canCreate ? "/entries/new" : "/get-involved"} className={linkClassName} activeProps={activeProps}>
        Create
      </Link>
      <Link to="/contact" className={linkClassName} activeProps={activeProps}>
        Help
      </Link>
    </nav>
  );
}
