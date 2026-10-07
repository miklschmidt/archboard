// The mark on a part that opens another board, in the top-right corner inside
// the card or the container's header: a small ring around an arrow that says
// which way the other board lies. Up opens a coarser board, the whole this one
// is a part of; down a finer one, this part's inside; across a board at the
// same level, beside this one.
//
// The direction is read, never stored. A node standing for another board
// carries that board's level as its kind (ADR 0029), and the vault lists its
// levels coarsest first, so comparing the node's kind with the board's own
// level places the other board. Where either is not a level the policy lists,
// the mark says only that the part opens another board.
//
// The mark stands at one place on every part, near and far: its centre is
// {@link DRILL_MARK_INSET} in from the top edge and from the right edge
// (TASK-434). From far away it is drawn larger about that same centre, so a
// fitted picture of a large board still says which cards open another board,
// and which way, and the swap between the views does not move it.

import { coord } from "@/transformers/semantic-renderer/lib/geometry";
import { tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";

/** Which way the board a part opens lies from the board it is drawn on. */
type DrillDirection = "up" | "down" | "across" | "elsewhere";

/** The ring's radius: a mark two thirds the size of a kind glyph. */
const DRILL_MARK_RADIUS = 6.5;

/** The ring's stroke. */
const RING_STROKE = 1.2;

/**
 * How far the mark's centre stands in from a part's top edge and from its
 * right edge, in the near view and in the far view alike (TASK-434). It was
 * chosen by eye. It is further in than the far view had it (11.7), where the
 * larger ring crowded the rounded corner. It is less far in than the near view
 * had it, a padding and a radius in from the side and level with the chip.
 * Here the ring stays about 3 units clear of the warning badge in the same
 * corner, even at its far size, so a part that wears the badge needs no other
 * place for the mark.
 */
const DRILL_MARK_INSET = 16;

/**
 * What a part keeps clear beside its name for the mark: the ring and a gap
 * before it, counted in from the part's padding. With the mark at
 * {@link DRILL_MARK_INSET}, the name stops short of the ring on every part.
 */
const DRILL_MARK_ROOM = 2 * DRILL_MARK_RADIUS + 8;

/** The arrow inside the ring, drawn about the ring's centre. */
const ARROWS: Readonly<Record<DrillDirection, string>> = {
	up: "M0,3.1 V-3.1 M-2.7,-0.5 L0,-3.2 L2.7,-0.5",
	down: "M0,-3.1 V3.1 M-2.7,0.5 L0,3.2 L2.7,0.5",
	across: "M-3.1,0 H3.1 M0.5,-2.7 L3.2,0 L0.5,2.7",
	elsewhere: "M-2.3,2.3 L2.4,-2.4 M-1.1,-2.6 H2.6 V1.1",
};

/**
 * Which way the board a part opens lies.
 * @param kind The part's kind, which is the level of the board it opens.
 * @param here The level of the board it is drawn on, when the caller said.
 * @param levels The vault's levels, coarsest first.
 * @returns The direction, or `elsewhere` when either level is not one the vault lists.
 */
function drillDirection(
	kind: string,
	here: string | undefined,
	levels: readonly string[],
): DrillDirection {
	const there = levels.indexOf(kind);
	const at = here === undefined ? -1 : levels.indexOf(here);
	if (there < 0 || at < 0) {
		return "elsewhere";
	}
	if (there === at) {
		return "across";
	}
	return there < at ? "up" : "down";
}

/**
 * The mark in a box's top-right corner, in a part's own ink: its centre
 * {@link DRILL_MARK_INSET} in from the top edge and from the right edge. This
 * is the one place that decides where the mark stands, near and far.
 * @param box The part's box.
 * @param box.x Its left edge.
 * @param box.y Its top edge.
 * @param box.width Its width.
 * @param direction Which way the other board lies.
 * @param ink The ink of the part's glyph.
 * @param scale How much larger than near it is drawn: from far away it grows with the chip.
 * @returns The mark.
 */
function cornerDrillMark(
	box: { readonly x: number; readonly y: number; readonly width: number },
	direction: DrillDirection,
	ink: string,
	scale: number,
): string {
	const cx = box.x + box.width - DRILL_MARK_INSET;
	const cy = box.y + DRILL_MARK_INSET;
	return wrap(
		"g",
		{
			class: "ab-drill",
			"data-drill": direction,
			transform: `translate(${coord(cx)},${coord(cy)})${scale === 1 ? "" : ` scale(${coord(scale)})`}`,
		},
		tag("circle", {
			r: DRILL_MARK_RADIUS,
			fill: "none",
			stroke: ink,
			"stroke-width": RING_STROKE,
			"stroke-opacity": 0.75,
		}) +
			tag("path", {
				d: ARROWS[direction],
				fill: "none",
				stroke: ink,
				"stroke-width": 1.4,
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
			}),
	);
}

export { DRILL_MARK_ROOM, cornerDrillMark, drillDirection, type DrillDirection };
