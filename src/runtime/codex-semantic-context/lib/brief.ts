import { CODEX_SEMANTIC_FRESHNESS_MS } from "@/shared/timing/timing";
import { SEMANTIC_CONTEXT_LIMITS } from "@/runtime/codex-semantic-context/lib/limits";
import { copyContext, fitAggregate } from "@/runtime/codex-semantic-context/lib/fit";
import {
	boundedReasons,
	byteLength,
	deepFreeze,
	fail,
	normalizeContext,
	uniqueSorted,
} from "@/runtime/codex-semantic-context/lib/normalize";
import type {
	SemanticArchitecture,
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

/**
 * Cap a list at the reviewed number of entries, reporting whether anything was dropped so the
 * brief can say it was truncated rather than quietly showing less than happened.
 * @param entries - The entries in order.
 * @param maximum - The reviewed ceiling.
 * @returns The kept entries and whether any were dropped.
 */
function capEntries<Entry>(
	entries: readonly Entry[],
	maximum: number,
): { readonly entries: Entry[]; readonly truncated: boolean } {
	return entries.length > maximum
		? { entries: entries.slice(0, maximum), truncated: true }
		: { entries: [...entries], truncated: false };
}

/**
 * Cap the named differences, keeping the counts they were taken from whole.
 * @param differences - The normalized differences, or null for a root variant.
 * @returns The capped differences and whether anything was dropped.
 */
function capDifferences(differences: SemanticArchitecture["differences"]): {
	readonly differences: SemanticArchitecture["differences"];
	readonly truncated: boolean;
} {
	if (differences === null) {
		return { differences: null, truncated: false };
	}
	const subjects = capEntries(differences.subjects, SEMANTIC_CONTEXT_LIMITS.differenceEntries);
	return {
		differences: { ...differences, subjects: subjects.entries },
		truncated: subjects.truncated,
	};
}

/**
 * Cap the architecture block's three lists, keeping the difference counts whole:
 * a count is what tells an agent that the list it can see is not all of it.
 * @param architecture - The normalized architecture.
 * @returns The capped architecture and whether anything was dropped.
 */
function capArchitecture(architecture: SemanticArchitecture): {
	readonly architecture: SemanticArchitecture;
	readonly truncated: boolean;
} {
	const selection = capEntries(
		architecture.selection.subjects,
		SEMANTIC_CONTEXT_LIMITS.selectionEntries,
	);
	const issues = capEntries(
		architecture.reconciliation.issues,
		SEMANTIC_CONTEXT_LIMITS.issueEntries,
	);
	const differences = capDifferences(architecture.differences);
	return {
		architecture: {
			variant: architecture.variant,
			view: architecture.view,
			// The count is never capped: it is what says the dropped subjects existed.
			selection: { ...architecture.selection, subjects: selection.entries },
			differences: differences.differences,
			// The summary is never capped: it is what says the dropped issues existed.
			reconciliation: { ...architecture.reconciliation, issues: issues.entries },
		},
		truncated: selection.truncated || issues.truncated || differences.truncated,
	};
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
/**
 * Refuse a non-finite time: a brief's freshness is arithmetic on timestamps, so an infinite or NaN
 * one would make freshness meaningless rather than wrong.
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
	const capped = capArchitecture(context.architecture);
	const ambiguity = capEntries(
		uniqueSorted([...context.ambiguity, ...extraAmbiguity.value]),
		SEMANTIC_CONTEXT_LIMITS.ambiguityEntries,
	);
	const truncated =
		context.truncated ||
		metadata.inputTruncated === true ||
		extraAmbiguity.truncated ||
		capped.truncated ||
		ambiguity.truncated;
	const freshness = freshnessAt(capturedAtMs, observedAtMs);
	const staleness = stalenessFor(context.staleReasons, freshness);
	const fitted = fitAggregate(
		copyContext({ ...context, architecture: capped.architecture }),
		feedId,
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
			name: context.board.name,
			file: context.board.file,
		},
		pane: context.pane,
		version: context.board.version,
		// What the brief actually carries, after fitting: an agent told a subject
		// is selected must be able to find it in the bytes it was sent.
		architecture: deepFreeze(fitted.context.architecture),
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
