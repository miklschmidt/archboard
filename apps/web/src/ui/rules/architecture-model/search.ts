import type { Model } from "@archboard/board/content";

/**
 * Find modules by name, responsibility, description, or bound source.
 * @param model The complete selected architecture.
 * @param query The reader's words.
 * @returns At most eight results, with name matches before supporting evidence.
 */
function findModules(model: Pick<Model, "modules" | "manifest">, query: string) {
	const needle = query.trim().toLowerCase();
	if (needle === "") return [];
	const names = new Map(model.modules.map((module) => [module.id, module.name]));
	return model.modules
		.flatMap((module) => {
			const rank = rankModule(module, needle);
			if (rank === null) return [];
			return [
				{
					id: module.id,
					name: module.name,
					kind: module.kind,
					scope: names.get(module.parent ?? "") ?? model.manifest.name,
					rank,
				},
			];
		})
		.toSorted((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
		.slice(0, 8);
}

/**
 * Prefer a matching name over supporting descriptions and code evidence.
 * @param module One authored module.
 * @param needle The normalized query.
 * @returns Its match priority, or absence.
 */
function rankModule(module: Model["modules"][number], needle: string) {
	const at = module.name.toLowerCase().indexOf(needle);
	if (at >= 0) return at === 0 ? 0 : 1;
	const rest = [
		module.responsibility,
		module.description,
		module.binding?.path,
		module.binding?.symbol,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
	return rest.includes(needle) ? 2 : null;
}

export { findModules };
