import { everyStep } from "@archboard/model/flow";
import {
	qualifiedSubjectIdSchema,
	type architecturePaneReadingSchema,
	type paneDisplaySettingsSchema,
} from "@archboard/model/pane-context";
import type { readArchitectureModel } from "@archboard/model/store-read";
import type { z } from "zod";
import { resolveEphemeralFlow } from "#server/panes/connections/rules/ephemeral-flow.ts";
import {
	resolveDirectionalFocus,
	resolveFilterSelectors,
	resolveGroupMembers,
	type IdListResult,
	type IdResult,
	type NavigationError,
	type ResolvedFilters,
} from "#server/panes/connections/rules/pane-filters.ts";
import { mergeKeptReading } from "#server/panes/connections/rules/pane-keep.ts";

type Reading = z.infer<ReturnType<typeof architecturePaneReadingSchema>>;
type DisplaySettings = z.infer<ReturnType<typeof paneDisplaySettingsSchema>>;
type Model = Extract<Awaited<ReturnType<typeof readArchitectureModel>>, { success: true }>;
type ModelModule = Model["modules"][number];

const DISPLAY_SETTING_KEYS = new Set(["layout", "theme", "hoverLight"]);

interface ResolvedReadingParts {
	readonly scope: string | undefined;
	readonly expand: string[] | undefined;
	readonly focus: readonly string[];
	readonly select: readonly string[];
	readonly filters: ResolvedFilters;
	readonly grammar: Reading["grammar"];
	readonly resolvedEphemeralFlow: Reading["resolvedEphemeralFlow"];
}

/**
 * Extract the browser display settings from a reading request, when any are present.
 * @param reading The parsed pane reading request.
 * @returns The display settings, or undefined when none were requested.
 */
function extractDisplaySettings(reading: Reading): DisplaySettings | undefined {
	const settings: DisplaySettings = {
		...(reading.layout === undefined ? {} : { layout: reading.layout }),
		...(reading.theme === undefined ? {} : { theme: reading.theme }),
		...(reading.hoverLight === undefined ? {} : { hoverLight: reading.hoverLight }),
	};
	return Object.keys(settings).length === 0 ? undefined : settings;
}

/**
 * Whether a request changes only browser display settings and asks for no model navigation.
 * @param reading The parsed pane reading request.
 * @returns True when at least one display setting is present and every reading selector is absent.
 */
function isSettingsOnlyRequest(reading: Reading): boolean {
	if (extractDisplaySettings(reading) === undefined) return false;
	return Object.entries(reading).every(
		([key, value]) => value === undefined || DISPLAY_SETTING_KEYS.has(key),
	);
}

/**
 * Resolve one candidate list: single match succeeds, multiple matches refuse as ambiguous, empty
 * returns null so the caller can try the next matching tier.
 * @param raw The requested selector text.
 * @param matches Candidate modules at this tier.
 * @returns A single resolved id, an ambiguity refusal, or null.
 */
function matchSingleModule(raw: string, matches: readonly ModelModule[]): IdResult | null {
	if (matches.length === 1) return { ok: true, id: matches[0]!.id };
	if (matches.length > 1) return ambiguousModule(raw, matches);
	return null;
}

/**
 * Resolve one module reference by qualified id, local id, exact name, case-insensitive name, or former name.
 * @param model The complete canonical reading.
 * @param raw The user- or agent-supplied module selector.
 * @returns The canonical qualified module id, or a structured refusal.
 */
function resolveModuleRef(model: Model, raw: string): IdResult {
	const trimmed = raw.trim();
	const byId = model.modules.find(
		(module) => module.id === trimmed || module.id === `${model.manifest.id}#${trimmed}`,
	);
	if (byId !== undefined) return { ok: true, id: byId.id };
	const lower = trimmed.toLowerCase();
	const tiers = [
		model.modules.filter((module) => module.name === trimmed),
		model.modules.filter((module) => module.name.toLowerCase() === lower),
		model.modules.filter((module) => module.formerNames?.includes(trimmed) === true),
	];
	for (const tier of tiers) {
		const found = matchSingleModule(trimmed, tier);
		if (found !== null) return found;
	}
	return {
		ok: false,
		error: {
			code: "MODULE_NOT_FOUND",
			error: `No module matches "${trimmed}" in ${model.manifest.name}.`,
		},
	};
}

/**
 * Format an ambiguity refusal naming every matching module id.
 * @param raw The ambiguous name.
 * @param matches The matching modules.
 * @returns The structured refusal.
 */
function ambiguousModule(
	raw: string,
	matches: readonly ModelModule[],
): { readonly ok: false; readonly error: NavigationError } {
	const ids = matches.map((module) => `${module.name} (${module.id})`).join(", ");
	return {
		ok: false,
		error: {
			code: "MODULE_AMBIGUOUS",
			error: `Module name "${raw}" is ambiguous. Pass a qualified id: ${ids}.`,
		},
	};
}

/**
 * Add collection, flow, and step subject ids into a set.
 * @param model The complete canonical reading.
 * @param ids The destination set.
 */
function addCollectionSubjectIds(model: Model, ids: Set<string>): void {
	for (const collection of model.collections) {
		ids.add(`${model.manifest.id}#${collection.id}`);
		for (const flow of collection.flows) {
			ids.add(flow.id);
			for (const step of everyStep(flow.steps)) ids.add(step.id);
		}
	}
}

/**
 * Add walkthrough and beat subject ids into a set.
 * @param model The complete canonical reading.
 * @param ids The destination set.
 */
function addWalkthroughSubjectIds(model: Model, ids: Set<string>): void {
	for (const walkthrough of model.walkthroughs) {
		ids.add(walkthrough.id);
		for (const beat of walkthrough.beats) ids.add(beat.id);
	}
}

/**
 * Collect every canonical subject id in a model for direct identity matching.
 * @param model The complete canonical reading.
 * @returns The set of known subject ids.
 */
function knownSubjectIds(model: Model): Set<string> {
	const ids = new Set<string>();
	for (const module of model.modules) ids.add(module.id);
	for (const edge of model.relationships) ids.add(edge.id);
	addCollectionSubjectIds(model, ids);
	addWalkthroughSubjectIds(model, ids);
	return ids;
}

/**
 * Resolve a subject selector that may name any subject id or a module by name.
 * @param model The complete canonical reading.
 * @param subjects Known subject ids in the model.
 * @param raw The selector string.
 * @returns The canonical qualified id, or a structured refusal.
 */
function resolveSubjectRef(model: Model, subjects: ReadonlySet<string>, raw: string): IdResult {
	const trimmed = raw.trim();
	if (subjects.has(trimmed)) return { ok: true, id: trimmed };
	const qualified = `${model.manifest.id}#${trimmed}`;
	if (subjects.has(qualified)) return { ok: true, id: qualified };
	return resolveModuleRef(model, trimmed);
}

/**
 * Let a well-formed qualified id that the reading does not hold go through as it was given. A
 * reader's own address reaches the pane, which says what the reading lacks, and an agent hears of a
 * missing scope, focus or expanded module from the structural refusal of the show.
 * @param resolve One selector resolver.
 * @returns The resolver that passes valid unknown qualified ids through.
 */
function orQualified(resolve: (raw: string) => IdResult): (raw: string) => IdResult {
	const qualifiedId = qualifiedSubjectIdSchema();
	return (raw) => {
		const resolved = resolve(raw);
		if (resolved.ok || resolved.error.code !== "MODULE_NOT_FOUND") return resolved;
		const trimmed = raw.trim();
		return qualifiedId.safeParse(trimmed).success ? { ok: true, id: trimmed } : resolved;
	};
}

/**
 * Resolve a list of module or subject selectors in order, stopping at the first refusal.
 * @param values The raw selector strings.
 * @param resolve One selector resolver.
 * @returns Resolved unique ids or the first refusal.
 */
function resolveList(values: readonly string[], resolve: (raw: string) => IdResult): IdListResult {
	const ids: string[] = [];
	for (const raw of values) {
		const resolved = resolve(raw);
		if (!resolved.ok) return resolved;
		if (!ids.includes(resolved.id)) ids.push(resolved.id);
	}
	return { ok: true, ids };
}

/**
 * Resolve an optional single selector with a resolver function.
 * @param raw The optional selector string.
 * @param resolve The resolver function.
 * @returns Resolved id or undefined, or a refusal.
 */
function resolveOptionalId(
	raw: string | undefined,
	resolve: (value: string) => IdResult,
):
	| { readonly ok: true; readonly id: string | undefined }
	| { readonly ok: false; readonly error: NavigationError } {
	return raw === undefined ? { ok: true, id: undefined } : resolve(raw);
}

/**
 * Resolve an optional list of selectors with a resolver function.
 * @param values The optional selector strings.
 * @param resolve The resolver function.
 * @returns Resolved ids or undefined, or a refusal.
 */
function resolveOptionalList(
	values: readonly string[] | undefined,
	resolve: (value: string) => IdResult,
):
	| { readonly ok: true; readonly ids: string[] | undefined }
	| { readonly ok: false; readonly error: NavigationError } {
	return values === undefined ? { ok: true, ids: undefined } : resolveList(values, resolve);
}

/**
 * Resolve structural selectors (`scope`, `expand`, `focus`), letting valid unknown qualified ids
 * pass through for reader addresses while agents hear structural refusals on the show route.
 * @param model The complete canonical reading.
 * @param subjects Known subject ids in the model.
 * @param request The reading request.
 * @returns Resolved scope, expand, and focus, or a refusal.
 */
function resolveStructuralSelectors(
	model: Model,
	subjects: ReadonlySet<string>,
	request: Reading,
):
	| {
			readonly ok: true;
			readonly scope: string | undefined;
			readonly expand: string[] | undefined;
			readonly focus: string[];
	  }
	| { readonly ok: false; readonly error: NavigationError } {
	const moduleOrQualified = orQualified((raw) => resolveModuleRef(model, raw));
	const subjectOrQualified = orQualified((raw) => resolveSubjectRef(model, subjects, raw));
	const scope = resolveOptionalId(request.scope, moduleOrQualified);
	if (!scope.ok) return scope;
	const expand = resolveOptionalList(request.expand, moduleOrQualified);
	if (!expand.ok) return expand;
	const focus = resolveOptionalList(request.focus, subjectOrQualified);
	if (!focus.ok) return focus;
	return { ok: true, scope: scope.id, expand: expand.ids, focus: focus.ids ?? [] };
}

/**
 * Resolve explicit `--select` subjects and `--group` memberships into one unique selection list.
 * @param model The complete canonical reading.
 * @param subjects Known subject ids in the model.
 * @param request The reading request.
 * @returns Resolved selection ids, or a refusal.
 */
function resolveSelectionSelectors(
	model: Model,
	subjects: ReadonlySet<string>,
	request: Reading,
): IdListResult {
	const selected = resolveOptionalList(request.select, (raw) =>
		resolveSubjectRef(model, subjects, raw),
	);
	if (!selected.ok) return selected;
	const group =
		request.group === undefined
			? { ok: true as const, ids: [] }
			: resolveGroupMembers(model, request.group);
	if (!group.ok) return group;
	return { ok: true, ids: [...new Set([...(selected.ids ?? []), ...group.ids])] };
}

/**
 * Resolve an optional ephemeral flow on the reading request.
 * @param model The complete canonical reading.
 * @param request The reading request.
 * @returns Effective grammar and resolved temporary flow, or a refusal.
 */
function resolveOptionalEphemeral(
	model: Model,
	request: Reading,
):
	| {
			readonly ok: true;
			readonly grammar: Reading["grammar"];
			readonly resolvedEphemeralFlow: Reading["resolvedEphemeralFlow"];
	  }
	| { readonly ok: false; readonly error: NavigationError } {
	if (request.ephemeralFlow === undefined) {
		return { ok: true, grammar: request.grammar, resolvedEphemeralFlow: undefined };
	}
	const ephemeral = resolveEphemeralFlow(model, request.ephemeralFlow, request.grammar, (raw) =>
		resolveModuleRef(model, raw),
	);
	if (!ephemeral.ok) return ephemeral;
	return { ok: true, grammar: ephemeral.grammar, resolvedEphemeralFlow: ephemeral.resolved };
}

/**
 * Strip CLI-only sugar fields and combine resolved selector outputs into a canonical reading.
 * @param request The original reading request.
 * @param parts Resolved structural, selection, filter, directional, and ephemeral outputs.
 * @returns The canonical pane reading.
 */
function assembleResolvedReading(request: Reading, parts: ResolvedReadingParts): Reading {
	const {
		onlyKinds: _onlyKinds,
		onlyEffects: _onlyEffects,
		to: _to,
		from: _from,
		group: _group,
		keep: _keep,
		ephemeralFlow: _ephemeralFlow,
		resolvedEphemeralFlow: _ignored,
		...base
	} = request;
	const out: Reading = { ...base, grammar: parts.grammar ?? "architecture" };
	assignDefined(out, "scope", parts.scope);
	assignDefined(out, "expand", parts.expand);
	assignDefined(out, "focus", parts.focus.length === 0 ? undefined : [...parts.focus]);
	assignDefined(out, "select", parts.select.length === 0 ? undefined : [...parts.select]);
	assignDefined(out, "lens", parts.filters.lens);
	assignDefined(out, "hideKinds", parts.filters.hideKinds);
	assignDefined(out, "hideEffects", parts.filters.hideEffects);
	assignDefined(out, "resolvedEphemeralFlow", parts.resolvedEphemeralFlow);
	return out;
}

/**
 * Set a field on a reading object only when its value is defined.
 * @param target The reading being built.
 * @param key The field name.
 * @param value The optional value.
 */
function assignDefined<K extends keyof Reading>(
	target: Reading,
	key: K,
	value: Reading[K] | undefined,
): void {
	if (value !== undefined) target[key] = value;
}

/**
 * Resolve every human- or agent-friendly selector on a reading into canonical ids ready for validation and dispatch.
 * @param model The complete canonical reading.
 * @param request The merged reading request.
 * @returns The canonical reading, or a structured refusal.
 */
function resolvePaneReading(
	model: Model,
	request: Reading,
):
	| { readonly ok: true; readonly reading: Reading }
	| { readonly ok: false; readonly error: NavigationError } {
	const subjects = knownSubjectIds(model);
	const structural = resolveStructuralSelectors(model, subjects, request);
	if (!structural.ok) return structural;
	const selection = resolveSelectionSelectors(model, subjects, request);
	if (!selection.ok) return selection;
	const filters = resolveFilterSelectors(model, request);
	if (!filters.ok) return filters;
	const directional = resolveDirectionalFocus(model, request, filters, (values) =>
		resolveList(values, (raw) => resolveModuleRef(model, raw)),
	);
	if (!directional.ok) return directional;
	const ephemeral = resolveOptionalEphemeral(model, request);
	if (!ephemeral.ok) return ephemeral;
	return {
		ok: true,
		reading: assembleResolvedReading(request, {
			scope: structural.scope,
			expand: structural.expand,
			focus: [...new Set([...structural.focus, ...directional.ids])],
			select: selection.ids,
			filters,
			grammar: ephemeral.grammar,
			resolvedEphemeralFlow: ephemeral.resolvedEphemeralFlow,
		}),
	};
}

export {
	extractDisplaySettings,
	isSettingsOnlyRequest,
	mergeKeptReading,
	resolvePaneReading,
	type NavigationError,
};
