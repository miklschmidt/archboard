// The footprint of a range of commits (ADR 0045).
//
// It reads, in each checkout that holds a bound part, the commits from the
// merge base of the named ref and HEAD up to HEAD, or up to a named head ref
// that need not be checked out (a layer of a pull-request stack), never
// fetching: a ref resolves only from what the checkout already has, and a
// checkout where it does not resolve is not read, and says so. A part pinned to
// a branch or commit that its checkout does not have out is read up to that ref
// when no head is named (TASK-493). The commits map onto the parts
// whose bound declarations or paths they changed. Large commits are
// kept and marked. With a proposal, the footprint sets the changed parts
// against the parts the proposal names, in three lists, and a part the lens
// skipped is in none of them.

import { snapshotCheckoutAccess, type CheckoutSnapshot } from "@archboard/code-binding/resolution";
import {
	attributeCommits,
	type AttributedCommits,
} from "#runtime/operations/history-lens/attribution.ts";
import { markedCommit } from "#runtime/operations/history-lens/answer-commit.ts";
import { walkCommits, type WalkedCommit } from "#runtime/operations/history-lens/commits.ts";
import { gitAnswer, type GitRunOptions } from "#runtime/clients/history-lens/git.ts";
import { namedParts, type Named } from "#runtime/operations/history-lens/named-parts.ts";
import { partReading, type ReadPart } from "#runtime/operations/history-lens/parts.ts";
import { commitOf } from "#runtime/clients/history-lens/source-history.ts";
import type { BehindCommit } from "#shared/protocol/code-check.ts";
import type {
	FootprintAnswer,
	FootprintPart,
	FootprintRepository,
	FootprintSkip,
	NamedReason,
} from "#shared/protocol/footprint.ts";
import { nodesAtOwnRef } from "#runtime/operations/history-lens/own-ref.ts";
import { compareVariants } from "@archboard/board/comparison";
import { emptyContent, type SemanticNode } from "@archboard/board/content";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";

/**
 * What to read, once the variants are chosen (`footprint-reading.ts`): the
 * variant the commits are read against, the ref, and the proposal to set it
 * against.
 */
interface VariantFootprintRequest {
	/** The vault directory the board is in: its own checkout is read for its own repository. */
	readonly vault: string;
	readonly board: Pick<SemanticBoard, "id" | "name" | "variants" | "current">;
	/**
	 * The variant the proposal is read against: the board's current variant by
	 * default. Undefined only with a proposal, which is then read against
	 * nothing, so it names every part it holds.
	 */
	readonly against?: SemanticVariant | undefined;
	/** A draft to set the commits against, when one was named. */
	readonly proposal?: SemanticVariant | undefined;
	/** Any ref that resolves in the checkouts, such as `main`, `origin/main` or a commit. */
	readonly base: string;
	/**
	 * Where the commits end, when not at each checkout's HEAD: a branch, tag or
	 * commit, resolved as the code check resolves a ref a draft pins. It is read
	 * from Git and never checked out.
	 */
	readonly head?: string | undefined;
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
 * The parts to read: the proposal's, with what it removed put back from the
 * variant it is read against. A removed part is only on that variant and an
 * added part is only on the proposal.
 * @param against The variant the proposal is read against, when there is one.
 * @param proposal The proposal, when there is one.
 * @returns The parts, each as the variant that has it states it.
 */
function partsOf(
	against: SemanticVariant | undefined,
	proposal: SemanticVariant | undefined,
): SemanticNode[] {
	const before = against?.content.nodes ?? [];
	if (proposal === undefined) return [...before];
	const held = new Set(proposal.content.nodes.map((node) => node.id));
	return [...proposal.content.nodes, ...before.filter((node) => !held.has(node.id))];
}

/**
 * The parts to read, with those of the variant the commits are read against
 * read at the one ref that variant is read against in each repository, which
 * in a stack holds the layers below it (TASK-493). A part that pins a ref that
 * ref does not hold keeps its own.
 * @param request What to read.
 * @param parts The parts, as `partsOf` lists them.
 * @param snapshot The registered checkouts.
 * @returns The parts, in the same order.
 */
async function atOwnRefs(
	request: VariantFootprintRequest,
	parts: readonly SemanticNode[],
	snapshot: CheckoutSnapshot,
): Promise<SemanticNode[]> {
	const read = request.proposal ?? request.against;
	if (read === undefined) return [...parts];
	const roots = new Map(
		partReading({ nodes: [...parts] }, snapshot, true).read.map((part) => [part.repo, part.root]),
	);
	const own = await nodesAtOwnRef(request.board, read, (repo) => roots.get(repo), {
		signal: request.signal,
	});
	const byId = new Map(own.map((node) => [node.id, node]));
	return parts.map((node) => byId.get(node.id) ?? node);
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
 * @param tipName What the commit was asked for as: the head ref, or HEAD.
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
 * merge base and the head, mapped onto the parts bound there.
 * @param repo The repository.
 * @param parts The parts bound there.
 * @param named Why the proposal names each part.
 * @param range Where the range runs.
 * @param walked The commits in it, newest first.
 * @param byPart Shared declaration attribution for each part.
 * @returns The checkout's footprint.
 */
function mappedRepository(
	repo: string,
	parts: readonly ReadPart[],
	named: Named,
	range: Range,
	walked: readonly WalkedCommit[],
	byPart: ReadonlyMap<string, AttributedCommits>,
): RepositoryFootprint {
	const entries = parts.map((part) => {
		const attributed = byPart.get(part.node.id);
		const commits = attributed?.commits ?? [];
		return {
			commits,
			part: {
				...listed(part, commits, named.get(part.node.id) ?? []),
				attribution: attributed?.attribution ?? { mode: "path" as const },
			},
		};
	});
	const used = new Set(entries.flatMap((entry) => entry.commits));
	return {
		range: { status: "read", repo, ...range, commits: walked.length },
		changed: entries.filter((entry) => entry.commits.length > 0).map((entry) => entry.part),
		unchanged: entries.filter((entry) => entry.commits.length === 0).map((entry) => entry.part),
		skipped: [],
		commits: walked
			.filter((commit) => used.has(commit.commit))
			.map((commit) => markedCommit(repo, commit)),
	};
}

/**
 * Read one checkout's range: where the ref resolves, the merge base with
 * the head, and the commits between them mapped onto the paths bound there.
 * @param repo The repository.
 * @param parts The parts bound there, all in one checkout.
 * @param refs The refs as asked.
 * @param refs.base The ref the range starts from.
 * @param refs.head The ref it ends at, when the caller named one.
 * @param named Why the proposal names each part.
 * @param options The caller's signal.
 * @returns What the checkout holds, or why its range was not read.
 */
async function readRepository(
	repo: string,
	parts: readonly ReadPart[],
	refs: { readonly base: string; readonly head: string | undefined },
	named: Named,
	options: GitRunOptions,
): Promise<RepositoryFootprint> {
	const root = parts[0]?.root ?? "";
	const range = await rangeOf(root, refs.base, refs.head, options);
	if ("reason" in range) return unreadRepository(repo, parts, named, range);
	const walked = await walkCommits(root, [`${range.mergeBase}..${range.head}`], options);
	return mappedRepository(
		repo,
		parts,
		named,
		range,
		walked,
		await attributeCommits(root, range.head, walked, parts, options),
	);
}

/**
 * The read parts of one variant by repository and by where their commits end:
 * the head the caller named, else the ref a part is pinned to that its
 * checkout lacks out, else HEAD (TASK-493).
 * @param parts The parts.
 * @param head The head the caller named, if any.
 * @returns Each repository with the parts bound there, and the head they are read up to.
 */
function byRepository(
	parts: readonly ReadPart[],
	head: string | undefined,
): { repo: string; head: string | undefined; parts: ReadPart[] }[] {
	const grouped = new Map<string, { repo: string; head: string | undefined; parts: ReadPart[] }>();
	for (const part of parts) {
		const tip = head ?? part.ref;
		const key = `${part.repo}\0${tip ?? ""}`;
		const held = grouped.get(key) ?? { repo: part.repo, head: tip, parts: [] };
		held.parts.push(part);
		grouped.set(key, held);
	}
	return [...grouped.values()];
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
 * @param against The variant the proposal is read against, when there is one.
 * @param proposal The proposal, when there is one.
 * @param nodes The parts read, as `partsOf` lists them.
 * @returns For each named part, its reasons.
 */
function namedBy(
	against: SemanticVariant | undefined,
	proposal: SemanticVariant | undefined,
	nodes: readonly SemanticNode[],
): Named {
	if (proposal === undefined) return new Map();
	const names = new Map(nodes.map((node) => [node.id, node.name]));
	return namedParts(
		compareVariants(against?.content ?? emptyContent(), proposal.content),
		(id) => names.get(id) ?? id,
	);
}

type FootprintEvidence = FootprintAnswer extends infer T
	? T extends unknown
		? Omit<T, "board" | "version">
		: never
	: never;
/**
 * Read the footprint of a range of commits against a board's current variant,
 * and against a proposal when one is named.
 * @param request What to read.
 * @returns The footprint.
 */
async function readFootprintEvidence(request: VariantFootprintRequest): Promise<FootprintEvidence> {
	const { vault, against, proposal, base, head, signal } = request;
	const all = partsOf(against, proposal);
	const snapshot = await snapshotCheckoutAccess({
		vault,
		...(signal === undefined ? {} : { signal }),
		bindings: all.flatMap((node) => (node.binding === undefined ? [] : [node.binding])),
	});
	const nodes = await atOwnRefs(request, all, snapshot);
	const named = namedBy(against, proposal, nodes);
	const reading = partReading({ nodes }, snapshot, true);
	const repositories = await Promise.all(
		byRepository(reading.read, head).map((group) =>
			readRepository(group.repo, group.parts, { base, head: group.head }, named, { signal }),
		),
	);
	const changed = inOrder(
		nodes,
		repositories.flatMap((one) => one.changed),
	);
	const common = {
		base,
		...(head === undefined ? {} : { head }),
		against: against === undefined ? null : { id: against.id, name: against.name },
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

/**
 * Read immutable legacy analysis inputs through the shared evidence engine.
 * @param request The retained semantic state and source range.
 * @returns The original semantic receipt.
 */
async function readVariantFootprint(
	request: Omit<VariantFootprintRequest, "board"> & { board: SemanticBoard },
): Promise<FootprintAnswer> {
	return {
		board: request.board.name,
		version: request.board.version,
		...(await readFootprintEvidence(request)),
	};
}
export { type VariantFootprintRequest, readVariantFootprint, readFootprintEvidence };
