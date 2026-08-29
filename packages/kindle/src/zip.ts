import { zipSync } from "fflate";

export interface GeneratedFile {
  path: string;
  content: string;
}

function toZippable(files: GeneratedFile[], storeUncompressed: (path: string) => boolean) {
  const input: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const file of files) {
    input[file.path] = [
      new TextEncoder().encode(file.content),
      { level: storeUncompressed(file.path) ? 0 : 6 },
    ];
  }
  return input;
}

/**
 * Zips the generated file list as a valid EPUB per the OCF spec: the
 * `mimetype` entry must be first and stored uncompressed. `files` must
 * already have `mimetype` as its first element.
 */
export function zipAsEpub(files: GeneratedFile[]): Buffer {
  if (files[0]?.path !== "mimetype") {
    throw new Error("zipAsEpub: the first file must be 'mimetype'");
  }
  return Buffer.from(zipSync(toZippable(files, (path) => path === "mimetype")));
}

/** Zips the same generated file list as a plain archive for reference/inspection - no special entry ordering or storage rules. */
export function zipAsSourceArchive(files: GeneratedFile[]): Buffer {
  return Buffer.from(zipSync(toZippable(files, () => false)));
}
