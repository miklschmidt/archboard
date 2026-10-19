// Where a decision's or loop's frame stands across a sequence (ADR 0053).
//
// UML draws a choice as an `alt` fragment and a repetition as a `loop`
// fragment: a frame around the messages it governs, an operator in a tab at
// its corner, and a guard on each operand. Here the tab says `alt` or `loop`,
// the words beside it are the decision's question or the loop's condition, and
// each alternative's label stands at the start of its own operand.
//
// A frame reaches across the ink of what it holds and no further, so a choice
// between two columns does not span the whole page, and a frame inside another
// stands inside it with the same room on every side. It widens to the right
// when its own words need more room than its messages do.

import type { FlowDecision, FlowLoop } from "@archboard/board/flow";
import { PILL_FONT } from "@/transformers/semantic-renderer/lib/fonts";
import { NEST_INSET, PILL_TEXT_SIZE } from "@/transformers/semantic-renderer/lib/design";
import {
	ACTIVATION_HALF_WIDTH,
	FRAME_HEAD_HEIGHT,
	FRAME_PAD,
	FRAME_TAB_PADDING,
} from "@/transformers/semantic-renderer/lib/sequence-design";
import { covering, union, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import { measure } from "@/transformers/semantic-renderer/lib/text";
import { stepBox } from "@/transformers/semantic-renderer/lib/layout/messages";
import type { ActiveAt, PlacedStep } from "@/transformers/semantic-renderer/lib/layout/dataflow";

/** The row one alternative's label stands on inside a decision's frame. */
interface FrameGuard {
	/** The alternative's label. */
	readonly label: string;
	/** The top of the row its label stands on. */
	readonly top: number;
	/** Where the dashed line that parts it from the alternative before runs; absent for the first. */
	readonly divider?: number | undefined;
}

/** A decision or loop placed down the page, before its sides are known. */
interface FrameRows {
	/** The decision or loop. */
	readonly step: FlowDecision | FlowLoop;
	/** Where its frame begins. */
	readonly top: number;
	/** Where it ends. */
	readonly bottom: number;
	/** Each alternative's label row, in order; none for a loop. */
	readonly guards: readonly FrameGuard[];
	/** The messages it holds, at any depth. */
	readonly messages: readonly string[];
	/** The frames directly inside it. */
	readonly inner: readonly string[];
}

/** A decision's or loop's frame, placed. */
interface PlacedFrame extends FrameRows {
	/** The frame. */
	readonly box: Box;
	/** The tab at its top left corner that its operator stands in. */
	readonly tab: Box;
	/** What the tab says: `alt` for a decision, `loop` for a loop. */
	readonly operator: "alt" | "loop";
	/** What the head row says beside the tab: the question, or the condition. */
	readonly words: string;
}

/**
 * How wide some words of a frame are drawn.
 * @param text The words.
 * @returns Their width.
 */
function wordsWidth(text: string): number {
	return measure(text, PILL_FONT, PILL_TEXT_SIZE);
}

/**
 * What one frame's tab and head row say.
 * @param step The decision or loop.
 * @returns Its operator, and the words beside it.
 */
function headOf(step: FlowDecision | FlowLoop): {
	readonly operator: "alt" | "loop";
	readonly words: string;
} {
	return step.kind === "decision"
		? { operator: "alt", words: step.question }
		: { operator: "loop", words: `[${step.condition}]` };
}

/**
 * The narrowest a frame may be and still hold its own words: the tab and the
 * words beside it, and each alternative's label.
 * @param rows The frame.
 * @param tabWidth The tab's width.
 * @param words What the head row says beside the tab.
 * @returns The width.
 */
function ownWidth(rows: FrameRows, tabWidth: number, words: string): number {
	let widest = tabWidth + FRAME_TAB_PADDING + wordsWidth(words) + FRAME_PAD;
	for (const guard of rows.guards) {
		widest = Math.max(widest, wordsWidth(`[${guard.label}]`) + FRAME_PAD * 2);
	}
	return Math.ceil(widest);
}

/** A stretch across the page: its left edge and its width. */
interface Span {
	readonly x: number;
	readonly width: number;
}

/**
 * What one message claims across a frame: its ink, and the lifelines it runs
 * between with the bars on them, so a frame's side never lies on a bar.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @returns The box.
 */
function inkOf(placed: PlacedStep, activeAt: ActiveAt): Box {
	const left = Math.min(placed.fromX, placed.toX) - ACTIVATION_HALF_WIDTH;
	const width = Math.abs(placed.toX - placed.fromX) + ACTIVATION_HALF_WIDTH * 2;
	return covering(stepBox(placed, activeAt), { x: left, y: placed.y, width, height: 0 });
}

/**
 * Every frame of one flow, with its sides: around the ink of its messages and
 * of the frames inside it, by the frame's room on each side, and wide enough
 * for its own words.
 * @param frames The frames, each after the frames inside it.
 * @param steps The flow's placed messages.
 * @param activeAt Whether a column is busy at a given height.
 * @param fallback The span a frame that holds no drawn ink takes: the flow's columns.
 * @returns The frames, in the same order.
 */
function placeFrames(
	frames: readonly FrameRows[],
	steps: readonly PlacedStep[],
	activeAt: ActiveAt,
	fallback: Span,
): PlacedFrame[] {
	const inks = new Map(steps.map((placed) => [placed.step.id, inkOf(placed, activeAt)]));
	const placed = new Map<string, PlacedFrame>();
	for (const rows of frames) {
		const held = [
			...rows.messages.flatMap((id) => inks.get(id) ?? []),
			...rows.inner.flatMap((id) => placed.get(id)?.box ?? []),
		];
		placed.set(rows.step.id, sided(rows, held, fallback));
	}
	return frames.flatMap((rows) => placed.get(rows.step.id) ?? []);
}

/**
 * One frame with its sides.
 * @param rows The frame.
 * @param held The ink it holds.
 * @param fallback The span it takes when it holds none.
 * @returns The placed frame.
 */
function sided(rows: FrameRows, held: readonly Box[], fallback: Span): PlacedFrame {
	const ink = union(held);
	const left = ink === undefined ? fallback.x : Math.floor(ink.x - FRAME_PAD);
	const right =
		ink === undefined ? fallback.x + fallback.width : Math.ceil(ink.x + ink.width + FRAME_PAD);
	const { operator, words } = headOf(rows.step);
	const tabWidth = Math.ceil(wordsWidth(operator) + FRAME_TAB_PADDING * 2);
	const width = Math.max(right - left, ownWidth(rows, tabWidth, words));
	const box = { x: left, y: rows.top, width, height: rows.bottom - rows.top };
	return {
		...rows,
		box,
		tab: { x: left, y: rows.top, width: tabWidth, height: FRAME_HEAD_HEIGHT },
		operator,
		words,
	};
}

/**
 * A flow's span across the page, grown to hold its decisions' and loops'
 * frames with the inset its columns keep.
 * @param span The flow's span around its columns and its messages' ink.
 * @param frames The flow's frames.
 * @returns The span, in whole units.
 */
function spanAround(span: Span, frames: readonly PlacedFrame[]): Span {
	let left = span.x;
	let right = span.x + span.width;
	for (const { box } of frames) {
		left = Math.min(left, Math.floor(box.x - NEST_INSET));
		right = Math.max(right, Math.ceil(box.x + box.width + NEST_INSET));
	}
	return { x: left, width: right - left };
}

export { type FrameGuard, type FrameRows, type PlacedFrame, placeFrames, spanAround };
