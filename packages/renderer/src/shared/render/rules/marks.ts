// The marks a viewer draws beside or over a picture, finished, as the renderer
// core draws them in the picture (ADR 0059): the key's samples of a line, of the
// emphasis and traffic a line carries and of the pin a subject of one standing
// wears, and the warning a code finding raises.
//
// A pane shows these itself, at once and without the core. Their inks, sizes
// and markup are generated from the core's painter by `bun run build:core`,
// so a pane holds no copy of the painter's rules: it places the markup this
// module finishes. Only the small drawing of each sample is written here.

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
 * the picture draws the line in.
 * @param color The palette colour its kind names, if any.
 * @returns The line's ink.
 */
function lineInk(color: string | undefined): string {
	return LINE_INK[lineColour(color)];
}

/** How high every line sample is drawn, and where its line runs. */
const LINE_BOX = { height: 20, middle: 10 } as const;

/** How wide a line sample is unless the place it sits in asks otherwise. */
const SAMPLE_WIDTH = 36;

/** A rail of a mixed line, and how far each stands from the line's middle. */
const RAIL = { width: 1.2, step: 1.2 } as const;

/** The picture's own proportions of a pulse in small: how long its light runs, and its glow. */
const PULSE = { span: 40, glow: 3 } as const;

/**
 * The light of a pulse along its length: nothing, a tail that gathers toward a
 * bright head, and a short soft front.
 */
const PULSE_STOPS = [
	[0, 0],
	[0.35, 0.05],
	[0.6, 0.2],
	[0.78, 0.5],
	[0.9, 1],
	[1, 0],
] as const;

/** The neutral line the emphasis and traffic samples are keyed on. */
const NEUTRAL_LINE = LINE_INK.neutral;

/**
 * A sample a key shows beside what it names: a relationship kind's line in its colour, dash and
 * arrowhead, the heavier line of the most emphasis, the pulse that rides a line with traffic, or
 * the pin a subject of one standing wears.
 */
type MarkSample =
	| {
			readonly kind: "line";
			/** The palette colour the kind names, if any. */
			readonly color?: string | undefined;
			/** `solid`, `dashed`, `dotted` or `mixed`. */
			readonly dash: string;
			/** `filled`, `open` or `none`. */
			readonly arrowhead: string;
	  }
	| { readonly kind: "emphasis" }
	| { readonly kind: "traffic" }
	| { readonly kind: "standing"; readonly standing: SubjectStanding };

/** Where a sample sits: how wide the place makes it, and an id no other sample on the page has. */
interface SampleRoom {
	/** How wide a line sample is; 36 when absent. A pin is always 12 across. */
	readonly width?: number | undefined;
	/** The traffic sample's gradient is named by it. */
	readonly id?: string | undefined;
}

/**
 * A line sample's frame around its strokes: a box as wide as asked, its strokes in one ink.
 * @param width How wide the sample is.
 * @param ink The ink its strokes take through currentColor.
 * @param strokes The strokes.
 * @returns The sample.
 */
function lineFrame(width: number, ink: string, strokes: string): string {
	return (
		`<svg aria-hidden="true" width="${width}" height="${LINE_BOX.height}" ` +
		`viewBox="0 0 ${width} ${LINE_BOX.height}" style="color:${ink}">${strokes}</svg>`
	);
}

/**
 * One straight stroke of a sample along its middle row or beside it.
 * @param row How far down the sample it stands.
 * @param end Where it stops.
 * @param width How thick it is.
 * @param dash How it is broken, if it is.
 * @returns The stroke.
 */
function stroke(row: number, end: number, width: number, dash?: string): string {
	const broken = dash === undefined ? "" : ` stroke-dasharray="${dash}"`;
	return `<path d="M1 ${row}H${end}" fill="none" stroke="currentColor" stroke-width="${width}"${broken}/>`;
}

/**
 * A sample's line up to where its head starts: two rails for a mixed line, as the picture draws
 * it, and otherwise one line in its dash.
 * @param end Where the line stops.
 * @param dash The line's dash.
 * @returns The line.
 */
function sampleRun(end: number, dash: string): string {
	if (dash === "mixed") {
		return (
			stroke(LINE_BOX.middle - RAIL.step, end, RAIL.width) +
			stroke(LINE_BOX.middle + RAIL.step, end, RAIL.width)
		);
	}
	const broken = dash === "dotted" ? "1 4" : dash === "dashed" ? "6 4" : undefined;
	return stroke(LINE_BOX.middle, end, LINE_WIDTH.normal, broken);
}

/**
 * An arrowhead as the picture draws it: the ten-unit drawing of its marker, in a square as large
 * as the picture's head. A filled head fills the square. An open head's arms run into the tip.
 * @param filled Whether the head is filled.
 * @param tip Where its tip is, on the line.
 * @returns The head.
 */
function arrowHead(filled: boolean, tip: number): string {
	const head = filled
		? '<path d="M0 0L10 5L0 10Z" fill="currentColor"/>'
		: `<path d="M2 1L10 5L2 9" fill="none" stroke="currentColor" stroke-width="${OPEN_ARM}" stroke-linecap="round" stroke-linejoin="round"/>`;
	return (
		`<svg x="${tip - HEAD_LENGTH}" y="${LINE_BOX.middle - HEAD_LENGTH / 2}" ` +
		`width="${HEAD_LENGTH}" height="${HEAD_LENGTH}" viewBox="0 0 10 10">${head}</svg>`
	);
}

/**
 * A relationship kind's line in its colour, dash and arrowhead, in the picture's own expression
 * for it: a coloured line at its line strength over the page, the neutral line as it is.
 * @param sample The line.
 * @param width How wide the sample is.
 * @returns The sample.
 */
function lineSample(sample: Extract<MarkSample, { kind: "line" }>, width: number): string {
	const tip = width - 1;
	const filled = sample.arrowhead === "filled";
	// A filled head covers the end of its line. An open head's arms meet where its line ends.
	const end = filled ? tip - HEAD_LENGTH / 2 : tip;
	const head = sample.arrowhead === "none" ? "" : arrowHead(filled, tip);
	return lineFrame(width, lineInk(sample.color), sampleRun(end, sample.dash) + head);
}

/**
 * A line with a pulse on it, the still shape of the beams that fly along a line whose author
 * illustrated its traffic: a gradient of light that gathers toward a head, in a soft glow.
 * @param width How wide the sample is.
 * @param id What names its gradient.
 * @returns The sample.
 */
function trafficSample(width: number, id: string): string {
	const gradient = `pulse-${id}`;
	const front = width / 2 + PULSE.span / 2;
	const run = `M${front - PULSE.span} ${LINE_BOX.middle}H${front}`;
	const ink = PULSE_INK[lineColour(undefined)];
	const stops = PULSE_STOPS.map(
		([offset, light]) =>
			`<stop offset="${offset}" style="stop-color:${ink}" stop-opacity="${light}"/>`,
	).join("");
	return lineFrame(
		width,
		NEUTRAL_LINE,
		`<defs><linearGradient id="${gradient}" gradientUnits="userSpaceOnUse" ` +
			`x1="${front - PULSE.span}" x2="${front}" y1="0" y2="0">${stops}</linearGradient></defs>` +
			stroke(LINE_BOX.middle, width - 1, LINE_WIDTH.normal) +
			`<path d="${run}" fill="none" stroke="url(#${gradient})" stroke-opacity="0.25" stroke-width="${PULSE_BREADTH + PULSE.glow}"/>` +
			`<path d="${run}" fill="none" stroke="url(#${gradient})" stroke-width="${PULSE_BREADTH}"/>`,
	);
}

/**
 * A sample drawn along a line: a kind's line, the heavier line of the most emphasis, or the
 * line a pulse rides.
 * @param sample Which sample.
 * @param width How wide it is.
 * @param id What names its traffic gradient.
 * @returns The sample.
 */
function lineMarkSample(
	sample: Exclude<MarkSample, { kind: "standing" }>,
	width: number,
	id: string,
): string {
	if (sample.kind === "line") return lineSample(sample, width);
	if (sample.kind === "traffic") return trafficSample(width, id);
	return lineFrame(width, NEUTRAL_LINE, stroke(LINE_BOX.middle, width - 1, LINE_WIDTH.hero));
}

/**
 * A sample a key shows, finished, drawn as the picture beside it draws what it names.
 * @param sample Which sample.
 * @param room Where it sits: its width, and the id that names its traffic gradient.
 * @returns The sample's SVG, hidden from assistive technology: the key's words say what it is.
 */
function markSample(sample: MarkSample, room: SampleRoom = {}): string {
	if (sample.kind === "standing") {
		return `<svg aria-hidden="true" width="12" height="12" viewBox="-10 -10 20 20">${STANDING_MARK[sample.standing]}</svg>`;
	}
	return lineMarkSample(sample, room.width ?? SAMPLE_WIDTH, room.id ?? "sample");
}

/**
 * The warning a subject nobody has decided wears: centred on a point, or on a box's top right
 * corner.
 * @param place Where it stands: a point, or the box whose corner it marks.
 * @returns The mark.
 */
function warningMark(
	place:
		| { readonly x: number; readonly y: number }
		| { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): string {
	const at =
		"width" in place
			? { x: place.x + place.width - CORNER_INSET, y: place.y + CORNER_INSET }
			: place;
	return `<g transform="translate(${coord(at.x)},${coord(at.y)})" pointer-events="none">${WARNING_GLYPH}</g>`;
}

export { markSample, warningMark, type MarkSample };
