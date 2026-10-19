// The legend an exported picture carries, or that is exported by itself
// (TASK-468).
//
// It lists what the page's key lists (`lib/picture-key.ts`), read from the same
// drawn picture: the marks a comparison puts on what it changed, each node
// kind, each relationship kind, and the two things a line says beside its
// kind. Each entry is drawn with the picture's own symbol, made by the code
// that draws it on the picture: the standing's pin, the kind's chip and the
// icon markup the picture carries, the line with the picture's ink, width,
// dash and head, the heavier line, and a pulse's light. Its words are measured
// with the diagram faces and painted with the palette's tokens, so it follows
// the ground the picture is drawn for.
//
// Laid out in a row that wraps at a width, it sits under a picture; in a
// column, beside one.

import type { LegendLayout } from "@archboard/board/render-reply";
import { PaletteColorSchema } from "@archboard/board/policy";
import { DIAGRAM_MARGIN } from "@/transformers/semantic-renderer/config";
import { CHIP_THICKNESS, ICON_CHIP_SIZE } from "@/transformers/semantic-renderer/lib/design";
import { CARD_NOTE_FONT, fontAttributes } from "@/transformers/semantic-renderer/lib/fonts";
import { coord, roundCoord } from "@/transformers/semantic-renderer/lib/geometry";
import {
	keyOf,
	LINE_MARKS,
	pictureAppearances,
	type AppliedAppearance,
	type LineMark,
	type MarkCount,
} from "@/transformers/semantic-renderer/picture-key";
import { measure } from "@/transformers/semantic-renderer/lib/text";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { chipTile, semanticInk } from "@/transformers/semantic-renderer/lib/svg/appearance";
import { pulseLook } from "@/transformers/semantic-renderer/lib/svg/beam-light";
import { lines, tag, textNode, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { standingPinAt } from "@/transformers/semantic-renderer/lib/svg/standing";
import {
	DASH_ARRAY,
	drawnInk,
	HEAD_LENGTH,
	STROKE_WIDTH,
} from "@/transformers/semantic-renderer/lib/svg/styles";

/** How tall an entry is, and how wide the room its symbol stands in. */
const ROW = 28;
const GLYPH = 30;
/** Room between a symbol and its words, and between the words and a count. */
const WORD_GAP = 8;
const COUNT_GAP = 6;
/** Room between two entries of a row, and before the first entry of the next list. */
const ENTRY_GAP = 24;
const LIST_GAP = 40;
/** How large the words are set. */
const WORD_SIZE = 12;

/** The light of a pulse along its length: nothing, a tail that gathers toward a bright head, and a short soft front. */
const PULSE_STOPS = [
	[0, 0],
	[0.35, 0.05],
	[0.6, 0.2],
	[0.78, 0.5],
	[0.9, 1],
	[1, 0],
] as const;
/**
 * How long a pulse's light runs in the sample, centred on it as the page's key
 * centres it, so its bright head lands at the room's end; and how much its
 * glow adds to the line.
 */
const PULSE_SPAN = 40;
const PULSE_GLOW = 3;

/** One entry: its symbol drawn at a place, its words, and a count when it has one. */
interface Entry {
	/** What it keys: a mark, a node kind, a relationship kind or a line mark. */
	readonly keys: "mark" | "kind" | "relationship" | LineMark;
	readonly symbol: (x: number, y: number) => string;
	readonly words: string;
	readonly count?: number | undefined;
}

/** A legend laid out: its size, and its drawing at a place. */
interface Legend {
	readonly width: number;
	readonly height: number;
	readonly draw: (x: number, y: number) => string;
}

/**
 * A line sample: a short horizontal line in the room of a symbol.
 * @param x The room's left.
 * @param y The room's top.
 * @param attributes How it is stroked.
 * @param end Where the line stops short of the room's right, for a head.
 * @returns The line.
 */
function lineAt(
	x: number,
	y: number,
	attributes: Record<string, string | number | undefined>,
	end = 1,
): string {
	return tag("path", {
		d: `M${coord(x + 1)} ${coord(y + ROW / 2)}H${coord(x + GLYPH - end)}`,
		fill: "none",
		"stroke-linecap": "round",
		...attributes,
	});
}

/**
 * A relationship kind's line as the picture draws one of its plain weight:
 * its ink, its dash and its head.
 * @param appearance The kind as the picture draws it.
 * @param palette The theme's colours.
 * @returns The symbol.
 */
function relationshipSymbol(appearance: AppliedAppearance, palette: Palette): Entry["symbol"] {
	const named = PaletteColorSchema.safeParse(appearance.lineColor);
	const ink = drawnInk(
		(named.success ? semanticInk(named.data) : undefined) ?? palette.edge,
		palette,
	);
	const head = HEAD_LENGTH.normal;
	const filled = appearance.arrowhead === "filled";
	const headed = appearance.arrowhead === "filled" || appearance.arrowhead === "open";
	return (x, y) => {
		const tip = x + GLYPH - 1;
		const shape = filled
			? tag("path", { d: "M0 0L10 5L0 10Z", fill: ink })
			: tag("path", {
					d: "M2 1L10 5L2 9",
					fill: "none",
					stroke: ink,
					"stroke-width": 1.7,
					"stroke-linecap": "round",
					"stroke-linejoin": "round",
				});
		return lines([
			lineAt(
				x,
				y,
				{
					stroke: ink,
					"stroke-width": STROKE_WIDTH.normal,
					"stroke-dasharray": DASH_ARRAY[appearance.dash],
				},
				filled ? 1 + head / 2 : 1,
			),
			headed
				? wrap(
						"svg",
						{
							x: coord(tip - head),
							y: coord(y + ROW / 2 - head / 2),
							width: head,
							height: head,
							viewBox: "0 0 10 10",
						},
						shape,
					)
				: "",
		]);
	};
}

/**
 * A node kind's chip as the picture draws it: the tile in its colour, under
 * the icon markup the picture carries.
 * @param appearance The kind as the picture draws it.
 * @param palette The theme's colours.
 * @returns The symbol.
 */
function kindSymbol(appearance: AppliedAppearance, palette: Palette): Entry["symbol"] {
	const named = PaletteColorSchema.safeParse(appearance.typeColor);
	const ink = (named.success ? semanticInk(named.data) : undefined) ?? palette.glyph;
	return (x, y) => {
		const box = {
			x: x + (GLYPH - ICON_CHIP_SIZE) / 2,
			y: y + (ROW - ICON_CHIP_SIZE) / 2,
			width: ICON_CHIP_SIZE,
			height: ICON_CHIP_SIZE,
		};
		// The icon sits where the picture's chip seats its eighteen-unit glyph.
		const glyph = wrap(
			"g",
			{
				transform: `translate(${coord(box.x + ICON_CHIP_SIZE / 2 - 9)},${coord(box.y + (ICON_CHIP_SIZE - CHIP_THICKNESS) / 2 - 9)})`,
			},
			appearance.iconSvg,
		);
		return chipTile(box, ink, palette) + glyph;
	};
}

/**
 * The sample of one thing a line says beside its kind: the line its author
 * emphasised most, or a plain line with a pulse's light on it.
 * @param mark Which.
 * @param palette The theme's colours.
 * @returns The symbol.
 */
function lineMarkSymbol(mark: LineMark, palette: Palette): Entry["symbol"] {
	if (mark === "emphasis") {
		return (x, y) =>
			lineAt(x, y, {
				stroke: drawnInk(palette.edge, palette, "hero"),
				"stroke-width": STROKE_WIDTH.hero,
			});
	}
	const plain = { stroke: drawnInk(palette.edge, palette), "stroke-width": STROKE_WIDTH.normal };
	const light = pulseLook(palette.edge, STROKE_WIDTH.normal, palette).head;
	return (x, y) => {
		const front = x + GLYPH / 2 + PULSE_SPAN / 2;
		const run = `M${coord(front - PULSE_SPAN)} ${coord(y + ROW / 2)}H${coord(front)}`;
		const gradient = wrap(
			"linearGradient",
			{
				id: "export-legend-pulse",
				gradientUnits: "userSpaceOnUse",
				x1: coord(front - PULSE_SPAN),
				x2: coord(front),
				y1: 0,
				y2: 0,
			},
			PULSE_STOPS.map(([offset, opacity]) =>
				tag("stop", { offset, "stop-color": light, "stop-opacity": opacity }),
			).join(""),
		);
		// Held to the symbol's room, as the page's key holds it, so the light
		// that runs past the line does not reach the words.
		return wrap(
			"svg",
			{
				x: coord(x),
				y: coord(y),
				width: GLYPH,
				height: ROW,
				viewBox: `${coord(x)} ${coord(y)} ${GLYPH} ${ROW}`,
			},
			lines([
				wrap("defs", {}, gradient),
				lineAt(x, y, plain),
				tag("path", {
					d: run,
					fill: "none",
					stroke: "url(#export-legend-pulse)",
					"stroke-opacity": 0.25,
					"stroke-width": STROKE_WIDTH.normal + 0.6 + PULSE_GLOW,
				}),
				tag("path", {
					d: run,
					fill: "none",
					stroke: "url(#export-legend-pulse)",
					"stroke-width": STROKE_WIDTH.normal + 0.6,
				}),
			]),
		);
	};
}

/**
 * What a legend lists, in its lists: the marks, the node kinds, then the
 * relationship kinds and the two line marks.
 * @param body The painted picture it keys.
 * @param marks The marks the picture draws, with their counts.
 * @param palette The theme's colours.
 * @returns The lists, each non-empty.
 */
function entriesOf(body: string, marks: readonly MarkCount[], palette: Palette): Entry[][] {
	const key = keyOf(pictureAppearances(body));
	const relationships = key?.relationships ?? [];
	return [
		marks.map((one): Entry => ({
			keys: "mark",
			/**
			 * The standing's pin, centred in the symbol's room.
			 * @param x The room's left.
			 * @param y The room's top.
			 * @returns The pin.
			 */
			symbol: (x, y) => standingPinAt(x + GLYPH / 2, y + ROW / 2, one.standing, palette),
			words: one.word,
			count: one.count,
		})),
		(key?.kinds ?? []).map((one): Entry => ({
			keys: "kind",
			symbol: kindSymbol(one, palette),
			words: one.typeName,
		})),
		[
			...relationships.map((one): Entry => ({
				keys: "relationship",
				symbol: relationshipSymbol(one, palette),
				words: one.typeName,
			})),
			...(relationships.length === 0
				? []
				: LINE_MARKS.map(({ mark, word }): Entry => ({
						keys: mark,
						symbol: lineMarkSymbol(mark, palette),
						words: word,
					}))),
		],
	].filter((list) => list.length > 0);
}

/**
 * How wide one entry is.
 * @param entry The entry.
 * @returns Its width.
 */
function widthOf(entry: Entry): number {
	const words = measure(entry.words, CARD_NOTE_FONT, WORD_SIZE);
	const count =
		entry.count === undefined
			? 0
			: COUNT_GAP + measure(String(entry.count), CARD_NOTE_FONT, WORD_SIZE);
	return roundCoord(GLYPH + WORD_GAP + words + count);
}

/**
 * One entry drawn at a place.
 * @param entry The entry.
 * @param x Its left.
 * @param y Its top.
 * @param palette The theme's colours.
 * @returns The entry.
 */
function drawnEntry(entry: Entry, x: number, y: number, palette: Palette): string {
	const words = { y: coord(y + ROW / 2), "dominant-baseline": "central", "font-size": WORD_SIZE };
	const wordsX = x + GLYPH + WORD_GAP;
	return wrap(
		"g",
		{ "data-legend-entry": entry.keys },
		lines([
			entry.symbol(x, y),
			textNode(
				{ x: coord(wordsX), ...words, fill: palette.foreground, ...fontAttributes(CARD_NOTE_FONT) },
				entry.words,
			),
			entry.count === undefined
				? ""
				: textNode(
						{
							x: coord(wordsX + measure(entry.words, CARD_NOTE_FONT, WORD_SIZE) + COUNT_GAP),
							...words,
							fill: palette.muted,
							...fontAttributes(CARD_NOTE_FONT),
						},
						String(entry.count),
					),
		]),
	);
}

/** Each entry of a legend at its place, and the size they fill, margins included. */
interface Placed {
	readonly at: readonly { readonly entry: Entry; readonly x: number; readonly y: number }[];
	readonly width: number;
	readonly height: number;
}

/**
 * The size placed entries fill.
 * @param at Each entry and its place.
 * @param bottom Where the last row ends.
 * @returns The entries, and the size they fill with the margins.
 */
function extent(at: Placed["at"], bottom: number): Placed {
	const right = Math.max(DIAGRAM_MARGIN, ...at.map(({ entry, x }) => x + widthOf(entry)));
	return {
		at,
		width: roundCoord(right + DIAGRAM_MARGIN),
		height: roundCoord(bottom + DIAGRAM_MARGIN),
	};
}

/**
 * The legend's lists in one column, a little room between two lists.
 * @param lists The lists.
 * @returns Each entry at its place, and the size they fill.
 */
function column(lists: readonly (readonly Entry[])[]): Placed {
	const at: { entry: Entry; x: number; y: number }[] = [];
	let y = DIAGRAM_MARGIN;
	for (const [index, list] of lists.entries()) {
		if (index > 0) y += LIST_GAP / 4;
		for (const entry of list) {
			at.push({ entry, x: DIAGRAM_MARGIN, y });
			y += ROW;
		}
	}
	return extent(at, y);
}

/**
 * The room before an entry of a row: none before the first, more before a list than inside one.
 * @param list Which list it is in.
 * @param order Where it is in its list.
 * @returns The room.
 */
function gapBefore(list: number, order: number): number {
	if (order > 0) return ENTRY_GAP;
	return list > 0 ? LIST_GAP : 0;
}

/**
 * The legend's lists in one row, wrapped onto the next row where it would grow past a width.
 * @param lists The lists.
 * @param wrapAt How wide a row may grow, margins included.
 * @returns Each entry at its place, and the size they fill.
 */
function row(lists: readonly (readonly Entry[])[], wrapAt: number): Placed {
	const at: { entry: Entry; x: number; y: number }[] = [];
	let x = DIAGRAM_MARGIN;
	let y = DIAGRAM_MARGIN;
	for (const [index, list] of lists.entries()) {
		for (const [order, entry] of list.entries()) {
			const width = widthOf(entry);
			const gap = gapBefore(index, order);
			if (at.length > 0 && x + gap + width > wrapAt - DIAGRAM_MARGIN) {
				x = DIAGRAM_MARGIN;
				y += ROW;
			} else {
				x += gap;
			}
			at.push({ entry, x, y });
			x += width;
		}
	}
	return extent(at, y + ROW);
}

/**
 * The legend of a painted picture, laid out.
 * @param body The painted picture it keys.
 * @param marks The marks the picture draws, with their counts.
 * @param layout A row that wraps, or a column.
 * @param wrapAt How wide a row may grow, margins included.
 * @param palette The theme's colours.
 * @returns Its size, and its drawing at a place.
 */
function legendOf(
	body: string,
	marks: readonly MarkCount[],
	layout: LegendLayout,
	wrapAt: number,
	palette: Palette,
): Legend {
	const lists = entriesOf(body, marks, palette);
	const laid = layout === "vertical" ? column(lists) : row(lists, wrapAt);
	return {
		width: laid.width,
		height: laid.height,
		/**
		 * The legend with its top left corner at a place.
		 * @param x Where its left edge stands.
		 * @param y Where its top edge stands.
		 * @returns Its drawing.
		 */
		draw: (x, y) =>
			wrap(
				"g",
				{ "data-slot": "export-legend", "data-layout": layout },
				lines(laid.at.map((one) => drawnEntry(one.entry, x + one.x, y + one.y, palette))),
			),
	};
}

export { legendOf, type Legend };
