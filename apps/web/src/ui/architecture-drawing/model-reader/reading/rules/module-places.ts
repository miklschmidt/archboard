// Where the lists of About put each module: the order of the tree, a container, then the parts it
// holds one rail in. A list stops there, because a model holds hundreds of modules, and each row
// says how many parts it holds. Pure.

import type {
	ModuleBranch,
	ModuleTree,
} from "#ui/architecture-drawing/model-reader/rules/module-tree.ts";

/** One row of a list of modules. */
interface ModulePlace<Module> {
	readonly module: Module;
	/** How many containers of the list stand above it. */
	readonly depth: number;
	/** How many parts it holds. */
	readonly holds: number;
	/** Its code path, when it has one. */
	readonly path: string | undefined;
}

/**
 * Where each module stands in the tree.
 * @param tree The tree.
 * @returns Its position, by identity.
 */
function treeOrder(tree: ModuleTree): ReadonlyMap<string, number> {
	const order = new Map<string, number>();
	/**
	 * Count a branch and everything below it.
	 * @param branch The branch.
	 */
	const walk = (branch: ModuleBranch): void => {
		order.set(branch.id, order.size);
		branch.children.forEach(walk);
	};
	tree.roots.forEach(walk);
	return order;
}

/**
 * The modules of a list in their containment.
 * @param modules The modules, as the reading states them.
 * @param tree The tree of the reading.
 * @param all Every module of the reading, by identity.
 * @param nest Whether each module brings the parts it holds.
 * @returns The rows.
 */
function modulePlaces<Module extends { readonly id: string }>(
	modules: readonly Module[],
	tree: ModuleTree,
	all: ReadonlyMap<string, Module>,
	nest: boolean,
): readonly ModulePlace<Module>[] {
	const order = treeOrder(tree);
	const listed = new Set(modules.map((module) => module.id));
	/**
	 * One row.
	 * @param module The module.
	 * @param depth Its depth.
	 * @returns The row.
	 */
	const row = (module: Module, depth: number): ModulePlace<Module> => {
		const branch = tree.owner.get(module.id);
		return { module, depth, holds: branch?.children.length ?? 0, path: branch?.path };
	};
	return modules
		.toSorted(
			(left, right) =>
				(order.get(left.id) ?? Number.POSITIVE_INFINITY) -
				(order.get(right.id) ?? Number.POSITIVE_INFINITY),
		)
		.flatMap((module) => {
			const held = nest ? (tree.owner.get(module.id)?.children ?? []) : [];
			const parts = held.flatMap(({ id }) => {
				const part = all.get(id);
				return part === undefined || listed.has(id) ? [] : [row(part, 1)];
			});
			return [row(module, 0), ...parts];
		});
}

export { modulePlaces, type ModulePlace };
