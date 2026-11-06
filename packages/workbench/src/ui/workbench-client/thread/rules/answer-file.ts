// A file an agent's answer links to. Codex writes a local file as a markdown
// link to its absolute path, with an optional line after a colon or in a
// GitHub fragment: `[app.ts](/abs/path/app.ts:12)` or
// `[app.ts](/abs/path/app.ts#L12C3)`. A browser reads such a link as a page of
// the Archboard server, so the answer opens the file in the person's editor.

/** A file an answer names, and the line it names in it. */
interface AnswerFile {
	readonly path: string;
	readonly line?: number;
}

/** The line at the end of a link, as `:line[:column]` or `#Lline[Ccolumn]`. */
const LINE = /(?::(\d+)(?::\d+)?|#L(\d+)(?:C\d+)?)$/u;

/**
 * The file a link names.
 * @param href The link's destination, as the markdown wrote it.
 * @returns The file and its line, or null for a link that names no local file.
 */
function answerFile(href: string | undefined): AnswerFile | null {
	if (!isLocalPath(href)) return null;
	const match = LINE.exec(href);
	if (match === null) return { path: decoded(href) };
	const path = decoded(href.slice(0, match.index));
	const line = lineOf(match);
	return line === undefined ? { path } : { path, line };
}

/**
 * Whether a link names a path on this machine: `//host/path` names another site, and a
 * scheme names its own handler.
 * @param href The link's destination.
 * @returns True for an absolute path.
 */
function isLocalPath(href: string | undefined): href is string {
	return href !== undefined && href.startsWith("/") && !href.startsWith("//");
}

/**
 * The line a link names.
 * @param match The line at the end of the link.
 * @returns The line, or undefined for a line before the first.
 */
function lineOf(match: RegExpExecArray): number | undefined {
	const line = Number(match[1] ?? match[2]);
	return Number.isSafeInteger(line) && line >= 1 ? line : undefined;
}

/**
 * A path with the percent escapes that markdown puts in a link taken out.
 * @param path The path as the link holds it.
 * @returns The path on disk.
 */
function decoded(path: string): string {
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}

export { answerFile, type AnswerFile };
