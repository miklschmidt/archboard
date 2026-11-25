import type {
	architecturePaneReadingSchema,
	semanticPaneContextSchema,
} from "@archboard/model/pane-context";
import type { z } from "zod";

type Reading = z.infer<ReturnType<typeof architecturePaneReadingSchema>>;
type CapturedArchitecture = NonNullable<
	z.infer<ReturnType<typeof semanticPaneContextSchema>>["architecture"]
>;

/**
 * Whether a reading request replaces the open version (state, checkpoint, or ref).
 * @param incoming The incoming reading fields.
 * @returns True when any version selector is set.
 */
function switchesVersion(incoming: Reading): boolean {
	return (
		incoming.state !== undefined || incoming.checkpoint !== undefined || incoming.ref !== undefined
	);
}

/**
 * Whether a reading request replaces active relationship filters.
 * @param incoming The incoming reading fields.
 * @returns True when lens or positive kind/effect filters are set.
 */
function switchesFilters(incoming: Reading): boolean {
	return (
		incoming.lens !== undefined ||
		incoming.onlyKinds !== undefined ||
		incoming.onlyEffects !== undefined
	);
}

/**
 * Whether a reading request changes the structural focus or scope.
 * @param incoming The incoming reading fields.
 * @returns True when scope, module, focus, directional filters, or filter switches are set.
 */
function switchesStructural(incoming: Reading): boolean {
	return (
		incoming.scope !== undefined ||
		incoming.module !== undefined ||
		hasFocusInput(incoming) ||
		switchesFilters(incoming)
	);
}

/**
 * Whether a reading request supplies explicit or directional focus.
 * @param incoming The incoming reading fields.
 * @returns True when focus, to, or from is present.
 */
function hasFocusInput(incoming: Reading): boolean {
	return incoming.focus !== undefined || incoming.to !== undefined || incoming.from !== undefined;
}

/**
 * Whether a reading request switches grammar or flow.
 * @param incoming The incoming reading fields.
 * @returns True when grammar, flow, or ephemeralFlow is present.
 */
function switchesBehavior(incoming: Reading): boolean {
	return (
		incoming.grammar !== undefined ||
		incoming.flow !== undefined ||
		incoming.ephemeralFlow !== undefined
	);
}

/**
 * Extract version selectors carried on a captured selection object.
 * @param selection The pane's captured selection.
 * @returns Version fields present on the selection.
 */
function selectionVersionFields(
	selection: NonNullable<CapturedArchitecture["selection"]>,
): Partial<Reading> {
	return {
		...optionalField("state", selection.state),
		...optionalField("checkpoint", selection.checkpoint),
		...optionalField("preview", selection.preview),
		...optionalField("bookmark", selection.bookmark),
		...optionalField("legacyAddress", selection.legacyAddress),
	};
}

/**
 * Carry forward version and source selection fields when the incoming request does not change them.
 * @param incoming The incoming reading fields.
 * @param current The pane's reported architecture context.
 * @returns The carried version fields.
 */
function keptVersionFields(incoming: Reading, current: CapturedArchitecture): Partial<Reading> {
	if (switchesVersion(incoming)) return {};
	const selectionFields =
		current.selection === undefined ? {} : selectionVersionFields(current.selection);
	const refField = optionalField("ref", current.display?.ref);
	return { ...selectionFields, ...refField };
}

/**
 * Carry forward comparison settings when the incoming request does not change them.
 * @param incoming The incoming reading fields.
 * @param current The pane's reported architecture context.
 * @returns The carried comparison fields.
 */
function keptComparisonFields(incoming: Reading, current: CapturedArchitecture): Partial<Reading> {
	if (incoming.against !== undefined || incoming.compare !== undefined) return {};
	return {
		...optionalField("against", current.selection?.against),
		...optionalField("compare", current.selection?.compare),
	};
}

/**
 * Resolve the carried focus list when neither scope nor focus inputs override it.
 * @param incoming The incoming reading fields.
 * @param current The pane's reported architecture context.
 * @returns The carried focus list, or undefined.
 */
function keptFocus(incoming: Reading, current: CapturedArchitecture): string[] | undefined {
	if (incoming.scope !== undefined || hasFocusInput(incoming)) return undefined;
	return nonEmptyList(current.reading.focus);
}

/**
 * Carry forward scope, focus, and expand when the incoming request does not replace them.
 * @param incoming The incoming reading fields.
 * @param current The pane's reported architecture context.
 * @returns The carried structural fields.
 */
function keptStructuralFields(incoming: Reading, current: CapturedArchitecture): Partial<Reading> {
	const keepScope = incoming.scope === undefined && incoming.module === undefined;
	return {
		...optionalField("scope", keepScope ? current.reading.scope : undefined),
		...optionalField("focus", keptFocus(incoming, current)),
		...optionalField("expand", incoming.expand === undefined ? current.reading.expand : undefined),
	};
}

/**
 * Resolve carried hidden kinds when the incoming request does not change kind filtering.
 * @param incoming The incoming reading fields.
 * @param current The pane's reported architecture context.
 * @returns The carried hidden kinds, or undefined.
 */
function keptHideKinds(incoming: Reading, current: CapturedArchitecture): string[] | undefined {
	if (
		incoming.lens !== undefined ||
		incoming.onlyKinds !== undefined ||
		incoming.hideKinds !== undefined
	) {
		return undefined;
	}
	return nonEmptyList(current.display?.hideKinds);
}

/**
 * Resolve carried hidden effects when the incoming request does not change effect filtering.
 * @param incoming The incoming reading fields.
 * @param current The pane's reported architecture context.
 * @returns The carried hidden effects, or undefined.
 */
function keptHideEffects(
	incoming: Reading,
	current: CapturedArchitecture,
): Reading["hideEffects"] | undefined {
	if (
		incoming.lens !== undefined ||
		incoming.onlyEffects !== undefined ||
		incoming.hideEffects !== undefined
	) {
		return undefined;
	}
	return nonEmptyList(current.display?.hideEffects);
}

/**
 * Carry forward lens and hide lists when the incoming request does not replace them.
 * @param incoming The incoming reading fields.
 * @param current The pane's reported architecture context.
 * @returns The carried filter fields.
 */
function keptFilterFields(incoming: Reading, current: CapturedArchitecture): Partial<Reading> {
	return {
		...optionalField("lens", switchesFilters(incoming) ? undefined : current.reading.lens),
		...optionalField("hideKinds", keptHideKinds(incoming, current)),
		...optionalField("hideEffects", keptHideEffects(incoming, current)),
	};
}

/**
 * Carry forward grammar and authored flow when neither behavior nor structure changed.
 * @param incoming The incoming reading fields.
 * @param current The pane's reported architecture context.
 * @returns The carried behavior fields.
 */
function keptBehaviorFields(incoming: Reading, current: CapturedArchitecture): Partial<Reading> {
	if (switchesBehavior(incoming) || switchesStructural(incoming)) return {};
	return {
		grammar: current.reading.grammar,
		...optionalField("flow", current.reading.flow),
	};
}

/**
 * Carry forward open file and page when the incoming request does not override them.
 * @param incoming The incoming reading fields.
 * @param current The pane's reported architecture context.
 * @returns The carried presentation fields.
 */
function keptPresentationFields(
	incoming: Reading,
	current: CapturedArchitecture,
): Partial<Reading> {
	const disp = current.display;
	const keepFile = incoming.file === undefined && disp?.file !== undefined;
	return {
		...(keepFile ? { file: disp.file, ...optionalField("fileRepo", disp.fileRepo) } : {}),
		...optionalField("page", incoming.page === undefined ? disp?.page : undefined),
	};
}

/**
 * Return a one-key object when a value is defined, or an empty object otherwise.
 * @param key The reading field name.
 * @param value The optional value.
 * @returns A partial reading object.
 */
function optionalField<K extends keyof Reading>(
	key: K,
	value: Reading[K] | undefined,
): Partial<Reading> {
	return value === undefined ? {} : { [key]: value };
}

/**
 * Return a list only when it holds at least one entry.
 * @param list The optional list.
 * @returns The list when non-empty, or undefined.
 */
function nonEmptyList<T>(list: T[] | undefined): T[] | undefined {
	return list !== undefined && list.length > 0 ? list : undefined;
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
	return {
		...keptVersionFields(incoming, current),
		...keptComparisonFields(incoming, current),
		...keptStructuralFields(incoming, current),
		...keptFilterFields(incoming, current),
		...keptBehaviorFields(incoming, current),
		...keptPresentationFields(incoming, current),
		...incoming,
	};
}

export { mergeKeptReading };
