// Every step of one flow, stacked down the page in the order it is stated.
//
// A message takes a row. A decision or loop takes a frame (ADR 0053): a head
// row with its operator and its question or condition, then what it holds, and
// for a decision a labelled row at the start of each alternative, parted from
// the one before by a dashed line. The steps after a decision run below every
// alternative, which is how a sequence says that the alternatives rejoin.
//
// Only heights are decided here. A frame's sides come from the ink of what it
// holds, which is known once every column's bars are (`frames.ts`).

import { isMessage, type FlowMessage, type FlowStep } from "@archboard/board/flow";
import {
	FRAME_GAP,
	FRAME_GUARD_HEIGHT,
	FRAME_HEAD_HEIGHT,
	MAX_PULSES_PER_STEP,
	MESSAGE_LINE_STEP,
	MESSAGE_PITCH,
	SELF_LOOP_EXTENT,
	STEP_NOTE_GAP,
} from "#shared/rules/layout/sequence/sequence-design.ts";
import {
	labelFor,
	pitchOf,
	placeNote,
	wordsFor,
	type ColumnBounds,
} from "#shared/rules/layout/sequence/step-rows.ts";
import type { FrameGuard, FrameRows } from "#shared/rules/layout/sequence/frames.ts";
import type { PlacedStep } from "#shared/rules/layout/sequence/dataflow.ts";

/** What the walk down one flow has placed so far, and where it has got to. */
interface Placing {
	/** Where each participant's lifeline runs. */
	readonly centreOf: ReadonlyMap<string, number>;
	/** The flow's columns, which a note stays inside. */
	readonly bounds: ColumnBounds;
	/** The messages placed, in document order. */
	readonly steps: PlacedStep[];
	/** The frames closed, each after the frames inside it. */
	readonly frames: FrameRows[];
	/** The height the next message runs at. */
	y: number;
	/** The next turn of the drawing's clock. */
	turn: number;
}

/** Where the walk stands: inside which alternative of every decision that holds it. */
type Branch = ReadonlyMap<string, string>;

/**
 * The top of the row a message running at a height stands in.
 * @param y The height its line runs at.
 * @returns The top of its row.
 */
function rowTop(y: number): number {
	return y - MESSAGE_PITCH / 2;
}

/**
 * Place one message on its row and move the walk below it.
 * @param step The message.
 * @param placing The walk; its cursor and its messages grow.
 * @param branch The alternatives that hold it.
 */
function placeMessage(step: FlowMessage, placing: Placing, branch: Branch): void {
	const count = Math.min(step.repeat ?? 1, MAX_PULSES_PER_STEP);
	const fromX = placing.centreOf.get(step.from) ?? 0;
	const toX = placing.centreOf.get(step.to) ?? 0;
	const words = wordsFor(step, { fromX, toX, y: placing.y }, placing.bounds);
	// A label stands above its arrow, so every line past the first lowers the row.
	const y = placing.y + (words.lines.length - 1) * MESSAGE_LINE_STEP;
	const note = placeNote(step, { fromX, toX, y }, placing.bounds);
	placing.steps.push({
		step,
		label: labelFor(step),
		words,
		y,
		fromX,
		toX,
		note,
		branch,
		slot: { start: placing.turn, count },
	});
	placing.turn += count;
	// The row grows by the note it holds, so the next message's words sit
	// where they would have without it, only lower.
	placing.y = y + pitchOf(step.kind) + (note === undefined ? 0 : note.box.height + STEP_NOTE_GAP);
}

/**
 * Place a run of steps in order.
 * @param steps The steps.
 * @param placing The walk.
 * @param branch The alternatives that hold them.
 */
function placeAll(steps: readonly FlowStep[], placing: Placing, branch: Branch): void {
	for (const step of steps) {
		if (isMessage(step)) {
			placeMessage(step, placing, branch);
		} else {
			placeFrame(step, placing, branch);
		}
	}
}

/**
 * Place one decision or loop: its head row, what it holds, and its foot, and
 * close its frame.
 * @param step The decision or loop.
 * @param placing The walk.
 * @param branch The alternatives that hold it.
 */
function placeFrame(step: Exclude<FlowStep, FlowMessage>, placing: Placing, branch: Branch): void {
	const top = rowTop(placing.y) + FRAME_GAP;
	const holding = { messages: placing.steps.length, frames: placing.frames.length };
	placing.y = top + FRAME_HEAD_HEIGHT + FRAME_GAP / 2 + MESSAGE_PITCH / 2;
	const guards = step.kind === "decision" ? placeAlternatives(step, placing, branch) : [];
	if (step.kind === "loop") {
		placeAll(step.steps, placing, branch);
	}
	const bottom = rowTop(placing.y) + FRAME_GAP;
	// The next message's words stand above its arrow, so they need the gap as well.
	placing.y = bottom + FRAME_GAP * 2 + MESSAGE_PITCH / 2;
	const inner = placing.frames.slice(holding.frames);
	const nested = new Set(inner.flatMap((frame) => frame.inner));
	placing.frames.push({
		step,
		top,
		bottom,
		guards,
		messages: placing.steps.slice(holding.messages).map((placed) => placed.step.id),
		inner: inner.map((frame) => frame.step.id).filter((id) => !nested.has(id)),
	});
}

/**
 * Place each alternative of a decision under its labelled row, parted from
 * the one before by a dashed line.
 * @param step The decision.
 * @param placing The walk.
 * @param branch The alternatives that hold the decision.
 * @returns The rows its alternatives' labels stand on.
 */
function placeAlternatives(
	step: Extract<FlowStep, { kind: "decision" }>,
	placing: Placing,
	branch: Branch,
): FrameGuard[] {
	const guards: FrameGuard[] = [];
	for (const [index, alternative] of step.alternatives.entries()) {
		const divider = index === 0 ? undefined : rowTop(placing.y) + FRAME_GAP;
		const guardTop = divider === undefined ? rowTop(placing.y) : divider + FRAME_GAP / 2;
		guards.push({ label: alternative.label, top: guardTop, divider });
		placing.y = guardTop + FRAME_GUARD_HEIGHT + FRAME_GAP / 2 + MESSAGE_PITCH / 2;
		placeAll(alternative.steps, placing, new Map([...branch, [step.id, alternative.label]]));
	}
	return guards;
}

/**
 * Every step of one flow, stacked down the page in the order it is stated.
 * @param steps The flow's steps.
 * @param centreOf Where each participant's lifeline runs.
 * @param bounds The flow's columns, which a note stays inside.
 * @param start Where the first message runs, and the turn of the drawing's clock its first pulse takes.
 * @param start.y The height the first message runs at.
 * @param start.turn The first turn.
 * @returns The placed messages, and the frames closed, inner before outer.
 */
function placeSteps(
	steps: readonly FlowStep[],
	centreOf: ReadonlyMap<string, number>,
	bounds: ColumnBounds,
	start: { readonly y: number; readonly turn: number },
): { readonly steps: PlacedStep[]; readonly frames: FrameRows[] } {
	const placing: Placing = { centreOf, bounds, steps: [], frames: [], ...start };
	placeAll(steps, placing, new Map());
	return { steps: placing.steps, frames: placing.frames };
}

/**
 * How far down the page one flow's own drawing reaches.
 * @param steps The placed messages.
 * @param frames The placed frames.
 * @param floor The height of the first message's row, when there is nothing below it.
 * @returns The lowest row anything was drawn on.
 */
function lowestDrawn(
	steps: readonly PlacedStep[],
	frames: readonly FrameRows[],
	floor: number,
): number {
	let lowest = floor;
	for (const placed of steps) {
		const loop = placed.y + (placed.step.kind === "self" ? SELF_LOOP_EXTENT : 0);
		const note = placed.note === undefined ? 0 : placed.note.box.y + placed.note.box.height;
		lowest = Math.max(lowest, loop, note);
	}
	for (const frame of frames) {
		lowest = Math.max(lowest, frame.bottom);
	}
	return lowest;
}

export { placeSteps, lowestDrawn };
