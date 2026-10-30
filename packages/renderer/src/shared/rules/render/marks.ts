// The marks a viewer draws beside or over a picture, drawn as the renderer core
// draws them in the picture (ADR 0059): the key's line samples, the pin a
// subject of one standing wears, and the warning a code finding raises.
//
// A pane draws these itself, at once and without the core. Their inks, sizes
// and markup are generated from the core's painter by `bun run build:core`,
// so a pane holds no copy of the painter's rules. Only the placement of a
// warning is written here.

import type { EdgeEmphasis } from "@archboard/board/content";
import {
	CORNER_INSET,
	HEAD_LENGTH,
	LINE_INK,
	LINE_WIDTH,
	OPEN_ARM,
	PULSE_BREADTH,
	PULSE_INK,
	STANDING_MARK,
	WARNING_GLYPH,
} from "#shared/protocol/generated/core/marks.ts";
import type { SubjectStanding } from "#shared/protocol/render-request.ts";

/**
 * A coordinate as a picture writes it: rounded to a hundredth, never minus zero.
 * @param value The coordinate.
 * @returns Its spelling.
 */
function coord(value: number): string {
	const rounded = Math.round(value * 100) / 100;
	return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** The colour a relationship kind is drawn in: a palette colour's name, or the neutral line. */
type LineColour = keyof typeof LINE_INK;

/**
 * Whether a name is one the core draws a line in.
 * @param color The name.
 * @returns Whether it is.
 */
function isLineColour(color: string): color is LineColour {
	return Object.hasOwn(LINE_INK, color);
}

/**
 * The colour of a line, by the colour its kind names: the neutral line for a
 * name that is not one of the palette's.
 * @param color The palette colour's name, if the kind has one.
 * @returns The line's colour.
 */
function lineColour(color: string | undefined): LineColour {
	return color !== undefined && isLineColour(color) ? color : "neutral";
}

/**
 * The ink a relationship's line of some colour is drawn in: the one expression
 * the picture draws the line in, for a key beside it to draw the same.
 * @param color The palette colour its kind names, if any.
 * @returns The line's ink.
 */
function lineInk(color: string | undefined): string {
	return LINE_INK[lineColour(color)];
}

/**
 * The ink of the body of a pulse that rides a line of some colour: the one
 * expression the picture draws it in, for a key beside it to draw the same.
 * @param color The palette colour the line's kind names, if any.
 * @returns The pulse's ink.
 */
function pulseInk(color: string | undefined): string {
	return PULSE_INK[lineColour(color)];
}

/**
 * How wide a page draws a line of one emphasis, in diagram units: for a key
 * that has to draw a line the way the picture does (TASK-383).
 * @param emphasis How loudly its author asked the line to speak.
 * @returns The stroke width.
 */
function lineWidth(emphasis: EdgeEmphasis): number {
	return LINE_WIDTH[emphasis];
}

/**
 * The pin a subject of one standing wears on its corner, as a page draws it:
 * for a key that has to show the mark the picture shows (TASK-383).
 * @param standing How the subject stands.
 * @returns The pin, centred on the origin in a twenty-unit square; empty for unchanged.
 */
function standingMark(standing: SubjectStanding): string {
	return STANDING_MARK[standing];
}

/**
 * The warning a subject nobody has decided wears, centred on a point.
 * @param at Where it stands.
 * @param at.x Across.
 * @param at.y Down.
 * @returns The mark.
 */
function lineWarning(at: { readonly x: number; readonly y: number }): string {
	return `<g transform="translate(${coord(at.x)},${coord(at.y)})" pointer-events="none">${WARNING_GLYPH}</g>`;
}

/**
 * The warning a box wears on its top right corner.
 * @param box The box.
 * @param box.x Its left edge.
 * @param box.y Its top edge.
 * @param box.width How wide it is.
 * @param box.height How tall it is.
 * @returns The mark.
 */
function cornerWarning(box: {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}): string {
	return lineWarning({ x: box.x + box.width - CORNER_INSET, y: box.y + CORNER_INSET });
}

export {
	HEAD_LENGTH,
	OPEN_ARM,
	PULSE_BREADTH,
	cornerWarning,
	lineInk,
	lineWarning,
	lineWidth,
	pulseInk,
	standingMark,
};
