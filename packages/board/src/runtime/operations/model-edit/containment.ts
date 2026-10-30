import type { ArchitectureModel } from "#shared/schemas/model.ts";
type Modules = ArchitectureModel["modules"];

/**
 * Capture the complete moved subtree without recursive traversal.
 * @param modules The selected module definitions.
 * @param root The moved or removed identity.
 * @returns The subtree identities.
 */
function descendants(modules: Modules, root: string): Set<string> {
	const found = new Set([root]);
	const queue = [root];
	for (let index = 0; index < queue.length; index++) {
		for (const child of modules.filter((module) => module.parent === queue[index])) {
			if (found.has(child.id)) continue;
			found.add(child.id);
			queue.push(child.id);
		}
	}
	return found;
}

/**
 * Include each former and new containment path in the affected closure.
 * @param modules One coherent side of the operation.
 * @param id The changed module identity.
 * @param affected The collected subjects.
 */
function includePath(modules: Modules, id: string, affected: Set<string>): void {
	for (const child of descendants(modules, id)) affected.add(child);
	const visited = new Set<string>();
	let parent = modules.find((module) => module.id === id)?.parent;
	while (parent !== undefined && !visited.has(parent)) {
		visited.add(parent);
		affected.add(parent);
		parent = modules.find((module) => module.id === parent)?.parent;
	}
}

/**
 * Find the claims and readers affected by containment changes.
 * @param before The original definitions.
 * @param after The candidate definitions.
 * @param affected The operation's subject set.
 */
function includeContainment(before: Modules, after: Modules, affected: Set<string>): void {
	const original = new Map(before.map((module) => [module.id, module]));
	const final = new Map(after.map((module) => [module.id, module]));
	for (const id of new Set([...original.keys(), ...final.keys()])) {
		if (original.has(id) === final.has(id) && original.get(id)?.parent === final.get(id)?.parent)
			continue;
		includePath(before, id, affected);
		includePath(after, id, affected);
	}
}
export { includeContainment };
