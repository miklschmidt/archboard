// Where one message's arrow starts and stops, where its words go, and how much
// of the page the whole thing claims.
//
// Forked from the geometry half of PR Lens's `svg/dataflow.ts`, moved out of the
// painter for the reason the architecture fork keeps its routes out of its
// painter: the same numbers decide what is drawn and what the atlas reports, and
// two copies of them would eventually disagree about where a message is.
//
// One thing here is not upstream's. A message's label sits above its arrow
// rather than astride it — `MESSAGE_LABEL_GAP` in `design.ts` says why — so the
// line a reader follows runs unbroken from the sender to the arrowhead.

import type { MessageKind } from "@/shared/semantic-board/index";
import {
	PILL_HEIGHT,
	PILL_PADDING_X,
	PILL_TEXT_SIZE,
} from "@/transformers/semantic-renderer/lib/design";
import {
	ACTIVATION_HALF_WIDTH,
	MARKER_INSET,
	MESSAGE_LABEL_GAP,
	SELF_LABEL_GAP,
	SELF_LOOP_CORNER,
	SELF_LOOP_EXTENT,
	SELF_LOOP_REACH,
} from "@/transformers/semantic-renderer/lib/sequence-design";
import { PILL_FONT } from "@/transformers/semantic-renderer/lib/fonts";
import { covering, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import { measure } from "@/transformers/semantic-renderer/lib/text";
import { pitchOf } from "@/transformers/semantic-renderer/lib/layout/step-rows";
import {
	type ActiveAt,
	type PlacedStep,
} from "@/transformers/semantic-renderer/lib/layout/dataflow";

/** Which way a message crosses the page: right, left, or nowhere at all. */
type Travel = -1 | 0 | 1;

/** Where one message's arrow begins and ends. */
interface Ends {
	/** Where it leaves its sender. */
	readonly start: number;
	/** Where its arrowhead lands. */
	readonly end: number;
}

/**
 * Which way a message travels.
 * @param kind What the message does.
 * @param fromX The sender's lifeline.
 * @param toX The receiver's.
 * @returns 0 for a message that never leaves its sender, otherwise its direction.
 */
function travelOf(kind: MessageKind, fromX: number, toX: number): Travel {
	if (kind === "self") {
		return 0;
	}
	return toX >= fromX ? 1 : -1;
}

/**
 * Where a message's arrow starts and stops.
 *
 * A busy column is a bar rather than a line, so an arrow touching one has to
 * stop at the bar's edge, and the arrowhead needs room of its own on top of
 * that.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @param direction Which way it travels.
 * @returns Its two ends.
 */
function endsFor(placed: PlacedStep, activeAt: ActiveAt, direction: -1 | 1): Ends {
	const leaving = activeAt(placed.step.from, placed.y) ? ACTIVATION_HALF_WIDTH : 0;
	const arriving = activeAt(placed.step.to, placed.y) ? ACTIVATION_HALF_WIDTH : 0;
	return {
		start: placed.fromX + direction * leaving,
		end: placed.toX - direction * (arriving + MARKER_INSET),
	};
}

/**
 * Where a self-message's loop leaves its lifeline.
 * @param placed The message.
 * @param activated Whether its column is busy at that height.
 * @returns The horizontal start of the loop.
 */
function selfStart(placed: PlacedStep, activated: boolean): number {
	return placed.fromX + (activated ? ACTIVATION_HALF_WIDTH : 0);
}

/**
 * How wide a message's label plate is.
 * @param label The label as drawn.
 * @returns Its width, padding included.
 */
function pillWidth(label: string): number {
	return measure(label, PILL_FONT, PILL_TEXT_SIZE) + PILL_PADDING_X * 2;
}

/**
 * A crossing message's label: centred over the arrow, sitting just above it.
 * @param placed The message.
 * @param ends Where its arrow begins and ends.
 * @returns The plate's box.
 */
function pillBox(placed: PlacedStep, ends: Ends): Box {
	const width = pillWidth(placed.label);
	return {
		x: (ends.start + ends.end) / 2 - width / 2,
		y: placed.y - MESSAGE_LABEL_GAP - PILL_HEIGHT,
		width,
		height: PILL_HEIGHT,
	};
}

/**
 * A self-message's label: above the loop's outgoing run, starting a little
 * past the lifeline, the way a crossing message's label sits above its arrow.
 *
 * Above rather than beside: columns are narrow and stand a seam apart, so a
 * plate beside the loop would lie across the next participant's column.
 * @param placed The message.
 * @param activated Whether its column is busy at that height.
 * @returns The plate's box.
 */
function selfPillBox(placed: PlacedStep, activated: boolean): Box {
	return {
		x: selfStart(placed, activated) + SELF_LABEL_GAP,
		y: placed.y - MESSAGE_LABEL_GAP - PILL_HEIGHT,
		width: pillWidth(placed.label),
		height: PILL_HEIGHT,
	};
}

/**
 * Where one message's label goes, whichever sort of message it is.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @returns The plate's box.
 */
function labelBox(placed: PlacedStep, activeAt: ActiveAt): Box {
	const direction = travelOf(placed.step.kind, placed.fromX, placed.toX);
	if (direction === 0) {
		return selfPillBox(placed, activeAt(placed.step.from, placed.y));
	}
	return pillBox(placed, endsFor(placed, activeAt, direction));
}

/**
 * The ink a self-message's loop puts on the page, label included.
 * @param placed The message.
 * @param activated Whether its column is busy at that height.
 * @returns The box covering both.
 */
function selfDrawn(placed: PlacedStep, activated: boolean): Box {
	const start = selfStart(placed, activated);
	return covering(
		{
			x: start,
			y: placed.y,
			width: SELF_LOOP_REACH + SELF_LOOP_CORNER,
			height: SELF_LOOP_EXTENT,
		},
		selfPillBox(placed, activated),
	);
}

/**
 * The ink a crossing message puts on the page, label included.
 * @param placed The message.
 * @param ends Where its arrow begins and ends.
 * @returns The box covering both.
 */
function straightDrawn(placed: PlacedStep, ends: Ends): Box {
	const left = Math.min(ends.start, ends.end);
	return covering(
		{ x: left, y: placed.y, width: Math.abs(ends.end - ends.start), height: 0 },
		pillBox(placed, ends),
	);
}

/**
 * The row one message owns: what it draws, grown to the pitch the layout gave it.
 *
 * An arrow is a line and a loop is barely taller, so the tight bounds of either
 * make a poor thing to put a rim around or to scroll to. The row is the honest
 * unit — it is the space the layout set aside for this message and no other, so
 * two neighbouring messages can never claim the same band. The label comes with
 * it: a message lit without its own words is a message a reader cannot name.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @returns Its row.
 */
function stepBox(placed: PlacedStep, activeAt: ActiveAt): Box {
	const direction = travelOf(placed.step.kind, placed.fromX, placed.toX);
	const drawn =
		direction === 0
			? selfDrawn(placed, activeAt(placed.step.from, placed.y))
			: straightDrawn(placed, endsFor(placed, activeAt, direction));

	const pitch = pitchOf(placed.step.kind);
	const row = {
		x: drawn.x,
		y: drawn.y + drawn.height / 2 - pitch / 2,
		width: drawn.width,
		height: pitch,
	};
	// A note is the message's own words too, and its row grew to hold it.
	return placed.note === undefined ? row : covering(row, placed.note.box);
}

export { type Ends, type Travel, endsFor, labelBox, selfStart, stepBox, travelOf };
