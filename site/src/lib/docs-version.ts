// Which docs a build makes. A plain build is main's docs, `next`. The release workflow builds a
// release's docs from its tag with `DOCS_VERSION` set to the version and `DOCS_REF` to the tag.
// `scripts/versions.ts` then mounts each build at its own docs root (ADR 0077).

/** The version that these docs describe: `next` for main, or a release such as `0.3.0`. */
export const docsVersion = process.env["DOCS_VERSION"] ?? "next";

/** The Git ref of these docs' source: `main`, or a release's tag such as `v0.3.0`. */
export const docsRef = process.env["DOCS_REF"] ?? "main";

/** Whether these docs describe a release rather than main. */
export const isRelease = docsVersion !== "next";
