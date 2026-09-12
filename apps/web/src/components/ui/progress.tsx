import { cn } from "@/lib/utils";

// A minimal indeterminate progress indicator - no percentage, since the
// import request has no per-item progress channel to drive a determinate
// bar with (see openspec: entries/bulk-import).
function Progress({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="progressbar"
      aria-busy="true"
      className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <div className="h-full w-full animate-pulse rounded-full bg-primary" />
    </div>
  );
}

export { Progress };
