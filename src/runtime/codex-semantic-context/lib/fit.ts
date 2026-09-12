// Fitting a brief under its byte ceiling.
//
// A brief is what an agent actually reads, so everything dropped on the way has
// to be reported rather than quietly omitted. A brief that already fits is kept
// exactly as it is; one that does not gives up its lists first, reduces every
// text field to its minimum, and then buys each of them back in a reviewed
// order. The two qualified cursor identities are never trimmed: a brief that
// cannot say which cursor it belongs to is not a usable brief, so it is refused
// instead.
//
// Apart from `brief.ts` because building a brief and squeezing one are two
// jobs, and the slot table for the second is most of a file on its own.

import { SEMANTIC_CONTEXT_LIMITS } from "@/runtime/codex-semantic-context/lib/limits";
import {
	byteLength,
	clipJsonUtf8,
	fail,
	jsonStringByteLength,
	type NormalizedContext,
} from "@/runtime/codex-semantic-context/lib/normalize";
import type {
	SemanticArchitecture,
	SemanticDifference,
	SemanticFreshness,
	SemanticIssue,
	SemanticStaleness,
	SemanticSubject,
} from "@/runtime/codex-semantic-context/lib/types";
import { descriptiveSlots, textSlots } from "@/runtime/codex-semantic-context/lib/slots";

interface MutableArchitecture {
	variant: SemanticArchitecture["variant"];
	view: SemanticArchitecture["view"];
	selection: { count: number; subjects: SemanticSubject[] };
	differences: {
		added: number;
		removed: number;
		changed: number;
		subjects: SemanticDifference[];
	} | null;
	reconciliation: {
		required: boolean;
		count: number;
		blockedBy: string | null;
		issues: SemanticIssue[];
	};
}

type BriefContext = {
	-readonly [Key in keyof NormalizedContext]: Key extends "architecture"
		? MutableArchitecture
		: NormalizedContext[Key];
};

interface FitParts {
	readonly context: BriefContext;
	readonly feedId: string;
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
	const architecture = context.architecture;
	return {
		...context,
		child: { ...context.child },
		threadLink: { ...context.threadLink },
		workhorse: { ...context.workhorse },
		coordinator: { ...context.coordinator },
		board: { ...context.board },
		pane: { ...context.pane },
		architecture: {
			variant: architecture.variant === null ? null : { ...architecture.variant },
			view: architecture.view === null ? null : { ...architecture.view },
			selection: { ...architecture.selection, subjects: [...architecture.selection.subjects] },
			differences:
				architecture.differences === null
					? null
					: { ...architecture.differences, subjects: [...architecture.differences.subjects] },
			reconciliation: {
				...architecture.reconciliation,
				issues: [...architecture.reconciliation.issues],
			},
		},
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
		"feedId" | "ambiguity" | "description" | "freshness" | "staleness" | "truncated"
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
		architecture: context.architecture,
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
function fitArray<Entry>(
	parts: FitParts,
	context: BriefContext,
	original: readonly Entry[],
	set: (value: Entry[]) => void,
): void {
	const fitted: Entry[] = [];
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

/** Every list a brief can give up, in the order room is bought back for them. */
interface Lists {
	readonly selection: SemanticSubject[];
	readonly issues: SemanticIssue[];
	readonly differences: SemanticDifference[];
	readonly ambiguity: string[];
	readonly staleReasons: string[];
}

/**
 * Fit the whole brief under its byte ceiling. A brief that already fits is kept as it is; otherwise the lists are dropped, every text field is reduced to its minimum, and the freed room is given back field by field. The two qualified cursor identities are never trimmed: a brief that cannot hold them is refused, because a brief that cannot say which cursor it belongs to is not usable.
 * @param context - The context to render, whose architecture lists are fitted in place.
 * @param feedId - The feed the brief belongs to.
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
	ambiguity: string[],
	description: string,
	freshness: SemanticFreshness,
	staleness: SemanticStaleness,
	truncated: boolean,
): FitParts & { readonly brief: string } {
	const parts: FitParts = {
		context,
		feedId,
		ambiguity,
		description,
		freshness,
		staleness: { state: staleness.state, reasons: [...staleness.reasons] },
		truncated,
	};
	const originals = listsOf(context, parts);
	const brief = render(context, parts);
	if (byteLength(brief) <= SEMANTIC_CONTEXT_LIMITS.briefBytes) {
		return { ...parts, brief };
	}
	parts.truncated = true;
	emptyLists(context, parts);
	// Both qualified identities stay exact. The remaining slots fit around them.
	return squeeze(context, parts, originals, textSlots(context));
}

/**
 * Every list a brief can give up, copied before anything is emptied.
 * @param context - The context being fitted.
 * @param parts - The parts being fitted.
 * @returns The lists, in the order they are bought back.
 */
function listsOf(context: BriefContext, parts: FitParts): Lists {
	return {
		selection: [...context.architecture.selection.subjects],
		issues: [...context.architecture.reconciliation.issues],
		differences: [...(context.architecture.differences?.subjects ?? [])],
		ambiguity: [...parts.ambiguity],
		staleReasons: [...parts.staleness.reasons],
	};
}

/**
 * Give up every list at once, so the fixed fields can be measured on their own.
 * @param context - The context being fitted.
 * @param parts - The parts being fitted.
 */
function emptyLists(context: BriefContext, parts: FitParts): void {
	const differences = context.architecture.differences;
	context.architecture.selection.subjects = [];
	context.architecture.reconciliation.issues = [];
	if (differences !== null) {
		differences.subjects = [];
	}
	parts.ambiguity = [];
	parts.staleness.reasons = [];
}

/**
 * Refuse a brief that cannot hold the two qualified cursor identities: a brief
 * that cannot say which cursor it belongs to is not a usable brief.
 * @param context - The context being fitted.
 * @param parts - The parts being fitted.
 * @returns The rendered brief.
 */
function rendered(context: BriefContext, parts: FitParts): string {
	const brief = render(context, parts);
	if (byteLength(brief) > SEMANTIC_CONTEXT_LIMITS.briefBytes) {
		fail(
			"brief",
			`qualified cursor identities exceed ${SEMANTIC_CONTEXT_LIMITS.briefBytes} UTF-8 bytes`,
		);
	}
	return brief;
}

/**
 * Reduce every text field to its minimum, prove the result fits at all, then
 * buy back text and lists in the reviewed order.
 * @param context - The context being fitted.
 * @param parts - The parts being fitted.
 * @param originals - The lists as they were before anything was emptied.
 * @param slots - The text fields that can be shortened.
 * @returns The fitted parts and the rendered brief.
 */
function squeeze(
	context: BriefContext,
	parts: FitParts,
	originals: Lists,
	slots: readonly TextSlot[],
): FitParts & { readonly brief: string } {
	const describing = descriptiveSlots(context, parts);
	for (const slot of [...slots, ...describing]) {
		slot.set(slot.minimum);
	}
	rendered(context, parts);
	// The selected identities first, before any text is given room back. They are
	// what an agent acts on, and they are short; the identity slots below are
	// display text whose minimum — an ellipsis — still leaves the brief valid. A
	// maximal repository path and board path together exceed the whole brief, so
	// refilling them first is how a single selected node gets squeezed out by
	// paths nobody is going to act on.
	fitArray(parts, context, originals.selection, (value) => {
		context.architecture.selection.subjects = value;
	});
	for (const slot of slots) {
		fitTextSlot(parts, context, slot);
	}
	// Then the remaining lists, still before any prose: what is unsettled is what
	// the agent has to do next, and the differences are the reading it can recover
	// by asking for a comparison.
	fitArray(parts, context, originals.issues, (value) => {
		context.architecture.reconciliation.issues = value;
	});
	fitArray(parts, context, originals.differences, (value) => {
		const differences = context.architecture.differences;
		if (differences !== null) {
			differences.subjects = value;
		}
	});
	// Only now the prose, with whatever the identities and the lists left.
	for (const slot of describing) {
		fitTextSlot(parts, context, slot);
	}
	fitArray(parts, context, originals.ambiguity, (value) => {
		parts.ambiguity = value;
	});
	fitArray(parts, context, originals.staleReasons, (value) => {
		parts.staleness.reasons = value;
	});
	return { ...parts, brief: rendered(context, parts) };
}

export { type BriefContext, type FitParts, type TextSlot, copyContext, fitAggregate };
