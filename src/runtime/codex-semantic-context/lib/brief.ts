import { CODEX_SEMANTIC_FRESHNESS_MS } from "@/shared/timing/timing";
import {
	SEMANTIC_CONTEXT_ELLIPSIS,
	SEMANTIC_CONTEXT_LIMITS,
} from "@/runtime/codex-semantic-context/lib/limits";
import {
	boundedReasons,
	byteLength,
	clipJsonUtf8,
	deepFreeze,
	fail,
	jsonStringByteLength,
	normalizeContext,
	type NormalizedContext,
	uniqueSorted,
} from "@/runtime/codex-semantic-context/lib/normalize";
import type {
	SemanticBriefFields,
	SemanticBriefSource,
	SemanticChangeOrigin,
	SemanticContextInput,
	SemanticCursorInput,
	SemanticFreshness,
	SemanticStaleness,
} from "@/runtime/codex-semantic-context/lib/types";

interface BriefMetadata {
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
	readonly feedId: string;
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

/**
 * An independent copy of a normalized context, so fitting a brief can trim fields in place without changing the context the caller holds.
 * @param context - The normalized context.
 * @returns The mutable copy.
 */
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
		cursor: context.cursor === null ? null : { ...context.cursor },
		ambiguity: [...context.ambiguity],
		staleReasons: [...context.staleReasons],
	};
}

/**
 * The brief as the object that gets serialized. Its field order is the brief's wire order, and every field the coordinator reads comes from here.
 * @param context - The context being rendered.
 * @param parts - The parts that vary while the brief is being fitted.
 * @returns The object to serialize.
 */
function serializableBrief(
	context: BriefContext,
	parts: Pick<
		FitParts,
		"feedId" | "selection" | "ambiguity" | "description" | "freshness" | "staleness" | "truncated"
	>,
): Record<string, unknown> {
	return {
		source: "semantic_context",
		feedId: parts.feedId,
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

/**
 * The brief's text, which is what its byte size is measured on.
 * @param context - The context being rendered.
 * @param parts - The parts that vary while the brief is being fitted.
 * @returns The serialized brief.
 */
function render(context: BriefContext, parts: FitParts): string {
	return JSON.stringify(serializableBrief(context, parts));
}

/**
 * Refuse a non-finite time: a brief's freshness is arithmetic on timestamps, so an infinite or NaN one would make freshness meaningless rather than wrong.
 * @param value - The claimed time.
 * @param field - The field being checked, for the refusal message.
 * @returns The time.
 */
function timestamp(value: number, field: string): number {
	if (!Number.isFinite(value)) {
		fail(field, "must be finite");
	}
	return value;
}

/**
 * A trimmed identity as it appears in a brief. A brief is display text under a byte ceiling: an
 * identity that does not fit is replaced by an ellipsis, which is not an issued identity. The
 * brief keeps the field's own type so a reader can still see which identity was trimmed away.
 * @param original - The identity being trimmed, which fixes the field's type.
 * @param trimmed - The trimmed text, or null when the field is absent.
 * @returns The trimmed text, in the field's identity type.
 */
function trimmedIdentity<Identity extends string>(
	original: Identity | null,
	trimmed: string | null,
): Identity | null {
	// The original is read only for its type: it is what says which identity is being trimmed.
	void original;
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a trimmed identity is display text, not an issued identity; nothing reads a brief's identity fields as identities, and the ellipsis is what makes the trimming visible
	return trimmed as Identity | null;
}

interface TextSlot {
	readonly original: string | null;
	readonly empty: string | null;
	readonly minimum: string | null;
	readonly set: (value: string | null) => void;
}

/**
 * Fit one text field into whatever room the brief has left: empty it, measure what that freed, then put back as much of the original as fits. A field that cannot fit at all keeps its minimum, which is the ellipsis that shows something was dropped.
 * @param parts - The parts being fitted.
 * @param context - The context being fitted.
 * @param slot - The field to fit.
 */
function fitTextSlot(parts: FitParts, context: BriefContext, slot: TextSlot): void {
	if (slot.original === null) {
		slot.set(null);
		return;
	}
	slot.set(slot.empty);
	const emptyBytes = slot.empty === null ? byteLength("null") : jsonStringByteLength(slot.empty);
	const available = SEMANTIC_CONTEXT_LIMITS.briefBytes - byteLength(render(context, parts));
	const fitted = clipJsonUtf8(slot.original, Math.max(0, available + emptyBytes)).value;
	slot.set(fitted || slot.minimum);
}

/**
 * Fit as many entries of a list as the brief has room for, in order, stopping at the first one that does not fit rather than dropping arbitrary entries.
 * @param parts - The parts being fitted.
 * @param context - The context being fitted.
 * @param original - The entries in order.
 * @param set - Installs the kept entries.
 */
function fitArray(
	parts: FitParts,
	context: BriefContext,
	original: readonly string[],
	set: (value: string[]) => void,
): void {
	const fitted: string[] = [];
	set(fitted);
	for (const value of original) {
		fitted.push(value);
		if (byteLength(render(context, parts)) > SEMANTIC_CONTEXT_LIMITS.briefBytes) {
			fitted.pop();
			set(fitted);
			break;
		}
	}
}

/**
 * Fit the whole brief under its byte ceiling. A brief that already fits is kept as it is; otherwise the lists are dropped, every text field is reduced to its minimum, and the freed room is given back field by field. The two qualified cursor identities are never trimmed: a brief that cannot hold them is refused, because a brief that cannot say which cursor it belongs to is not usable.
 * @param context - The context to render.
 * @param feedId - The feed the brief belongs to.
 * @param selection - The selected element ids.
 * @param ambiguity - The ambiguity reasons.
 * @param description - The change description.
 * @param freshness - The brief's freshness window.
 * @param staleness - The brief's staleness state.
 * @param truncated - Whether anything was already dropped before fitting.
 * @returns The fitted parts and the rendered brief.
 */
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
		feedId,
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
	let brief = render(context, parts);
	if (byteLength(brief) <= SEMANTIC_CONTEXT_LIMITS.briefBytes) {
		return { ...parts, brief };
	}

	parts.truncated = true;
	parts.selection = [];
	parts.ambiguity = [];
	parts.staleness.reasons = [];
	// Both qualified identities stay exact. The remaining slots fit around them.
	const slots: readonly TextSlot[] = [
		{
			original: context.repository,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed repository back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.repository = value ?? SEMANTIC_CONTEXT_ELLIPSIS;
			},
		},
		{
			original: context.board.key,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed board.key back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.board = { ...context.board, key: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
			},
		},
		{
			original: context.child.id,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed child.id back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.child = { ...context.child, id: trimmedIdentity(context.child.id, value) };
			},
		},
		{
			original: context.child.epoch,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed child.epoch back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.child = {
					...context.child,
					epoch: trimmedIdentity(context.child.epoch, value),
				};
			},
		},
		{
			original: context.workhorse.threadId,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed workhorse.threadId back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.workhorse = {
					...context.workhorse,
					threadId: trimmedIdentity(context.workhorse.threadId, value),
				};
			},
		},
		{
			original: context.workhorse.turnId,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed workhorse.turnId back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.workhorse = {
					...context.workhorse,
					turnId: trimmedIdentity(context.workhorse.turnId, value),
				};
			},
		},
		{
			original: context.coordinator.threadId,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed coordinator.threadId back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.coordinator = {
					...context.coordinator,
					threadId: trimmedIdentity(context.coordinator.threadId, value),
				};
			},
		},
		{
			original: context.coordinator.realtimeSessionId,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed coordinator.realtimeSessionId back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.coordinator = {
					...context.coordinator,
					realtimeSessionId: trimmedIdentity(context.coordinator.realtimeSessionId, value),
				};
			},
		},
		{
			original: context.board.note,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed board.note back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.board = { ...context.board, note: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
			},
		},
		{
			original: context.pane.paneId,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed pane.paneId back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.pane = { ...context.pane, paneId: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
			},
		},
		{
			original: parts.description,
			empty: "",
			minimum: "",
			/**
			 * Install the trimmed original: parts.description back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				parts.description = value ?? "";
			},
		},
		{
			original: context.doing,
			empty: null,
			minimum: null,
			/**
			 * Install the trimmed doing back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.doing = value;
			},
		},
		{
			original: context.claim.doing,
			empty: null,
			minimum: null,
			/**
			 * Install the trimmed claim.doing back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.claim = { ...context.claim, doing: value };
			},
		},
		{
			original: context.threadLink.reason,
			empty: null,
			minimum: null,
			/**
			 * Install the trimmed threadLink.reason back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.threadLink = { ...context.threadLink, reason: value };
			},
		},
	];
	for (const slot of slots) {
		slot.set(slot.minimum);
	}
	if (byteLength(render(context, parts)) > SEMANTIC_CONTEXT_LIMITS.briefBytes) {
		fail(
			"brief",
			`qualified cursor identities exceed ${SEMANTIC_CONTEXT_LIMITS.briefBytes} UTF-8 bytes`,
		);
	}
	for (const slot of slots) {
		fitTextSlot(parts, context, slot);
	}
	fitArray(parts, context, selectionOriginal, (value) => {
		parts.selection = value;
	});
	fitArray(parts, context, ambiguityOriginal, (value) => {
		parts.ambiguity = value;
	});
	fitArray(parts, context, staleReasonsOriginal, (value) => {
		parts.staleness.reasons = value;
	});
	brief = render(context, parts);
	if (byteLength(brief) > SEMANTIC_CONTEXT_LIMITS.briefBytes) {
		fail(
			"brief",
			`qualified cursor identities exceed ${SEMANTIC_CONTEXT_LIMITS.briefBytes} UTF-8 bytes`,
		);
	}
	return { ...parts, brief };
}

/**
 * Cap a list at the reviewed number of entries, reporting whether anything was dropped so the
 * brief can say it was truncated rather than quietly showing less than happened.
 * @param entries - The entries in order.
 * @param maximum - The reviewed ceiling.
 * @returns The kept entries and whether any were dropped.
 */
function capEntries(
	entries: readonly string[],
	maximum: number,
): { readonly entries: string[]; readonly truncated: boolean } {
	return entries.length > maximum
		? { entries: entries.slice(0, maximum), truncated: true }
		: { entries: [...entries], truncated: false };
}

/**
 * The freshness window a brief carries: a person's gesture is fresh for a fixed span after it was
 * captured, and stale afterwards, whatever else has happened since.
 * @param capturedAtMs - When the gesture was captured.
 * @param observedAtMs - When the brief is being built.
 * @returns The frozen freshness.
 */
function freshnessAt(capturedAtMs: number, observedAtMs: number): SemanticFreshness {
	const freshUntilMs = capturedAtMs + CODEX_SEMANTIC_FRESHNESS_MS;
	return deepFreeze({
		capturedAtMs,
		freshUntilMs,
		state: observedAtMs < freshUntilMs ? "fresh" : "stale",
	});
}

/**
 * Everything that makes a brief stale, including the expiry of its own freshness window, so the
 * coordinator is never handed a stale brief that does not say why.
 * @param contextReasons - The reasons the context already carried.
 * @param freshness - The brief's freshness window.
 * @returns The staleness state and its reasons.
 */
function stalenessFor(
	contextReasons: readonly string[],
	freshness: SemanticFreshness,
): SemanticStaleness {
	const reasons = uniqueSorted([...contextReasons]);
	if (freshness.state === "stale") {
		reasons.push("semantic freshness window expired");
	}
	return { state: reasons.length > 0 ? "stale" : "current", reasons };
}

/**
 * Build the semantic brief for one event: normalize its context, cap what is too long, work out
 * its freshness and staleness, then fit the whole thing under the brief's byte ceiling. The brief
 * is what the coordinator actually reads, so everything dropped on the way is reported as
 * truncation rather than silently omitted.
 * @param input - The semantic context of the event.
 * @param feedId - The feed the event belongs to.
 * @param clock - The clock used to decide freshness.
 * @param metadata - The source, origin, capture time and any extra ambiguity or stale reasons.
 * @returns Every field of the brief, including its rendered text and byte size.
 */
function buildSemanticBrief(
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
	const selection = capEntries([...context.selection], SEMANTIC_CONTEXT_LIMITS.selectionEntries);
	const ambiguity = capEntries(
		uniqueSorted([...context.ambiguity, ...extraAmbiguity.value]),
		SEMANTIC_CONTEXT_LIMITS.ambiguityEntries,
	);
	const truncated =
		context.truncated ||
		metadata.inputTruncated === true ||
		extraAmbiguity.truncated ||
		selection.truncated ||
		ambiguity.truncated;
	const freshness = freshnessAt(capturedAtMs, observedAtMs);
	const staleness = stalenessFor(context.staleReasons, freshness);
	const fitted = fitAggregate(
		copyContext(context),
		feedId,
		selection.entries,
		ambiguity.entries,
		context.description,
		freshness,
		staleness,
		truncated,
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
		board: {
			key: context.board.key,
			note: context.board.note,
		},
		pane: context.pane,
		version: context.board.version,
		selection: Object.freeze([...selection.entries]),
		claim: context.claim,
		doing: context.doing,
		cursor: context.cursor,
		description: context.description,
		freshness,
		truncated: fitted.truncated,
		ambiguity: Object.freeze([...ambiguity.entries]),
		staleness: deepFreeze(staleness),
		brief: fitted.brief,
		bytes: byteLength(fitted.brief),
	};
}

export { type BriefMetadata, buildSemanticBrief };
