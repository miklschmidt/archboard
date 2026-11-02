// Containment, and the chains that one reading folds into one step (rule 10 of the
// reader's record): a module whose one part holds parts reads the same as that part.
// The forest lists modules as a repository reads: containment decides the place, and a
// code path decides only the order among siblings, so a path never moves a module to
// another parent.

import { codeFolderOf, codePathOf } from "#shared/rules/code-path.ts";
import type { VariantContent } from "#shared/schemas/content.ts";

type Node = VariantContent["nodes"][number];

/** One entry of the forest: a module, or a chain that folds into one entry. */
interface ModuleBranch {
	/** The module at the head of the chain. */
	readonly id: string;
	/** The module that a reading of this branch opens: the end of the chain. */
	readonly end: string;
	/** Every module of the chain, head first. */
	readonly steps: readonly string[];
	readonly name: string;
	readonly path: string | undefined;
	readonly children: readonly ModuleBranch[];
}

/** Folder names read as a repository lists them, whatever the reader's locale. */
const FOLDERS = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Compare two code folders one segment at a time, so that a folder comes before what it holds.
 * @param left A folder, or nothing for a module that names no code.
 * @param right The other.
 * @returns The sort order: a module with no code comes last, and a tie is zero.
 */
function compareFolders(left: string | undefined, right: string | undefined): number {
	if (left === undefined || right === undefined)
		return Number(left === undefined) - Number(right === undefined);
	const theirs = right.split("/");
	const ours = left.split("/");
	for (const [index, segment] of ours.entries()) {
		const other = theirs[index];
		if (other === undefined) return 1;
		const order = FOLDERS.compare(segment, other);
		if (order !== 0) return order;
	}
	return Number(ours.length < theirs.length) * -1;
}

/**
 * The modules of one reading as a forest of folded branches.
 * @param content The complete content of the reading, in authored order.
 * @returns The root branches. Each list of siblings is sorted by code path, with unbound
 * modules last and authored order for ties.
 */
function moduleForest(content: Pick<VariantContent, "nodes">): readonly ModuleBranch[] {
	const childrenOf = containment(content);
	const nodes = new Map(content.nodes.map((node) => [node.id, node]));
	/**
	 * Siblings in the order a repository lists them.
	 * @param siblings The modules, in authored order.
	 * @returns The modules. Sorting is stable, so a tie keeps the authored order.
	 */
	const inOrder = (siblings: readonly Node[]): Node[] =>
		siblings.toSorted((left, right) =>
			compareFolders(codeFolderOf(left, childrenOf), codeFolderOf(right, childrenOf)),
		);
	/**
	 * A module, the chain it folds and everything below it.
	 * @param node The module.
	 * @returns Its branch.
	 */
	const branchOf = (node: Node): ModuleBranch => {
		const steps = foldChain(childrenOf, node.id);
		const end = steps.at(-1) ?? node.id;
		return {
			id: node.id,
			end,
			steps,
			name: steps.map((id) => nodes.get(id)?.name ?? id).join(" / "),
			path: codePathOf(nodes.get(end) ?? node, childrenOf),
			children: inOrder(childrenOf.get(end) ?? []).map(branchOf),
		};
	};
	return inOrder(content.nodes.filter((node) => node.parent === undefined)).map(branchOf);
}

/**
 * The chain that folds from a module down.
 * @param childrenOf The containment index.
 * @param id The module where the chain starts.
 * @returns The module and every step below it, in order.
 */
function foldChain(childrenOf: ReadonlyMap<string, readonly Node[]>, id: string): string[] {
	const chain = [id];
	for (let next = onlyContainer(childrenOf, id); next !== undefined;) {
		chain.push(next);
		next = onlyContainer(childrenOf, next);
	}
	return chain;
}

/**
 * The next step of a chain. A part with no parts of its own ends it, because it opens nothing.
 * @param childrenOf The containment index.
 * @param id The module.
 * @returns Its one part, when that part holds parts.
 */
function onlyContainer(
	childrenOf: ReadonlyMap<string, readonly Node[]>,
	id: string,
): string | undefined {
	const parts = childrenOf.get(id) ?? [];
	const only = parts[0]?.id ?? "";
	return parts.length === 1 && childrenOf.has(only) ? only : undefined;
}

/**
 * Index modules by the module that holds them.
 * @param complete The complete content.
 * @returns Each container's direct parts.
 */
function containment(
	complete: Pick<VariantContent, "nodes">,
): ReadonlyMap<string, readonly Node[]> {
	const childrenOf = new Map<string, Node[]>();
	for (const node of complete.nodes) {
		if (node.parent === undefined) continue;
		childrenOf.set(node.parent, [...(childrenOf.get(node.parent) ?? []), node]);
	}
	return childrenOf;
}

/**
 * A chain of modules with one part each folds, as a code host folds single-child folders
 * (rule 10), so a dead stop costs no click.
 * @param complete The complete depicted content.
 * @param scope The requested module, or null for repository roots.
 * @returns The module that the reading opens.
 */
function foldedScope(complete: VariantContent, scope: string | null): string | null {
	if (scope === null) return null;
	return foldChain(containment(complete), scope).at(-1) ?? scope;
}

export { containment, foldedScope, moduleForest };
