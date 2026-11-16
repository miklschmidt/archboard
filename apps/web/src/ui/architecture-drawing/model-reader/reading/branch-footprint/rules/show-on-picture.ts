import type { Model } from "@archboard/model/content";
import type { BranchFootprintAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";

/** A list to show on its picture: the reading the footprint read, and the list's modules. */
interface FootprintShow {
	/** The ref of the branch reading, or undefined for the vault on disk. */
	readonly ref: string | undefined;
	/** The proposal the commits were set against, or undefined for the current state. */
	readonly state: string | undefined;
	readonly modules: readonly string[];
}

/** Where a list is shown: the module that opens, and the drawn modules that are selected. */
interface ShownList {
	/** The nearest shared parent of the list's modules, or null for the root reading. */
	readonly scope: string | null;
	/** Each listed module that the open module draws, and each drawn module that holds one. */
	readonly selected: readonly string[];
}

/**
 * Where a list of modules is shown on the picture of a model. The nearest shared parent of the
 * modules opens, so each of them is drawn inside it, either itself or inside the module of the
 * picture that holds it. A module that the model does not hold is left out.
 * @param modules The modules of the model that opens.
 * @param listed The modules of the list.
 * @returns The module that opens, and what is selected.
 */
function showList(
	modules: readonly Pick<Model["modules"][number], "id" | "parent">[],
	listed: readonly string[],
): ShownList {
	const parents = new Map(modules.map((module) => [module.id, module.parent ?? null]));
	const held = listed.filter((id) => parents.has(id));
	const scope = sharedParent(held.map((id) => ancestors(id, parents)));
	const selected = new Set(held.map((id) => drawnFor(id, scope, parents)));
	return { scope, selected: [...selected] };
}

/**
 * The modules that hold a module, nearest first, ending with null for the root reading.
 * @param id The module.
 * @param parents The parent of each module.
 * @returns Its ancestors.
 */
function ancestors(id: string, parents: ReadonlyMap<string, string | null>): (string | null)[] {
	const chain: (string | null)[] = [];
	let next = parents.get(id) ?? null;
	while (next !== null && !chain.includes(next)) {
		chain.push(next);
		next = parents.get(next) ?? null;
	}
	chain.push(null);
	return chain;
}

/**
 * The nearest module that holds every module, given each one's ancestors.
 * @param chains The ancestors of each module, nearest first.
 * @returns The nearest shared one, or null for the root reading.
 */
function sharedParent(chains: readonly (readonly (string | null)[])[]): string | null {
	const [first, ...rest] = chains;
	return first?.find((one) => rest.every((chain) => chain.includes(one))) ?? null;
}

/**
 * The module that the open module draws for a listed module: the module itself when the open
 * module holds it directly, else the module of the picture that holds it.
 * @param id The listed module.
 * @param scope The open module.
 * @param parents The parent of each module.
 * @returns The drawn module.
 */
function drawnFor(
	id: string,
	scope: string | null,
	parents: ReadonlyMap<string, string | null>,
): string {
	let drawn = id;
	for (const holder of ancestors(id, parents)) {
		if (holder === scope) return drawn;
		if (holder !== null) drawn = holder;
	}
	return drawn;
}

/**
 * The list to show, in the reading that the footprint read: the head's branch reading when the
 * footprint read the vault at a ref, else the vault on disk, in the state the commits were set
 * against.
 * @param answer The footprint.
 * @param modules The modules of the list.
 * @returns What to show.
 */
function footprintShow(answer: BranchFootprintAnswer, modules: readonly string[]): FootprintShow {
	const read = answer.vaultRead;
	return {
		ref: read.at === "ref" ? read.ref : undefined,
		state: answer.proposal?.id,
		modules,
	};
}

export { footprintShow, showList, type FootprintShow, type ShownList };
