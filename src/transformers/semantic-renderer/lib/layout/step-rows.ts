// How much of the page one message's row takes: its label, its pitch, and
// its note. A note is the caveat a sequence carries on one
// message (a branch, a loop's condition), so it is drawn whole under the message
// it qualifies, never truncated, and the message's row grows to hold it.

import type { FlowStep, MessageKind, SemanticFlow } from "@/shared/semantic-board/index";
import { NOTE_SIZE, TEXT_LINE_HEIGHT } from "@/transformers/semantic-renderer/lib/design";
import type { TextRun } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { measureNoteLines } from "@/transformers/semantic-renderer/lib/measurement";
import {
	ACTIVATION_HALF_WIDTH,
	COLUMN_GAP,
	MESSAGE_PITCH,
	SELF_LOOP_EXTENT,
	SELF_MESSAGE_PITCH,
	STEP_NOTE_GAP,
	STEP_NOTE_INSET,
	STEP_NOTE_MAX_WIDTH,
	STEP_NOTE_MIN_WIDTH,
	STEP_NOTE_PADDING_X,
	STEP_NOTE_PADDING_Y,
} from "@/transformers/semantic-renderer/lib/sequence-design";

/** A step's note, placed under its message. */
interface PlacedNote {
	/** The plate the words sit on. */
	readonly box: Box;
	/** Every line, complete, with baselines measured from the plate's inner top. */
	readonly lines: readonly TextRun[];
}

/** Where a message runs: the lifelines it leaves and reaches, and its height. */
interface MessageEnds {
	readonly fromX: number;
	readonly toX: number;
	readonly y: number;
}

/** The left and right edges of a flow's columns, which a note stays inside. */
interface ColumnBounds {
	readonly left: number;
	readonly right: number;
	readonly pitch: number;
	readonly firstCentre: number;
	readonly lastCentre: number;
}

/**
 * Measure one note against the minimum readable corridor.
 * @param note The authored explanation, if any.
 * @returns Its required plate width, or zero when there is no note.
 */
function minimumNoteWidth(note: string | undefined): number {
	if (!note?.trim()) return 0;
	const lines = measureNoteLines(
		note,
		STEP_NOTE_MIN_WIDTH - STEP_NOTE_PADDING_X * 2,
		NOTE_SIZE,
		NOTE_SIZE * TEXT_LINE_HEIGHT,
	);
	let painted = 0;
	for (const line of lines) painted = Math.max(painted, line.width);
	return Math.max(STEP_NOTE_MIN_WIDTH, Math.ceil(painted) + STEP_NOTE_PADDING_X * 2);
}

/**
 * The column width needed to leave a readable corridor for every note.
 * @param flows The exchanges sharing one column width.
 * @returns The required width, or zero when no step carries a note.
 */
function requiredNoteColumnWidth(flows: readonly SemanticFlow[]): number {
	let width = 0;
	for (const flow of flows) {
		for (const step of flow.steps) width = Math.max(width, minimumNoteWidth(step.note));
	}
	return width === 0 ? 0 : width + (ACTIVATION_HALF_WIDTH + STEP_NOTE_INSET) * 2 - COLUMN_GAP;
}

/**
 * Place a note in the next corridor, or the previous one for the last self-message.
 * @param step The message being explained.
 * @param ends Its participant centres and height.
 * @param bounds The available column corridors.
 * @returns The note's leading edge.
 */
function noteAnchor(step: FlowStep, ends: MessageEnds, bounds: ColumnBounds): number {
	const inset = ACTIVATION_HALF_WIDTH + STEP_NOTE_INSET;
	if (step.kind !== "self") return Math.min(ends.fromX, ends.toX) + inset;
	if (ends.fromX === bounds.lastCentre && bounds.firstCentre !== bounds.lastCentre) {
		return ends.fromX - bounds.pitch + inset;
	}
	return ends.fromX + inset;
}

/**
 * Where a step's note goes: under the message, starting where the message's
 * own words start (just past the lifeline for a loop, the left lifeline for a
 * crossing message), wrapped to the hop and held inside the flow's columns.
 * @param step The message.
 * @param ends Where the message runs.
 * @param bounds The flow's columns.
 * @returns The placed note, or nothing when the step has none.
 */
function placeNote(
	step: FlowStep,
	ends: MessageEnds,
	bounds: ColumnBounds,
): PlacedNote | undefined {
	if (step.note === undefined || step.note.trim() === "") {
		return undefined;
	}
	const self = step.kind === "self";
	const inset = ACTIVATION_HALF_WIDTH + STEP_NOTE_INSET;
	const corridorWidth = bounds.pitch - inset * 2;
	const wrapWidth = Math.min(
		bounds.right - bounds.left,
		STEP_NOTE_MAX_WIDTH,
		Math.max(STEP_NOTE_MIN_WIDTH, Math.abs(ends.toX - ends.fromX)),
		corridorWidth,
	);
	const lineHeight = NOTE_SIZE * TEXT_LINE_HEIGHT;
	const lines = measureNoteLines(
		step.note,
		wrapWidth - STEP_NOTE_PADDING_X * 2,
		NOTE_SIZE,
		lineHeight,
	);
	// The painted width wins over the wrap width, as it does on a card: whole-line
	// kerning can run a hair past the measure, and no word is cut to fit.
	let widest = 0;
	for (const run of lines) {
		widest = Math.max(widest, run.width);
	}
	const width = Math.ceil(widest) + STEP_NOTE_PADDING_X * 2;
	return {
		box: {
			x: Math.max(bounds.left, Math.min(noteAnchor(step, ends, bounds), bounds.right - width)),
			y: ends.y + (self ? SELF_LOOP_EXTENT : 0) + STEP_NOTE_GAP,
			width,
			height: lines.length * lineHeight + STEP_NOTE_PADDING_Y * 2,
		},
		lines,
	};
}

/**
 * The label as drawn: a repeated step says so rather than being drawn twice.
 * @param step The message.
 * @returns Its label, with the repeat count folded in.
 */
function labelFor(step: FlowStep): string {
	return step.repeat === undefined ? step.label : `${step.label} ×${step.repeat}`;
}

/**
 * The vertical step from one message to the next. A self-message needs more,
 * because it drops below its own row before it comes back.
 * @param kind What the message does.
 * @returns The pitch of its row.
 */
function pitchOf(kind: MessageKind): number {
	return kind === "self" ? SELF_MESSAGE_PITCH : MESSAGE_PITCH;
}

export {
	type ColumnBounds,
	type PlacedNote,
	labelFor,
	pitchOf,
	placeNote,
	requiredNoteColumnWidth,
};
