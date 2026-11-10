// The changed files that no binding holds (TASK-621). The footprint maps each commit onto the
// parts whose bound files it changed, so a change to any other file is in none of its lists. These
// files are listed on their own, as information. Renames follow the rule of `commitsByBoundPath`:
// once a newer commit renamed a file into a bound path, the older commits of its former name are
// bound too. Pure.

import { filesOfBinding } from "@archboard/code-binding/bindings";
import type { WalkedCommit } from "#runtime/history-lens/operations/commits.ts";
import type { UnboundFile } from "#shared/protocol/footprint.ts";

/** A changed file that no binding holds in one checkout, and the commits that changed it. */
type Unbound = Omit<UnboundFile, "repo">;

/**
 * Every file of the walk under each of its names.
 * @param walked The commits.
 * @returns The files.
 */
function filesOf(walked: readonly WalkedCommit[]): Set<string> {
	return new Set(
		walked.flatMap((commit) =>
			commit.changes.flatMap((change) =>
				change.from === undefined ? [change.path] : [change.path, change.from],
			),
		),
	);
}

/**
 * Whether a binding holds a change, under either name of a rename. A rename into a bound path binds
 * the former name for the older commits.
 * @param bound The bound files; grows in place.
 * @param change One change of a commit.
 * @returns True when a binding holds it.
 */
function isBound(bound: Set<string>, change: WalkedCommit["changes"][number]): boolean {
	const { path, from } = change;
	if (!bound.has(path)) return from !== undefined && bound.has(from);
	if (from !== undefined) bound.add(from);
	return true;
}

/**
 * Add a commit to a file's list once.
 * @param found The files found so far, each with its commits; grows in place.
 * @param path The file.
 * @param commit The commit.
 */
function note(found: Map<string, string[]>, path: string, commit: string): void {
	const commits = found.get(path) ?? [];
	if (!commits.includes(commit)) commits.push(commit);
	found.set(path, commits);
}

/**
 * The files that the commits changed outside every scope.
 * @param walked The commits of the range, newest first.
 * @param scopes Each normalized scope that binds files: the path of each binding, a project
 * file's directory, and the vault's directory.
 * @returns Each such file in path order, with the commits that changed it, newest first.
 */
function unboundFiles(walked: readonly WalkedCommit[], scopes: readonly string[]): Unbound[] {
	const files = filesOf(walked);
	const bound = new Set(scopes.flatMap((scope) => filesOfBinding(scope, files)));
	const found = new Map<string, string[]>();
	for (const commit of walked) {
		for (const change of commit.changes) {
			if (!isBound(bound, change)) note(found, change.path, commit.commit);
		}
	}
	return [...found]
		.toSorted(([left], [right]) => left.localeCompare(right))
		.map(([path, commits]) => ({ path, commits }));
}

export { unboundFiles };
