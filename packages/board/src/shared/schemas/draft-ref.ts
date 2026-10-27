// The code a draft is read against (TASK-488, TASK-493).
//
// In a stack of pull requests each draft describes the code of its own
// branch, which holds the code of the layers below it. A part of the draft may
// still pin an older layer's branch, because it was inherited. The code a
// draft describes, in each repository, is the ref its bindings name that no
// variant before it names, which is the draft's own branch; else the one ref
// they all name; else none, and the checkout's files stand. A draft that names
// several refs of a repository, none of them its own, is read part by part.

import type { CodeBinding } from "@archboard/code-binding/bindings";
import type { SemanticBoard, SemanticVariant } from "#shared/schemas/board-document.ts";
import type { SemanticNode } from "#shared/schemas/content.ts";

/**
 * The variants a variant was branched from, nearest first.
 * @param board The board.
 * @param variant The variant.
 * @returns Its parent, the parent's parent, and so on.
 */
function ancestorsOf(board: Pick<SemanticBoard, "variants">, variant: SemanticVariant): SemanticVariant[] {
	const chain: SemanticVariant[] = [];
	let next = board.variants.find((one) => one.id === variant.parent);
	while (next !== undefined && !chain.includes(next)) {
		chain.push(next);
		const child = next;
		next = board.variants.find((one) => one.id === child.parent);
	}
	return chain;
}

/**
 * The ref a part's binding names in one repository.
 * @param node The part.
 * @param repo The repository.
 * @returns Its commit, else its branch; none when it binds another repository or names no ref.
 */
function refOf(node: SemanticNode, repo: string): string[] {
	if (node.binding?.repo !== repo) return [];
	const ref = node.binding.commit ?? node.binding.branch;
	return ref === undefined ? [] : [ref];
}

/**
 * The refs the bindings of some variants name in one repository.
 * @param variants The variants.
 * @param repo The repository.
 * @returns Each ref: a binding's commit, else its branch.
 */
function refsIn(variants: readonly SemanticVariant[], repo: string): Set<string> {
	return new Set(
		variants.flatMap((variant) => variant.content.nodes.flatMap((node) => refOf(node, repo))),
	);
}

/**
 * The refs a draft could be read against in one repository: the refs its
 * bindings name that no variant before it names, else every ref they name.
 * @param board The board.
 * @param variant The draft.
 * @param repo The repository.
 * @returns The refs, sorted; none when the draft names no ref there.
 */
function draftRefs(board: Pick<SemanticBoard, "variants">, variant: SemanticVariant, repo: string): string[] {
	const named = refsIn([variant], repo);
	const earlier = refsIn(ancestorsOf(board, variant), repo);
	const own = [...named].filter((ref) => !earlier.has(ref));
	return (own.length > 0 ? own : [...named]).toSorted();
}

/**
 * The ref a binding names.
 * @param binding The binding.
 * @returns Its commit, else its branch; none when it names no ref.
 */
function refOfBinding(binding: CodeBinding): string | undefined {
	return binding.commit ?? binding.branch;
}

/** The ref a draft is read at in one repository, and a binding of the draft that names it. */
interface OwnRef {
	readonly ref: string;
	readonly binding: CodeBinding;
}

/**
 * For each repository where a draft names one ref of its own (or the one ref
 * they all name), that ref. A repository where the draft names no ref, or
 * several of its own, is absent: its parts are read part by part. A variant
 * that is not a draft has none.
 * @param board The board.
 * @param variant The variant.
 * @returns The ref the draft is read at, by repository.
 */
function ownRefs(board: Pick<SemanticBoard, "variants">, variant: SemanticVariant): Map<string, OwnRef> {
	const own = new Map<string, OwnRef>();
	if (variant.lifecycle !== "draft") return own;
	const { nodes } = variant.content;
	for (const repo of new Set(nodes.flatMap((node) => node.binding?.repo ?? []))) {
		const found = ownRefIn(board, variant, repo);
		if (found !== undefined) own.set(repo, found);
	}
	return own;
}

/**
 * The one ref a draft is read at in a repository.
 * @param board The board.
 * @param variant The draft.
 * @param repo The repository.
 * @returns The ref and a binding that names it, or undefined when the draft names none or several of its own.
 */
function ownRefIn(
	board: Pick<SemanticBoard, "variants">,
	variant: SemanticVariant,
	repo: string,
): OwnRef | undefined {
	const refs = draftRefs(board, variant, repo);
	const [ref] = refs;
	if (refs.length !== 1 || ref === undefined) return undefined;
	const binding = variant.content.nodes.find((node) => refOf(node, repo)[0] === ref)?.binding;
	return binding === undefined ? undefined : { ref, binding };
}

/**
 * A binding with the branch and commit of another binding, which names the
 * ref the draft is read at.
 * @param binding The binding.
 * @param source A binding of the draft that names the ref.
 * @returns The binding at that ref.
 */
function pinnedTo(binding: CodeBinding, source: CodeBinding): CodeBinding {
	const { branch: _branch, commit: _commit, ...rest } = binding;
	return {
		...rest,
		...(source.branch === undefined ? {} : { branch: source.branch }),
		...(source.commit === undefined ? {} : { commit: source.commit }),
	};
}

/**
 * A part as it is read: at the draft's ref when it pins no ref, that one, or
 * an older one whose code that ref holds.
 * @param node The part.
 * @param own The ref the draft is read at, by repository.
 * @param holds Whether the draft's ref holds the code of a ref in a repository.
 * @returns The part.
 */
function repinned(
	node: SemanticNode,
	own: ReadonlyMap<string, OwnRef>,
	holds: (repo: string, ref: string) => boolean,
): SemanticNode {
	const { binding } = node;
	const at = binding === undefined ? undefined : own.get(binding.repo);
	if (binding === undefined || at === undefined) return node;
	const ref = refOfBinding(binding);
	return readsAt(ref, at, (older) => holds(binding.repo, older))
		? { ...node, binding: pinnedTo(binding, at.binding) }
		: node;
}

/**
 * Whether a part that pins a ref is read at the draft's ref.
 * @param ref The ref the part pins, if any.
 * @param at The ref the draft is read at.
 * @param holds Whether the draft's ref holds the code of a ref.
 * @returns True when the part pins none, the draft's own, or a ref the draft's ref holds.
 */
function readsAt(ref: string | undefined, at: OwnRef, holds: (ref: string) => boolean): boolean {
	return ref === undefined || ref === at.ref || holds(ref);
}

/**
 * The parts of a draft as they are read: a bound part of a repository where
 * the draft has a ref of its own is read at that ref, when it pins no ref, the
 * same one, or an older one whose code that ref holds (`holds`). A part that
 * pins another ref, such as a later layer's branch, keeps it.
 * @param nodes The draft's parts.
 * @param own The ref the draft is read at, by repository.
 * @param holds Whether the draft's ref holds the code of a ref in a repository.
 * @returns The parts.
 */
function nodesPinnedTo(
	nodes: readonly SemanticNode[],
	own: ReadonlyMap<string, OwnRef>,
	holds: (repo: string, ref: string) => boolean,
): SemanticNode[] {
	return nodes.map((node) => repinned(node, own, holds));
}

export { type OwnRef, draftRefs, nodesPinnedTo, ownRefs, refOfBinding };
