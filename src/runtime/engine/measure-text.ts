// How wide a piece of text is, with no browser open.
//
// A box has to fit its words, and the renderer decides how big a box is before
// any browser sees the picture. There is no estimation anywhere in that path,
// so whatever measures, decides. An estimate of 0.6 x fontSize per character
// was not a bad number needing tuning; it made `AuthService` 76.7 px too wide.
//
// So this reproduces the browser. Four things beyond summing advance widths,
// each found by measuring against Chrome rather than reasoned about
// (docs/design/measuring-text-outside-a-browser.md):
//
//   the face comes from the `@font-face` unicode-range, not from which file
//     happens to carry the glyph (font-faces.ts)
//   GPOS pair kerning and GSUB ligatures apply (font-layout.ts)
//   no shaping crosses a space, because Blink shapes word by word: a font
//     that kerns ` A` does not get to, and eight such pairs disagreed until
//     the string was split at spaces first
//   U+00AD and the other default-ignorables lay out as nothing
//
// With those it agreed with Chrome across 130,000 measurements to within
// 0.0012 px, and `src/runtime/engine/tests/text-metrics.test.ts` pins the numbers.
//
// HEIGHT IS NOT MEASURED. A line's height is `fontSize * lineHeight`, and the
// renderer owns both numbers; no canvas and no glyphs are involved, so
// measuring one here would be inventing a second answer to a settled question.

import { loadFace, type FaceDescriptor, type LoadedFace } from "@/runtime/engine/font-faces";

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
 * One line of text, in pixels, in a face stack the caller names.
 *
 * The one way text is measured. The caller names the faces — the renderer
 * knows which file each family and weight is — and the word splitting, face
 * selection, kerning and ligature handling stay here, so there is never a
 * second answer to "how wide is this string".
 * @param text The line.
 * @param fontSize The font size in pixels.
 * @param stack The families to try, in CSS order, each as its faces.
 * @returns The width and the characters nothing covered.
 */
export function measureLineIn(
	text: string,
	fontSize: number,
	stack: readonly FaceDescriptor[][],
): LineMeasurement {
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
