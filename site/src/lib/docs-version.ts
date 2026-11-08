// Which docs a build makes. A plain build is main's docs, `next`. The release workflow builds a
// release's docs from its tag with `DOCS_VERSION` set to the version and `DOCS_REF` to the tag.
// `scripts/versions.ts` then mounts each build at its own docs root (ADR 0077).
import { execFileSync } from "node:child_process";

/** The version that these docs describe: `next` for main, or a release such as `0.3.0`. */
export const docsVersion = process.env["DOCS_VERSION"] ?? "next";

/** The Git ref of these docs' source: `main`, or a release's tag such as `v0.3.0`. */
export const docsRef = process.env["DOCS_REF"] ?? "main";

/** Whether these docs describe a release rather than main. */
export const isRelease = docsVersion !== "next";

/** The output of a Git command in this checkout. */
function git(...args: string[]): string {
	return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/**
 * The tag and commit that the examples pin this repository's Actions to. A release's docs pin its
 * own tag, which the build checks out. Main's docs pin the newest release tag that holds the
 * Actions, or main's commit while no release does. A tag can move, so an example names the commit
 * and the tag in a comment beside it. Main's build needs the tags and their history.
 */
function pinActions(): { ref: string; sha: string } {
	if (isRelease) return { ref: docsRef, sha: git("rev-parse", "HEAD") };
	const tag = git("tag", "--merged", "HEAD", "--list", "v*", "--sort=-v:refname")
		.split("\n")
		.find(
			(name) =>
				name !== "" && git("ls-tree", "--name-only", name, "actions/check/action.yml") !== "",
		);
	if (tag === undefined) return { ref: "main", sha: git("rev-parse", "HEAD") };
	return { ref: tag, sha: git("rev-parse", `${tag}^{commit}`) };
}

export const actionsPin = pinActions();
