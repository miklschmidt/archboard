import { allLens, readingLens } from "@archboard/model/content";
import { everyStep } from "@archboard/model/flow";
import type {
	architecturePaneReadingSchema,
	paneDisplaySettingsSchema,
	semanticPaneContextSchema,
} from "@archboard/model/pane-context";
import { hiddenKinds, lineEffect } from "@archboard/model/policy";
import type { readArchitectureModel } from "@archboard/model/store-read";
import type { z } from "zod";
import { resolveEphemeralFlow } from "#server/panes/connections/rules/ephemeral-flow.ts";

type Reading = z.infer<ReturnType<typeof architecturePaneReadingSchema>>;
type DisplaySettings = z.infer<ReturnType<typeof paneDisplaySettingsSchema>>;
type CapturedArchitecture = NonNullable<
	z.infer<ReturnType<typeof semanticPaneContextSchema>>["architecture"]
>;
type Model = Extract<Awaited<ReturnType<typeof readArchitectureModel>>, { success: true }>;
type NavigationError = { readonly code: string; readonly error: string };

const ALL_EFFECTS = ["mutation", "query", "compute", "declared"] as const;
type LineEffect = (typeof ALL_EFFECTS)[number];
const DISPLAY_SETTING_KEYS = new Set(["layout", "theme", "hoverLight"]);

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
 * Merge a `--keep` request onto what the target pane currently reports so agents can adjust
 * one filter or selector without reconstructing every active field.
 * @param request The incoming request with `keep: true`.
 * @param current The pane's currently reported architecture context, if any.
 * @returns The merged reading request.
 */
function mergeKeptReading(request: Reading, current: CapturedArchitecture | null): Reading {
	const { keep, ...incoming } = request;
	if (keep !== true || current === null) return incoming;
	const switchesVersion =
		incoming.state !== undefined || incoming.checkpoint !== undefined || incoming.ref !== undefined;
	const switchesFilters =
		incoming.lens !== undefined ||
		incoming.onlyKinds !== undefined ||
		incoming.onlyEffects !== undefined;
	const switchesStructural =
		incoming.scope !== undefined ||
		incoming.module !== undefined ||
		incoming.focus !== undefined ||
		incoming.to !== undefined ||
		incoming.from !== undefined ||
		switchesFilters;
	const switchesBehavior =
		incoming.grammar !== undefined ||
		incoming.flow !== undefined ||
		incoming.ephemeralFlow !== undefined;
	const sel = current.selection;
	const disp = current.display;
	const kept: Reading = {
		...(switchesVersion
			? {}
			: {
					...(sel?.state === undefined ? {} : { state: sel.state }),
					...(sel?.checkpoint === undefined ? {} : { checkpoint: sel.checkpoint }),
					...(disp?.ref === undefined ? {} : { ref: disp.ref }),
					...(sel?.preview === undefined ? {} : { preview: sel.preview }),
					...(sel?.bookmark === undefined ? {} : { bookmark: sel.bookmark }),
					...(sel?.legacyAddress === undefined ? {} : { legacyAddress: sel.legacyAddress }),
				}),
		...(incoming.against !== undefined || incoming.compare !== undefined
			? {}
			: {
					...(sel?.against === undefined ? {} : { against: sel.against }),
					...(sel?.compare === undefined ? {} : { compare: sel.compare }),
				}),
		...(incoming.scope !== undefined ||
		incoming.module !== undefined ||
		current.reading.scope === undefined
			? {}
			: { scope: current.reading.scope }),
		...(incoming.focus !== undefined ||
		incoming.to !== undefined ||
		incoming.from !== undefined ||
		incoming.scope !== undefined ||
		current.reading.focus.length === 0
			? {}
			: { focus: current.reading.focus }),
		...(incoming.expand !== undefined || current.reading.expand === undefined
			? {}
			: { expand: current.reading.expand }),
		...(switchesFilters || current.reading.lens === undefined
			? {}
			: { lens: current.reading.lens }),
		...(incoming.lens !== undefined ||
		incoming.onlyKinds !== undefined ||
		incoming.hideKinds !== undefined ||
		!disp?.hideKinds?.length
			? {}
			: { hideKinds: disp.hideKinds }),
		...(incoming.lens !== undefined ||
		incoming.onlyEffects !== undefined ||
		incoming.hideEffects !== undefined ||
		!disp?.hideEffects?.length
			? {}
			: { hideEffects: disp.hideEffects }),
		...(switchesBehavior || switchesStructural ? {} : { grammar: current.reading.grammar }),
		...(switchesBehavior || switchesStructural || current.reading.flow === undefined
			? {}
			: { flow: current.reading.flow }),
		...(incoming.file !== undefined || disp?.file === undefined
			? {}
			: {
					file: disp.file,
					...(disp.fileRepo === undefined ? {} : { fileRepo: disp.fileRepo }),
				}),
		...(incoming.page !== undefined || disp?.page === undefined ? {} : { page: disp.page }),
	};
	return { ...kept, ...incoming };
}

/**
 * Resolve one module reference by qualified id, local id, exact name, case-insensitive name, or former name.
 * @param model The complete canonical reading.
 * @param raw The user- or agent-supplied module selector.
 * @returns The canonical qualified module id, or a structured refusal.
 */
function resolveModuleRef(
	model: Model,
	raw: string,
):
	| { readonly ok: true; readonly id: string }
	| { readonly ok: false; readonly error: NavigationError } {
	const trimmed = raw.trim();
	const byId = model.modules.find(
		(module) => module.id === trimmed || module.id === `${model.manifest.id}#${trimmed}`,
	);
	if (byId !== undefined) return { ok: true, id: byId.id };
	const exactName = model.modules.filter((module) => module.name === trimmed);
	if (exactName.length === 1) return { ok: true, id: exactName[0]!.id };
	if (exactName.length > 1) return ambiguousModule(trimmed, exactName);
	const lower = trimmed.toLowerCase();
	const ciName = model.modules.filter((module) => module.name.toLowerCase() === lower);
	if (ciName.length === 1) return { ok: true, id: ciName[0]!.id };
	if (ciName.length > 1) return ambiguousModule(trimmed, ciName);
	const former = model.modules.filter((module) => module.formerNames?.includes(trimmed) === true);
	if (former.length === 1) return { ok: true, id: former[0]!.id };
	if (former.length > 1) return ambiguousModule(trimmed, former);
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
	matches: readonly Model["modules"][number][],
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
 * Collect every canonical subject id in a model for direct identity matching.
 * @param model The complete canonical reading.
 * @returns The set of known subject ids.
 */
function knownSubjectIds(model: Model): Set<string> {
	const ids = new Set<string>();
	for (const module of model.modules) ids.add(module.id);
	for (const edge of model.relationships) ids.add(edge.id);
	for (const collection of model.collections) {
		ids.add(`${model.manifest.id}#${collection.id}`);
		for (const flow of collection.flows) {
			ids.add(flow.id);
			for (const step of everyStep(flow.steps)) ids.add(step.id);
		}
	}
	for (const walkthrough of model.walkthroughs) {
		ids.add(walkthrough.id);
		for (const beat of walkthrough.beats) ids.add(beat.id);
	}
	return ids;
}

/**
 * Resolve a subject selector that may name any subject id or a module by name.
 * @param model The complete canonical reading.
 * @param subjects Known subject ids in the model.
 * @param raw The selector string.
 * @returns The canonical qualified id, or a structured refusal.
 */
function resolveSubjectRef(
	model: Model,
	subjects: ReadonlySet<string>,
	raw: string,
):
	| { readonly ok: true; readonly id: string }
	| { readonly ok: false; readonly error: NavigationError } {
	const trimmed = raw.trim();
	if (subjects.has(trimmed)) return { ok: true, id: trimmed };
	const qualified = `${model.manifest.id}#${trimmed}`;
	if (subjects.has(qualified)) return { ok: true, id: qualified };
	return resolveModuleRef(model, trimmed);
}

/**
 * Let a qualified id that the reading does not hold go through as it was given. A reader's own
 * address reaches the pane, which says what the reading lacks, and an agent hears of a missing
 * scope, focus or expanded module from the structural refusal of the show.
 * @param resolve One selector resolver.
 * @returns The resolver that passes unknown qualified ids through.
 */
function orQualified(
	resolve: (
		raw: string,
	) =>
		| { readonly ok: true; readonly id: string }
		| { readonly ok: false; readonly error: NavigationError },
): typeof resolve {
	return (raw) => {
		const resolved = resolve(raw);
		return !resolved.ok && resolved.error.code === "MODULE_NOT_FOUND" && raw.includes("#")
			? { ok: true, id: raw.trim() }
			: resolved;
	};
}

/**
 * Resolve a list of module or subject selectors in order, stopping at the first refusal.
 * @param values The raw selector strings.
 * @param resolve One selector resolver.
 * @returns Resolved unique ids or the first refusal.
 */
function resolveList(
	values: readonly string[],
	resolve: (
		raw: string,
	) =>
		| { readonly ok: true; readonly id: string }
		| { readonly ok: false; readonly error: NavigationError },
):
	| { readonly ok: true; readonly ids: string[] }
	| { readonly ok: false; readonly error: NavigationError } {
	const ids: string[] = [];
	for (const raw of values) {
		const resolved = resolve(raw);
		if (!resolved.ok) return resolved;
		if (!ids.includes(resolved.id)) ids.push(resolved.id);
	}
	return { ok: true, ids };
}

/**
 * Collect a module and every descendant inside its containment subtree.
 * @param model The complete canonical reading.
 * @param rootId The root module id.
 * @returns The module id and all descendant ids.
 */
function subtreeOf(model: Model, rootId: string): Set<string> {
	const childrenByParent = new Map<string, string[]>();
	for (const module of model.modules) {
		if (module.parent === undefined) continue;
		const list = childrenByParent.get(module.parent);
		if (list === undefined) childrenByParent.set(module.parent, [module.id]);
		else list.push(module.id);
	}
	const members = new Set<string>([rootId]);
	const stack = [rootId];
	while (stack.length > 0) {
		const current = stack.pop()!;
		for (const child of childrenByParent.get(current) ?? []) {
			if (!members.has(child)) {
				members.add(child);
				stack.push(child);
			}
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
 * Resolve positive `--only-kind` and `--only-effect` selectors into canonical lens + hide lists.
 * @param model The complete canonical reading.
 * @param request The reading selectors.
 * @returns Resolved lens, hideKinds, and hideEffects, or a structured refusal.
 */
function resolveFilterSelectors(
	model: Model,
	request: Reading,
):
	| {
			readonly ok: true;
			readonly lens: string | undefined;
			readonly hideKinds: string[] | undefined;
			readonly hideEffects: LineEffect[] | undefined;
	  }
	| { readonly ok: false; readonly error: NavigationError } {
	const policyKinds = Object.keys(model.policy.relationshipKinds);
	let lens = request.lens;
	let hideKinds = request.hideKinds;
	let hideEffects = request.hideEffects;
	if (request.onlyKinds !== undefined && request.onlyKinds.length > 0) {
		const keptKinds = new Set<string>();
		for (const raw of request.onlyKinds) {
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
			keptKinds.add(matched);
		}
		const complement = policyKinds.filter((kind) => !keptKinds.has(kind));
		hideKinds = [...new Set([...complement, ...(hideKinds ?? [])])];
		if (lens === undefined) lens = allLens();
	}
	if (request.onlyEffects !== undefined && request.onlyEffects.length > 0) {
		const keptEffects = new Set<LineEffect>(request.onlyEffects);
		const complement = ALL_EFFECTS.filter((effect) => !keptEffects.has(effect));
		hideEffects = [...new Set([...complement, ...(hideEffects ?? [])])];
		if (lens === undefined) lens = allLens();
	}
	return { ok: true, lens, hideKinds, hideEffects };
}

/**
 * Resolve `--to` and `--from` into matching relationship ids after active lens, kind, and effect filters.
 * @param model The complete canonical reading.
 * @param to Target module selectors.
 * @param from Source module selectors.
 * @param lens Effective lens id.
 * @param hideKinds Effective hidden relationship kinds.
 * @param hideEffects Effective hidden effects.
 * @returns Matching relationship ids, or a structured refusal.
 */
function resolveDirectionalFocus(
	model: Model,
	to: readonly string[] | undefined,
	from: readonly string[] | undefined,
	lens: string | undefined,
	hideKinds: readonly string[] | undefined,
	hideEffects: readonly LineEffect[] | undefined,
):
	| { readonly ok: true; readonly relationshipIds: string[] }
	| { readonly ok: false; readonly error: NavigationError } {
	const hasTo = to !== undefined && to.length > 0;
	const hasFrom = from !== undefined && from.length > 0;
	if (!hasTo && !hasFrom) return { ok: true, relationshipIds: [] };
	const resolvedTo = hasTo
		? resolveList(to, (raw) => resolveModuleRef(model, raw))
		: { ok: true as const, ids: [] };
	if (!resolvedTo.ok) return resolvedTo;
	const resolvedFrom = hasFrom
		? resolveList(from, (raw) => resolveModuleRef(model, raw))
		: { ok: true as const, ids: [] };
	if (!resolvedFrom.ok) return resolvedFrom;
	const toTrees = resolvedTo.ids.map((id) => ({ root: id, members: subtreeOf(model, id) }));
	const fromTrees = resolvedFrom.ids.map((id) => ({ root: id, members: subtreeOf(model, id) }));
	const both = hasTo && hasFrom;
	const directional = model.relationships.filter((edge) => {
		const matchesTo =
			!hasTo ||
			toTrees.some(
				({ root, members }) =>
					members.has(edge.to) && (both || !members.has(edge.from) || edge.to === root),
			);
		const matchesFrom =
			!hasFrom ||
			fromTrees.some(
				({ root, members }) =>
					members.has(edge.from) && (both || !members.has(edge.to) || edge.from === root),
			);
		return matchesTo && matchesFrom;
	});
	const activeLens = readingLens(model.policy, lens);
	const hiddenKindSet = new Set(hiddenKinds(hideKinds ?? [], model.policy));
	const hiddenEffectSet = new Set<LineEffect>(hideEffects ?? []);
	const matched = directional.filter((edge) => {
		// As the picture does: a relationship of an old reading that states no effect is never hidden by effect.
		const effect = lineEffect(edge);
		const effectAllowed = effect === undefined || !hiddenEffectSet.has(effect);
		return activeLens.draws(edge) && !hiddenKindSet.has(edge.kind) && effectAllowed;
	});
	if (matched.length === 0) {
		const targetDesc = [
			...(hasFrom ? [`from ${from.join(", ")}`] : []),
			...(hasTo ? [`to ${to.join(", ")}`] : []),
		].join(" ");
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
				error: `No relationships match ${targetDesc} under the requested filters.${detail}`,
			},
		};
	}
	return { ok: true, relationshipIds: matched.map((edge) => edge.id) };
}

/**
 * Resolve a `--group` selector into its member module ids.
 * @param model The complete canonical reading.
 * @param group The requested group id or name.
 * @returns The member module ids, or a structured refusal.
 */
function resolveGroupMembers(
	model: Model,
	group: string,
):
	| { readonly ok: true; readonly ids: string[] }
	| { readonly ok: false; readonly error: NavigationError } {
	const groups = model.policy.groups ?? {};
	const trimmed = group.trim();
	let matchedId: string | undefined;
	if (Object.hasOwn(groups, trimmed)) {
		matchedId = trimmed;
	} else {
		const lower = trimmed.toLowerCase();
		for (const [id, spec] of Object.entries(groups)) {
			if (id.toLowerCase() === lower || spec.name.toLowerCase() === lower) {
				matchedId = id;
				break;
			}
		}
	}
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
	// Scope, expand and focus pass through, because a reader's own address holds them and the
	// show's structural refusal checks them for an agent. Nothing checks a selected id afterwards.
	const resolvedScope =
		request.scope === undefined
			? { ok: true as const, id: undefined }
			: orQualified((raw) => resolveModuleRef(model, raw))(request.scope);
	if (!resolvedScope.ok) return resolvedScope;

	const resolvedExpand =
		request.expand === undefined
			? { ok: true as const, ids: undefined }
			: resolveList(
					request.expand,
					orQualified((raw) => resolveModuleRef(model, raw)),
				);
	if (!resolvedExpand.ok) return resolvedExpand;

	const resolvedFocus =
		request.focus === undefined
			? { ok: true as const, ids: undefined }
			: resolveList(
					request.focus,
					orQualified((raw) => resolveSubjectRef(model, subjects, raw)),
				);
	if (!resolvedFocus.ok) return resolvedFocus;

	const resolvedSelect =
		request.select === undefined
			? { ok: true as const, ids: undefined }
			: resolveList(request.select, (raw) => resolveSubjectRef(model, subjects, raw));
	if (!resolvedSelect.ok) return resolvedSelect;

	const resolvedGroup =
		request.group === undefined
			? { ok: true as const, ids: [] }
			: resolveGroupMembers(model, request.group);
	if (!resolvedGroup.ok) return resolvedGroup;

	const filters = resolveFilterSelectors(model, request);
	if (!filters.ok) return filters;

	const directional = resolveDirectionalFocus(
		model,
		request.to,
		request.from,
		filters.lens,
		filters.hideKinds,
		filters.hideEffects,
	);
	if (!directional.ok) return directional;

	const mergedFocus = [...new Set([...(resolvedFocus.ids ?? []), ...directional.relationshipIds])];
	const mergedSelect = [...new Set([...(resolvedSelect.ids ?? []), ...resolvedGroup.ids])];

	let grammar = request.grammar;
	let resolvedEphemeralFlow = request.resolvedEphemeralFlow;
	if (request.ephemeralFlow !== undefined) {
		const ephemeral = resolveEphemeralFlow(model, request.ephemeralFlow, request.grammar, (raw) =>
			resolveModuleRef(model, raw),
		);
		if (!ephemeral.ok) return ephemeral;
		grammar = ephemeral.grammar;
		resolvedEphemeralFlow = ephemeral.resolved;
	}

	const {
		onlyKinds: _onlyKinds,
		onlyEffects: _onlyEffects,
		to: _to,
		from: _from,
		group: _group,
		keep: _keep,
		ephemeralFlow: _ephemeralFlow,
		...base
	} = request;

	return {
		ok: true,
		reading: {
			...base,
			grammar: grammar ?? "architecture",
			...(resolvedScope.id === undefined ? {} : { scope: resolvedScope.id }),
			...(resolvedExpand.ids === undefined ? {} : { expand: resolvedExpand.ids }),
			...(mergedFocus.length === 0 ? {} : { focus: mergedFocus }),
			...(mergedSelect.length === 0 ? {} : { select: mergedSelect }),
			...(filters.lens === undefined ? {} : { lens: filters.lens }),
			...(filters.hideKinds === undefined ? {} : { hideKinds: filters.hideKinds }),
			...(filters.hideEffects === undefined ? {} : { hideEffects: filters.hideEffects }),
			...(resolvedEphemeralFlow === undefined ? {} : { resolvedEphemeralFlow }),
		},
	};
}

export {
	extractDisplaySettings,
	isSettingsOnlyRequest,
	mergeKeptReading,
	resolvePaneReading,
	type NavigationError,
};
