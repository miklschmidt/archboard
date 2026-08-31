import { CODEX_SEMANTIC_FRESHNESS_MS } from "../../../shared/timing/timing.js";
import { SEMANTIC_CONTEXT_ELLIPSIS, SEMANTIC_CONTEXT_LIMITS } from "./limits.js";
import {
	boundedReasons,
	byteLength,
	clipUtf8,
	deepFreeze,
	fail,
	normalizeContext,
	type NormalizedContext,
	uniqueSorted,
} from "./normalize.js";
import type {
	SemanticBriefFields,
	SemanticBriefSource,
	SemanticChangeOrigin,
	SemanticContextInput,
	SemanticCursorInput,
	SemanticFreshness,
	SemanticStaleness,
} from "./types.js";

export interface BriefMetadata {
	readonly source: SemanticBriefSource;
	readonly origin: SemanticChangeOrigin | null;
	readonly capturedAtMs: number;
	readonly cursorOverride?: SemanticCursorInput | null;
	readonly additionalAmbiguity?: readonly string[];
	readonly additionalStaleReasons?: readonly string[];
	readonly inputTruncated?: boolean;
}

type BriefContext = {
	-readonly [Key in keyof NormalizedContext]: NormalizedContext[Key];
};

interface FitParts {
	readonly context: BriefContext;
	selection: string[];
	ambiguity: string[];
	description: string;
	freshness: SemanticFreshness;
	staleness: {
		state: "current" | "stale";
		reasons: string[];
	};
	truncated: boolean;
}

function copyContext(context: NormalizedContext): BriefContext {
	return {
		...context,
		child: { ...context.child },
		threadLink: { ...context.threadLink },
		workhorse: { ...context.workhorse },
		coordinator: { ...context.coordinator },
		board: { ...context.board },
		pane: { ...context.pane },
		selection: [...context.selection],
		claim: { ...context.claim },
		ambiguity: [...context.ambiguity],
		staleReasons: [...context.staleReasons],
	};
}

function serializableBrief(
	context: BriefContext,
	feedId: string,
	parts: Pick<
		FitParts,
		"selection" | "ambiguity" | "description" | "freshness" | "staleness" | "truncated"
	>,
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
		selection: parts.selection,
		claim: context.claim,
		doing: context.doing,
		cursor: context.cursor,
		description: parts.description,
		freshness: parts.freshness,
		truncated: parts.truncated,
		ambiguity: parts.ambiguity,
		staleness: parts.staleness,
		child: context.child,
		threadLink: context.threadLink,
	};
}

function render(context: BriefContext, feedId: string, parts: FitParts): string {
	return JSON.stringify(serializableBrief(context, feedId, parts));
}

function timestamp(value: number, field: string): number {
	if (!Number.isFinite(value)) fail(field, "must be finite");
	return value;
}

interface TextSlot {
	readonly original: string | null;
	readonly empty: string | null;
	readonly minimum: string | null;
	readonly set: (value: string | null) => void;
}

function fitTextSlot(parts: FitParts, context: BriefContext, feedId: string, slot: TextSlot): void {
	if (slot.original === null) {
		slot.set(null);
		return;
	}
	slot.set(slot.empty);
	const available = SEMANTIC_CONTEXT_LIMITS.briefBytes - byteLength(render(context, feedId, parts));
	const fitted = clipUtf8(slot.original, Math.max(0, available)).value;
	slot.set(fitted || slot.minimum);
}

function fitArray(
	parts: FitParts,
	context: BriefContext,
	feedId: string,
	original: readonly string[],
	set: (value: string[]) => void,
): void {
	const fitted: string[] = [];
	set(fitted);
	for (const value of original) {
		fitted.push(value);
		if (byteLength(render(context, feedId, parts)) > SEMANTIC_CONTEXT_LIMITS.briefBytes) {
			fitted.pop();
			set(fitted);
			break;
		}
	}
}

function fitAggregate(
	context: BriefContext,
	feedId: string,
	selection: string[],
	ambiguity: string[],
	description: string,
	freshness: SemanticFreshness,
	staleness: SemanticStaleness,
	truncated: boolean,
): FitParts & { readonly brief: string } {
	const parts: FitParts = {
		context,
		selection,
		ambiguity,
		description,
		freshness,
		staleness: { state: staleness.state, reasons: [...staleness.reasons] },
		truncated,
	};
	const selectionOriginal = [...parts.selection];
	const ambiguityOriginal = [...parts.ambiguity];
	const staleReasonsOriginal = [...parts.staleness.reasons];
	if (byteLength(render(context, feedId, parts)) <= SEMANTIC_CONTEXT_LIMITS.briefBytes) {
		return { ...parts, brief: render(context, feedId, parts) };
	}

	parts.truncated = true;
	parts.selection = [];
	parts.ambiguity = [];
	parts.staleness.reasons = [];
	const slots: readonly TextSlot[] = [
		{
			original: context.repository,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			set: (value) => {
				context.repository = value ?? SEMANTIC_CONTEXT_ELLIPSIS;
			},
		},
		{
			original: context.board.key,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			set: (value) => {
				context.board = { ...context.board, key: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
			},
		},
		{
			original: context.board.note,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			set: (value) => {
				context.board = { ...context.board, note: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
			},
		},
		{
			original: context.pane.paneId,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			set: (value) => {
				context.pane = { ...context.pane, paneId: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
			},
		},
		{
			original: parts.description,
			empty: "",
			minimum: "",
			set: (value) => {
				parts.description = value ?? "";
			},
		},
		{
			original: context.doing,
			empty: null,
			minimum: null,
			set: (value) => {
				context.doing = value;
			},
		},
		{
			original: context.claim.doing,
			empty: null,
			minimum: null,
			set: (value) => {
				context.claim = { ...context.claim, doing: value };
			},
		},
		{
			original: context.threadLink.reason,
			empty: null,
			minimum: null,
			set: (value) => {
				context.threadLink = { ...context.threadLink, reason: value };
			},
		},
	];
	for (const slot of slots) {
		slot.set(slot.minimum);
	}
	if (byteLength(render(context, feedId, parts)) > SEMANTIC_CONTEXT_LIMITS.briefBytes) {
		fail(
			"brief",
			`fixed semantic identity fields exceed ${SEMANTIC_CONTEXT_LIMITS.briefBytes} UTF-8 bytes`,
		);
	}
	for (const slot of slots) fitTextSlot(parts, context, feedId, slot);
	fitArray(parts, context, feedId, selectionOriginal, (value) => {
		parts.selection = value;
	});
	fitArray(parts, context, feedId, ambiguityOriginal, (value) => {
		parts.ambiguity = value;
	});
	fitArray(parts, context, feedId, staleReasonsOriginal, (value) => {
		parts.staleness.reasons = value;
	});
	const brief = render(context, feedId, parts);
	if (byteLength(brief) > SEMANTIC_CONTEXT_LIMITS.briefBytes) {
		fail(
			"brief",
			`fixed semantic identity fields exceed ${SEMANTIC_CONTEXT_LIMITS.briefBytes} UTF-8 bytes`,
		);
	}
	return { ...parts, brief };
}

export function buildSemanticBrief(
	input: SemanticContextInput,
	feedId: string,
	clock: () => number,
	metadata: BriefMetadata,
): SemanticBriefFields {
	const capturedAtMs = timestamp(metadata.capturedAtMs, "capturedAtMs");
	const observedAtMs = timestamp(clock(), "now");
	const context = normalizeContext(
		input,
		feedId,
		metadata.cursorOverride,
		metadata.additionalStaleReasons,
	);
	const extraAmbiguity = boundedReasons(metadata.additionalAmbiguity ?? [], "event.ambiguity");
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
	const freshUntilMs = capturedAtMs + CODEX_SEMANTIC_FRESHNESS_MS;
	const freshness: SemanticFreshness = deepFreeze({
		capturedAtMs,
		freshUntilMs,
		state: observedAtMs < freshUntilMs ? "fresh" : "stale",
	});
	const staleReasons = uniqueSorted([...context.staleReasons]);
	if (freshness.state === "stale") staleReasons.push("semantic freshness window expired");
	const staleness: SemanticStaleness = {
		state: staleReasons.length > 0 ? "stale" : "current",
		reasons: staleReasons,
	};
	const fitted = fitAggregate(
		copyContext(context),
		feedId,
		selection,
		ambiguity,
		context.description,
		freshness,
		staleness,
		truncated,
	);
	return {
		source: metadata.source,
		origin: metadata.origin,
		feedId,
		repository: fitted.context.repository,
		child: fitted.context.child,
		threadLink: fitted.context.threadLink,
		workhorse: fitted.context.workhorse,
		coordinator: fitted.context.coordinator,
		board: {
			key: fitted.context.board.key,
			note: fitted.context.board.note,
		},
		pane: fitted.context.pane,
		version: fitted.context.board.version,
		selection: Object.freeze([...fitted.selection]),
		claim: fitted.context.claim,
		doing: fitted.context.doing,
		cursor: fitted.context.cursor,
		description: fitted.description,
		freshness,
		truncated: fitted.truncated,
		ambiguity: Object.freeze([...fitted.ambiguity]),
		staleness: deepFreeze(fitted.staleness),
		brief: fitted.brief,
		bytes: byteLength(fitted.brief),
	};
}
