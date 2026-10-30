import type { Model } from "@archboard/board/content";

/** What Find can land on. */
type FindKind = "module" | "flow" | "walkthrough" | "bookmark" | "address";

/** One thing found. */
interface FindHit {
	readonly kind: FindKind;
	/** The identity the destination opens by. */
	readonly id: string;
	readonly name: string;
	/** Where it is, or what it is. */
	readonly detail: string;
	readonly rank: number;
}

/** How many results the list holds. */
const FIND_LIMIT = 10;

const SAME = 0;
const STARTS = 1;
const INSIDE = 2;
const IN_PATH = 3;
const IN_TEXT = 4;

/** What Find reads of an imported model. */
type Imported = "bookmarks" | "addresses";

type Searchable = Pick<Model, "modules" | "manifest" | "collections" | "walkthroughs"> & {
	readonly migration?: Pick<NonNullable<Model["migration"]>, Imported> | undefined;
	readonly migrationPreview?: Pick<NonNullable<Model["migrationPreview"]>, Imported> | undefined;
};

/**
 * Find anything a reading can open: modules by name, path or words, then flows,
 * walkthroughs, bookmarks and former addresses.
 * @param model The complete selected architecture.
 * @param query The reader's words.
 * @returns The closest results, with an exact name or path first.
 */
function findInModel(model: Searchable, query: string): FindHit[] {
	const needle = query.trim().toLowerCase();
	if (needle === "") return [];
	return [
		...moduleHits(model, needle),
		...namedHits("flow", flowsOf(model), needle),
		...namedHits("walkthrough", model.walkthroughs, needle),
		...namedHits("bookmark", bookmarksOf(model), needle),
		...addressHits(model, needle),
	]
		.toSorted((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
		.slice(0, FIND_LIMIT);
}

/**
 * The flows of a reading, with what each one is about.
 * @param model The architecture.
 * @returns The flows.
 */
function flowsOf(model: Searchable) {
	return model.collections.flatMap((collection) =>
		collection.flows.map((flow) => ({ id: flow.id, name: flow.name, detail: collection.name })),
	);
}

/**
 * The bookmarks a migration kept.
 * @param model The architecture.
 * @returns The bookmarks.
 */
function bookmarksOf(model: Searchable) {
	const imported = model.migrationPreview ?? model.migration;
	return (imported?.bookmarks ?? []).map((entry) => ({ ...entry, detail: entry.summary }));
}

/**
 * Match a name.
 * @param name The name.
 * @param needle The normalized query.
 * @returns Its rank, or null without a match.
 */
function nameRank(name: string, needle: string): number | null {
	const lower = name.toLowerCase();
	if (lower === needle) return SAME;
	const at = lower.indexOf(needle);
	if (at < 0) return null;
	return at === 0 ? STARTS : INSIDE;
}

/**
 * Prefer a matching name or path over the words that describe a module.
 * @param module One authored module.
 * @param needle The normalized query.
 * @returns Its match priority, or absence.
 */
function moduleRank(module: Model["modules"][number], needle: string): number | null {
	const path = pathOf(module);
	if (path === needle) return SAME;
	const named = nameRank(module.name, needle);
	if (named !== null) return named;
	if (path.includes(needle)) return IN_PATH;
	return textOf(module).includes(needle) ? IN_TEXT : null;
}

/**
 * A module's code path.
 * @param module One authored module.
 * @returns It in lower case, or nothing for an unbound module.
 */
function pathOf(module: Model["modules"][number]): string {
	return module.binding?.path.toLowerCase() ?? "";
}

/**
 * The words that describe a module.
 * @param module One authored module.
 * @returns Them, in lower case.
 */
function textOf(module: Model["modules"][number]): string {
	return [module.responsibility, module.description, module.binding?.symbol]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

/**
 * The modules that match.
 * @param model The architecture.
 * @param needle The normalized query.
 * @returns The hits.
 */
function moduleHits(model: Searchable, needle: string): FindHit[] {
	const names = new Map(model.modules.map((module) => [module.id, module.name]));
	return model.modules.flatMap((module) => {
		const rank = moduleRank(module, needle);
		if (rank === null) return [];
		return {
			kind: "module" as const,
			id: module.id,
			name: module.name,
			detail: module.binding?.path ?? names.get(module.parent ?? "") ?? model.manifest.name,
			rank,
		};
	});
}

/**
 * The named things of one kind that match.
 * @param kind The kind.
 * @param entries The things.
 * @param needle The normalized query.
 * @returns The hits.
 */
function namedHits(
	kind: FindKind,
	entries: readonly { id: string; name: string; detail?: string | undefined }[],
	needle: string,
): FindHit[] {
	return entries.flatMap((entry) => {
		const rank = nameRank(entry.name, needle);
		if (rank === null) return [];
		return { kind, id: entry.id, name: entry.name, detail: entry.detail ?? "", rank: rank + 1 };
	});
}

/**
 * The former addresses that match. An exact one comes first, because a person who pastes
 * an old address means it. Others come last.
 * @param model The architecture.
 * @param needle The normalized query.
 * @returns The hits, one for each address.
 */
function addressHits(model: Searchable, needle: string): FindHit[] {
	const imported = model.migrationPreview ?? model.migration;
	const addresses = new Set((imported?.addresses ?? []).map((entry) => entry.address));
	return [...addresses].flatMap((address) => {
		const lower = address.toLowerCase();
		if (!lower.includes(needle)) return [];
		const rank = lower === needle ? SAME : IN_TEXT + 1;
		return { kind: "address" as const, id: address, name: address, detail: "", rank };
	});
}

export { findInModel, type FindHit, type FindKind };
