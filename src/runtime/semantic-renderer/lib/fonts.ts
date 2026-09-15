// The faces a diagram is drawn in, and the `@font-face` rules that put them
// in front of a browser.
//
// The renderer owns its own type. It does not borrow the page's: the
// application stylesheet registers `Archboard Onest` from the variable file
// across 400-700, and a second registration of that name from a different file
// would be a coin toss over which file a weight actually came from. Under
// distinct names, the file the browser draws from is exactly the file the
// server measured, which is the whole point — a document that names a family it
// does not register draws in whatever the host happens to have, and then its
// boxes do not fit their words.
//
// Two weights, and only two. 400 and 500 ship as real files and are both
// measured. 600 and 700 do not exist here: asking for one would make a browser
// synthesise a face wider than anything that was measured. `DiagramWeight`
// makes that unsayable in this module, and `font-synthesis: none` in the
// document's stylesheet makes it harmless if it were ever said anyway.
//
// The faces are the operator shell's own type — Onest and DM Mono, both under
// the SIL Open Font License, whose texts sit beside the files in
// `src/ui/shell/assets/fonts/OFL-*.txt`.

import type { FontSource } from "@/shared/semantic-board/index";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FaceDescriptor } from "@/runtime/engine/font-faces";

/** Which of the two families a piece of text is set in. */
type DiagramFamily = "sans" | "mono";

/** The two weights that exist as files. There is no third. */
type DiagramWeight = 400 | 500;

/** One face: a family and a weight, which together name exactly one file. */
interface DiagramFont {
	/** Which family. */
	readonly family: DiagramFamily;
	/** Which weight. */
	readonly weight: DiagramWeight;
}

/** Where the faces come from when the document is opened. */

/** The names the document registers. Deliberately not the shell's own names. */
const SANS_CSS_FAMILY = "Archboard Diagram Sans";
const MONO_CSS_FAMILY = "Archboard Diagram Mono";

/**
 * The stack a document names, family first and then a generic. The generic is
 * a last resort for a browser that could not fetch the file at all; anything it
 * draws is by definition not what was measured.
 */
const SANS_STACK = `"${SANS_CSS_FAMILY}", ui-sans-serif, system-ui, sans-serif`;
const MONO_STACK = `"${MONO_CSS_FAMILY}", ui-monospace, monospace`;

/** Where the canvas serves the same files from. */
const FONT_URL_PREFIX = "/assets/diagram-fonts";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(moduleDir, "../../../ui/shell/assets/fonts");

/** One registered face. */
interface DiagramFace {
	/** Which family and weight it answers to. */
	readonly font: DiagramFont;
	/** The CSS family name the document registers it under. */
	readonly cssFamily: string;
	/** The file it comes from, by name. */
	readonly file: string;
}

/**
 * Every face the document registers.
 *
 * The 400 sans is the variable file at its default instance, which is 400; the
 * others are static files. All four are registered on every document, whether
 * or not this particular picture uses all of them, so that the stylesheet is
 * the same shape in every render and a later change of weight somewhere in the
 * painter cannot quietly produce a document missing a face.
 */
const FACES: readonly DiagramFace[] = [
	{
		font: { family: "sans", weight: 400 },
		cssFamily: SANS_CSS_FAMILY,
		file: "Onest-wght-v1.000.ttf",
	},
	{
		font: { family: "sans", weight: 500 },
		cssFamily: SANS_CSS_FAMILY,
		file: "Onest-Medium-v1.000.ttf",
	},
	{
		font: { family: "mono", weight: 400 },
		cssFamily: MONO_CSS_FAMILY,
		file: "DMMono-Regular-v1.000.ttf",
	},
	{
		font: { family: "mono", weight: 500 },
		cssFamily: MONO_CSS_FAMILY,
		file: "DMMono-Medium-v1.000.ttf",
	},
];

/**
 * The face a font names.
 * @param font The family and weight.
 * @returns Its face.
 * @throws {Error} Never in practice: the four faces cover the whole of the type.
 */
function faceOf(font: DiagramFont): DiagramFace {
	const face = FACES.find(
		(candidate) => candidate.font.family === font.family && candidate.font.weight === font.weight,
	);
	if (face === undefined) {
		throw new Error(`no diagram face for ${font.family} ${font.weight}`);
	}
	return face;
}

const stacks = new Map<string, FaceDescriptor[][]>();

/**
 * The face stack to measure a font in: one family, one file, the whole of
 * Unicode. A character no file covers measures as nothing and is reported by
 * `measureLineIn` as missing, exactly as it is for board text.
 * @param font The family and weight.
 * @returns The stack, cached across renders.
 */
function stackFor(font: DiagramFont): FaceDescriptor[][] {
	const key = `${font.family}-${font.weight}`;
	const known = stacks.get(key);
	if (known !== undefined) {
		return known;
	}
	const stack: FaceDescriptor[][] = [
		[{ file: path.join(FONT_DIR, faceOf(font).file), ranges: null }],
	];
	stacks.set(key, stack);
	return stack;
}

/**
 * The family and weight attributes a piece of text carries.
 *
 * Measurement and emission come from the same value, so a string drawn at 500
 * cannot have been measured at 400: there is one `DiagramFont` per role and it
 * is passed to both.
 * @param font The family and weight.
 * @returns The presentation attributes to write on the element.
 */
function fontAttributes(font: DiagramFont): {
	readonly "font-family": string;
	readonly "font-weight": number;
} {
	return {
		"font-family": font.family === "mono" ? MONO_STACK : SANS_STACK,
		"font-weight": font.weight,
	};
}

const encoded = new Map<string, string>();

/**
 * One font file as base64, read once per process.
 * @param file The file's name.
 * @returns Its bytes, base64 encoded.
 */
function base64Of(file: string): string {
	const known = encoded.get(file);
	if (known !== undefined) {
		return known;
	}
	const bytes = fs.readFileSync(path.join(FONT_DIR, file)).toString("base64");
	encoded.set(file, bytes);
	return bytes;
}

/**
 * Where one face's bytes come from.
 *
 * A linked document is what a pane shows: the canvas serves the same files, so
 * the browser fetches four small files and the SVG stays a few kilobytes. An
 * embedded one is what somebody keeps: it carries its faces with it and draws
 * the same picture on a machine that has never heard of Archboard, at the cost
 * of about half a megabyte.
 * @param face The face.
 * @param source Which of the two modes.
 * @returns The `src` descriptor's value.
 */
function faceSource(face: DiagramFace, source: FontSource): string {
	if (source === "embedded") {
		return `url("data:font/ttf;base64,${base64Of(face.file)}") format("truetype")`;
	}
	return `url("${FONT_URL_PREFIX}/${face.file}") format("truetype")`;
}

/**
 * The `@font-face` rules the document registers its own type with.
 * @param source Where the faces come from.
 * @returns The rules, as one CSS string.
 */
function faceRules(source: FontSource): string {
	return FACES.map(
		(face) =>
			`@font-face{font-family:"${face.cssFamily}";font-style:normal;` +
			`font-weight:${face.font.weight};src:${faceSource(face, source)}}`,
	).join("");
}

/** A card's name — the one thing on a card a reader is scanning for. */
const CARD_TITLE_FONT: DiagramFont = { family: "sans", weight: 500 };
/** What a card is responsible for, subordinate to its name. */
const CARD_NOTE_FONT: DiagramFont = { family: "sans", weight: 400 };
/** A band's name, which is a label rather than a name and is set as one. */
const HEADER_NAME_FONT: DiagramFont = { family: "sans", weight: 500 };
/** What a band is responsible for. */
const HEADER_NOTE_FONT: DiagramFont = { family: "sans", weight: 400 };
/** What a connection carries: small, technical, and on a plate. */
const PILL_FONT: DiagramFont = { family: "sans", weight: 500 };
/** The two kind glyphs that are drawn as characters rather than as shapes. */
const GLYPH_FONT: DiagramFont = { family: "mono", weight: 400 };

export {
	type DiagramFamily,
	type DiagramWeight,
	type DiagramFont,
	SANS_STACK,
	stackFor,
	fontAttributes,
	faceRules,
	CARD_TITLE_FONT,
	CARD_NOTE_FONT,
	HEADER_NAME_FONT,
	HEADER_NOTE_FONT,
	PILL_FONT,
	GLYPH_FONT,
};
