// The footprint of a range of commits (ADR 0045).
//
// It reads, in each checkout that holds a bound part, the commits from the
// merge base of the named ref and HEAD up to HEAD, never fetching: a ref
// resolves only from what the checkout already has, and a checkout where it
// does not resolve is not read, and says so. The commits map onto the parts
// whose bound files they changed, the way behind maps them. Large commits are
// kept and marked. With a proposal, the footprint sets the changed parts
// against the parts the proposal names, in three lists, and a part the lens
// skipped is in none of them.

import { snapshotCheckoutAccess } from "@/runtime/code-target/index";
import { answerCommit } from "@/runtime/history-lens/lib/answer-commit";
import {
	commitsByBoundPath,
	walkCommits,
	type WalkedCommit,
} from "@/runtime/history-lens/lib/commits";
import { gitAnswer, type GitRunOptions } from "@/runtime/history-lens/lib/git";
import { namedParts, type Named } from "@/runtime/history-lens/lib/named-parts";
import { partReading, type ReadPart } from "@/runtime/history-lens/lib/parts";
import type { BehindCommit } from "@/shared/code-check/index";
import type {
	FootprintAnswer,
	FootprintPart,
	FootprintRepository,
	FootprintSkip,
	NamedReason,
} from "@/shared/footprint/index";
import {
	compareVariants,
	type SemanticBoard,
	type SemanticNode,
	type SemanticVariant,
} from "@/shared/semantic-board/index";

/** What to read: a board's current variant, the ref, and the proposal to set it against. */
interface FootprintRequest {
	readonly board: SemanticBoard;
	/** The variant that is built, which the commits are read against. */
	readonly current: SemanticVariant;
	/** A draft to set the commits against, when one was named. */
	readonly proposal?: SemanticVariant | undefined;
	/** Any ref that resolves in the checkouts, such as `main`, `origin/main` or a commit. */
	readonly base: string;
	readonly signal?: AbortSignal | undefined;
}

/** What one repository's checkout holds of the footprint. */
interface RepositoryFootprint {
	readonly range: FootprintRepository;
	/** Parts that commits changed. */
	readonly changed: readonly FootprintPart[];
	/** Parts that no commit changed. */
	readonly unchanged: readonly FootprintPart[];
	/** Parts of this repository the lens did not read, because its range was not. */
	readonly skipped: readonly FootprintSkip[];
	readonly commits: readonly BehindCommit[];
}

/** Where a checkout's range runs: the ref's commit, the merge base with HEAD, and HEAD. */
interface Range {
	readonly base: string;
	readonly mergeBase: string;
	readonly head: string;
}

/** Why a checkout's range was not read. */
interface Unread {
	readonly reason: "base-unresolved" | "no-merge-base";
	readonly detail: string;
}

/**
 * The parts to read: the proposal's, with what it removed put back from the
 * current variant. A removed part is only on the current variant and an added
 * part is only on the proposal.
 * @param current The current variant.
 * @param proposal The proposal, when there is one.
 * @returns The parts, each as the variant that has it states it.
 */
function partsOf(current: SemanticVariant, proposal: SemanticVariant | undefined): SemanticNode[] {
	if (proposal === undefined) return [...current.content.nodes];
	const held = new Set(proposal.content.nodes.map((node) => node.id));
	return [...proposal.content.nodes, ...current.content.nodes.filter((node) => !held.has(node.id))];
}

/**
 * The part as the answer lists it.
 * @param part The part read.
 * @param commits The commits that changed it, newest first.
 * @param named Why the proposal names it.
 * @returns The listed part.
 */
function listed(part: ReadPart, commits: readonly string[], named: NamedReason[]): FootprintPart {
	return {
		subject: { kind: "node", id: part.node.id, name: part.node.name },
		repo: part.repo,
		path: part.node.binding?.path ?? part.path,
		commits: [...commits],
		named,
	};
}

/**
 * Where a checkout's range runs. `--end-of-options` keeps a ref that begins
 * with a dash from being read as an option.
 * @param root The checkout.
 * @param base The ref as asked.
 * @param options The caller's signal.
 * @returns The range, or why it cannot be read.
 */
async function rangeOf(
	root: string,
	base: string,
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
	const head = await gitAnswer(
		root,
		["rev-parse", "--verify", "--quiet", "HEAD^{commit}"],
		options,
	);
	const mergeBase =
		head === undefined ? undefined : await gitAnswer(root, ["merge-base", resolved, head], options);
	if (head === undefined || mergeBase === undefined) {
		return {
			reason: "no-merge-base",
			detail: `"${base}" and HEAD share no history in the checkout at ${root}.`,
		};
	}
	return { base: resolved, mergeBase, head };
}

/**
 * What a checkout whose range was not read holds: none of its parts are in a
 * list, and each is skipped with the reason.
 * @param repo The repository.
 * @param parts The parts bound there.
 * @param named Why the proposal names each part.
 * @param unread Why the range was not read.
 * @returns The checkout's footprint.
 */
function unreadRepository(
	repo: string,
	parts: readonly ReadPart[],
	named: Named,
	unread: Unread,
): RepositoryFootprint {
	return {
		range: { status: "unread", repo, ...unread },
		changed: [],
		unchanged: [],
		commits: [],
		skipped: parts.map((part) => ({
			subject: { kind: "node", id: part.node.id, name: part.node.name },
			reason: unread.reason,
			repo,
			detail: unread.detail,
			named: named.get(part.node.id) ?? [],
		})),
	};
}

/**
 * What a checkout holds when its range was read: the commits between the
 * merge base and HEAD, mapped onto the parts bound there.
 * @param repo The repository.
 * @param parts The parts bound there.
 * @param named Why the proposal names each part.
 * @param range Where the range runs.
 * @param walked The commits in it, newest first.
 * @returns The checkout's footprint.
 */
function mappedRepository(
	repo: string,
	parts: readonly ReadPart[],
	named: Named,
	range: Range,
	walked: readonly WalkedCommit[],
): RepositoryFootprint {
	const byPath = commitsByBoundPath(
		walked,
		parts.map((part) => part.path),
	);
	const entries = parts.map((part) => {
		const commits = byPath.get(part.path) ?? [];
		return { commits, part: listed(part, commits, named.get(part.node.id) ?? []) };
	});
	const used = new Set(entries.flatMap((entry) => entry.commits));
	return {
		range: { status: "read", repo, ...range, commits: walked.length },
		changed: entries.filter((entry) => entry.commits.length > 0).map((entry) => entry.part),
		unchanged: entries.filter((entry) => entry.commits.length === 0).map((entry) => entry.part),
		skipped: [],
		commits: walked
			.filter((commit) => used.has(commit.commit))
			.map((commit) => answerCommit(repo, commit)),
	};
}

/**
 * Read one checkout's range: where the ref resolves, the merge base with
 * HEAD, and the commits between them mapped onto the paths bound there.
 * @param repo The repository.
 * @param parts The parts bound there, all in one checkout.
 * @param base The ref as asked.
 * @param named Why the proposal names each part.
 * @param options The caller's signal.
 * @returns What the checkout holds, or why its range was not read.
 */
async function readRepository(
	repo: string,
	parts: readonly ReadPart[],
	base: string,
	named: Named,
	options: GitRunOptions,
): Promise<RepositoryFootprint> {
	const root = parts[0]?.root ?? "";
	const range = await rangeOf(root, base, options);
	if ("reason" in range) return unreadRepository(repo, parts, named, range);
	const walked = await walkCommits(root, [`${range.mergeBase}..${range.head}`], options);
	return mappedRepository(repo, parts, named, range, walked);
}

/**
 * The read parts of one variant by repository.
 * @param parts The parts.
 * @returns Each repository with the parts bound there.
 */
function byRepository(parts: readonly ReadPart[]): Map<string, ReadPart[]> {
	const grouped = new Map<string, ReadPart[]>();
	for (const part of parts) grouped.set(part.repo, [...(grouped.get(part.repo) ?? []), part]);
	return grouped;
}

/**
 * Entries in the order of the variant's parts, whatever repository holds them.
 * @param nodes The parts in the variant's order.
 * @param entries Anything about a part.
 * @returns The entries, ordered.
 */
function inOrder<Entry extends { readonly subject: { readonly id: string } }>(
	nodes: readonly SemanticNode[],
	entries: readonly Entry[],
): Entry[] {
	const order = new Map(nodes.map((node, index) => [node.id, index]));
	return entries.toSorted(
		(left, right) => (order.get(left.subject.id) ?? 0) - (order.get(right.subject.id) ?? 0),
	);
}

/**
 * Whether the proposal names a part.
 * @param part A listed part.
 * @returns True when it carries a reason.
 */
function isNamed(part: FootprintPart): boolean {
	return part.named.length > 0;
}

/**
 * Why the proposal names each part: nothing without a proposal.
 * @param current The current variant.
 * @param proposal The proposal, when there is one.
 * @param nodes The parts read, as `partsOf` lists them.
 * @returns For each named part, its reasons.
 */
function namedBy(
	current: SemanticVariant,
	proposal: SemanticVariant | undefined,
	nodes: readonly SemanticNode[],
): Named {
	if (proposal === undefined) return new Map();
	const names = new Map(nodes.map((node) => [node.id, node.name]));
	return namedParts(
		compareVariants(current.content, proposal.content),
		(id) => names.get(id) ?? id,
	);
}

/**
 * Read the footprint of a range of commits against a board's current variant,
 * and against a proposal when one is named.
 * @param request What to read.
 * @returns The footprint.
 */
async function readFootprint(request: FootprintRequest): Promise<FootprintAnswer> {
	const { board, current, proposal, base, signal } = request;
	const nodes = partsOf(current, proposal);
	const named = namedBy(current, proposal, nodes);
	const snapshot = await snapshotCheckoutAccess({
		...(signal === undefined ? {} : { signal }),
		bindings: nodes.flatMap((node) => (node.binding === undefined ? [] : [node.binding])),
	});
	const reading = partReading({ nodes }, snapshot);
	const repositories = await Promise.all(
		[...byRepository(reading.read)].map(([repo, parts]) =>
			readRepository(repo, parts, base, named, { signal }),
		),
	);
	const changed = inOrder(
		nodes,
		repositories.flatMap((one) => one.changed),
	);
	const common = {
		board: board.name,
		version: board.version,
		base,
		current: { id: current.id, name: current.name },
		repositories: repositories.map((one) => one.range),
		commits: repositories
			.flatMap((one) => one.commits)
			.toSorted((left, right) => right.committedAt.localeCompare(left.committedAt)),
		skipped: inOrder(nodes, [
			...reading.skipped.map((skip) => ({ ...skip, named: named.get(skip.subject.id) ?? [] })),
			...repositories.flatMap((one) => one.skipped),
		]),
	};
	if (proposal === undefined) return { ...common, proposal: null, changed };
	const unchanged = inOrder(
		nodes,
		repositories.flatMap((one) => one.unchanged),
	);
	return {
		...common,
		proposal: { id: proposal.id, name: proposal.name },
		namedAndChanged: changed.filter(isNamed),
		changedNotNamed: changed.filter((part) => !isNamed(part)),
		namedNotChanged: unchanged.filter(isNamed),
	};
}

export { type FootprintRequest, readFootprint };
