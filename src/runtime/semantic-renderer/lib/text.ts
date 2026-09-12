// How wide a piece of diagram text is.
//
// PR Lens answered this from a table of glyph advances, because it had to
// produce the same geometry on a CI runner with no fonts installed. That table
// is gone. This repository's standing invariant is that text width is measured
// and never estimated (`src/runtime/engine/measure-text.ts`), and the
// measurement is available here for the same reason it is available to the
// board writer: the font files are in the repository, so measuring them needs
// no browser and no machine-dependent font cache.
//
// **A measurement names a face, not a family.** Every function here takes the
// same `DiagramFont` — family *and* weight — that the painter writes onto the
// element, so a string set at 500 is measured against the medium file and one
// set at 400 against the regular. Passing a family alone is what made a name
// fitted in one face overflow when drawn in another, and there is no spelling
// for it any more.
//
// `measureLineIn` is the repository's one measuring engine, asked for the
// faces this module registers. There is no second measuring path here: word
// splitting, face selection, GPOS kerning and GSUB ligatures all stay where
// board text gets them.

import { measureLineIn } from "@/runtime/engine/measure-text";
import { stackFor, type DiagramFont } from "@/runtime/semantic-renderer/lib/fonts";

const ELLIPSIS = "…";

/**
 * Width of one line in diagram units, measured from the real font file.
 * @param text The line.
 * @param font The face it is set in.
 * @param fontSize The size it is set at.
 * @returns Its width, to a hundredth of a unit.
 */
function measure(text: string, font: DiagramFont, fontSize: number): number {
	return Math.round(measureLineIn(text, fontSize, stackFor(font)).width * 100) / 100;
}

/**
 * Width of tracked text: CSS letter-spacing adds a fixed step after every
 * glyph, the last one included, and no font file knows about it.
 * @param text The line.
 * @param font The face it is set in.
 * @param fontSize The size it is set at.
 * @param tracking The letter-spacing, as a multiple of the font size.
 * @returns Its width including the tracking.
 */
function trackedWidth(text: string, font: DiagramFont, fontSize: number, tracking: number): number {
	return measure(text, font, fontSize) + Array.from(text).length * tracking * fontSize;
}

/**
 * Shortens `text` until it fits `maxWidth`, ellipsis included.
 *
 * Cutting by code point rather than by UTF-16 unit keeps a surrogate pair from
 * being split into a replacement character. The walk is linear in the string
 * because each character is measured on its own — which is very slightly wider
 * than measuring the prefix, since it forgoes kerning, so a truncated string
 * never comes out over budget.
 * @param text The line.
 * @param font The face it is set in.
 * @param fontSize The size it is set at.
 * @param maxWidth The room it has.
 * @returns The line, or as much of it as fits followed by an ellipsis.
 */
function truncate(text: string, font: DiagramFont, fontSize: number, maxWidth: number): string {
	if (measure(text, font, fontSize) <= maxWidth) {
		return text;
	}
	const characters = Array.from(text);
	const ellipsisWidth = measure(ELLIPSIS, font, fontSize);
	let width = 0;
	let kept = 0;
	for (const character of characters) {
		const next = width + measure(character, font, fontSize);
		if (next + ellipsisWidth > maxWidth) {
			break;
		}
		width = next;
		kept += 1;
	}
	if (kept === 0) {
		return ELLIPSIS;
	}
	return `${characters.slice(0, kept).join("").trimEnd()}${ELLIPSIS}`;
}

/**
 * `truncate`, counting the extra step letter-spacing puts after each glyph.
 * @param text The line.
 * @param font The face it is set in.
 * @param fontSize The size it is set at.
 * @param tracking The letter-spacing, as a multiple of the font size.
 * @param maxWidth The room it has.
 * @returns The line, or as much of it as fits followed by an ellipsis.
 */
function truncateTracked(
	text: string,
	font: DiagramFont,
	fontSize: number,
	tracking: number,
	maxWidth: number,
): string {
	if (trackedWidth(text, font, fontSize, tracking) <= maxWidth) {
		return text;
	}
	const characters = Array.from(text);
	let kept = 0;
	while (kept < characters.length) {
		const next = `${characters.slice(0, kept + 1).join("")}${ELLIPSIS}`;
		if (trackedWidth(next, font, fontSize, tracking) > maxWidth) {
			break;
		}
		kept += 1;
	}
	if (kept === 0) {
		return ELLIPSIS;
	}
	return `${characters.slice(0, kept).join("").trimEnd()}${ELLIPSIS}`;
}

/**
 * The size a title is set at: the largest half-point step, at or below the
 * size the card's width earns, where the whole label still fits its run.
 *
 * Stops at the floor, and the painter truncates from there — at that point the
 * name really is longer than the card, rather than a point or two over.
 * @param label The title.
 * @param font The face it is set in.
 * @param earned The size this card's width has earned.
 * @param budget The horizontal run the title has.
 * @param floor The smallest size a title may be set at.
 * @param step How much one size-down is worth.
 * @returns The size to set the title at.
 */
function fittedSize(
	label: string,
	font: DiagramFont,
	earned: number,
	budget: number,
	floor: number,
	step: number,
): number {
	let size = earned;
	while (size > floor && measure(label, font, size) > budget) {
		size = Math.max(floor, size - step);
	}
	return size;
}

export { measure, trackedWidth, truncate, truncateTracked, fittedSize };
