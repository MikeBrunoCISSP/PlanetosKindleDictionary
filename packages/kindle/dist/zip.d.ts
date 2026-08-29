export interface GeneratedFile {
    path: string;
    content: string;
}
/**
 * Zips the generated file list as a valid EPUB per the OCF spec: the
 * `mimetype` entry must be first and stored uncompressed. `files` must
 * already have `mimetype` as its first element.
 */
export declare function zipAsEpub(files: GeneratedFile[]): Buffer;
/** Zips the same generated file list as a plain archive for reference/inspection - no special entry ordering or storage rules. */
export declare function zipAsSourceArchive(files: GeneratedFile[]): Buffer;
//# sourceMappingURL=zip.d.ts.map