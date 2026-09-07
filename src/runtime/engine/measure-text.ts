// How wide a piece of text is, with no browser open.
//
// ADR 0015 says the agent-friendly shape is converted once, on write. A label
// is converted into a text element, and a text element has a width — and
// Excalidraw's width for one is exactly what the browser's `measureText`
// returns. There is no estimation anywhere in that path, so whatever measures,
// decides. Our old estimate of 0.6 x fontSize per character was not a bad
// number needing tuning; it made `AuthService` 76.7 px too wide.
//
// So this reproduces the browser. Four things beyond summing advance widths,
// each found by measuring against Chrome rather than reasoned about
// (docs/design/measuring-text-outside-a-browser.md):
//
//   the face comes from the `@font-face` unicode-range, not from which file
//     happens to carry the glyph (fonts.ts)
//   GPOS pair kerning and GSUB ligatures apply (font-layout.ts)
//   no shaping crosses a space, because Blink shapes word by word: a font
//     that kerns ` A` does not get to, and eight such pairs disagreed until
//     the string was split at spaces first
//   U+00AD and the other default-ignorables lay out as nothing
//
// With those it agreed with Chrome across 130,000 measurements to within
// 0.0012 px, and `src/runtime/engine/tests/text-metrics.test.ts` pins the numbers.
//
// HEIGHT IS NOT MEASURED, by anybody. Excalidraw's `getTextHeight` is
// `fontSize * lineHeight * lineCount`, with `lineHeight` a per-family constant
// it reads from its own registry. No canvas and no glyphs are involved, so
// measuring one here would be inventing a second answer to a settled question.

import {
	faceStack,
	lineHeightOf,
	loadFace,
	type FaceDescriptor,
	type LoadedFace,
} from "@/runtime/engine/fonts";

export { canMeasure } from "@/runtime/engine/fonts";

// Characters a browser lays out as zero width: soft hyphen, zero-width space,
// the joiners, and the byte-order mark.
const IGNORABLE = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0xfeff]);

const SPACE = 0x20;

/** A face and its parsed file. */
interface Face {
	descriptor: FaceDescriptor;
	loaded: LoadedFace;
}

/**
 * Whether a face's declared `unicode-range` covers a character.
 * @param descriptor The face.
 * @param codepoint The character.
 * @returns True when covered, or when the face declares no range.
 */
function covers(descriptor: FaceDescriptor, codepoint: number): boolean {
	const ranges = descriptor.ranges;
	return ranges === null || ranges.some(([a, b]) => codepoint >= a && codepoint <= b);
}

/**
 * The parsed face for a descriptor, or undefined when its file cannot be read.
 * @param descriptor The face.
 * @returns The parsed face.
 */
function tryLoad(descriptor: FaceDescriptor): LoadedFace | undefined {
	try {
		return loadFace(descriptor.file);
	} catch {
		return undefined;
	}
}

/**
 * The face within one family that draws a character: the last `@font-face`
 * whose `unicode-range` covers it and whose file has the glyph, as CSS says.
 * @param codepoint The character.
 * @param faces The family's faces in declaration order.
 * @returns The face, or undefined when the family has none for it.
 */
function familyFaceFor(codepoint: number, faces: readonly FaceDescriptor[]): Face | undefined {
	for (let i = faces.length - 1; i >= 0; i--) {
		const descriptor = faces[i];
		if (!descriptor || !covers(descriptor, codepoint)) {
			continue;
		}
		const loaded = tryLoad(descriptor);
		if (loaded?.font.cmap.has(codepoint)) {
			return { descriptor, loaded };
		}
	}
	return undefined;
}

/**
 * The face a character comes from, trying families in the order the stack
 * declares them.
 * @param codepoint The character.
 * @param stack Each family's faces, first family first.
 * @returns The face, or undefined when no shipped file covers the character.
 */
function faceFor(codepoint: number, stack: readonly FaceDescriptor[][]): Face | undefined {
	for (const faces of stack) {
		const face = familyFaceFor(codepoint, faces);
		if (face) {
			return face;
		}
	}
	return undefined;
}

/**
 * The file a character would be drawn from — the face-selection rule, said
 * where something can check it.
 *
 * Nunito's subsets overlap: five of them carry `A`, and the browser picks by
 * the declared `unicode-range` rather than by which file has the glyph. On the
 * version shipped today those five agree on `A`'s advance, so no width can
 * tell the two rules apart and this can.
 * @param codepoint The character.
 * @param fontFamily The family number.
 * @returns The woff2 path, or undefined when nothing shipped covers the character.
 */
export function faceFileFor(codepoint: number, fontFamily: number): string | undefined {
	return faceFor(codepoint, faceStack(fontFamily))?.descriptor.file;
}

export interface LineMeasurement {
	/** Width in pixels, at the font size asked for. */
	width: number;
	/** Characters no shipped file covers, whose width is therefore not counted. */
	missing: string[];
}

/** Consecutive characters of one word drawn from one face. */
interface Run {
	face: LoadedFace | undefined;
	chars: string[];
}

/** A word, or one space, as the runs it is shaped in. */
interface Word {
	runs: Run[];
	isSpace: boolean;
}

/**
 * Split a line into words and each word into single-face runs. A subset
 * boundary changes which file a glyph is drawn from but not whether it kerns
 * against its neighbour, while a space stops shaping outright.
 * @param text The line.
 * @param stack The family's face stack.
 * @returns The words in order; ignorable characters are dropped.
 */
function wordsOf(text: string, stack: readonly FaceDescriptor[][]): Word[] {
	const words: Word[] = [];
	let word: Word | null = null;
	for (const ch of text) {
		const codepoint = ch.codePointAt(0) ?? 0;
		if (IGNORABLE.has(codepoint)) {
			continue;
		}
		word = wordFor(words, word, codepoint === SPACE);
		appendToRun(word, ch, faceFor(codepoint, stack)?.loaded);
	}
	return words;
}

/**
 * The word a character belongs to: the one being built, or a new one for the
 * first character, any space, and the character after a space.
 * @param words The words so far, extended when a new one opens.
 * @param word The word being built, or null before the first character.
 * @param isSpace Whether the character is a space.
 * @returns The word to append to.
 */
function wordFor(words: Word[], word: Word | null, isSpace: boolean): Word {
	if (word && !isSpace && !word.isSpace) {
		return word;
	}
	const next: Word = { runs: [], isSpace };
	words.push(next);
	return next;
}

/**
 * Append a character to the word's last run, or open a new run when the face
 * changes. The parsed face is the run key, not the descriptor, because
 * `loadFace` caches one object per file.
 * @param word The word.
 * @param ch The character.
 * @param face The character's face.
 */
function appendToRun(word: Word, ch: string, face: LoadedFace | undefined): void {
	let run = word.runs[word.runs.length - 1];
	if (!run || run.face !== face) {
		run = { face, chars: [] };
		word.runs.push(run);
	}
	run.chars.push(ch);
}

/** The glyph a run ended on, so the next run can kern against it. */
interface Previous {
	face: LoadedFace;
	glyph: number;
}

/**
 * The advance of one run in font units, kerned against the run before it
 * when both come from the same face.
 * @param run The run, whose face is set.
 * @param face The run's face.
 * @param previous The glyph before the run, when one kerns into it.
 * @returns The units and the run's last glyph.
 */
function runUnits(
	run: Run,
	face: LoadedFace,
	previous: Previous | null,
): { units: number; last: Previous | null } {
	const { font, gsub } = face;
	let glyphs = run.chars.map((ch) => font.cmap.get(ch.codePointAt(0) ?? 0) ?? 0);
	if (gsub) {
		glyphs = gsub.substitute(glyphs);
	}
	let units = 0;
	let last = previous;
	for (const glyph of glyphs) {
		units += (font.advances[glyph] ?? 0) + kernInto(last, face, glyph);
		last = { face, glyph };
	}
	return { units, last };
}

/**
 * The pair kern between the previous glyph and this one, when both are drawn
 * from the same face and it kerns at all.
 * @param last The previous glyph, when any.
 * @param face The current face.
 * @param glyph The current glyph.
 * @returns The kern in font units, 0 when none applies.
 */
function kernInto(last: Previous | null, face: LoadedFace, glyph: number): number {
	if (last?.face !== face || !face.gpos) {
		return 0;
	}
	return face.gpos.kern(last.glyph, glyph);
}

/**
 * Sum every run's advance, per units-per-em. Advances are integers in font
 * units, so they are summed as integers and scaled once —
 * `units * fontSize / unitsPerEm`, in that order, per distinct units-per-em
 * rather than per run. Every other arrangement leaves an ulp behind:
 * dividing as each advance is added gave `AuthService` 114.50000000000001
 * against the browser's 114.5, scaling an em figure afterwards gave `Queue`
 * 58.760000000000005, and scaling per run gave `a standalone caption`
 * 203.66000000000003 because it is three words. A note carrying a width one
 * ulp off a browser's is a difference something downstream has to either
 * notice or hide.
 * @param words The line's words.
 * @param missing Collects the characters no face covers.
 * @returns Units by units-per-em.
 */
function unitsPerEm(words: readonly Word[], missing: string[]): Map<number, number> {
	const unitsPer = new Map<number, number>();
	for (const { runs } of words) {
		let previous: Previous | null = null;
		for (const run of runs) {
			if (!run.face) {
				missing.push(...run.chars);
				previous = null;
				continue;
			}
			const measured = runUnits(run, run.face, previous);
			previous = measured.last;
			const em = run.face.font.unitsPerEm;
			unitsPer.set(em, (unitsPer.get(em) ?? 0) + measured.units);
		}
	}
	return unitsPer;
}

/**
 * One line of text, in pixels at `fontSize`.
 *
 * A kern across a subset boundary is left at zero. Chrome applies one for
 * Nunito, and neither of the two files says what it is: they number their
 * kerning classes differently, so no combination of the two tables produces
 * Chrome's answer. It costs at most 2.34 px at fontSize 20, on 511 of 58,564
 * Latin pairs, in the one family that shows it. Excalifont — the family
 * archboard writes — has no disagreement of this kind anywhere.
 * @param text The line.
 * @param fontSize The font size in pixels.
 * @param fontFamily The family number.
 * @returns The width and the characters nothing covered.
 */
export function measureLine(text: string, fontSize: number, fontFamily: number): LineMeasurement {
	const stack = faceStack(fontFamily);
	if (stack.length === 0) {
		return { width: 0, missing: Array.from(text) };
	}
	const missing: string[] = [];
	let width = 0;
	for (const [em, units] of unitsPerEm(wordsOf(text, stack), missing)) {
		width += (units * fontSize) / em;
	}
	return { width, missing };
}

/**
 * One line of text, in pixels at `fontSize`.
 * @param text The line.
 * @param fontSize The font size in pixels.
 * @param fontFamily The family number.
 * @returns The width.
 */
export function measureLineWidth(text: string, fontSize: number, fontFamily: number): number {
	return measureLine(text, fontSize, fontFamily).width;
}

export interface TextSize {
	width: number;
	height: number;
	/** Characters no shipped file covers. A caller may report them; nothing here does. */
	missing: string[];
}

/**
 * The size Excalidraw gives a piece of text: the widest line, and the height
 * that follows from the line count.
 *
 * `lineHeight` is taken from the element when it carries one, because a board
 * that has been through an older Excalidraw may hold a different value and the
 * element's own record is what that Excalidraw will render from.
 * @param text The text, possibly several lines.
 * @param fontSize The font size in pixels.
 * @param fontFamily The family number.
 * @param lineHeight The element's own line height, when it carries one.
 * @returns The size and the characters nothing covered.
 */
export function measureText(
	text: string,
	fontSize: number,
	fontFamily: number,
	lineHeight?: number,
): TextSize {
	const lines = text.split("\n");
	let width = 0;
	const missing: string[] = [];
	for (const line of lines) {
		const measured = measureLine(line, fontSize, fontFamily);
		width = Math.max(width, measured.width);
		missing.push(...measured.missing);
	}
	const perLine = lineHeight ?? lineHeightOf(fontFamily);
	return { width, height: fontSize * perLine * lines.length, missing };
}
