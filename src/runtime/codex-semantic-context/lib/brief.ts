import { CODEX_SEMANTIC_FRESHNESS_MS } from "../../../shared/timing/timing.js";
import {
	byteLength,
	clipUtf8,
	deepFreeze,
	fail,
	normalizeContext,
	textValue,
	uniqueSorted,
	type BoundedValue,
	type NormalizedContext,
} from "./normalize.js";
import { SEMANTIC_CONTEXT_LIMITS } from "./limits.js";
import type {
	SemanticBriefFields,
	SemanticBriefSource,
	SemanticChangeOrigin,
	SemanticContextInput,
	SemanticFreshness,
	SemanticStaleness,
} from "./types.js";

export interface BriefMetadata {
	readonly source: SemanticBriefSource;
	readonly origin: SemanticChangeOrigin | null;
	readonly capturedAtMs: number;
	readonly additionalAmbiguity?: readonly string[];
	readonly additionalStaleReasons?: readonly string[];
	readonly inputTruncated?: boolean;
}

function serializableBrief(
	context: NormalizedContext,
	feedId: string,
	selection: readonly string[],
	ambiguity: readonly string[],
	description: string,
	truncated: boolean,
	freshness: SemanticFreshness,
	staleness: SemanticStaleness,
): Record<string, unknown> {
	return {
		source: "semantic_context",
		feedId,
		repository: context.repository,
		workhorse: context.workhorse,
		coordinator: context.coordinator,
		board: context.board,
		pane: context.pane,
		version: context.board.version,
		selection,
		claim: context.claim,
		doing: context.doing,
		cursor: context.cursor,
		description,
		freshness,
		truncated,
		ambiguity,
		staleness,
		child: context.child,
		threadLink: context.threadLink,
	};
}

function timestamp(value: number, field: string): number {
	if (!Number.isFinite(value)) fail(field, "must be finite");
	return value;
}

function boundedExtraReasons(
	values: readonly string[] | undefined,
	field: string,
): BoundedValue<string[]> {
	const entries = (values ?? []).map((reason, index) =>
		textValue(reason, `${field}[${index}]`, SEMANTIC_CONTEXT_LIMITS.ambiguityBytes),
	);
	const unique = uniqueSorted(entries.map((entry) => entry.value));
	return {
		value: unique.slice(0, SEMANTIC_CONTEXT_LIMITS.ambiguityEntries),
		truncated:
			entries.some((entry) => entry.truncated) ||
			unique.length > SEMANTIC_CONTEXT_LIMITS.ambiguityEntries,
	};
}

function render(
	context: NormalizedContext,
	feedId: string,
	selection: readonly string[],
	ambiguity: readonly string[],
	description: string,
	truncated: boolean,
	freshness: SemanticFreshness,
	staleness: SemanticStaleness,
): string {
	return JSON.stringify(
		serializableBrief(
			context,
			feedId,
			selection,
			ambiguity,
			description,
			truncated,
			freshness,
			staleness,
		),
	);
}

function fitBrief(
	context: NormalizedContext,
	feedId: string,
	selection: string[],
	ambiguity: string[],
	description: string,
	truncated: boolean,
	freshness: SemanticFreshness,
	staleness: SemanticStaleness,
): {
	selection: string[];
	ambiguity: string[];
	description: string;
	truncated: boolean;
	brief: string;
} {
	let currentDescription = description;
	let currentSelection = selection;
	let currentAmbiguity = ambiguity;
	let currentTruncated = truncated;
	let brief = render(
		context,
		feedId,
		currentSelection,
		currentAmbiguity,
		currentDescription,
		currentTruncated,
		freshness,
		staleness,
	);
	if (byteLength(brief) > SEMANTIC_CONTEXT_LIMITS.briefBytes) {
		const overhead = byteLength(
			render(context, feedId, currentSelection, currentAmbiguity, "", true, freshness, staleness),
		);
		const available = Math.max(0, SEMANTIC_CONTEXT_LIMITS.briefBytes - overhead);
		currentDescription = clipUtf8(currentDescription, available).value;
		currentTruncated = true;
		brief = render(
			context,
			feedId,
			currentSelection,
			currentAmbiguity,
			currentDescription,
			currentTruncated,
			freshness,
			staleness,
		);
	}
	while (byteLength(brief) > SEMANTIC_CONTEXT_LIMITS.briefBytes && currentAmbiguity.length > 0) {
		currentAmbiguity = currentAmbiguity.slice(0, -1);
		currentTruncated = true;
		brief = render(
			context,
			feedId,
			currentSelection,
			currentAmbiguity,
			currentDescription,
			currentTruncated,
			freshness,
			staleness,
		);
	}
	while (byteLength(brief) > SEMANTIC_CONTEXT_LIMITS.briefBytes && currentSelection.length > 0) {
		currentSelection = currentSelection.slice(0, -1);
		currentTruncated = true;
		brief = render(
			context,
			feedId,
			currentSelection,
			currentAmbiguity,
			currentDescription,
			currentTruncated,
			freshness,
			staleness,
		);
	}
	if (byteLength(brief) > SEMANTIC_CONTEXT_LIMITS.briefBytes) {
		fail("brief", `serialized context exceeds ${SEMANTIC_CONTEXT_LIMITS.briefBytes} UTF-8 bytes`);
	}
	return {
		selection: currentSelection,
		ambiguity: currentAmbiguity,
		description: currentDescription,
		truncated: currentTruncated,
		brief,
	};
}

export function buildSemanticBrief(
	input: SemanticContextInput,
	feedId: string,
	qualifyCursor: (cursor: string | number | null) => BoundedValue<string | null>,
	clock: () => number,
	metadata: BriefMetadata,
): SemanticBriefFields {
	const capturedAtMs = timestamp(metadata.capturedAtMs, "capturedAtMs");
	const observedAtMs = timestamp(clock(), "now");
	const context = normalizeContext(input, qualifyCursor, metadata.additionalStaleReasons);
	const extraAmbiguity = boundedExtraReasons(metadata.additionalAmbiguity, "event.ambiguity");
	let selection = [...context.selection];
	let ambiguity = uniqueSorted([...context.ambiguity, ...extraAmbiguity.value]);
	let truncated = context.truncated || metadata.inputTruncated === true || extraAmbiguity.truncated;
	if (selection.length > SEMANTIC_CONTEXT_LIMITS.selectionEntries) {
		selection = selection.slice(0, SEMANTIC_CONTEXT_LIMITS.selectionEntries);
		truncated = true;
	}
	if (ambiguity.length > SEMANTIC_CONTEXT_LIMITS.ambiguityEntries) {
		ambiguity = ambiguity.slice(0, SEMANTIC_CONTEXT_LIMITS.ambiguityEntries);
		truncated = true;
	}
	const freshness: SemanticFreshness = deepFreeze({
		capturedAtMs,
		freshUntilMs: capturedAtMs + CODEX_SEMANTIC_FRESHNESS_MS,
		state: observedAtMs < capturedAtMs + CODEX_SEMANTIC_FRESHNESS_MS ? "fresh" : "stale",
	});
	const staleReasons = uniqueSorted([...context.staleReasons]);
	if (freshness.state === "stale") {
		staleReasons.push("semantic freshness window expired");
	}
	const staleness: SemanticStaleness = deepFreeze({
		state: staleReasons.length > 0 ? "stale" : "current",
		reasons: staleReasons,
	});
	const fitted = fitBrief(
		context,
		feedId,
		selection,
		ambiguity,
		context.description,
		truncated,
		freshness,
		staleness,
	);
	return {
		source: metadata.source,
		origin: metadata.origin,
		feedId,
		repository: context.repository,
		child: context.child,
		threadLink: context.threadLink,
		workhorse: context.workhorse,
		coordinator: context.coordinator,
		board: { key: context.board.key, note: context.board.note },
		pane: context.pane,
		version: context.board.version,
		selection: Object.freeze([...fitted.selection]),
		claim: context.claim,
		doing: context.doing,
		cursor: context.cursor,
		description: fitted.description,
		freshness,
		truncated: fitted.truncated,
		ambiguity: Object.freeze([...fitted.ambiguity]),
		staleness,
		brief: fitted.brief,
		bytes: byteLength(fitted.brief),
	};
}
