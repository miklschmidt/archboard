// The file the painted body is wrapped in.
//
// Forked from PR Lens's `svg/document.ts`. The dot-grid ground went: a
// texture behind the picture fights the parts that stand on it. What is new is the small stylesheet — upstream had none, because
// GitHub's image proxy can ignore CSS, and Archboard shows these in its own
// pane. It carries the `@font-face` rules that make the picture draw in the
// faces it was measured in, plus the pointer cursor and the selection ring a
// viewer toggles.
//
// There is no script in the document. In `linked` mode it refers to the four
// font files the Archboard server serves and to nothing else; in `embedded` mode it
// refers to nothing at all.
//
// Its colours are the page's own tokens (`lib/theme.ts`). Shown in a page, the
// picture takes them, and the page's `color-scheme`, from wherever it is put, so
// one picture serves both themes and a theme switch repaints nothing. A
// document that has to stand alone — a file, a bitmap — is drawn for one theme
// and carries that theme's value of every token it names on its root, or drawn
// `auto` and carries both, for the reader's colour scheme to choose between.

import { coord, type Canvas } from "@/transformers/semantic-renderer/lib/geometry";
import type { FontSource, StandaloneTheme } from "@archboard/board/render-reply";
import type { ReadingDirection } from "@/transformers/semantic-renderer/lib/drawing";
import { faceRules, SANS_STACK } from "@/transformers/semantic-renderer/lib/fonts";
import { themeColor } from "@/transformers/semantic-renderer/lib/host";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lightDark } from "@/transformers/semantic-renderer/lib/svg/colour";
import { escapeXml, lines, tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { portDefinitions } from "@/transformers/semantic-renderer/lib/svg/ports";
import { slabDefinitions } from "@/transformers/semantic-renderer/lib/svg/slab";
import {
	AWAY_PLACE,
	CHIP_CLASS,
	FAR_CLASS,
	FAR_PLACE,
	FAR_VIEW_CLASS,
	NEAR_CLASS,
	NEAR_PLACE,
	WORDS_CLASS,
} from "@/transformers/semantic-renderer/lib/svg/far-view";
import {
	MEMBERS_ATTRIBUTE,
	TRAFFIC_ATTRIBUTE,
} from "@/transformers/semantic-renderer/lib/svg/standing";
import { FAR_VIEW_SWAP_MS } from "@archboard/timing";
import { PULSE_CLASS } from "@/transformers/semantic-renderer/lib/svg/pulse";
import { HEAD_SHADE_CLASS } from "@/transformers/semantic-renderer/lib/sequence-design";
import {
	HEAD_REF_X,
	headWidths,
	LIT_HEAD,
	WEIGHTS,
	lineColour,
	type Head,
	type Weight,
} from "@/transformers/semantic-renderer/lib/svg/styles";
import type { SubjectStanding } from "@/transformers/semantic-renderer/lib/svg/standing";

/**
 * The standings an arrowhead is drawn for, beyond the plain one.
 *
 * A marker cannot inherit the colour of the line that references it — SVG
 * markers are painted in their own right — so every ink a line can be drawn in
 * needs its own. Four small elements in the defs, referenced or not.
 */
const MARKED: readonly SubjectStanding[] = ["added", "changed", "removed"];

/**
 * One arrowhead marker.
 *
 * The open head anchors at its tip so the line runs all the way into the point,
 * where a filled head covers its own line end.
 * @param head Which form.
 * @param weight How loudly the line it ends speaks.
 * @param ink The ink to draw it in, and what its id says about that ink.
 * @param ink.colour The colour.
 * @param ink.suffix The end of its id: nothing for the plain ink.
 * @returns The marker element.
 */
function marker(
	head: Head,
	weight: Weight,
	{ colour, suffix }: { readonly colour: string; readonly suffix: string },
): string {
	const size = coord(headWidths(weight));
	const shape =
		head === "filled"
			? tag("path", { d: "M0,0 L10,5 L0,10 z", fill: colour })
			: tag("path", {
					d: "M2,1 L10,5 L2,9",
					fill: "none",
					stroke: colour,
					"stroke-width": 1.7,
					"stroke-linecap": "round",
					"stroke-linejoin": "round",
				});
	return wrap(
		"marker",
		{
			id: `ah-${head}-${weight}${suffix}`,
			viewBox: "0 0 10 10",
			refX: HEAD_REF_X[head],
			refY: 5,
			markerWidth: size,
			markerHeight: size,
			orient: "auto-start-reverse",
		},
		shape,
	);
}

/**
 * Every arrowhead the document can reach for: one per form and weight in the
 * ink of the line's own weight, one more per standing that has an ink, and one
 * in the selection's ink for a lit message's trace.
 * @param palette The theme's colours.
 * @returns The marker elements.
 */
function markers(palette: Palette): string {
	const heads: readonly Head[] = ["filled", "open"];
	const inks = [
		{ colour: lineColour(palette, undefined), suffix: "" },
		...MARKED.map((standing) => ({
			colour: lineColour(palette, standing),
			suffix: `-${standing}`,
		})),
		{ colour: palette.selection, suffix: LIT_HEAD },
	];
	return heads
		.flatMap((head) => WEIGHTS.flatMap((weight) => inks.map((ink) => marker(head, weight, ink))))
		.join("");
}

/**
 * The document's stylesheet.
 *
 * Three jobs, and nothing else. It registers the faces the picture was measured
 * in, so that the file the browser draws from is the file the server measured —
 * a document that names a family it does not register draws in whatever the
 * host has, and then its boxes do not fit their words. And it carries the part
 * of a viewer's behaviour an attribute cannot say: the pointer cursor and the
 * selection ring a viewer toggles by putting `is-selected` on a group. And it
 * honours a reader's request for less motion in a file that may outlive the
 * caller who could have asked on their behalf.
 *
 * `font-synthesis: none` is the backstop under the weight rule. Only 400 and
 * 500 exist as files; asking for 600 would otherwise have a browser invent one,
 * wider than anything that was measured. With synthesis off, a stray weight
 * falls back to a real face instead of a made-up one. `DiagramWeight` in
 * `lib/fonts.ts` is what stops it being asked for in the first place.
 * @param palette The theme's colours.
 * @param fonts Where the faces come from.
 * @returns The style element.
 */
function stylesheet(palette: Palette, fonts: FontSource): string {
	return wrap(
		"style",
		{},
		[
			faceRules(fonts),
			"svg,text{font-synthesis:none}",
			"[data-semantic-kind]{cursor:pointer}",
			".ab-halo{opacity:0}",
			`.is-selected .ab-halo{opacity:1;stroke:${palette.selection}}`,
			// A viewer draws a selected line over the rest, so it is drawn whole: the
			// cuts where it ran under another line would be gaps in it now.
			".is-selected[mask]{mask:none}",
			// A flow's head a viewer has moved down to keep in view stands on the
			// frame's ground, which the picture draws hidden behind it.
			`.is-stuck>.${HEAD_SHADE_CLASS}{visibility:visible}`,
			// Seen from far away, a card is its name: a viewer puts the far class
			// on the picture when a card's own name would be too small to read,
			// and each card shows its name and chip grown to fill it instead.
			...farViewRules(),
			// A presented step's veil is a viewer's reading, toggled on the picture
			// the way selection is: the surface says a step is presented, the
			// subjects it is about stand as drawn, and everything else recedes. A
			// group's region and a junction mark are lit with the members they
			// list, and recede without.
			`.is-veiled [data-semantic-id],.is-veiled [${TRAFFIC_ATTRIBUTE}],.is-veiled [${MEMBERS_ATTRIBUTE}]{opacity:.28}`,
			".is-veiled .is-lit,.is-veiled .is-lit [data-semantic-id]{opacity:1}",
			// A reader who has asked their system for less motion gets a still
			// picture even when nobody asked this renderer for one. CSS cannot stop
			// a SMIL animation, so the layer it moves is hidden instead: the pulses go
			// and the lines they rode stay exactly as they were.
			`@media(prefers-reduced-motion:reduce){.${PULSE_CLASS}{display:none}}`,
		].join(""),
	);
}

/** How every part of a swap between the near and the far view moves: quick to leave, gentle to land, never past its end. */
const SWAP_EASE = "cubic-bezier(.4,0,.2,1)";

/**
 * How a picture swaps its cards' near and far views (TASK-428). A card's chip
 * is one element that moves and grows between its near and its far place. The
 * words of each view move to where the other view's words start, so the first
 * lines of the two views stand on one baseline at one size all the way, and
 * read as one block that changes. The two views fade over the same span with
 * the same easing, so at every moment the coming view is as opaque as the
 * leaving view is clear, and the words never fade out together. A view that
 * comes is drawn at once, still clear, and a view that leaves is hidden only
 * once it has faded out, so it is not painted after. The mark of a board a part
 * opens fades where it stands. A reader asking for less motion gets the swap at
 * once.
 * @returns The rules.
 */
function farViewRules(): string[] {
	const fade = `opacity ${FAR_VIEW_SWAP_MS}ms ${SWAP_EASE}`;
	const shown = `opacity:1;visibility:visible;transition:${fade},visibility 0s`;
	const hidden = `opacity:0;visibility:hidden;transition:${fade},visibility 0s linear ${FAR_VIEW_SWAP_MS}ms`;
	const move = `transition:transform ${FAR_VIEW_SWAP_MS}ms ${SWAP_EASE}`;
	const far = `.${FAR_VIEW_CLASS}`;
	return [
		`.${FAR_CLASS}{display:inline;${hidden}}`,
		`.${NEAR_CLASS}{${shown}}`,
		`${far} .${FAR_CLASS}{${shown}}`,
		`${far} .${NEAR_CLASS}{${hidden}}`,
		`.${CHIP_CLASS}{transform:var(${NEAR_PLACE});${move}}`,
		`${far} .${CHIP_CLASS}{transform:var(${FAR_PLACE})}`,
		`.${WORDS_CLASS}{${move}}`,
		`.${FAR_CLASS}>.${WORDS_CLASS},${far} .${NEAR_CLASS}>.${WORDS_CLASS}{transform:var(${AWAY_PLACE})}`,
		`${far} .${FAR_CLASS}>.${WORDS_CLASS}{transform:none}`,
		`@media(prefers-reduced-motion:reduce){.${FAR_CLASS},.${NEAR_CLASS},${far} .${FAR_CLASS},${far} .${NEAR_CLASS},.${CHIP_CLASS},.${WORDS_CLASS}{transition:none}}`,
	];
}

/** What a rendered document is made of. */
interface DocumentInput {
	/** The page width. */
	readonly width: number;
	/** The page height. */
	readonly height: number;
	/** The theme's colours. */
	readonly palette: Palette;
	/** What the picture is of, for the accessible name. */
	readonly title: string;
	/** A longer description, when there is one. */
	readonly description: string | undefined;
	/** Where the drawn faces come from. */
	readonly fonts: FontSource;
	/** The painted body. */
	readonly body: string;
	/** Which way the page reads, when the grammar has a reading direction. */
	readonly reading?: ReadingDirection | undefined;
	/**
	 * The theme a document that stands alone is drawn in; absent, it takes the
	 * theme of the page it is shown in.
	 */
	readonly theme?: StandaloneTheme | undefined;
}

/** A reference to one of the page's tokens, or to a property the document sets itself. */
const TOKEN_REFERENCE = /var\((--[\w-]+)\)/gu;

/**
 * A property the document sets on one of its own elements, such as the places
 * of a card's chip in its two views (`far-view.ts`). It is no token of the page.
 */
const OWN_PROPERTY = /[";](--[\w-]+):/gu;

/**
 * What a document that stands alone declares on its root: the colour scheme
 * its `light-dark()` choices follow, and the value of every token the
 * document names, in name order.
 *
 * Drawn for one theme, a token is that theme's value. Drawn `auto`, the scheme
 * is `light dark` and a token is `light-dark()` of its two values, the one
 * mechanism the picture's own choices already use: whoever shows the file, as
 * an image, a background or inline, picks the ground by the reader's colour
 * scheme (TASK-466).
 *
 * On the root's own `style` rather than in the stylesheet, so that the values
 * reach this document and nothing else wherever it is put: a stylesheet rule
 * inside an SVG applies to the whole page it is inlined into.
 * @param theme The theme it is drawn in.
 * @param document Everything the document paints with.
 * @returns The root's `style`.
 */
function standingAlone(theme: StandaloneTheme, document: string): string {
	// The stylesheet reads a card's places whether or not a card is drawn: a
	// legend exported by itself draws none.
	const own = new Set([
		NEAR_PLACE,
		FAR_PLACE,
		AWAY_PLACE,
		...[...document.matchAll(OWN_PROPERTY)].map((found) => found[1]!),
	]);
	const names = new Set(
		[...document.matchAll(TOKEN_REFERENCE)]
			.map((found) => found[1]!)
			.filter((name) => !own.has(name)),
	);
	return [
		`color-scheme:${theme === "auto" ? "light dark" : theme}`,
		...[...names].toSorted().map((name) => `${name}:${tokenValue(theme, name)}`),
	].join(";");
}

/**
 * One token's value in a document that stands alone.
 * @param theme The theme it is drawn in.
 * @param name The token.
 * @returns That theme's value, or for `auto` the choice between the two.
 */
function tokenValue(theme: StandaloneTheme, name: string): string {
	if (theme !== "auto") return themeColor(theme, name);
	const light = themeColor("light", name);
	const dark = themeColor("dark", name);
	return light === dark ? light : lightDark(light, dark);
}

/**
 * Wraps painted content in a standalone SVG file.
 * @param input The page, its palette and its body.
 * @returns The whole document.
 */
function svgDocument(input: DocumentInput): string {
	const { width, height, palette, title, description, fonts, body, reading, theme } = input;
	const painted = lines([
		stylesheet(palette, fonts),
		wrap("defs", {}, markers(palette) + slabDefinitions(palette) + portDefinitions(palette)),
		tag("rect", {
			x: 0,
			y: 0,
			width: coord(width),
			height: coord(height),
			fill: palette.background,
		}),
		body,
	]);
	return lines([
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${coord(width)} ${coord(height)}" ` +
			`width="${coord(width)}" height="${coord(height)}" role="img" aria-label="${escapeXml(title)}" ` +
			`font-family="${escapeXml(SANS_STACK)}"` +
			(reading === undefined ? "" : ` data-reading-direction="${reading}"`) +
			(theme === undefined ? "" : ` style="${escapeXml(standingAlone(theme, painted))}"`) +
			">",
		description === undefined ? "" : wrap("desc", {}, escapeXml(description)),
		painted,
		"</svg>",
	]);
}

/**
 * Moves painted content clear of the canvas edge when something was drawn above
 * or to the left of the origin. Wrapping rather than re-deriving every
 * coordinate keeps the geometry — and so the bytes — unchanged whenever the
 * shift is zero, which is the ordinary case.
 * @param canvas The page and its shift.
 * @param body The painted body.
 * @returns The body, moved onto the page.
 */
function shifted(canvas: Canvas, body: string): string {
	if (canvas.shiftX === 0 && canvas.shiftY === 0) {
		return body;
	}
	return wrap(
		"g",
		{ transform: `translate(${coord(canvas.shiftX)},${coord(canvas.shiftY)})` },
		body,
	);
}

export { svgDocument, shifted };
