import { cn } from "@/lib/utils";

// The sword runs along the diagonal from the pommel (lower-left) to the tip
// (top-right). Blade: parallel edges from the crossguard, then a pointed tip.
const BLADE = "M11.28 22.28 L25.16 8.4 L26.5 5.5 L23.6 6.84 L9.72 20.72 Z";
const GUARD = "M7.95 18.95 L13.05 24.05";
const GRIP = "M10.5 21.5 L7.95 24.05";
const POMMEL = { cx: 7.04, cy: 24.96, r: 1.6 };

/**
 * Site mark: a Kindle with a sword laid diagonally across it - an e-reader
 * for fantasy and science fiction. The sword sits on a background-coloured
 * knockout so the blade stays legible where it crosses the device outline.
 */
export function SiteLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Kindle: body, screen, two lines of text */}
      <g stroke="currentColor">
        <rect x="8.5" y="2.5" width="16" height="27" rx="2.75" strokeWidth="1.6" />
        <rect x="11" y="5.5" width="11" height="17.5" rx="0.6" strokeWidth="1" opacity="0.55" />
        <path d="M13.25 9h6.5M13.25 11.75h4.5" strokeWidth="1" opacity="0.55" />
      </g>

      {/* Knockout behind the sword */}
      <g stroke="var(--background)" strokeWidth="3.2" fill="var(--background)">
        <path d={BLADE} />
        <path d={GUARD} />
        <path d={GRIP} />
        <circle {...POMMEL} />
      </g>

      {/* Sword: blade, crossguard, grip, pommel */}
      <g className="text-primary" stroke="currentColor" fill="currentColor">
        <path d={BLADE} strokeWidth="0.4" />
        <path d={GUARD} strokeWidth="2.2" />
        <path d={GRIP} strokeWidth="2" />
        <circle {...POMMEL} stroke="none" />
      </g>
    </svg>
  );
}
