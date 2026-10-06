// Depth by thickness. Every part of the picture is a block lit from the upper
// left, as a keycap or a foam-core model is: a flat top face with a fine
// highlight along its top edge and light that falls off down it, a front edge
// along its foot that shows how thick the block is, and a soft shadow it casts
// down and to the right on whatever it stands on.
//
// The layout box is the block's silhouette. Its thickness is drawn inside the
// box, along its foot, so a line that ends on the foot of a box meets the edge a
// reader sees; only the shadow reaches past the box. Nothing here is a filter, a
// blur or a mask, because a picture of a hundred cards is dragged and zoomed:
// depth is flat shapes, one shared gradient and stacked translucent copies of
// the silhouette.
//
// Each shape a block is built of is a rect drawn at an offset from the part's
// box, so a viewer that carries a card from one picture to the next
// (`picture-cards.ts`) draws each one at the moving box. A card, a container
// or a relationship's label opens with its seat, its box unpainted, which is
// the one shape of it that takes the pointer and the first shape a reader of
// the markup finds.

import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lightDark, mixed } from "@/transformers/semantic-renderer/lib/svg/colour";
import {
	lines,
	tag,
	wrap,
	type Attributes,
} from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	RING_DASH,
	standingInk,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";

/** A share of a colour mixed into another, on the light ground and on the dark one. */
interface Share {
	readonly light: number;
	readonly dark: number;
}

/**
 * A colour tinted by an ink, as much as each ground asks for.
 * @param base The colour.
 * @param ink The ink, or none to leave the colour as it is.
 * @param share How much of the ink, on each ground.
 * @returns The tinted colour.
 */
function tinted(base: string, ink: string | undefined, share: Share): string {
	if (ink === undefined) return base;
	const light = mixed(base, ink, share.light);
	return share.light === share.dark ? light : lightDark(light, mixed(base, ink, share.dark));
}

/** How a block looks: its two tones, how thick it is and how round its corners are. */
interface SlabLook {
	/** Its top face. */
	readonly face: string;
	/** Its front edge, the side of the block that faces the reader. */
	readonly edge: string;
	/** How tall its front edge shows, inside its box along its foot. */
	readonly thickness: number;
	readonly radius: number;
	/** Whether light falls off down its face: a card's and a chip's, not a container's broad top. */
	readonly sheen: boolean;
	/**
	 * A container's heading: how far down its face the heading's band reaches,
	 * and the band's tone. What the container itself relates to leaves from the
	 * band's lower edge, so the step in tone is that line's visible origin.
	 */
	readonly header?: { readonly height: number; readonly face: string } | undefined;
	/**
	 * How far inside the face a standing's ring is drawn: by default far enough
	 * that the selection ring, three units outside the box, stands well apart
	 * from it, and closer for a label, which has no selection ring of its own.
	 */
	readonly ringInset?: number | undefined;
}

/** How wide the highlight along the top edge of a face is. */
const GLINT_WIDTH = 1;

/** How far the highlight mixes a face toward the glint, on each ground. */
const GLINT: Share = { light: 0.85, dark: 0.09 };

/**
 * The fine highlight along the top edge of a face: the face, mixed toward the glint.
 * @param face The face's colour.
 * @param palette The theme's colours.
 * @returns The highlight's colour.
 */
function glintOf(face: string, palette: Palette): string {
	return tinted(face, palette.slabGlint, GLINT);
}

/** The light that falls off down a face, one gradient every face shares. */
const SHEEN_ID = "ab-slab-sheen";

/** One translucent copy of a silhouette: how far it is moved, how much larger, and how dark. */
interface ShadowLayer {
	readonly dx: number;
	readonly dy: number;
	readonly grow: number;
	readonly share: number;
}

/**
 * The shadows a block casts, by what it is. Each is a tight, dark contact
 * shadow under the front edge and softer, larger copies further down and to
 * the right, fading to nothing; a card's first layer reaches a unit round it,
 * so a near-white card keeps its top edge on the near-white page. None
 * reaches more than twelve units past the box. A group's region is a mat
 * lying flat on what holds it and casts none; the tab its caption is printed
 * on casts a short one on the mat, and none past the mat's own edge. A chip
 * and a relationship's label, many and small, cast only a contact shadow.
 */
const SHADOWS = {
	card: [
		{ dx: 0, dy: 0.5, grow: 1, share: 0.4 },
		{ dx: 0.5, dy: 1.5, grow: 0.5, share: 0.9 },
		{ dx: 1, dy: 3, grow: 1.5, share: 0.35 },
		{ dx: 1.5, dy: 4.5, grow: 3, share: 0.2 },
		{ dx: 2, dy: 6, grow: 5, share: 0.1 },
	],
	plinth: [
		{ dx: 0.5, dy: 2, grow: 0.5, share: 0.8 },
		{ dx: 1, dy: 3.5, grow: 2, share: 0.35 },
		{ dx: 2, dy: 5.5, grow: 4, share: 0.18 },
		{ dx: 2.5, dy: 7, grow: 5, share: 0.1 },
	],
	tab: [
		{ dx: 0.5, dy: 1.5, grow: 0.5, share: 0.6 },
		{ dx: 1, dy: 2.5, grow: 1, share: 0.3 },
	],
	chip: [{ dx: 0, dy: 1, grow: 0.5, share: 0.45 }],
} as const satisfies Readonly<Record<string, readonly ShadowLayer[]>>;

/** Which block casts a shadow. */
type Lift = keyof typeof SHADOWS;

/**
 * A rounded rect over a box, which takes no pointer unless it says so.
 * @param box Where it is.
 * @param radius Its corners.
 * @param paint How it is painted.
 * @returns The rect.
 */
function plate(box: Box, radius: number, paint: Attributes): string {
	return tag("rect", {
		x: coord(box.x),
		y: coord(box.y),
		width: coord(box.width),
		height: coord(box.height),
		rx: coord(radius),
		"pointer-events": "none",
		...paint,
	});
}

/**
 * A part's seat: its box, unpainted, which takes the pointer for the whole of
 * it while every shape painted over it takes none.
 * @param box The part's box.
 * @param radius Its corners.
 * @returns The seat.
 */
function slabSeat(box: Box, radius: number): string {
	return plate(box, radius, { fill: "none", "pointer-events": "all" });
}

/**
 * The shadow a block casts, under it.
 * @param box The block's box.
 * @param radius Its corners.
 * @param lift Which sort of block it is.
 * @param palette The theme's colours.
 * @returns The shadow's layers.
 */
function slabShadow(box: Box, radius: number, lift: Lift, palette: Palette): string {
	return lines(
		SHADOWS[lift].map(({ dx, dy, grow, share }) =>
			plate(
				{
					x: box.x + dx - grow,
					y: box.y + dy - grow,
					width: box.width + 2 * grow,
					height: box.height + 2 * grow,
				},
				radius + grow,
				{ fill: palette.slabShadow, "fill-opacity": share },
			),
		),
	);
}

/**
 * The face below a container's heading band. The whole face is drawn in the
 * band's tone and this part over it, its rounded upper corners squared off by
 * a stroke as wide as the corners are round, so the step between the two is
 * one straight line across the face.
 * @param face The top face.
 * @param look The block's look; nothing is drawn for a block with no heading.
 * @returns The part of the face below the band.
 */
function belowHeader(face: Box, look: SlabLook): string {
	if (look.header === undefined) return "";
	const top = face.y + look.header.height;
	const rest = { ...face, y: top, height: face.y + face.height - top };
	if (rest.height <= 2 * look.radius) return "";
	return lines([
		plate(rest, look.radius, { fill: look.face }),
		tag("line", {
			x1: coord(face.x),
			y1: coord(top + look.radius / 2),
			x2: coord(face.x + face.width),
			y2: coord(top + look.radius / 2),
			stroke: look.face,
			"stroke-width": coord(look.radius),
			"pointer-events": "none",
		}),
	]);
}

/**
 * How far inside a block's top face a standing's ring is drawn by default, and
 * how wide: five units in, so its outer side stands six units inside the
 * selection ring's inner side, with the block's own edge between them.
 */
const RING_INSET = 5;
const RING_WIDTH = 2;

/**
 * What a standing does to a block, which has no outline for it to take over: a
 * ring inside its face in the standing's ink and texture. The front edge keeps
 * the block's own tone, which says what group it serves; the ring and the pin
 * on its corner say what the proposal did to it.
 * @param face The block's top face.
 * @param look How the block looks.
 * @param standing How the part stands, or undefined when this is not a proposal.
 * @param palette The theme's colours.
 * @returns The ring, or nothing.
 */
function standingRing(
	face: Box,
	look: SlabLook,
	standing: SubjectStanding | undefined,
	palette: Palette,
): string {
	const ink = standing === undefined ? undefined : standingInk(standing, palette);
	if (standing === undefined || ink === undefined) return "";
	const inset = look.ringInset ?? RING_INSET;
	const ring = {
		x: face.x + inset,
		y: face.y + inset,
		width: face.width - 2 * inset,
		height: face.height - 2 * inset,
	};
	return plate(ring, Math.max(1, look.radius - inset), {
		fill: "none",
		stroke: ink,
		"stroke-width": RING_WIDTH,
		"stroke-dasharray": RING_DASH[standing],
	});
}

/**
 * One block, standing in its box: its body in the tone of its front edge, its
 * face over that with the highlight along its top edge, and the light falling
 * off down it; a container's face carries its heading's band. A part a
 * proposal changed, added or removed is marked on its face
 * ({@link standingRing}).
 * @param box The part's box.
 * @param look How the block looks.
 * @param palette The theme's colours.
 * @param standing How the part stands, when this is a proposal.
 * @returns The block.
 */
function slab(box: Box, look: SlabLook, palette: Palette, standing?: SubjectStanding): string {
	const top = look.header?.face ?? look.face;
	// The top face is the box without its front edge.
	const face = { ...box, height: box.height - look.thickness };
	const lit = { ...face, y: face.y + GLINT_WIDTH, height: face.height - GLINT_WIDTH };
	return lines([
		plate(box, look.radius, { fill: look.edge }),
		plate(face, look.radius, { fill: glintOf(top, palette) }),
		plate(lit, look.radius, { fill: top }),
		belowHeader(lit, look),
		look.sheen ? plate(lit, look.radius, { fill: `url(#${SHEEN_ID})` }) : "",
		standingRing(face, look, standing, palette),
	]);
}

/**
 * The definitions every slab reaches for: the light that falls off down a face,
 * from the sheen at its top edge to nothing at its foot. One gradient, in the
 * face's own box, so every face of any size shares it.
 * @param palette The theme's colours.
 * @returns The gradient.
 */
function slabDefinitions(palette: Palette): string {
	return wrap(
		"linearGradient",
		{ id: SHEEN_ID, x1: 0, y1: 0, x2: 0, y2: 1 },
		tag("stop", { offset: 0, "stop-color": palette.slabSheen }) +
			tag("stop", { offset: 1, "stop-color": palette.slabSheen, "stop-opacity": 0 }),
	);
}

export {
	type Share,
	type SlabLook,
	GLINT_WIDTH,
	glintOf,
	slab,
	slabDefinitions,
	slabSeat,
	slabShadow,
	tinted,
};
