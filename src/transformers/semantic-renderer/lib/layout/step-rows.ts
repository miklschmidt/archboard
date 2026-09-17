// How much of the page one message's row takes: its label, its pitch, and
// its note. A note is the caveat a sequence carries on one
// message (a branch, a loop's condition), so it is drawn whole under the message
// it qualifies, never truncated, and the message's row grows to hold it.

import type { FlowStep, MessageKind } from "@/shared/semantic-board/index";
import { NOTE_SIZE, TEXT_LINE_HEIGHT } from "@/transformers/semantic-renderer/lib/design";
import type { TextRun } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { measureNoteLines } from "@/transformers/semantic-renderer/lib/measurement";
import {
	ACTIVATION_HALF_WIDTH,
	MESSAGE_PITCH,
	SELF_LABEL_GAP,
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
	const wrapWidth = Math.min(
		bounds.right - bounds.left,
		STEP_NOTE_MAX_WIDTH,
		Math.max(STEP_NOTE_MIN_WIDTH, Math.abs(ends.toX - ends.fromX)),
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
	const anchor = self
		? ends.fromX + ACTIVATION_HALF_WIDTH + SELF_LABEL_GAP
		: Math.min(ends.fromX, ends.toX) + STEP_NOTE_INSET;
	return {
		box: {
			x: Math.max(bounds.left, Math.min(anchor, bounds.right - width)),
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

export { type ColumnBounds, type PlacedNote, labelFor, pitchOf, placeNote };
