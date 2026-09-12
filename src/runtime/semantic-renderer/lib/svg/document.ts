// The file the painted body is wrapped in.
//
// Forked from PR Lens's `svg/document.ts`. The dot-grid ground went: the
// operator shell is flat, and a texture behind a diagram of one-pixel rules
// fights it. What is new is the small stylesheet — upstream had none, because
// GitHub's image proxy can ignore CSS, and Archboard shows these in its own
// pane. It carries the `@font-face` rules that make the picture draw in the
// faces it was measured in, plus the pointer cursor and the selection ring a
// viewer toggles.
//
// There is no script in the document. In `linked` mode it refers to the four
// font files the canvas serves and to nothing else; in `embedded` mode it
// refers to nothing at all.

import { coord, type Canvas } from "@/runtime/semantic-renderer/lib/geometry";
import type { FontSource } from "@/shared/semantic-board/index";
import { faceRules, SANS_STACK } from "@/runtime/semantic-renderer/lib/fonts";
import type { Palette } from "@/runtime/semantic-renderer/lib/theme";
import { escapeXml, lines, tag, wrap } from "@/runtime/semantic-renderer/lib/svg/primitives";
import { PULSE_CLASS } from "@/runtime/semantic-renderer/lib/svg/pulse";
import {
	WEIGHTS,
	weightColour,
	type Head,
	type Weight,
} from "@/runtime/semantic-renderer/lib/svg/styles";

/** How big an arrowhead of each weight is. A hero's head is part of its weight. */
const HEAD_SIZE: Readonly<Record<Weight, number>> = { hero: 7.5, normal: 6, muted: 5.5 };

/**
 * One arrowhead marker.
 *
 * The open head anchors at its tip so the line runs all the way into the point,
 * where a filled head covers its own line end.
 * @param head Which form.
 * @param weight How loudly the line it ends speaks.
 * @param palette The theme's colours.
 * @returns The marker element.
 */
function marker(head: Head, weight: Weight, palette: Palette): string {
	const size = HEAD_SIZE[weight];
	const colour = weightColour(palette, weight);
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
			id: `ah-${head}-${weight}`,
			viewBox: "0 0 10 10",
			refX: head === "filled" ? 8 : 10,
			refY: 5,
			markerWidth: size,
			markerHeight: size,
			orient: "auto-start-reverse",
		},
		shape,
	);
}

/**
 * Every arrowhead the document can reach for.
 * @param palette The theme's colours.
 * @returns The marker elements.
 */
function markers(palette: Palette): string {
	const heads: readonly Head[] = ["filled", "open"];
	return heads.flatMap((head) => WEIGHTS.map((weight) => marker(head, weight, palette))).join("");
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
			// A reader who has asked their system for less motion gets a still
			// picture even when nobody asked this renderer for one. CSS cannot stop
			// a SMIL animation, so the layer it moves is hidden instead: the dots go
			// and the lines they rode stay exactly as they were.
			`@media(prefers-reduced-motion:reduce){.${PULSE_CLASS}{display:none}}`,
		].join(""),
	);
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
}

/**
 * Wraps painted content in a standalone SVG file.
 * @param input The page, its palette and its body.
 * @returns The whole document.
 */
function svgDocument(input: DocumentInput): string {
	const { width, height, palette, title, description, fonts, body } = input;
	const defs = wrap("defs", {}, markers(palette));
	return lines([
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${coord(width)} ${coord(height)}" ` +
			`width="${coord(width)}" height="${coord(height)}" role="img" aria-label="${escapeXml(title)}" ` +
			`font-family="${escapeXml(SANS_STACK)}">`,
		wrap("title", {}, escapeXml(title)),
		description === undefined ? "" : wrap("desc", {}, escapeXml(description)),
		stylesheet(palette, fonts),
		defs,
		tag("rect", {
			x: 0,
			y: 0,
			width: coord(width),
			height: coord(height),
			fill: palette.background,
		}),
		body,
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
