import { useEffect, useRef, useState } from "react";

/**
 * A small e-reader mock that plays the site's one orchestrated motion:
 * a press-and-hold on an invented word, then its dictionary popup.
 * The sentence and entry are original example content. The animation
 * lives in index.css (.reader-*) and is skipped under reduced motion.
 */
export function ReaderDemo() {
  const ref = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(false);

  // Play once, the first time at least half the device is on screen.
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setPlaying(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPlaying(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <figure
      ref={ref}
      data-playing={playing ? "" : undefined}
      className="reader-demo mx-auto w-full max-w-sm rounded-[1.4rem] border border-black/40 bg-[#262838] p-3 pb-6 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)] dark:border-white/10">
      <div className="rounded-md bg-paper px-5 pt-3 pb-6 text-paper-foreground">
        <div className="mb-4 flex justify-between font-sans text-xs text-paper-foreground/60">
          <span>Chapter 4</span>
          <span>38%</span>
        </div>

        <p className="font-serif text-[1.05rem] leading-[1.7] [font-variant-numeric:oldstyle-nums]">
          By the third bell the caravan had reached the glass dunes. Teska knelt, unwrapped the{" "}
          <span className="relative inline-block">
            <span className="reader-word">vhalstone</span>
            <svg
              viewBox="0 0 40 40"
              className="pointer-events-none absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2"
              aria-hidden="true"
            >
              <circle
                className="reader-press-ring"
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="#22766b"
                strokeWidth="2"
                pathLength={100}
              />
            </svg>
          </span>
          , and waited for it to turn toward water.
        </p>

        <div
          className="reader-popup relative mt-4 rounded-sm border border-paper-foreground/40 bg-paper px-4 py-3 shadow-[0_6px_0_-3px_rgb(0_0_0/0.12)]"
          role="note"
          aria-label="Dictionary lookup for vhalstone"
        >
          <p className="font-headword text-lg leading-tight font-medium">
            vhalstone <span className="font-serif text-base font-normal italic">n.</span>
          </p>
          <p className="mt-1 font-serif text-[0.98rem] leading-snug">
            A palm-sized lodestone carried by desert guides. Warmed in the hand, it turns toward the nearest fresh
            water.
          </p>
          <p className="mt-2 border-t border-paper-foreground/20 pt-1.5 font-sans text-xs text-paper-foreground/70">
            Example dictionary
          </p>
        </div>
      </div>
      <figcaption className="sr-only">
        An e-reader page where pressing and holding the word vhalstone opens its definition from a custom
        dictionary.
      </figcaption>
    </figure>
  );
}
