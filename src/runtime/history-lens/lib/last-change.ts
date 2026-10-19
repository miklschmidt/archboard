// A board's last change, found in the board file's own Git history
// (ADR 0045).
//
// The last change is the last commit that changed the board's current
// variant: another variant became current, or a part, a relationship, a flow
// or a step of the current variant was added, changed or removed. A draft
// edit, a shelving, a rename, a change to the views, a walkthrough edit and a
// migration write change none of those, so none of them counts. The walk goes
// newest first, follows the renames of the file, and stops at the first commit
// that changed the current variant. The commit that created the board changed
// it.
//
// A change no commit has yet makes the last change now: the board file holds
// it in the working tree, or Git does not track the file and does not ignore
// it. If the vault is in no Git repository, or Git ignores the board file, the
// last change cannot be found, and the answer says so rather than count zero.

import path from "node:path";
import { gitBytes, gitSays, gitText, type GitRunOptions } from "@/runtime/history-lens/lib/git";
import { parseLog } from "@/runtime/history-lens/lib/commits";
import { decodeSemanticBoardDocument } from "@/runtime/semantic-board-store/index";
import { compareVariants } from "@archboard/board/compare-variants";
import {
	currentVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";

/** Where a board's last change is, or why it cannot be found. */
type LastChange =
	| { readonly kind: "commit"; readonly commit: string; readonly committedAt: number }
	| { readonly kind: "uncommitted" }
	| { readonly kind: "unknown"; readonly reason: "vault-outside-git" | "board-file-ignored" };

/** How many commits of a board file's history are read from Git at a time. */
const VERSIONS_PER_BATCH = 8;

/**
 * The header `git cat-file --batch` writes before an object it found:
 * `<object id> <type> <size>`. For a name it cannot find it writes the name
 * and `missing`, and a name holds every space of its path, as most board
 * names have one, so only this whole shape says that an object follows.
 */
const FOUND_HEADER = /^[0-9a-f]{40,64} [a-z]+ (\d+)$/u;

/**
 * A board file as a commit holds it, or undefined when it is not a board this
 * build reads. Registered migrations are applied in memory and write nothing.
 * @param bytes The file's bytes at that commit.
 * @returns The board, or undefined.
 */
function boardOf(bytes: Uint8Array | undefined): SemanticBoard | undefined {
	if (bytes === undefined) return undefined;
	const parsed = decodeSemanticBoardDocument(new TextDecoder().decode(bytes));
	return parsed.ok ? parsed.board : undefined;
}

/**
 * Whether a variant's parts, relationships, flows or steps changed.
 * @param was The variant before, if there was one.
 * @param is The variant after, if there is one.
 * @returns True when one was added, changed or removed, or only one side has the variant.
 */
function variantChanged(
	was: SemanticVariant | undefined,
	is: SemanticVariant | undefined,
): boolean {
	if (was === undefined || is === undefined) return was !== is;
	const comparison = compareVariants(was.content, is.content);
	return [comparison.nodes, comparison.edges, comparison.flows, comparison.steps].some((subjects) =>
		[...subjects.values()].some((change) => change.kind !== "unchanged"),
	);
}

/**
 * Whether one version of a board changed its current variant against the
 * version before it: another variant became current, or the current one
 * changed. A version that did not exist, or that this build cannot read,
 * counts as a change, because the lens cannot show that the variant stayed the
 * same.
 * @param before The version before, or undefined when there was none or it is unreadable.
 * @param after The version after, or undefined when it is unreadable.
 * @returns True when the current variant changed.
 */
function changedCurrent(
	before: SemanticBoard | undefined,
	after: SemanticBoard | undefined,
): boolean {
	if (before === undefined || after === undefined) return true;
	return (
		before.current !== after.current ||
		variantChanged(currentVariant(before), currentVariant(after))
	);
}

/**
 * Read many blobs in one `git cat-file --batch`.
 * @param root The checkout.
 * @param wanted Each blob as `<commit>:<path>`, or undefined for none.
 * @param options The caller's signal.
 * @returns Each blob's bytes, or undefined where none was asked for or Git has none.
 */
async function readBlobs(
	root: string,
	wanted: readonly (string | undefined)[],
	options: GitRunOptions,
): Promise<(Uint8Array | undefined)[]> {
	const specs = wanted.filter((spec) => spec !== undefined);
	if (specs.length === 0) return wanted.map(() => undefined);
	const output = await gitBytes(root, ["cat-file", "--batch"], {
		...options,
		input: `${specs.join("\n")}\n`,
	});
	const blobs: (Uint8Array | undefined)[] = [];
	let at = 0;
	for (let read = 0; read < specs.length; read += 1) {
		const end = output.indexOf(0x0a, at);
		const found = FOUND_HEADER.exec(new TextDecoder().decode(output.subarray(at, end)));
		at = end + 1;
		if (found === null) {
			blobs.push(undefined);
			continue;
		}
		const size = Number(found[1]);
		blobs.push(output.subarray(at, at + size));
		at += size + 1;
	}
	return wanted.map((spec) => (spec === undefined ? undefined : blobs.shift()));
}

/** One commit of a board file's history, with where the file was before and after it. */
interface FileVersion {
	readonly commit: string;
	readonly committedAt: number;
	readonly path: string;
	/** Where the file was before the commit, or undefined when the commit created it. */
	readonly before: string | undefined;
}

/**
 * The commits of one file, newest first, following its renames. A merge that
 * changed nothing of its own is left out.
 * @param root The checkout.
 * @param file The repository-relative path of the file at HEAD.
 * @param options The caller's signal.
 * @returns The versions.
 */
async function fileHistory(
	root: string,
	file: string,
	options: GitRunOptions,
): Promise<FileVersion[]> {
	const output = await gitText(
		root,
		[
			"log",
			"--follow",
			"-z",
			"--format=\u001e%H\u001f%ct\u001f",
			"--name-status",
			"-M",
			"HEAD",
			"--",
			file,
		],
		options,
	);
	return parseLog(output).flatMap((commit) => {
		const change = commit.changes[0];
		if (change === undefined) return [];
		return [
			{
				commit: commit.commit,
				committedAt: commit.committedAt,
				path: change.path,
				before: change.status === "A" ? undefined : (change.from ?? change.path),
			},
		];
	});
}

/**
 * The newest commit of a file's history that changed the board's current variant.
 * @param root The checkout.
 * @param history The file's commits, newest first.
 * @param options The caller's signal.
 * @returns That commit.
 */
async function lastChangingCommit(
	root: string,
	history: readonly FileVersion[],
	options: GitRunOptions,
): Promise<FileVersion | undefined> {
	for (let start = 0; start < history.length; start += VERSIONS_PER_BATCH) {
		const batch = history.slice(start, start + VERSIONS_PER_BATCH);
		const specs = batch.flatMap((version) => [
			`${version.commit}:${version.path}`,
			version.before === undefined ? undefined : `${version.commit}^:${version.before}`,
		]);
		// oxlint-disable-next-line no-await-in-loop -- most boards stop in the first batch
		const blobs = await readBlobs(root, specs, options);
		const at = batch.findIndex((_, index) =>
			changedCurrent(boardOf(blobs[index * 2 + 1]), boardOf(blobs[index * 2])),
		);
		if (at !== -1) return batch[at];
	}
	return history.at(-1);
}

/**
 * The last change of one board.
 * @param board The board as the store reads it now.
 * @param file The board file.
 * @param vaultRoot The root of the Git checkout that holds the vault, or undefined when there is none.
 * @param options The caller's signal.
 * @returns The last change, or why it cannot be found.
 */
async function lastChangeOf(
	board: SemanticBoard,
	file: string,
	vaultRoot: string | undefined,
	options: GitRunOptions,
): Promise<LastChange> {
	if (vaultRoot === undefined) return { kind: "unknown", reason: "vault-outside-git" };
	const relative = path.relative(vaultRoot, file).split(path.sep).join("/");
	const [atHead] = await readBlobs(vaultRoot, [`HEAD:${relative}`], options);
	if (atHead === undefined) {
		const ignored = await gitSays(vaultRoot, ["check-ignore", "-q", "--", relative], options);
		return ignored ? { kind: "unknown", reason: "board-file-ignored" } : { kind: "uncommitted" };
	}
	if (changedCurrent(boardOf(atHead), board)) return { kind: "uncommitted" };
	const found = await lastChangingCommit(
		vaultRoot,
		await fileHistory(vaultRoot, relative, options),
		options,
	);
	return found === undefined
		? { kind: "uncommitted" }
		: { kind: "commit", commit: found.commit, committedAt: found.committedAt };
}

export { type LastChange, lastChangeOf };
