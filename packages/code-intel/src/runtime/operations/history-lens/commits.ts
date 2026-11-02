// Walking commits and mapping them onto bound paths (ADR 0045).
//
// A commit changes a part when it changes one of the part's bound files: the
// file its binding names, or any file below the directory it names. Git
// records files, so this needs no parser and works in every language. A merge
// counts for nothing of its own; the commits it brings in count. The mapping
// follows renames as Git's own rename detection sees them: a commit that
// renames a bound file changes the part, and the commits before it count under
// the former path.

import { gitText, type GitRunOptions } from "#runtime/clients/history-lens/git.ts";
import { filesOfBinding } from "@archboard/code-binding/bindings";

/**
 * The size above which a commit is large: code-maat's default for the largest
 * change set it counts (`--max-changeset-size`).
 */
const LARGE_COMMIT_FILES = 30;

/** One file a commit changed. A rename carries the path it came from. */
interface FileChange {
	/** Git's status letter: `A`dded, `M`odified, `D`eleted, `R`enamed, `C`opied, `T`ype changed. */
	readonly status: string;
	readonly path: string;
	readonly from?: string;
}

/** One commit, with every file it changed. */
interface WalkedCommit {
	readonly commit: string;
	/** Seconds since the epoch, as Git records the commit time. */
	readonly committedAt: number;
	readonly subject: string;
	readonly changes: readonly FileChange[];
}

// Each record starts with a byte no subject holds, and its fields are split by
// another, so a subject is read whole whatever it says.
const RECORD = "\u001e";
const FIELD = "\u001f";

/**
 * One change at the start of a record's remaining tokens.
 * @param tokens The tokens from the change's status on.
 * @returns The change, and how many tokens it took.
 */
function changeAt(tokens: readonly string[]): [FileChange, number] {
	const [code = "", first = "", second = ""] = tokens;
	const status = code.slice(0, 1);
	if (status === "R") return [{ status, path: second, from: first }, 3];
	if (status === "C") return [{ status, path: second }, 3];
	return [{ status, path: first }, 2];
}

/**
 * The files of one record's `--name-status -z` part.
 * @param tokens The part, split at its NUL bytes.
 * @returns Each change; a rename carries the path it came from.
 */
function changesOf(tokens: readonly string[]): FileChange[] {
	const changes: FileChange[] = [];
	for (let at = 0; at < tokens.length;) {
		const [change, taken] = changeAt(tokens.slice(at, at + 3));
		changes.push(change);
		at += taken;
	}
	return changes;
}

/**
 * Read the output of `git log -z --format=<RECORD>%H<FIELD>%ct<FIELD>%s --name-status`.
 * @param output The whole output.
 * @returns The commits in the order Git printed them.
 */
function parseLog(output: string): WalkedCommit[] {
	return output
		.split(RECORD)
		.filter((record) => record !== "")
		.map((record) => {
			const end = record.indexOf("\0");
			const header = end === -1 ? record : record.slice(0, end);
			const body = end === -1 ? "" : record.slice(end + 1).replace(/^\n/u, "");
			const [commit = "", time = "0", subject = ""] = header.split(FIELD);
			const tokens = body.split("\0").filter((token) => token !== "");
			return { commit, committedAt: Number(time), subject, changes: changesOf(tokens) };
		});
}

/** The format every walk prints, which `parseLog` reads. */
const LOG_FORMAT = `--format=${RECORD}%H${FIELD}%ct${FIELD}%s`;

/**
 * Walk commits with every file each one changed, newest first, leaving out
 * merges. The caller names the range: revisions on the command line, or
 * `--no-walk --stdin` with commit ids as input.
 * @param root The checkout.
 * @param range Git's arguments that name the commits.
 * @param options The caller's signal, and the input for `--stdin`.
 * @returns The commits.
 */
async function walkCommits(
	root: string,
	range: readonly string[],
	options: GitRunOptions,
): Promise<WalkedCommit[]> {
	const output = await gitText(
		root,
		[
			"log",
			"--no-merges",
			"-z",
			LOG_FORMAT,
			"--name-status",
			"-M",
			"--no-ext-diff",
			"--no-textconv",
			...range,
		],
		options,
	);
	return parseLog(output);
}

/**
 * Whether a commit changes more than the large-commit limit of files.
 * @param commit The commit.
 * @returns True for a large commit.
 */
function isLargeCommit(commit: WalkedCommit): boolean {
	return commit.changes.length > LARGE_COMMIT_FILES;
}

/**
 * A repository-relative path as the bindings and Git both spell it: no `./`,
 * no trailing `/`, and the empty string for the whole repository.
 * @param bound The path a binding names.
 * @returns The path, or undefined when it leaves the repository.
 */
function normalizeBoundPath(bound: string): string | undefined {
	const normalized = bound
		.replaceAll("\\", "/")
		.split("/")
		.filter((segment) => segment !== "" && segment !== ".");
	if (bound.startsWith("/") || normalized.includes("..")) return undefined;
	return normalized.join("/");
}

/**
 * Every file a commit changed, under both names of a rename.
 * @param commit The commit.
 * @returns The files.
 */
function filesOfCommit(commit: WalkedCommit): string[] {
	return commit.changes.flatMap((change) =>
		change.from === undefined ? [change.path] : [change.path, change.from],
	);
}

/**
 * Every path a commit's changes fall under: each file, each directory above it
 * and the whole repository. A name is here exactly when `filesOfBinding` finds a
 * file of the commit for it, so a walk can skip the commits that touch no name
 * of a path without listing their files.
 * @param commit The commit.
 * @returns The paths.
 */
function pathsUnder(commit: WalkedCommit): ReadonlySet<string> {
	const paths = new Set([""]);
	for (const file of filesOfCommit(commit)) {
		for (let at = file; !paths.has(at); at = at.slice(0, Math.max(at.lastIndexOf("/"), 0))) {
			paths.add(at);
		}
	}
	return paths;
}

/**
 * Whether one commit changed a bound path, as the path was named when the
 * commit was made. A rename into the path adds the file's former name, under
 * which the older commits count.
 * @param commit The commit.
 * @param touched The paths its changes fall under.
 * @param names Every name the path's files had after this commit; grows in place.
 * @returns True when the commit changed one of the path's files.
 */
function changedUnder(
	commit: WalkedCommit,
	touched: ReadonlySet<string>,
	names: Set<string>,
): boolean {
	const [few, many] = names.size < touched.size ? [names, touched] : [touched, names];
	const met = [...few].filter((name) => many.has(name));
	if (met.length === 0) return false;
	const files = filesOfCommit(commit);
	const bound = new Set(met.flatMap((name) => filesOfBinding(name, files)));
	const formerNames: string[] = [];
	const changed = commit.changes.filter((change) => {
		const after = bound.has(change.path);
		const from = change.from;
		const before = from !== undefined && bound.has(from);
		if (after && from !== undefined && !before) formerNames.push(from);
		return after || before;
	});
	for (const name of formerNames) names.add(name);
	return changed.length > 0;
}

/**
 * The commits that changed each bound path, newest first. Each path follows
 * the renames of its files: once a newer commit renamed a file into it, the
 * older commits count under the name the file had. A year of commits across a
 * model's hundreds of paths runs in one turn of the server's event loop, so a
 * commit that touches none of a path's names costs one set lookup (ADR 0045).
 * @param commits The walk, newest first.
 * @param paths Normalized bound paths.
 * @returns For each path, the ids of the commits that changed it.
 */
function commitsByBoundPath(
	commits: readonly WalkedCommit[],
	paths: Iterable<string>,
): Map<string, string[]> {
	const walk = commits.map((commit) => ({ commit, touched: pathsUnder(commit) }));
	return new Map(
		[...new Set(paths)].map((bound) => {
			const names = new Set([bound]);
			return [
				bound,
				walk
					.filter(({ commit, touched }) => changedUnder(commit, touched, names))
					.map(({ commit }) => commit.commit),
			];
		}),
	);
}

export { type WalkedCommit, commitsByBoundPath, isLargeCommit, normalizeBoundPath, walkCommits };
