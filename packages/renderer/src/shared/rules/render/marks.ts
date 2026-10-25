// The marks a viewer draws beside or over a picture, drawn as the renderer core
// draws them in the picture (ADR 0057): the key's line samples, the pin a
// subject of one standing wears, and the warning a code finding raises.
//
// A pane draws these itself, at once and without the core, so they are the one
// piece of painting left in TypeScript. `tests/runtime/operations/marks/viewer-marks.test.ts`
// holds them to the core's picture.

import type { EdgeEmphasis } from "@archboard/board/content";
import { LINE_STRENGTH } from "#shared/constants/design.ts";
import type { SubjectStanding } from "#shared/protocol/render-request.ts";
import { coord } from "#shared/rules/geometry.ts";

/** How loudly a line speaks. */
type Weight = EdgeEmphasis;

/** Which arrowhead a line ends in. */
type Head = "filled" | "open";

/** How strong one ink is over the page, in each theme. */
interface Share {
	readonly light: number;
	readonly dark: number;
}

/** The page's tokens the marks are drawn in. */
const PAGE = {
	background: "var(--background)",
	edge: "var(--diagram-edge)",
	glow: "var(--diagram-glow)",
	warning: "light-dark(var(--warning-foreground), var(--warning))",
	standing: {
		added: "var(--standing-added)",
		changed: "var(--standing-changed)",
		removed: "var(--standing-removed)",
	},
} as const;

/** How wide a line of each weight is drawn. */
const STROKE_WIDTH: Readonly<Record<Weight, number>> = { hero: 2.2, normal: 1.4, muted: 1.4 };

/** How long an arrowhead of each weight is, from its base to its tip; it is as wide. */
const HEAD_LENGTH: Readonly<Record<Weight, number>> = { hero: 11, normal: 11, muted: 11 };

/** Where in its ten-unit box each head meets its line. */
const HEAD_REF_X: Readonly<Record<Head, number>> = { filled: 8, open: 10 };

/** How strong a removed line's ink is over the page. */
const REMOVED_STRENGTH: Share = { light: 0.85, dark: 1 };

/** How near the page's glow the body of a pulse goes. */
const PULSE_LIGHT: Share = { light: 0.65, dark: 0.5 };

/** Where a pin or a warning stands in from its subject's corner. */
const PIN_INSET = 3;
const PIN_RADIUS = 9.2;
const PIN_STROKE = 1.7;
const PIN_RIM = 1.5;

/** Each standing's glyph inside its pin: none for unchanged. */
const PIN_GLYPH: Readonly<Record<SubjectStanding, string>> = {
	added: "M-2.5,0 H2.5 M0,-2.5 V2.5",
	removed: "M-2.7,0 H2.7",
	changed: "M-2.9,0.9 Q-1.45,-2 0,0 Q1.45,2 2.9,-0.9",
	unchanged: "",
};

/** The warning's triangle, its bar and its dot. */
const BADGE_GLYPH = "M0,-5.2 L5.4,4.4 H-5.4 Z";
const BADGE_MARKS = "M0,-2.4 V0.9 M0,2.6 V2.9";

/** The properties written as CSS rather than as presentation attributes. */
const PAINT = new Set(["fill", "stroke"]);

/**
 * One element, its paint gathered into one `style` where the first of it stood.
 * @param name The element name.
 * @param attributes Its attributes, in the order they are written.
 * @param children Its content, if it has any.
 * @returns The element.
 */
function element(
	name: string,
	attributes: Readonly<Record<string, string | number>>,
	children?: string,
): string {
	const stated = Object.entries(attributes);
	const paint = stated
		.filter(([key]) => PAINT.has(key))
		.map(([key, value]) => `${key}:${value}`)
		.join(";");
	const first = stated.findIndex(([key]) => PAINT.has(key));
	const written = stated
		.flatMap(([key, value], index) =>
			index === first ? [["style", paint]] : PAINT.has(key) ? [] : [[key, value]],
		)
		.map(([key, value]) => ` ${key}="${String(value)}"`)
		.join("");
	return children === undefined
		? `<${name}${written}/>`
		: `<${name}${written}>${children}</${name}>`;
}

/**
 * One colour mixed into another, as CSS mixes it.
 * @param from The colour mixed into.
 * @param to The colour mixed in.
 * @param amount How much of it, from 0 to 1.
 * @returns The mix.
 */
function mixed(from: string, to: string, amount: number): string {
	if (amount <= 0) return from;
	if (amount >= 1) return to;
	return `color-mix(in srgb, ${to} ${Number((amount * 100).toFixed(4))}%, ${from})`;
}

/**
 * An ink at a strength over a ground, in each theme.
 * @param base The ground.
 * @param ink The ink.
 * @param share How strong it is in each theme.
 * @returns The colour.
 */
function tinted(base: string, ink: string, share: Share): string {
	const light = mixed(base, ink, share.light);
	return share.light === share.dark
		? light
		: `light-dark(${light}, ${mixed(base, ink, share.dark)})`;
}

/**
 * The colour a relationship's line is drawn in, from the colour it stands for:
 * the one expression the picture draws the line in, for a key beside it to
 * draw the same.
 * @param ink The colour at full strength.
 * @returns The line's colour.
 */
function lineInk(ink: string): string {
	if (ink === PAGE.standing.removed) return tinted(PAGE.background, ink, REMOVED_STRENGTH);
	return ink === PAGE.edge ? ink : tinted(PAGE.background, ink, LINE_STRENGTH);
}

/**
 * The colour of the body of a pulse that rides a line of one colour: the one
 * expression the picture draws it in, for a key beside it to draw the same.
 * @param ink The line's colour at full strength.
 * @returns The pulse's colour.
 */
function pulseInk(ink: string): string {
	return tinted(ink, PAGE.glow, PULSE_LIGHT);
}

/**
 * How wide a page draws a line of one emphasis, in diagram units: for a key
 * that has to draw a line the way the picture does (TASK-383).
 * @param emphasis How loudly its author asked the line to speak.
 * @returns The stroke width.
 */
function lineWidth(emphasis: Weight): number {
	return STROKE_WIDTH[emphasis];
}

/**
 * How long a page draws the arrowhead of a line of one emphasis, from its base
 * to its tip, in diagram units: for a key that has to draw a head the way the
 * picture does.
 * @param emphasis How loudly its author asked the line to speak.
 * @returns The head's length, which is also its width.
 */
function headLength(emphasis: Weight): number {
	return HEAD_LENGTH[emphasis];
}

/**
 * How far an arrowhead reaches past the end of its line.
 * @param head Which head.
 * @param weight How loudly the line speaks.
 * @returns The reach, in diagram units.
 */
function headReach(head: Head, weight: Weight): number {
	return ((10 - HEAD_REF_X[head]) / 10) * HEAD_LENGTH[weight];
}

/**
 * The pin a subject of one standing wears on its corner, as a page draws it:
 * for a key that has to show the mark the picture shows (TASK-383).
 * @param standing How the subject stands.
 * @returns The pin, centred on the origin in a twenty-unit square; empty for unchanged.
 */
function standingMark(standing: SubjectStanding): string {
	if (standing === "unchanged") return "";
	return element(
		"g",
		{ transform: "translate(0,0)" },
		[
			element("circle", {
				r: PIN_RADIUS,
				fill: PAGE.standing[standing],
				stroke: PAGE.background,
				"stroke-width": PIN_RIM,
			}),
			element("path", {
				d: PIN_GLYPH[standing],
				fill: "none",
				stroke: PAGE.background,
				"stroke-width": PIN_STROKE,
				"stroke-linecap": "round",
			}),
		].join(""),
	);
}

/**
 * The warning a subject nobody has decided wears, centred on a point.
 * @param at Where it stands.
 * @param at.x Across.
 * @param at.y Down.
 * @returns The mark.
 */
function lineWarning(at: { readonly x: number; readonly y: number }): string {
	return element(
		"g",
		{ transform: `translate(${coord(at.x)},${coord(at.y)})`, "pointer-events": "none" },
		element("path", { d: BADGE_GLYPH, fill: PAGE.warning }) +
			element("path", {
				d: BADGE_MARKS,
				fill: "none",
				stroke: PAGE.background,
				"stroke-width": PIN_STROKE,
				"stroke-linecap": "round",
			}),
	);
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
	return lineWarning({ x: box.x + box.width - PIN_INSET, y: box.y + PIN_INSET });
}

export {
	type Head,
	type Weight,
	cornerWarning,
	headLength,
	headReach,
	lineInk,
	lineWarning,
	lineWidth,
	pulseInk,
	standingMark,
};
