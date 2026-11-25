import { allLens, readingLens } from "@archboard/model/content";
import type { architecturePaneReadingSchema } from "@archboard/model/pane-context";
import { hiddenKinds, lineEffect } from "@archboard/model/policy";
import type { readArchitectureModel } from "@archboard/model/store-read";
import type { z } from "zod";

type Reading = z.infer<ReturnType<typeof architecturePaneReadingSchema>>;
type Model = Extract<Awaited<ReturnType<typeof readArchitectureModel>>, { success: true }>;
type ModelRelationship = Model["relationships"][number];
type NavigationError = { readonly code: string; readonly error: string };
type IdResult =
	| { readonly ok: true; readonly id: string }
	| { readonly ok: false; readonly error: NavigationError };
type IdListResult =
	| { readonly ok: true; readonly ids: string[] }
	| { readonly ok: false; readonly error: NavigationError };
type ResolvedFilters = {
	readonly ok: true;
	readonly lens: string | undefined;
	readonly hideKinds: string[] | undefined;
	readonly hideEffects: LineEffect[] | undefined;
};
type FilterResolution = ResolvedFilters | { readonly ok: false; readonly error: NavigationError };

const ALL_EFFECTS = ["mutation", "query", "compute", "declared"] as const;
type LineEffect = (typeof ALL_EFFECTS)[number];

/**
 * Index direct child module ids by parent id.
 * @param model The complete canonical reading.
 * @returns Parent-to-children map.
 */
function childrenIndex(model: Model): Map<string, string[]> {
	const index = new Map<string, string[]>();
	for (const module of model.modules) {
		if (module.parent === undefined) continue;
		const list = index.get(module.parent);
		if (list === undefined) index.set(module.parent, [module.id]);
		else list.push(module.id);
	}
	return index;
}

/**
 * Collect a module and every descendant inside its containment subtree.
 * @param model The complete canonical reading.
 * @param rootId The root module id.
 * @returns The module id and all descendant ids.
 */
function subtreeOf(model: Model, rootId: string): Set<string> {
	const index = childrenIndex(model);
	const members = new Set<string>([rootId]);
	const stack = [rootId];
	while (stack.length > 0) {
		const current = stack.pop()!;
		for (const child of index.get(current) ?? []) {
			if (members.has(child)) continue;
			members.add(child);
			stack.push(child);
		}
	}
	return members;
}

/**
 * Match a relationship kind by exact id, case-insensitive id, or case-insensitive display name.
 * @param model The complete canonical reading.
 * @param raw The requested kind name or id.
 * @returns The canonical kind id, or undefined when unmatched.
 */
function matchRelationshipKind(model: Model, raw: string): string | undefined {
	const trimmed = raw.trim();
	if (Object.hasOwn(model.policy.relationshipKinds, trimmed)) return trimmed;
	const lower = trimmed.toLowerCase();
	for (const [id, spec] of Object.entries(model.policy.relationshipKinds)) {
		if (id.toLowerCase() === lower || spec.name.toLowerCase() === lower) return id;
	}
	return undefined;
}

/**
 * Resolve positive `--only-kind` filters into complement `hideKinds`.
 * @param model The complete canonical reading.
 * @param onlyKinds Positive kind selectors.
 * @param existing Existing hidden kinds.
 * @returns Merged hidden kinds, or a refusal on unknown kinds.
 */
function resolveOnlyKinds(
	model: Model,
	onlyKinds: readonly string[],
	existing: readonly string[] | undefined,
):
	| { readonly ok: true; readonly hideKinds: string[] }
	| { readonly ok: false; readonly error: NavigationError } {
	const policyKinds = Object.keys(model.policy.relationshipKinds);
	const kept = new Set<string>();
	for (const raw of onlyKinds) {
		const matched = matchRelationshipKind(model, raw);
		if (matched === undefined) {
			return {
				ok: false,
				error: {
					code: "KIND_NOT_FOUND",
					error: `This vault has no relationship kind "${raw}". Available kinds: ${policyKinds.join(", ")}.`,
				},
			};
		}
		kept.add(matched);
	}
	const complement = policyKinds.filter((kind) => !kept.has(kind));
	return { ok: true, hideKinds: [...new Set([...complement, ...(existing ?? [])])] };
}

/**
 * Apply optional `--only-kind` narrowing onto the current lens and hidden kinds.
 * @param model The complete canonical reading.
 * @param request The reading request.
 * @returns Updated lens and hideKinds, or a refusal.
 */
function applyOnlyKinds(
	model: Model,
	request: Reading,
):
	| {
			readonly ok: true;
			readonly lens: string | undefined;
			readonly hideKinds: string[] | undefined;
	  }
	| { readonly ok: false; readonly error: NavigationError } {
	const onlyKinds = request.onlyKinds;
	if (onlyKinds === undefined || onlyKinds.length === 0) {
		return { ok: true, lens: request.lens, hideKinds: request.hideKinds };
	}
	const resolved = resolveOnlyKinds(model, onlyKinds, request.hideKinds);
	if (!resolved.ok) return resolved;
	return { ok: true, lens: request.lens ?? allLens(), hideKinds: resolved.hideKinds };
}

/**
 * Apply optional `--only-effect` narrowing onto the current lens and hidden effects.
 * @param request The reading request.
 * @param lens The current lens after kind resolution.
 * @returns Updated lens and hideEffects.
 */
function applyOnlyEffects(
	request: Reading,
	lens: string | undefined,
): { readonly lens: string | undefined; readonly hideEffects: LineEffect[] | undefined } {
	const onlyEffects = request.onlyEffects;
	if (onlyEffects === undefined || onlyEffects.length === 0) {
		return { lens, hideEffects: request.hideEffects };
	}
	const kept = new Set<LineEffect>(onlyEffects);
	const complement = ALL_EFFECTS.filter((effect) => !kept.has(effect));
	const hideEffects = [...new Set([...complement, ...(request.hideEffects ?? [])])];
	return { lens: lens ?? allLens(), hideEffects };
}

/**
 * Resolve positive `--only-kind` and `--only-effect` selectors into canonical lens + hide lists.
 * @param model The complete canonical reading.
 * @param request The reading selectors.
 * @returns Resolved lens, hideKinds, and hideEffects, or a structured refusal.
 */
function resolveFilterSelectors(model: Model, request: Reading): FilterResolution {
	const kinds = applyOnlyKinds(model, request);
	if (!kinds.ok) return kinds;
	const effects = applyOnlyEffects(request, kinds.lens);
	return {
		ok: true,
		lens: effects.lens,
		hideKinds: kinds.hideKinds,
		hideEffects: effects.hideEffects,
	};
}

/**
 * Whether an edge satisfies one side (`--to` or `--from`) of a directional filter.
 * @param trees Subtrees rooted at the requested modules.
 * @param endpoint The edge's matching endpoint id.
 * @param opposite The edge's other endpoint id.
 * @param both Whether both `--to` and `--from` are active.
 * @returns True when the edge matches that side.
 */
function matchesDirectionalSide(
	trees: readonly { readonly root: string; readonly members: ReadonlySet<string> }[],
	endpoint: string,
	opposite: string,
	both: boolean,
): boolean {
	if (trees.length === 0) return true;
	return trees.some(
		({ root, members }) =>
			members.has(endpoint) && (both || !members.has(opposite) || endpoint === root),
	);
}

/**
 * Filter directional edges by the active lens, hidden kinds, and hidden effects.
 * @param model The complete canonical reading.
 * @param edges Directionally matched edges.
 * @param filters Effective lens, hideKinds, and hideEffects.
 * @returns Visible edges matching all filters.
 */
function filterVisibleEdges(
	model: Model,
	edges: readonly ModelRelationship[],
	filters: ResolvedFilters,
): ModelRelationship[] {
	const activeLens = readingLens(model.policy, filters.lens);
	const hiddenKindSet = new Set(hiddenKinds(filters.hideKinds ?? [], model.policy));
	const hiddenEffectSet = new Set<LineEffect>(filters.hideEffects ?? []);
	return edges.filter((edge) => {
		// As the picture does: a relationship of an old reading that states no effect is never hidden by effect.
		const effect = lineEffect(edge);
		const effectAllowed = effect === undefined || !hiddenEffectSet.has(effect);
		return activeLens.draws(edge) && !hiddenKindSet.has(edge.kind) && effectAllowed;
	});
}

/**
 * Format the refusal when directional filters match no visible relationships.
 * @param to Raw `--to` selectors.
 * @param from Raw `--from` selectors.
 * @param directional Edges matching direction before kind/effect filtering.
 * @returns The `NO_MATCHING_RELATIONSHIPS` refusal.
 */
function noMatchingRelationshipsError(
	to: readonly string[] | undefined,
	from: readonly string[] | undefined,
	directional: readonly ModelRelationship[],
): { readonly ok: false; readonly error: NavigationError } {
	const parts = [
		...(from?.length ? [`from ${from.join(", ")}`] : []),
		...(to?.length ? [`to ${to.join(", ")}`] : []),
	];
	const foundKinds = [...new Set(directional.map((edge) => edge.kind))].join(", ");
	const foundEffects = [...new Set(directional.map((edge) => lineEffect(edge) ?? "none"))].join(
		", ",
	);
	const detail =
		directional.length === 0
			? ""
			: ` Found ${directional.length} directional relationship(s) with kinds [${foundKinds}] and effects [${foundEffects}].`;
	return {
		ok: false,
		error: {
			code: "NO_MATCHING_RELATIONSHIPS",
			error: `No relationships match ${parts.join(" ")} under the requested filters.${detail}`,
		},
	};
}

/**
 * Resolve directional target and source module lists into containment subtrees.
 * @param model The complete canonical reading.
 * @param to Target module selectors.
 * @param from Source module selectors.
 * @param resolveModuleList List resolver for module selectors.
 * @returns Resolved target and source subtrees, or a refusal.
 */
function resolveDirectionalTrees(
	model: Model,
	to: readonly string[],
	from: readonly string[],
	resolveModuleList: (values: readonly string[]) => IdListResult,
):
	| {
			readonly ok: true;
			readonly toTrees: { readonly root: string; readonly members: Set<string> }[];
			readonly fromTrees: { readonly root: string; readonly members: Set<string> }[];
	  }
	| { readonly ok: false; readonly error: NavigationError } {
	const resolvedTo = resolveModuleList(to);
	if (!resolvedTo.ok) return resolvedTo;
	const resolvedFrom = resolveModuleList(from);
	if (!resolvedFrom.ok) return resolvedFrom;
	return {
		ok: true,
		toTrees: resolvedTo.ids.map((id) => ({ root: id, members: subtreeOf(model, id) })),
		fromTrees: resolvedFrom.ids.map((id) => ({ root: id, members: subtreeOf(model, id) })),
	};
}

/**
 * Find every relationship matching the resolved `--to` and `--from` module subtrees.
 * @param model The complete canonical reading.
 * @param toTrees Subtrees rooted at `--to` targets.
 * @param fromTrees Subtrees rooted at `--from` sources.
 * @returns Matching directional edges before lens/kind/effect filtering.
 */
function directionalEdges(
	model: Model,
	toTrees: readonly { readonly root: string; readonly members: ReadonlySet<string> }[],
	fromTrees: readonly { readonly root: string; readonly members: ReadonlySet<string> }[],
): ModelRelationship[] {
	const both = toTrees.length > 0 && fromTrees.length > 0;
	return model.relationships.filter(
		(edge) =>
			matchesDirectionalSide(toTrees, edge.to, edge.from, both) &&
			matchesDirectionalSide(fromTrees, edge.from, edge.to, both),
	);
}

/**
 * Extract the non-empty `--to` and `--from` lists from a reading request, or null when neither is set.
 * @param request The reading request.
 * @returns Both arrays, or null when no directional filter is requested.
 */
function directionalLists(
	request: Reading,
): { readonly to: readonly string[]; readonly from: readonly string[] } | null {
	const to = request.to ?? [];
	const from = request.from ?? [];
	return to.length === 0 && from.length === 0 ? null : { to, from };
}

/**
 * Resolve `--to` and `--from` into matching relationship ids after active lens, kind, and effect filters.
 * @param model The complete canonical reading.
 * @param request The reading request.
 * @param filters Effective lens, hideKinds, and hideEffects.
 * @param resolveModuleList List resolver for module selectors.
 * @returns Matching relationship ids, or a structured refusal.
 */
function resolveDirectionalFocus(
	model: Model,
	request: Reading,
	filters: ResolvedFilters,
	resolveModuleList: (values: readonly string[]) => IdListResult,
): IdListResult {
	const lists = directionalLists(request);
	if (lists === null) return { ok: true, ids: [] };
	const trees = resolveDirectionalTrees(model, lists.to, lists.from, resolveModuleList);
	if (!trees.ok) return trees;
	const directional = directionalEdges(model, trees.toTrees, trees.fromTrees);
	const matched = filterVisibleEdges(model, directional, filters);
	if (matched.length === 0) {
		return noMatchingRelationshipsError(request.to, request.from, directional);
	}
	return { ok: true, ids: matched.map((edge) => edge.id) };
}

/**
 * Find a semantic group id by exact id, case-insensitive id, or case-insensitive display name.
 * @param groups The vault's configured semantic groups.
 * @param trimmed The trimmed group selector.
 * @returns The group id, or undefined.
 */
function findGroupId(groups: Model["policy"]["groups"], trimmed: string): string | undefined {
	if (Object.hasOwn(groups, trimmed)) return trimmed;
	const lower = trimmed.toLowerCase();
	for (const [id, spec] of Object.entries(groups)) {
		if (id.toLowerCase() === lower || spec.name.toLowerCase() === lower) return id;
	}
	return undefined;
}

/**
 * Resolve a `--group` selector into its member module ids.
 * @param model The complete canonical reading.
 * @param group The requested group id or name.
 * @returns The member module ids, or a structured refusal.
 */
function resolveGroupMembers(model: Model, group: string): IdListResult {
	const groups = model.policy.groups;
	const trimmed = group.trim();
	const matchedId = findGroupId(groups, trimmed);
	if (matchedId === undefined) {
		const available = Object.keys(groups);
		return {
			ok: false,
			error: {
				code: "GROUP_NOT_FOUND",
				error:
					available.length === 0
						? `This vault defines no semantic groups (requested "${trimmed}").`
						: `This vault has no group "${trimmed}". Available groups: ${available.join(", ")}.`,
			},
		};
	}
	const members = model.modules
		.filter((module) => module.groups?.includes(matchedId) === true)
		.map((module) => module.id);
	return { ok: true, ids: members };
}

export {
	resolveDirectionalFocus,
	resolveFilterSelectors,
	resolveGroupMembers,
	type FilterResolution,
	type IdListResult,
	type IdResult,
	type NavigationError,
	type ResolvedFilters,
};
