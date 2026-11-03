// The Modules tree: the forest that the board package lists, indexed so that a reading can
// find a module's branch, the branches above it and its siblings.

import { moduleForest, type VariantContent } from "@archboard/board/content";

/** One row of the tree: a module, or a chain that folds into one row. */
type ModuleBranch = ReturnType<typeof moduleForest>[number];

/** The whole tree of one reading. */
interface ModuleTree {
	readonly roots: readonly ModuleBranch[];
	/** The branch above each branch; a root has none. */
	readonly above: ReadonlyMap<string, ModuleBranch>;
	/** The branch that shows each module. */
	readonly owner: ReadonlyMap<string, ModuleBranch>;
}

/** One drawn row. */
interface ModuleRow {
	readonly id: string;
	readonly branch: boolean;
	readonly open: boolean;
	readonly parent: string | null;
	readonly module: ModuleBranch;
	readonly depth: number;
}

/**
 * The tree of one reading's modules.
 * @param content The complete content of the reading, in authored order.
 * @returns The tree.
 */
function moduleTree(content: Pick<VariantContent, "nodes">): ModuleTree {
	const roots = moduleForest(content);
	const above = new Map<string, ModuleBranch>();
	const owner = new Map<string, ModuleBranch>();
	/**
	 * Index a branch and everything below it.
	 * @param branch The branch.
	 */
	const index = (branch: ModuleBranch): void => {
		for (const step of branch.steps) owner.set(step, branch);
		for (const child of branch.children) {
			above.set(child.id, branch);
			index(child);
		}
	};
	roots.forEach(index);
	return { roots, above, owner };
}

/**
 * Every module in the order the tree shows it.
 * @param content The complete content of the reading, in authored order.
 * @returns The ids, each branch before what is below it.
 */
function moduleOrder(content: Pick<VariantContent, "nodes">): readonly string[] {
	/**
	 * A branch and everything below it.
	 * @param branch The branch.
	 * @returns The ids.
	 */
	const walk = (branch: ModuleBranch): readonly string[] => [
		...branch.steps,
		...branch.children.flatMap(walk),
	];
	return moduleForest(content).flatMap(walk);
}

/**
 * The branches that a reading of a module keeps open.
 * @param tree The tree.
 * @param id The open module, or null for the roots.
 * @returns The branch that shows it and every branch above it, top first.
 */
function pathTo(tree: ModuleTree, id: string | null): ModuleBranch[] {
	const path: ModuleBranch[] = [];
	if (id === null) return path;
	for (let at = tree.owner.get(id); at !== undefined; at = tree.above.get(at.id)) path.unshift(at);
	return path;
}

/**
 * The rows the tree draws.
 * @param tree The tree.
 * @param open The branches that show what they hold.
 * @returns The rows, in reading order.
 */
function treeRows(tree: ModuleTree, open: ReadonlySet<string>): ModuleRow[] {
	/**
	 * The rows of some siblings and of what they hold open.
	 * @param branches The siblings.
	 * @param depth Their depth.
	 * @returns The rows, in order.
	 */
	const walk = (branches: readonly ModuleBranch[], depth: number): ModuleRow[] =>
		branches.flatMap((module) => {
			const opened = open.has(module.id) && module.children.length > 0;
			const row: ModuleRow = {
				id: module.id,
				branch: module.children.length > 0,
				open: opened,
				parent: tree.above.get(module.id)?.id ?? null,
				module,
				depth,
			};
			return [row, ...(opened ? walk(module.children, depth + 1) : [])];
		});
	return walk(tree.roots, 0);
}

/**
 * The branch beside a module in the tree.
 * @param tree The tree.
 * @param id The module.
 * @param step How far to walk: -1 for the one before, 1 for the one after.
 * @returns The branch, or null where the siblings end.
 */
function siblingOf(tree: ModuleTree, id: string, step: number): ModuleBranch | null {
	const branch = tree.owner.get(id);
	if (branch === undefined) return null;
	const siblings = tree.above.get(branch.id)?.children ?? tree.roots;
	return siblings[siblings.indexOf(branch) + step] ?? null;
}

/**
 * The first or last branch that a scope holds.
 * @param tree The tree.
 * @param scope The open module, or null for the roots.
 * @param step 1 for the first, -1 for the last.
 * @returns The branch, or null for a scope that holds none.
 */
function endWithin(tree: ModuleTree, scope: string | null, step: number): ModuleBranch | null {
	const held = scope === null ? tree.roots : (tree.owner.get(scope)?.children ?? []);
	return held.at(step > 0 ? 0 : -1) ?? null;
}

/**
 * The module above the open one. Up leaves a whole fold, or it would open the same picture.
 * @param tree The tree.
 * @param id The open module.
 * @returns The module to open, or null for the roots.
 */
function upFrom(tree: ModuleTree, id: string | null): string | null {
	const branch = id === null ? undefined : tree.owner.get(id);
	return branch === undefined ? null : (tree.above.get(branch.id)?.end ?? null);
}

export {
	moduleOrder,
	moduleTree,
	pathTo,
	siblingOf,
	treeRows,
	endWithin,
	upFrom,
	type ModuleBranch,
	type ModuleRow,
	type ModuleTree,
};
