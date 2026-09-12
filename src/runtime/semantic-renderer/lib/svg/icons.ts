// The chip glyph for a node's kind.
//
// Forked from PR Lens's `svg/icons.ts`. The drawings are the same; the way they
// are written is not. Upstream had one fifteen-arm switch, which is a shape this
// repository's complexity limit will not hold, so each glyph is a short list of
// primitives and one painter draws all of them. The vocabulary is unchanged —
// Archboard's `NodeKind` is PR Lens's, at the revision this was forked from.
//
// These say "what sort of thing is this" at a glance and nothing more, which is
// why the kind enum is coarse. Every kind draws something: a card with an empty
// chip reads as a rendering fault rather than as an unknown kind.

import type { NodeKind } from "@/shared/semantic-board/index";
import { coord } from "@/runtime/semantic-renderer/lib/geometry";
import { fontAttributes, GLYPH_FONT } from "@/runtime/semantic-renderer/lib/fonts";
import { lines, tag, textNode, wrap } from "@/runtime/semantic-renderer/lib/svg/primitives";
import type { SvgStyles } from "@/runtime/semantic-renderer/lib/svg/styles";

/** A point relative to the chip's centre. */
type Offset = readonly [number, number];

/** One primitive of a glyph, positioned relative to the chip's centre. */
type Shape =
	| { readonly kind: "box"; readonly w: number; readonly h: number; readonly r: number }
	| { readonly kind: "dot"; readonly at: Offset; readonly r: number }
	| { readonly kind: "ring"; readonly at: Offset; readonly r: number }
	| {
			readonly kind: "line";
			readonly points: readonly Offset[];
			readonly closed?: true;
			readonly filled?: true;
	  }
	| { readonly kind: "cylinder"; readonly rx: number; readonly ry: number; readonly h: number }
	| { readonly kind: "mark"; readonly text: string; readonly size: number };

/**
 * A stroked rectangle centred on the chip.
 * @param w How wide.
 * @param h How tall.
 * @param r Its corner radius.
 * @returns The shape.
 */
function box(w: number, h: number, r: number): Shape {
	return { kind: "box", w, h, r };
}

/**
 * A stroked polyline.
 * @param points Its points, relative to the chip's centre.
 * @returns The shape.
 */
function line(...points: Offset[]): Shape {
	return { kind: "line", points };
}

/**
 * A filled polygon.
 * @param points Its points, relative to the chip's centre.
 * @returns The shape.
 */
function solid(...points: Offset[]): Shape {
	return { kind: "line", points, closed: true, filled: true };
}

/**
 * A filled dot.
 * @param at Where, relative to the chip's centre.
 * @param r Its radius.
 * @returns The shape.
 */
function dot(at: Offset, r: number): Shape {
	return { kind: "dot", at, r };
}

/**
 * Every kind's glyph. Sizes are in chip units, which is to say pixels at the
 * chip's own scale, measured from its centre.
 */
const GLYPHS: Readonly<Record<NodeKind, readonly Shape[]>> = {
	service: [box(13, 13, 3), dot([0, 0], 2)],
	app: [box(14, 12, 2), line([-7, -2], [7, -2])],
	module: [{ kind: "mark", text: "{ }", size: 10.5 }],
	function: [{ kind: "mark", text: "ƒ", size: 13 }],
	route: [solid([-7, -6], [7, 0], [-7, 6])],
	job: [{ kind: "ring", at: [0, 0], r: 6.5 }, line([0, -3.5], [0, 0], [3, 0])],
	queue: [
		line([-6.5, -4.5], [6.5, -4.5]),
		line([-6.5, 0], [6.5, 0]),
		line([-6.5, 4.5], [6.5, 4.5]),
	],
	datastore: [{ kind: "cylinder", rx: 6.5, ry: 2.6, h: 9 }],
	cache: [solid([1, -7], [-6, 1], [-1, 1], [-1, 7], [6, -1], [1, -1])],
	external: [box(16, 12, 2), line([-8, -4], [0, 2], [8, -4])],
	ui: [box(14, 12, 2), line([-2.5, -6], [-2.5, 6])],
	config: [line([-7, -4], [7, -4]), line([-7, 4], [7, 4]), dot([-2, -4], 2.2), dot([3, 4], 2.2)],
	test: [line([-6, 0], [-2, 4], [6, -4])],
	package: [
		line([0, -7], [6.5, -3.5], [6.5, 3.5], [0, 7], [-6.5, 3.5], [-6.5, -3.5], [0, -7]),
		line([-6.5, -3.5], [0, 0], [6.5, -3.5]),
		line([0, 0], [0, 7]),
	],
	other: [dot([-5, 0], 1.8), dot([0, 0], 1.8), dot([5, 0], 1.8)],
};

/** Where a glyph is being drawn. */
interface Origin {
	/** The chip's centre, across. */
	readonly cx: number;
	/** The chip's centre, down. */
	readonly cy: number;
	/** The palette's attribute bundles. */
	readonly styles: SvgStyles;
}

/**
 * A polyline's `d` attribute.
 * @param points The points, relative to the chip's centre.
 * @param origin Where the glyph is being drawn.
 * @param closed Whether to close the path.
 * @returns The path data.
 */
function polyline(points: readonly Offset[], origin: Origin, closed: boolean): string {
	const drawn = points
		.map(
			([dx, dy], index) =>
				`${index === 0 ? "M" : "L"}${coord(origin.cx + dx)},${coord(origin.cy + dy)}`,
		)
		.join(" ");
	return closed ? `${drawn} Z` : drawn;
}

/** How far below the chip's centre a glyph character's baseline sits. */
const MARK_BASELINE = 0.35;

/**
 * A glyph drawn as a character rather than as a shape: the two kinds whose
 * conventional picture is a piece of type.
 *
 * Both are set in the mono face the document registers. PR Lens set its `ƒ` in
 * italic Georgia, which is a family nothing here ships — and a document that
 * names a face it does not register draws whatever the host has, which is the
 * bug this module exists not to have. DM Mono carries `ƒ`; Onest does not.
 * @param shape The shape.
 * @param origin Where the glyph is being drawn.
 * @returns The markup.
 */
function drawMark(shape: Extract<Shape, { kind: "mark" }>, origin: Origin): string {
	return textNode(
		{
			x: coord(origin.cx),
			y: coord(origin.cy + shape.size * MARK_BASELINE),
			"text-anchor": "middle",
			"font-size": shape.size,
			...fontAttributes(GLYPH_FONT),
			...origin.styles.glyph,
		},
		shape.text,
	);
}

/**
 * The three shapes that are drawn with a path.
 * @param shape The shape.
 * @param origin Where the glyph is being drawn.
 * @returns The markup.
 */
function drawPath(
	shape: Extract<Shape, { kind: "line" | "cylinder" | "mark" }>,
	origin: Origin,
): string {
	const { cx, cy, styles } = origin;
	if (shape.kind === "line") {
		const paint = shape.filled === true ? { ...styles.glyph, stroke: "none" } : styles.glyphStroke;
		return tag("path", { d: polyline(shape.points, origin, shape.closed === true), ...paint });
	}
	if (shape.kind === "cylinder") {
		const { rx, ry, h } = shape;
		return lines([
			tag("ellipse", { cx: coord(cx), cy: coord(cy - h / 2), rx, ry, ...styles.glyphStroke }),
			tag("path", {
				d: `M${coord(cx - rx)},${coord(cy - h / 2)} v${coord(h)} a${rx},${ry} 0 0 0 ${coord(rx * 2)} 0 v${coord(-h)}`,
				...styles.glyphStroke,
			}),
		]);
	}
	return drawMark(shape, origin);
}

/**
 * One primitive of a glyph.
 * @param shape The shape.
 * @param origin Where the glyph is being drawn.
 * @returns The markup.
 */
function drawShape(shape: Shape, origin: Origin): string {
	const { cx, cy, styles } = origin;
	if (shape.kind === "box") {
		return tag("rect", {
			x: coord(cx - shape.w / 2),
			y: coord(cy - shape.h / 2),
			width: coord(shape.w),
			height: coord(shape.h),
			rx: coord(shape.r),
			...styles.glyphStroke,
		});
	}
	if (shape.kind === "dot") {
		const [dx, dy] = shape.at;
		return tag("circle", { cx: coord(cx + dx), cy: coord(cy + dy), r: shape.r, ...styles.glyph });
	}
	if (shape.kind === "ring") {
		const [dx, dy] = shape.at;
		return tag("circle", {
			cx: coord(cx + dx),
			cy: coord(cy + dy),
			r: shape.r,
			...styles.glyphStroke,
		});
	}
	return drawPath(shape, origin);
}

/**
 * The glyph for a node's kind, centred on a point and drawn in one ink.
 *
 * The shape is the kind's and the ink is the caller's: what a thing IS decides
 * the silhouette, what it is PART OF decides the colour, and keeping the two
 * apart is what lets a reader see both at once.
 * @param kind What sort of thing the node is.
 * @param cx The chip's centre, across.
 * @param cy The chip's centre, down.
 * @param styles The palette's attribute bundles.
 * @param ink What colour to draw it in.
 * @returns The markup.
 */
function glyphGroup(
	kind: NodeKind,
	cx: number,
	cy: number,
	styles: SvgStyles,
	ink: string,
): string {
	const origin: Origin = {
		cx,
		cy,
		styles: {
			...styles,
			glyph: { ...styles.glyph, fill: ink },
			glyphStroke: { ...styles.glyphStroke, stroke: ink },
		},
	};
	return wrap("g", {}, lines(GLYPHS[kind].map((shape) => drawShape(shape, origin))));
}

export { glyphGroup };
