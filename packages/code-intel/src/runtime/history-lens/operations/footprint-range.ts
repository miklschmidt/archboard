// Where a footprint's range runs in one checkout (ADR 0045): from the merge base of the base ref
// and the head up to the head. The head is a ref the caller named, else the checkout's HEAD, or its
// working tree when the caller names that (TASK-646.02). Nothing is fetched: a ref resolves only
// from what the checkout already has.

import { gitAnswer, type GitRunOptions } from "#runtime/history-lens/clients/git.ts";
import { commitOf } from "#runtime/history-lens/clients/source-history.ts";
import { withWorkingTree } from "#runtime/history-lens/operations/working-tree.ts";

/** The working tree of each checkout as the head of a footprint, in place of a ref. */
interface WorkingTreeHead {
	readonly workingTree: true;
}

/** Where a footprint's commits end: a ref, or each checkout's working tree. */
type FootprintHead = string | WorkingTreeHead;

/** Where a checkout's range runs: the ref's commit, the merge base with the head, and the head. */
interface Range {
	readonly base: string;
	readonly mergeBase: string;
	readonly head: string;
}

/** Why a checkout's range was not read. */
interface Unread {
	readonly reason: "base-unresolved" | "head-unresolved" | "no-merge-base";
	readonly detail: string;
}

/**
 * The commit the range ends at: the head the caller named, resolved as the
 * code check resolves a ref, else the checkout's HEAD.
 * @param root The checkout.
 * @param head The head ref as asked, when the caller named one.
 * @param options The caller's signal.
 * @returns The commit id, or undefined when the checkout has no such commit.
 */
function headOf(
	root: string,
	head: string | undefined,
	options: GitRunOptions,
): Promise<string | undefined> {
	return head === undefined
		? gitAnswer(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], options)
		: commitOf(root, head, options);
}

/**
 * Where a checkout's range runs between a head and the base. `--end-of-options`
 * keeps a ref that begins with a dash from being read as an option.
 * @param root The checkout.
 * @param base The ref as asked.
 * @param tip The commit the range ends at, when the checkout has one.
 * @param tipName What the commit was asked for as: the head ref, HEAD or the working tree.
 * @param options The caller's signal.
 * @returns The range, or why it cannot be read.
 */
async function rangeBetween(
	root: string,
	base: string,
	tip: string | undefined,
	tipName: string,
	options: GitRunOptions,
): Promise<Range | Unread> {
	const resolved = await gitAnswer(
		root,
		["rev-parse", "--verify", "--quiet", "--end-of-options", `${base}^{commit}`],
		options,
	);
	if (resolved === undefined) {
		return {
			reason: "base-unresolved",
			detail: `"${base}" does not resolve in the checkout at ${root}.`,
		};
	}
	const mergeBase =
		tip === undefined ? undefined : await gitAnswer(root, ["merge-base", resolved, tip], options);
	if (tip === undefined || mergeBase === undefined) {
		return {
			reason: "no-merge-base",
			detail: `"${base}" and ${tipName} share no history in the checkout at ${root}.`,
		};
	}
	return { base: resolved, mergeBase, head: tip };
}

/**
 * Where a checkout's range runs: from the base to the head the caller named,
 * else to HEAD.
 * @param root The checkout.
 * @param base The ref as asked.
 * @param head The head ref as asked, when the caller named one.
 * @param options The caller's signal.
 * @returns The range, or why it cannot be read.
 */
async function rangeOf(
	root: string,
	base: string,
	head: string | undefined,
	options: GitRunOptions,
): Promise<Range | Unread> {
	const tip = await headOf(root, head, options);
	if (tip === undefined && head !== undefined) {
		return {
			reason: "head-unresolved",
			detail: `"${head}" does not resolve in the checkout at ${root}.`,
		};
	}
	return rangeBetween(root, base, tip, head ?? "HEAD", options);
}

/**
 * Read a checkout's range. The commit of a working tree lives only for the reading.
 * @param root The checkout.
 * @param refs The refs as asked.
 * @param refs.base The ref the range starts from.
 * @param refs.head Where it ends: a ref, the working tree, or HEAD when absent.
 * @param options The caller's signal.
 * @param read The reading, given the range and the options every Git command of it runs with.
 * @returns What the reading answers.
 */
async function withRange<Answer>(
	root: string,
	refs: { readonly base: string; readonly head: FootprintHead | undefined },
	options: GitRunOptions,
	read: (range: Range | Unread, options: GitRunOptions) => Promise<Answer>,
): Promise<Answer> {
	const { base, head } = refs;
	if (typeof head === "object") {
		return withWorkingTree(root, options, async (tip, inTree) =>
			read(await rangeBetween(root, base, tip, "the working tree", inTree), inTree),
		);
	}
	return read(await rangeOf(root, base, head, options), options);
}

/**
 * A head as a key that groups parts: the empty string for HEAD. No ref holds a NUL byte, so the
 * working tree's key is never a ref's.
 * @param head Where the commits end.
 * @returns The key.
 */
function headKey(head: FootprintHead | undefined): string {
	return typeof head === "object" ? "\0" : (head ?? "");
}

export { headKey, withRange, type FootprintHead, type Range, type Unread };
