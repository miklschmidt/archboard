// The footprint of a range of commits (ADR 0045).
//
// It reads, in each checkout that holds a bound part, the commits from the
// merge base of the named ref and HEAD up to HEAD, or up to a named head ref
// that need not be checked out (a layer of a pull-request stack), never
// fetching: a ref resolves only from what the checkout already has, and a
// checkout where it does not resolve is not read, and says so. A part pinned to
// a branch or commit that its checkout does not have out is read up to that ref
// when no head is named (TASK-493). A part changed when its bound declarations
// or paths differ between the merge base and the head, so a change that a later
// commit undoes, or that a merge brings in from a lower layer of a stack, does
// not count (TASK-635). Each changed part keeps the commits that changed it.
// Large commits are kept and marked. With a proposal, the footprint sets the changed parts
// against the parts the proposal names, in three lists, and a part the lens
// skipped is in none of them. A changed file that no binding holds is in a
// list of its own (TASK-621). Each part says whether the range adds source to
// it, and a part the proposal adds that gains none is preexisting: its code was
// there before the branch, or its binding names code that exists nowhere
// (TASK-637). A caller can name the working tree as the head: the range then
// ends at each checkout's uncommitted changes, untracked files included, on top
// of HEAD, so that a gate run before a commit sees them (TASK-646.02).

import { realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { bindingPathOf } from "@archboard/code-binding/bindings";
import { snapshotCheckoutAccess, type CheckoutSnapshot } from "@archboard/code-binding/resolution";
import {
	attributeCommits,
	netChangedParts,
	type AttributedCommits,
} from "#runtime/history-lens/operations/attribution.ts";
import { markedCommit } from "#runtime/history-lens/operations/answer-commit.ts";
import {
	normalizeBoundPath,
	walkCommits,
	type WalkedCommit,
} from "#runtime/history-lens/operations/commits.ts";
import {
	headKey,
	withRange,
	type FootprintHead,
	type Range,
	type Unread,
} from "#runtime/history-lens/operations/footprint-range.ts";
import { unboundFiles } from "#runtime/history-lens/operations/unbound-files.ts";
import { withHeld, type ChangedPart } from "#runtime/history-lens/operations/held-parts.ts";
import type { GitRunOptions } from "#runtime/history-lens/clients/git.ts";
import { namedParts, type Named } from "#runtime/history-lens/operations/named-parts.ts";
import { partReading, type ReadPart } from "#runtime/history-lens/operations/parts.ts";
import type { BehindCommit } from "#shared/protocol/code-check.ts";
import type {
	FootprintAnswer,
	FootprintPart,
	FootprintRepository,
	FootprintSkip,
	NamedReason,
	UnboundFile,
} from "#shared/protocol/footprint.ts";
import { nodesAtOwnRef } from "#runtime/history-lens/operations/own-ref.ts";
import { compareVariants } from "@archboard/model/comparison";
import { emptyContent, type SemanticNode } from "@archboard/model/content";
import type { LegacyBoard, SemanticVariant } from "@archboard/model/legacy-board";

/**
 * What to read, once the variants are chosen (`footprint-reading.ts`): the
 * variant the commits are read against, the ref, and the proposal to set it
 * against.
 */
interface VariantFootprintRequest {
	/** The vault directory the document is in: its own checkout is read for its own repository. */
	readonly vault: string;
	readonly document: Pick<LegacyBoard, "id" | "name" | "variants" | "current">;
	/**
	 * The variant the proposal is read against: the document's current variant by
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
	 * commit, resolved as the code check resolves a ref a draft pins, read from Git
	 * and never checked out. Or each checkout's working tree, which reads its
	 * uncommitted changes on top of HEAD.
	 */
	readonly head?: FootprintHead | undefined;
	readonly signal?: AbortSignal | undefined;
}

/** What one repository's checkout holds of the footprint. */
interface RepositoryFootprint {
	readonly range: FootprintRepository;
	/** Parts that the range changed, each with the files that it changed. */
	readonly changed: readonly ChangedPart[];
	/** Parts that the range did not change. */
	readonly unchanged: readonly FootprintPart[];
	/** Parts of this repository the lens did not read, because its range was not. */
	readonly skipped: readonly FootprintSkip[];
	readonly commits: readonly BehindCommit[];
	/** The changed files that no binding holds; none for a range read up to a pinned ref. */
	readonly unbound: readonly UnboundFile[];
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
	const own = await nodesAtOwnRef(request.document, read, (repo) => roots.get(repo), {
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
 * @param newSource Whether the range adds source to it.
 * @returns The listed part.
 */
function listed(
	part: ReadPart,
	commits: readonly string[],
	named: NamedReason[],
	newSource: boolean,
): FootprintPart {
	return {
		subject: { kind: "node", id: part.node.id, name: part.node.name },
		repo: part.repo,
		path: part.node.binding?.path ?? part.path,
		commits: [...commits],
		named,
		holds: [],
		newSource,
	};
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
		unbound: [],
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
 * What a checkout holds when its range was read: the parts bound there that
 * the range changed, each with the commits between the merge base and the
 * head that changed it.
 * @param repo The repository.
 * @param parts The parts bound there.
 * @param named Why the proposal names each part.
 * @param range Where the range runs.
 * @param walked The commits in it, newest first.
 * @param byPart Shared declaration attribution for each part.
 * @param net The parts that the range changed, and the files it changed.
 * @param net.parts The ids of those parts.
 * @param net.adds The ids of the parts that the range adds source to.
 * @param net.files Those files, under each name of a rename.
 * @returns The checkout's footprint.
 */
function mappedRepository(
	repo: string,
	parts: readonly ReadPart[],
	named: Named,
	range: Range,
	walked: readonly WalkedCommit[],
	byPart: ReadonlyMap<string, AttributedCommits>,
	net: {
		readonly parts: ReadonlySet<string>;
		readonly adds: ReadonlySet<string>;
		readonly files: readonly string[];
	},
): RepositoryFootprint {
	const entries = parts.map((part) => {
		const attributed = byPart.get(part.node.id) ?? {
			commits: [],
			attribution: { mode: "path" as const },
		};
		const changed = net.parts.has(part.node.id);
		const commits = changed ? attributed.commits : [];
		return {
			changed,
			commits,
			part: {
				...listed(part, commits, named.get(part.node.id) ?? [], net.adds.has(part.node.id)),
				attribution: attributed.attribution,
			},
		};
	});
	const used = new Set(entries.flatMap((entry) => entry.commits));
	return {
		range: { status: "read", repo, ...range, commits: walked.length },
		changed: entries
			.filter((entry) => entry.changed)
			.map((entry) => ({ ...entry.part, files: net.files })),
		unchanged: entries.filter((entry) => !entry.changed).map((entry) => entry.part),
		skipped: [],
		commits: walked
			.filter((commit) => used.has(commit.commit))
			.map((commit) => markedCommit(repo, commit)),
		unbound: [],
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
 * @param scopes Where the files of the repository are bound, or undefined to list no unbound file.
 * @param options The caller's signal.
 * @returns What the checkout holds, or why its range was not read.
 */
async function readRepository(
	repo: string,
	parts: readonly ReadPart[],
	refs: { readonly base: string; readonly head: FootprintHead | undefined },
	named: Named,
	scopes: readonly string[] | undefined,
	options: GitRunOptions,
): Promise<RepositoryFootprint> {
	const root = parts[0]?.root ?? "";
	return withRange(root, refs, options, async (range, inRange) => {
		if ("reason" in range) return unreadRepository(repo, parts, named, range);
		const walked = await walkCommits(root, [`${range.mergeBase}..${range.head}`], inRange);
		const [byPart, net] = await Promise.all([
			attributeCommits(root, range.head, walked, parts, inRange),
			netChangedParts(root, { from: range.mergeBase, to: range.head }, parts, inRange),
		]);
		const mapped = mappedRepository(repo, parts, named, range, walked, byPart, net);
		if (scopes === undefined) return mapped;
		const changedFiles = new Set(net.files);
		return {
			...mapped,
			unbound: unboundFiles(walked, scopes)
				.filter((file) => changedFiles.has(file.path))
				.map((file) => ({ repo, ...file })),
		};
	});
}

/**
 * A path as the operating system resolves it, else as given.
 * @param path The path.
 * @returns The real path.
 */
function realOf(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return path;
	}
}

/**
 * The vault's directory as a scope of a checkout, so that its files are never unbound.
 * @param root The checkout.
 * @param vault The vault directory.
 * @returns The scope, or none when the vault is not inside the checkout.
 */
function vaultScope(root: string, vault: string): string[] {
	const inside = relative(realOf(root), realOf(vault)).split(sep).join("/");
	return inside === "" || inside.split("/")[0] === ".." || isAbsolute(inside) ? [] : [inside];
}

/**
 * Where the files of one repository are bound: the scope of every binding there, a skipped
 * part's too, and the vault's directory.
 * @param nodes Every part.
 * @param repo The repository.
 * @param root Its checkout.
 * @param vault The vault directory.
 * @returns The normalized scopes.
 */
function scopesOf(
	nodes: readonly SemanticNode[],
	repo: string,
	root: string,
	vault: string,
): string[] {
	const paths = nodes.flatMap((node) =>
		node.binding?.repo === repo ? [normalizeBoundPath(node.binding.path)] : [],
	);
	return [
		...paths.flatMap((path) => (path === undefined ? [] : [bindingPathOf(path)])),
		...vaultScope(root, vault),
	];
}

/** The read parts of one repository that are read up to one head. */
interface RepositoryGroup {
	readonly repo: string;
	readonly head: FootprintHead | undefined;
	readonly parts: ReadPart[];
}

/**
 * The read parts of one variant by repository and by where their commits end:
 * the ref the caller named, else the ref a part is pinned to that its
 * checkout lacks out, else the working tree when the caller named it, else HEAD (TASK-493).
 * @param parts The parts.
 * @param head The head the caller named, if any.
 * @returns Each repository with the parts bound there, and the head they are read up to.
 */
function byRepository(
	parts: readonly ReadPart[],
	head: FootprintHead | undefined,
): RepositoryGroup[] {
	const grouped = new Map<string, RepositoryGroup>();
	for (const part of parts) {
		const tip = typeof head === "string" ? head : (part.ref ?? head);
		const key = `${part.repo}\0${headKey(tip)}`;
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
		? Omit<T, "model" | "version">
		: never
	: never;
/**
 * Read the footprint of a range of commits against a document's current variant,
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
	// Only the range up to the head is the branch's own: a part pinned to another ref lists no file.
	const repositories = await Promise.all(
		byRepository(reading.read, head).map((group) =>
			readRepository(
				group.repo,
				group.parts,
				{ base, head: group.head },
				named,
				group.head === head
					? scopesOf(nodes, group.repo, group.parts[0]?.root ?? "", vault)
					: undefined,
				{ signal },
			),
		),
	);
	const changed = withHeld(
		inOrder(
			nodes,
			repositories.flatMap((one) => one.changed),
		),
	);
	const common = {
		base,
		...(head === undefined
			? {}
			: typeof head === "string"
				? { head }
				: { workingTree: true as const }),
		against: against === undefined ? null : { id: against.id, name: against.name },
		repositories: repositories.map((one) => one.range),
		commits: repositories
			.flatMap((one) => one.commits)
			.toSorted((left, right) => right.committedAt.localeCompare(left.committedAt)),
		skipped: inOrder(nodes, [
			...reading.skipped.map((skip) => ({ ...skip, named: named.get(skip.subject.id) ?? [] })),
			...repositories.flatMap((one) => one.skipped),
		]),
		unboundFiles: repositories.flatMap((one) => one.unbound),
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
		preexisting: inOrder(nodes, [...changed, ...unchanged]).filter(
			(part) =>
				!part.newSource && part.named.some(({ by, status }) => by === "part" && status === "added"),
		),
	};
}

/**
 * Read immutable legacy analysis inputs through the shared evidence engine.
 * @param request The retained semantic state and source range.
 * @returns The original semantic receipt.
 */
async function readVariantFootprint(
	request: Omit<VariantFootprintRequest, "document"> & { document: LegacyBoard },
): Promise<FootprintAnswer> {
	return {
		model: request.document.name,
		version: request.document.version,
		...(await readFootprintEvidence(request)),
	};
}
export { readVariantFootprint, readFootprintEvidence };
