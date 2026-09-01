import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The built SPA lives at apps/web/dist. This module sits at
// apps/api/{src,dist}/lib/staticSite.{ts,js}, so apps/web/dist is always
// three directories up plus web/dist - identical whether we're running the
// compiled dist output or tsx against src.
const WEB_DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../web/dist");

export interface WebDist {
  /** Absolute path to the directory to serve static assets from. */
  root: string;
  /** Absolute path to the SPA HTML entry document. */
  indexHtml: string;
}

/**
 * Locates the built web SPA. Returns null - with a warning left to the
 * caller - when it isn't present: the integration tests never build the
 * web app, and `pnpm dev:api` runs the API without it.
 */
export function resolveWebDist(): WebDist | null {
  const indexHtml = join(WEB_DIST_DIR, "index.html");
  if (!existsSync(indexHtml)) return null;
  return { root: WEB_DIST_DIR, indexHtml };
}
