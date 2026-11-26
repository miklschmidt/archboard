// What a declaration of a Terraform or OpenTofu address space reaches
// (terraform-configuration.ts): its references, followed through every
// variable, module argument, output and local value, which only pass a value
// on, to the resources, data sources and module calls they lead to.
//
// The search keeps one way for each declaration it reaches and each thing the
// reference that starts the way proves (TASK-367.18). So a function that
// names a queue in its environment, a configured path, and in its role's
// policy, a permission, reaches the queue twice.

/** What the search needs of a declaration: its kind. */
interface Reachable {
	readonly kind: string;
}

/** What the search needs of a reference: where it leads, what it proves, and its nested block if any. */
interface Step {
	readonly to: string;
	readonly kind: string;
	readonly joins?: string;
	readonly block?: string;
}

/** One way the search still has to follow. */
interface Way<L extends Step> {
	readonly to: string;
	/** The reference of the declaration that starts the way. */
	readonly first: L;
}

/**
 * What tells two ways apart: where they lead, what the reference that
 * starts each proves, and—when attributing nested-block relationship
 * evidence—which depth-1 nested block starts it.
 * @param way The way.
 * @param perBlock Whether distinct depth-1 nested blocks keep separate ways.
 * @returns Its key.
 */
function wayKey(way: Way<Step>, perBlock: boolean): string {
	return `${way.to}\0${way.first.kind}\0${way.first.joins ?? ""}\0${perBlock ? (way.first.block ?? "") : ""}`;
}

/** What the search of one declaration's reach collects. */
interface Search<D extends Reachable, L extends Step> {
	readonly declarations: ReadonlyMap<string, D>;
	readonly links: ReadonlyMap<string, readonly L[]>;
	readonly passing: ReadonlySet<string>;
	readonly perBlock: boolean;
	readonly found: Map<string, { to: D; link: L }>;
}

/**
 * Take one step of the search: a declaration that passes a value on leads
 * further, and any other one is reached.
 * @param search What the search collects, which this adds to.
 * @param way The way.
 * @returns The ways that lead on from it.
 */
function step<D extends Reachable, L extends Step>(search: Search<D, L>, way: Way<L>): Way<L>[] {
	const declaration = search.declarations.get(way.to);
	if (declaration === undefined) return [];
	if (!search.passing.has(declaration.kind)) {
		search.found.set(wayKey(way, search.perBlock), { to: declaration, link: way.first });
		return [];
	}
	return (search.links.get(way.to) ?? []).map((link) => ({ to: link.to, first: way.first }));
}

/**
 * What a declaration reaches, through every declaration that passes a value on.
 * @param declarations The address space.
 * @param links The references of each declaration.
 * @param address The declaration's address.
 * @param passing The kinds of declaration that pass a value on.
 * @param perBlock Whether distinct depth-1 nested blocks keep separate ways.
 * @returns Each declaration reached, with the reference that starts the way
 * there, once for each thing the references that start ways there prove.
 */
function reachedFrom<D extends Reachable, L extends Step>(
	declarations: ReadonlyMap<string, D>,
	links: ReadonlyMap<string, readonly L[]>,
	address: string,
	passing: ReadonlySet<string>,
	perBlock = false,
): { readonly to: D; readonly link: L }[] {
	const search: Search<D, L> = { declarations, links, passing, perBlock, found: new Map() };
	const seen = new Set<string>();
	const ways: Way<L>[] = (links.get(address) ?? []).map((link) => ({ to: link.to, first: link }));
	for (let way = ways.shift(); way !== undefined; way = ways.shift()) {
		const key = wayKey(way, perBlock);
		if (way.to === address || seen.has(key)) continue;
		seen.add(key);
		ways.push(...step(search, way));
	}
	return [...search.found.values()];
}

export { reachedFrom };
