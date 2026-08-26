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
// 0.0012 px, and `scripts/check-text-metrics.mjs` pins the numbers.
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
} from "./fonts.js";

export { canMeasure } from "./fonts.js";

// Characters a browser lays out as zero width: soft hyphen, zero-width space,
// the joiners, and the byte-order mark.
const IGNORABLE = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0xfeff]);

const SPACE = 0x20;

/**
 * The face a character comes from.
 *
 * Within a family the last `@font-face` whose `unicode-range` covers the
 * character wins, as CSS says; families are tried in the order the stack
 * declares them.
 */
function faceFor(
	codepoint: number,
	stack: readonly FaceDescriptor[][],
): { descriptor: FaceDescriptor; loaded: LoadedFace } | undefined {
	for (const faces of stack) {
		for (let i = faces.length - 1; i >= 0; i--) {
			const descriptor = faces[i] as FaceDescriptor;
			const ranges = descriptor.ranges;
			if (ranges !== null && !ranges.some(([a, b]) => codepoint >= a && codepoint <= b)) continue;
			let loaded: LoadedFace;
			try {
				loaded = loadFace(descriptor.file);
			} catch {
				continue;
			}
			if (loaded.font.cmap.has(codepoint)) return { descriptor, loaded };
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

/**
 * One line of text, in pixels at `fontSize`.
 *
 * Split into words first and into single-face runs inside a word, because a
 * subset boundary changes which file a glyph is drawn from but not whether it
 * kerns against its neighbour — while a space stops shaping outright.
 *
 * A kern across a subset boundary is left at zero. Chrome applies one for
 * Nunito, and neither of the two files says what it is: they number their
 * kerning classes differently, so no combination of the two tables produces
 * Chrome's answer. It costs at most 2.34 px at fontSize 20, on 511 of 58,564
 * Latin pairs, in the one family that shows it. Excalifont — the family
 * archboard writes — has no disagreement of this kind anywhere.
 */
export function measureLine(text: string, fontSize: number, fontFamily: number): LineMeasurement {
	const stack = faceStack(fontFamily);
	if (stack.length === 0) return { width: 0, missing: Array.from(text) };

	interface Run {
		face: LoadedFace | undefined;
		chars: string[];
	}
	const words: Array<{ runs: Run[] }> = [];
	let word: { runs: Run[]; isSpace: boolean } | null = null;

	for (const ch of text) {
		const codepoint = ch.codePointAt(0) as number;
		if (IGNORABLE.has(codepoint)) continue;
		const isSpace = codepoint === SPACE;
		if (!word || isSpace || word.isSpace) {
			word = { runs: [], isSpace };
			words.push(word);
		}
		// The parsed face, not the descriptor, because runs are split on face
		// identity and `loadFace` is what caches one object per file.
		const face = faceFor(codepoint, stack)?.loaded;
		let run = word.runs[word.runs.length - 1];
		if (!run || run.face !== face) {
			run = { face, chars: [] };
			word.runs.push(run);
		}
		run.chars.push(ch);
	}

	// Advances are integers in font units, so they are summed as integers and
	// scaled once — `units * fontSize / unitsPerEm`, in that order, per distinct
	// units-per-em rather than per run. Every other arrangement leaves an ulp
	// behind: dividing as each advance is added gave `AuthService`
	// 114.50000000000001 against the browser's 114.5, scaling an em figure
	// afterwards gave `Queue` 58.760000000000005, and scaling per run gave
	// `a standalone caption` 203.66000000000003 because it is three words. A
	// note carrying a width one ulp off a browser's is a difference something
	// downstream has to either notice or hide.
	const unitsPer = new Map<number, number>();
	const missing: string[] = [];
	for (const { runs } of words) {
		let previous: { face: LoadedFace; glyph: number } | null = null;
		for (const run of runs) {
			if (!run.face) {
				missing.push(...run.chars);
				previous = null;
				continue;
			}
			const { font, gsub, gpos } = run.face;
			let glyphs = run.chars.map((ch) => font.cmap.get(ch.codePointAt(0) as number) as number);
			if (gsub) glyphs = gsub.substitute(glyphs);
			let units = 0;
			for (const glyph of glyphs) {
				units += font.advances[glyph] ?? 0;
				if (previous && previous.face === run.face && gpos) {
					units += gpos.kern(previous.glyph, glyph);
				}
				previous = { face: run.face, glyph };
			}
			unitsPer.set(font.unitsPerEm, (unitsPer.get(font.unitsPerEm) ?? 0) + units);
		}
	}
	let width = 0;
	for (const [unitsPerEm, units] of unitsPer) width += (units * fontSize) / unitsPerEm;
	return { width, missing };
}

/** One line of text, in pixels at `fontSize`. */
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
 */
export function measureText(
	text: string,
	fontSize: number,
	fontFamily: number,
	lineHeight?: number,
): TextSize {
	const lines = String(text ?? "").split("\n");
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
