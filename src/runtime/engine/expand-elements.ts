// The one conversion, in one direction, at one boundary (ADR 0015).
//
// An agent writes `{"type":"rectangle","label":{"text":"AuthService"}}`.
// Excalidraw has no `label` field: a label there is a separate text element
// bound to the shape, with a measured width, a computed position and about
// thirty other properties. Something has to turn one into the other.
//
// There used to be two somethings. This one, on the way into a note, and
// Excalidraw's own `convertToExcalidrawElements` in the browser on the way
// into a pane — a converter we did not control, which we then corrected
// locally.
// Given one board of nine elements the two produced documents differing on
// fourteen fields. Divergence between two copies of one thing is invisible
// until it is expensive, and it was: a label that multiplied every time the
// board went round the loop, a rename that came back, a cleared label that
// refilled itself, a label that drifted a thousand pixels from its arrow.
//
// So there is one of these, it runs on the way in, and nothing converts on the
// way out. What a reader gets is what Excalidraw renders.
//
// WHAT "CORRECT" MEANS HERE. Not "matches what `convertToExcalidrawElements`
// would have produced" — that converter is gone, and eight of the fourteen
// differences turned out to describe its own fallbacks rather than anything
// Excalidraw insists on. The property is that a document we write is a fixed
// point: rendered in a real browser, nothing comes back changed.
// `tests/system/browser/fixed-point-document.test.ts` is that check and it is the arbiter.
//
// Measured with that check, against this version of Excalidraw, the only
// thing a render rewrites is `index` — so the defaults (lib/expand-elements-
// completion.ts) come from Excalidraw's own `DEFAULT_ELEMENT_PROPS` and
// `AppState` rather than from a second converter's output, and they are the
// values a shape a user drew would carry.

import { type ServerElement } from "@/runtime/engine/types";
import { boundTextsByContainer } from "@/runtime/engine/labels";
import { agentLabelIntentOf, withAgentLabelIntent } from "@/runtime/engine/lib/agent-element-input";
import { attachArrowRefs } from "@/runtime/engine/lib/expand-elements-arrow-refs";
import { canonicalizeKeys } from "@/runtime/engine/lib/expand-elements-canonical-keys";
import {
	completeFreedrawFields,
	completeImageFields,
	completeLinearFields,
	completeTextFields,
	makeBaseElement,
	stampsFor,
} from "@/runtime/engine/lib/expand-elements-completion";
import { settleDeletions } from "@/runtime/engine/lib/expand-elements-deletions";
import { type LabelContext, appendLabel } from "@/runtime/engine/lib/expand-elements-labels";
import {
	fractionalIndex,
	indexPosition,
	repairIndices,
	restateIndices,
	settledIndices,
} from "@/runtime/engine/lib/expand-elements-z-order";
import { validatePersistedBoardElement } from "@/runtime/engine/lib/native-element";
import { stringAt } from "@/runtime/engine/lib/unknown-record";
import type { LegacyElementIngress, RuntimeBoardElement } from "@/shared/board-elements";
import type { IdsInUse } from "@/shared/ids/ids";

interface ExpandOptions {
	// Derive seeds, versionNonces, and `updated` timestamps from element ids
	// and updatedAt instead of Math.random()/Date.now(), so repeated exports
	// of an unchanged scene are byte-identical (keeps committed .excalidraw
	// files diff-clean).
	deterministic?: boolean;
	/**
	 * Elements bound for the board's own map rather than for a file.
	 *
	 * The difference is bookkeeping, not conversion: the store keeps
	 * `createdAt`, `updatedAt`, `source` and the server's `version`. The
	 * conversion either way is this one, and neither way keeps a seed — not a
	 * `label`, and not an arrow's `start` and `end`.
	 */
	forStore?: boolean;
	/**
	 * Keep that bookkeeping without the rest of `forStore`.
	 *
	 * A board's note is where the board lives (ADR 0015), so it has to hold
	 * everything the board is, and that includes one field nothing else can
	 * recover: `source`, which says a human drew an element rather than an
	 * agent, and which `describe` reports and `compare` reads. What an arrow
	 * joins is not in that class — it is in `startBinding` and `endBinding`,
	 * which are Excalidraw's own fields and go into the note as themselves.
	 *
	 * Not `forStore`, because a note is a whole document: its z-order is restated
	 * and its labels are expanded, neither of which a partial write wants. And
	 * not on by default, because `export --out` writes a file for another tool,
	 * where archboard's bookkeeping is noise.
	 */
	keepServerFields?: boolean;
	/** Ids already spoken for elsewhere, so an expanded label cannot take one. */
	inUse?: IdsInUse;
}

// Server-only fields. They are stripped before conversion and come back at
// the end when the elements are going to the board's own map rather than to
// a file, because there that bookkeeping is the point.
const SERVER_FIELDS = ["createdAt", "updatedAt", "syncedAt", "source", "syncTimestamp", "version"];

/**
 * The input element as a record, and the same record without its server
 * fields.
 * @param el The input element.
 * @returns The full record and the conversion's input fields.
 */
function splitServerFields(el: LegacyElementIngress): {
	source: Record<string, unknown>;
	rest: Record<string, unknown>;
} {
	const source: Record<string, unknown> = Object.fromEntries(Object.entries(el));
	const rest = { ...source };
	for (const key of SERVER_FIELDS) {
		delete rest[key];
	}
	return { source, rest };
}

/**
 * Put the server fields the input carried back on the converted element.
 *
 * Nothing here restores `label`, `text` on anything that is not a text
 * element, or an arrow's `start` and `end`. All of them are the seed, and
 * the seed is an input format: it has been read by now, and what it said
 * is a text element and a binding on the board. Storing it too would be
 * one fact spelled twice, which is what needed a rule for which spelling
 * wins, which is what TASK-024, TASK-028 and TASK-029 each were
 * (TASK-073), and what TASK-088 was when a human re-bound an arrow and
 * the ref went on naming the shape they had dragged it off.
 * @param element The converted element, edited in place.
 * @param source The input element with its server fields.
 * @returns The same element.
 */
function restoreServerFields(
	element: Record<string, unknown>,
	source: Record<string, unknown>,
): Record<string, unknown> {
	for (const key of SERVER_FIELDS) {
		if (source[key] !== undefined) {
			element[key] = source[key];
		}
	}
	return element;
}

/**
 * Complete the fields one element type carries beyond the shared ones.
 * @param el The input element.
 * @param base The element being completed.
 * @param rest The input fields.
 */
function completeTypeFields(
	el: LegacyElementIngress,
	base: Record<string, unknown>,
	rest: Record<string, unknown>,
): void {
	// An arrow ends where its bindings say. A scene from a browser or a note
	// already carries them; an agent says `start: { id }`, which is the input
	// spelling of the same thing and becomes a binding here, through the one
	// conversion `arrow-binding.ts` holds. From here on the binding is all
	// anything reads, including the server's own routing (TASK-088).
	if (el.type === "arrow" || el.type === "line") {
		completeLinearFields(base, rest, el.type);
	} else if (el.type === "freedraw") {
		completeFreedrawFields(base, rest);
	} else if (el.type === "image") {
		completeImageFields(base, rest);
	}
}

/**
 * Convert one input element: strip the server fields, complete the shared
 * and type-specific fields, expand its label, and restore the bookkeeping
 * when the element is going to the board.
 * @param el The input element.
 * @param context The conversion.
 * @param keepServerFields Whether the server fields come back.
 * @returns The converted element; any label it expanded is queued on the context.
 */
function convertElement(
	el: LegacyElementIngress,
	context: LabelContext,
	keepServerFields: boolean,
): Record<string, unknown> {
	const { source, rest } = splitServerFields(el);
	const base = makeBaseElement(source, rest, context.stamps);
	if (el.type === "text") {
		// Standalone text elements keep their text directly.
		completeTextFields(base, rest);
	} else {
		completeTypeFields(el, base, rest);
		appendLabel(el, base, rest, agentLabelIntentOf(el), context);
	}
	return keepServerFields ? restoreServerFields(base, source) : base;
}

/**
 * The conversion. There is one of it, and this is it (ADR 0015).
 *
 * It was called `expandElementsForExport` until TASK-089 went looking for two
 * implementations of one thing and found the name instead: every board write
 * goes through here as well, by way of `expandForBoard` below, so "for export"
 * described half of what it does. `options.forStore` is the half it left out.
 *
 * Called two ways, and neither is a second implementation of anything:
 *
 *   · over a whole document, by `scene-document` on the way to a note and by
 *     `share-url` on the way to a URL. The whole element list is available, so
 *     z-order is restated across the lot.
 *   · over one write, through `expandForBoard`, which is this call with
 *     `forStore` and one thing done first.
 *
 * So the two cannot disagree about the same input, which is the property
 * ADR 0015 asks for and the reason `readBoardFile` and `readNote` were a real
 * problem while this pair was not.
 * @param sourceElements The elements as written.
 * @param options How the conversion is stamped and what it keeps.
 * @returns The converted elements, labels after their containers.
 */
function expandElements(
	sourceElements: LegacyElementIngress[],
	options: ExpandOptions = {},
): RuntimeBoardElement[] {
	const { deterministic = false, forStore = false, keepServerFields = forStore } = options;
	// Every name the scene already spends, so a label expanded here cannot be
	// handed one of them. `inUse` carries the rest of the board when this is
	// converting one write rather than a whole scene.
	const named = new Set<string>(sourceElements.map((el) => el.id));
	const context: LabelContext = {
		forStore,
		sourceElements,
		named,
		taken: {
			/**
			 * Whether an id is spent here or elsewhere on the board.
			 * @param id The id.
			 * @returns True when spent.
			 */
			has: (id: string) => named.has(id) || (options.inUse?.has(id) ?? false),
		},
		stamps: stampsFor(deterministic),
		boundTextElements: [],
	};
	const converted = sourceElements.map((el) => convertElement(el, context, keepServerFields));
	attachArrowRefs(converted);
	// Bound text elements follow their parents.
	converted.push(...context.boundTextElements);
	// Not restated for the store, where a write names a few elements and the
	// board holds the rest: settling a partial document's indices would
	// renumber it against elements it cannot see.
	const ordered = forStore ? converted : restateIndices(converted);
	return validated(ordered, deterministic);
}

/**
 * The converted elements checked against the persisted shape, in canonical
 * key order when the conversion is deterministic.
 * @param elements The converted elements.
 * @param deterministic Whether the output must be byte-stable.
 * @returns The validated elements.
 */
function validated(
	elements: readonly Record<string, unknown>[],
	deterministic: boolean,
): RuntimeBoardElement[] {
	const checked = elements.map((element) =>
		validatePersistedBoardElement(
			element,
			`write ingress element ${stringAt(element, "id") ?? ""}`,
		),
	);
	if (!deterministic) {
		return checked;
	}
	// canonicalizeKeys copies a value changing only the order of its keys, so
	// a validated element stays the element the validator returned.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- key order is the only difference
	return canonicalizeKeys(checked) as RuntimeBoardElement[];
}

/**
 * A `boundElements` entry from a written element.
 */
type WrittenRef = NonNullable<LegacyElementIngress["boundElements"]>[number];

/**
 * One written element squared against the labels the board already holds.
 *
 * A container whose label the board already holds keeps it, whichever
 * direction the binding is recorded in. A binding is written down twice and
 * either half can be the one that survives: the text names its container in
 * `containerId`, the container names its text in `boundElements`. A pane
 * reports the text the instant a person types into it while the container
 * has nothing new to say; a note edited by a user or a scene imported from
 * elsewhere can arrive with one end missing outright. The expansion looks at
 * the container's end only, so on such a board a write carrying a label
 * would read as a label nobody had expanded, and it would expand a second
 * one. Deleting the seed narrowed this without removing it: the write that
 * trips it is now always one carrying a label of its own, which means a
 * rename. Taking it out fails three checks in
 * `src/runtime/engine/tests/label-input.test.ts` (TASK-073).
 * @param element The written element.
 * @param labelled Live bound texts per container on the board.
 * @param board The board.
 * @param writtenTextIds Text elements the write itself carries.
 * @returns The element, replaced when its refs had to change.
 */
function mendLabelRefs(
	element: LegacyElementIngress,
	labelled: ReadonlyMap<string, string[]>,
	board: ReadonlyMap<string, ServerElement>,
	writtenTextIds: ReadonlySet<string>,
): LegacyElementIngress {
	const textIds = labelled.get(element.id) ?? [];
	const refs = Array.isArray(element.boundElements) ? element.boundElements : [];
	const live = liveRefs(refs, textIds, board, writtenTextIds);
	const named = live.some((ref) => ref.type === "text" && textIds.includes(ref.id));
	const firstTextId = textIds[0];
	if (named || firstTextId === undefined) {
		return withLiveRefs(element, live, refs.length);
	}
	return keepingIntent(element, {
		...element,
		boundElements: [...live, { id: firstTextId, type: "text" }],
	});
}

/**
 * A replacement for a written element that keeps the label the agent asked
 * for, which lives beside the element rather than in it.
 * @param element The written element.
 * @param value The replacement.
 * @returns The replacement carrying the label intent.
 */
function keepingIntent(
	element: LegacyElementIngress,
	value: LegacyElementIngress,
): LegacyElementIngress {
	return withAgentLabelIntent(value, agentLabelIntentOf(element));
}

/**
 * The element with only its live refs, or the element itself when none were
 * dropped.
 * @param element The written element.
 * @param live The refs that point at something.
 * @param written How many refs the element carried.
 * @returns The element, replaced only when a ref was dropped.
 */
function withLiveRefs(
	element: LegacyElementIngress,
	live: WrittenRef[],
	written: number,
): LegacyElementIngress {
	if (live.length === written) {
		return element;
	}
	return keepingIntent(element, { ...element, boundElements: live.length > 0 ? live : null });
}

/**
 * The refs worth keeping. A reference to a text element the board does not
 * hold is not a label, and leaving it would suppress the real one.
 * @param refs The written element's refs.
 * @param textIds The board's labels for the element.
 * @param board The board.
 * @param writtenTextIds Text elements the write itself carries.
 * @returns The refs that point at something.
 */
function liveRefs(
	refs: readonly WrittenRef[],
	textIds: readonly string[],
	board: ReadonlyMap<string, ServerElement>,
	writtenTextIds: ReadonlySet<string>,
): WrittenRef[] {
	return refs.filter(
		(ref) =>
			ref.type !== "text" ||
			textIds.includes(ref.id) ||
			board.has(ref.id) ||
			writtenTextIds.has(ref.id),
	);
}

/**
 * One agent write, converted against the board it lands on.
 *
 * This is the boundary ADR 0015 names, and the two callers that matter both go
 * through it — the server application on every agent write, and
 * `src/runtime/engine/tests/label-input.test.ts`,
 * which runs the label loop to exhaustion and would prove nothing about a copy
 * of this. What comes back is the elements handed in, now complete, followed
 * by any label the conversion had to expand.
 *
 * **It is not a second conversion and it does none of the converting.** All of
 * that is `expandElements` above, which this calls. What is here is the one
 * thing a partial write needs and a whole document does not: a write names a
 * few elements and the board holds the rest, so a reference to a text element
 * has to be squared against the board before anything can ask whether a
 * container already has a label. Given the whole document that question
 * answers itself, which is why the other entry point never asks it.
 *
 * TASK-089 went looking for two implementations meant to agree and this pair
 * was on the list. They are not two: one calls the other, so no input can get
 * two answers out of them, and `src/runtime/engine/tests/label-input.test.ts`
 * asserts it rather than leaving
 * this paragraph to hold the line on its own.
 * @param written The elements the write names.
 * @param board The board they land on.
 * @returns The written elements, complete, then any expanded labels.
 */
function expandForBoard(
	written: LegacyElementIngress[],
	board: ReadonlyMap<string, ServerElement>,
): ServerElement[] {
	if (written.length === 0) {
		return [];
	}
	const labelled = boundTextsByContainer([...board.values()]);
	const writtenTextIds = new Set(
		written.filter((element) => element.type === "text").map((element) => element.id),
	);
	const mended = written.map((element) => mendLabelRefs(element, labelled, board, writtenTextIds));
	return expandElements(mended, {
		forStore: true,
		inUse: {
			/**
			 * Whether the board already holds an id.
			 * @param id The id.
			 * @returns True when held.
			 */
			has: (id: string) => board.has(id),
		},
	});
}

/**
 * The board's text element for a container whose label now says something
 * else, when it has one and the text differs.
 * @param container The written container.
 * @param labelled Live bound texts per container on the board.
 * @param board The board.
 * @returns The text element and the wanted text, or null when nothing changes.
 */
function renamedLabel(
	container: LegacyElementIngress,
	labelled: ReadonlyMap<string, string[]>,
	board: ReadonlyMap<string, ServerElement>,
): { existing: Extract<ServerElement, { type: "text" }>; wanted: string } | null {
	const wanted = labelIntentOf(container);
	if (wanted === undefined) {
		return null;
	}
	const existing = labelTextOn(board, labelled.get(container.id)?.[0]);
	if (existing?.type !== "text" || existing.text === wanted) {
		return null;
	}
	return { existing, wanted };
}

/**
 * The label an agent asked for on a container; a text element labels nothing.
 * @param container The written element.
 * @returns The label text, or undefined.
 */
function labelIntentOf(container: LegacyElementIngress): string | undefined {
	return container.type === "text" ? undefined : agentLabelIntentOf(container);
}

/**
 * The board's element for a label id, when there is one.
 * @param board The board.
 * @param textId The label's id, when the container has a label.
 * @returns The element, or undefined.
 */
function labelTextOn(
	board: ReadonlyMap<string, ServerElement>,
	textId: string | undefined,
): ServerElement | undefined {
	return textId === undefined ? undefined : board.get(textId);
}

/**
 * A label that now says something else, as the text element it has to become.
 *
 * Expansion only ever mints a text element for a container that has none, so a
 * rename would otherwise leave the seed and the text element disagreeing —
 * which is TASK-028, where a human's rename kept coming back. The text element
 * is the label, so the rename is written into it, and it is re-measured on the
 * way through. Nothing is stored here; the caller owns the board.
 * @param written The elements the write names.
 * @param board The board they land on.
 * @returns The re-measured text elements for every renamed label.
 */
function relabelBoundTexts(
	written: readonly LegacyElementIngress[],
	board: ReadonlyMap<string, ServerElement>,
): ServerElement[] {
	const labelled = boundTextsByContainer([...board.values()]);
	const relabelled: ServerElement[] = [];
	for (const container of written) {
		const renamed = renamedLabel(container, labelled, board);
		if (renamed === null) {
			continue;
		}
		const [remeasured] = expandForBoard(
			[{ ...renamed.existing, text: renamed.wanted, originalText: renamed.wanted }],
			board,
		);
		if (remeasured) {
			relabelled.push(remeasured);
		}
	}
	return relabelled;
}

export {
	type ExpandOptions,
	canonicalizeKeys,
	expandElements,
	expandForBoard,
	fractionalIndex,
	indexPosition,
	relabelBoundTexts,
	repairIndices,
	settleDeletions,
	settledIndices,
};
