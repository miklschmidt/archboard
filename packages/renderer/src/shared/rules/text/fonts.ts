// The faces a diagram is drawn in. The renderer core writes the `@font-face`
// rules that put them in front of a browser (ADR 0057); this host measures
// text in them, and hands the core their bytes for a document that embeds them.
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
// synthesise a face wider than anything that was measured. The weight of a
// `DiagramFont` makes that unsayable, and `font-synthesis: none` in the document's
// stylesheet makes it harmless if it were ever said anyway.
//
// The faces are the operator shell's own type — Onest and DM Mono, both under
// the SIL Open Font License, whose texts sit beside the files in
// `packages/renderer/assets/fonts/OFL-*.txt`.

import type * as Core from "#shared/protocol/generated/core/types.ts";
import { rendererHost } from "#shared/rules/render/host.ts";

/** Which of the two families a piece of text is set in. */
type DiagramFamily = Core.DiagramFamily;

/**
 * One face: a family and a weight, which together name exactly one file. The
 * two weights, 400 and 500, are the only ones that exist as files.
 */
type DiagramFont = Core.DiagramFont;

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

/** Where the Archboard server serves the same files from. */
const FONT_URL_PREFIX = "/assets/diagram-fonts";

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
 * The family stack a piece of text is set in: the face the document names for
 * it, and the face it is measured in.
 * @param font The family and weight.
 * @returns The CSS family stack.
 */
function fontStack(font: DiagramFont): string {
	return font.family === "mono" ? MONO_STACK : SANS_STACK;
}

const encoded = new Map<string, string>();

/**
 * One font file as base64, asked of the host once per process.
 * @param file The file's name.
 * @returns Its bytes, base64 encoded.
 */
function base64Of(file: string): string {
	const known = encoded.get(file);
	if (known !== undefined) {
		return known;
	}
	const bytes = rendererHost().fontBase64(file);
	encoded.set(file, bytes);
	return bytes;
}

/**
 * A card's name — the one thing on a card a reader is scanning for — and a
 * container's or a flow's, on its header slab.
 */
const CARD_TITLE_FONT: DiagramFont = { family: "sans", weight: 500 };
/** What a card, a container or a flow is responsible for, subordinate to its name. */
const CARD_NOTE_FONT: DiagramFont = { family: "sans", weight: 400 };
/** What a connection carries: small, technical, and on a plate. */
const PILL_FONT: DiagramFont = { family: "sans", weight: 500 };

export {
	type DiagramFamily,
	type DiagramFont,
	FACES,
	FONT_URL_PREFIX,
	fontStack,
	base64Of,
	CARD_TITLE_FONT,
	CARD_NOTE_FONT,
	PILL_FONT,
};
