import { Link } from "@tanstack/react-router";
import { useMe } from "@/lib/useMe";

export function TopMenuStrip() {
  const me = useMe();
  const canCreate = me != null && (me.role === "ADMIN" || me.approvalStatus === "APPROVED");

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b bg-background px-4 py-2">
      <Link
        to="/downloads"
        className="rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap hover:bg-accent"
      >
        Downloads
      </Link>
      <Link
        to="/search"
        className="rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap hover:bg-accent"
      >
        Search
      </Link>
      <Link
        to={canCreate ? "/entries/new" : "/get-involved"}
        className="rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap hover:bg-accent"
      >
        Create
      </Link>
      <Link
        to="/contact"
        className="rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap hover:bg-accent"
      >
        Help
      </Link>
    </nav>
  );
}
