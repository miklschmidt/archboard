// Depth by thickness. Every part of the picture is a block lit from above, as
// a keycap or a foam-core model under a lamp is: a flat top face with a fine
// highlight along its top edge and light that falls off down it, a front edge
// along its foot that shows how thick the block is, and a soft shadow it casts
// down and to the right on whatever it stands on. A container is the opposite
// of a block, a tray cut into what holds it (`tray.ts`), built of the same
// shapes.
//
// The layout box is the block's silhouette. Its thickness is drawn inside the
// box, along its foot, so a line that ends on the foot of a box meets the edge a
// reader sees; only the shadow reaches past the box. Nothing here is a filter, a
// blur or a mask, because a picture of a hundred cards is dragged and zoomed:
// depth is flat shapes, one shared gradient and stacked translucent copies of
// the silhouette.
//
// A proposal's standing is said on the face, in place of the group's colour,
// which the front edge still carries. An added block's face is washed in the
// standing's green, a changed one's in its orange and hatched; a removed block
// has lost its thickness. Its ghost is a flat, see-through face inside a dashed
// footprint where the block stood, with no front edge and no shadow.
//
// Each shape a block is built of is a rect at an offset from the part's box, or
// a line across it, so a viewer that carries a card from one picture to the
// next (`picture-cards.ts`) draws each one at the moving box and stretches it
// with the box. A card, a container or a relationship's label opens with its
// seat, its box unpainted, which is the one shape of it that takes the pointer
// and the first shape a reader of the markup finds.

import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lightDark, mixed, translucent } from "@/transformers/semantic-renderer/lib/svg/colour";
import {
	lines,
	tag,
	wrap,
	type Attributes,
} from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
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

/**
 * How far an ink is shaded toward `--slab-deep` before it tints a face on the
 * dark ground. A full-strength ink is far lighter than a dark face, so a tint
 * of it would lift the face toward the secondary words on it; a deeper shade
 * of the same hue carries as much colour and keeps the face's lightness.
 */
const DEEPEN = 0.55;

/**
 * A face washed with an ink: the ink itself on the light ground, a deeper
 * shade of it on the dark ({@link DEEPEN}), so the words on the face keep
 * their contrast on either.
 * @param base The face.
 * @param ink The ink, or none to leave the face as it is.
 * @param share How much of it, on each ground.
 * @param palette The theme's colours.
 * @returns The washed face.
 */
function washed(base: string, ink: string | undefined, share: Share, palette: Palette): string {
	if (ink === undefined) return base;
	return lightDark(
		mixed(base, ink, share.light),
		mixed(base, mixed(ink, palette.slabDeep, DEEPEN), share.dark),
	);
}

/** How a block looks: its two tones, how thick it is and how round its corners are. */
interface SlabLook {
	/** Its top face. */
	readonly face: string;
	/**
	 * Its top face before a card's group tinted it. A standing washes this
	 * rather than the tinted face, one tint to a face, so a green or an orange
	 * wash reads as itself and not as a muddy mix with the group's colour, which
	 * the front edge still carries.
	 */
	readonly ground?: string;
	/** Its front edge, the side of the block that faces the reader. */
	readonly edge: string;
	/** How tall its front edge shows, inside its box along its foot. */
	readonly thickness: number;
	readonly radius: number;
	/** Whether light falls off down its face: a card's and a chip's, not a container's broad top. */
	readonly sheen: boolean;
	/**
	 * Whether a changed part's face is hatched: a card's. A label's is not,
	 * since the swipe under its line carries that texture.
	 */
	readonly hatch?: boolean;
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
/**
 * The same light on a face a group's colour or a standing's tints. The plain
 * sheen is nearly white on the light ground: over a near-white face it is a
 * faint change, but over a tinted face it bleached the top and left the colour
 * pooled at the foot. On the light ground this one is the glint at a fifth of
 * the sheen's strength, so a tinted face changes from top to foot as gently as
 * a plain one; on the dark ground it is the plain sheen, which is faint already.
 */
const SOFT_SHEEN_ID = "ab-slab-sheen-soft";
const SOFT_SHEEN = 0.2;

/** The hatch over a changed block's face, one pattern every face shares. */
const HATCH_ID = "ab-slab-hatch";
/** How far apart the hatch's strokes are, and how wide each is. */
const HATCH_PITCH = 6;
const HATCH_STROKE = 1.25;
/**
 * How strong a hatch stroke is over the washed face, on each ground: a texture
 * the words read through, there to say "changed" to a reader who cannot tell
 * the orange wash from the green.
 */
const HATCH: Share = { light: 0.2, dark: 0.12 };

/**
 * How much of its standing's ink an added or changed face is washed with: a
 * clear tint at a glance that still leaves the face the ground its words were
 * chosen for.
 */
const WASH: Share = { light: 0.15, dark: 0.2 };

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
 * reaches more than twelve units past the box. A container's tray is cut into
 * what holds it and casts none. A group's region is a boundary with no face
 * and casts none; the tab its caption is printed on casts a short one on what
 * the region lies on. A chip, a relationship's label and an activation bar,
 * many and small, cast only a contact shadow.
 */
const SHADOWS = {
	card: [
		{ dx: 0, dy: 0.5, grow: 1, share: 0.4 },
		{ dx: 0.5, dy: 1.5, grow: 0.5, share: 0.9 },
		{ dx: 1, dy: 3, grow: 1.5, share: 0.35 },
		{ dx: 1.5, dy: 4.5, grow: 3, share: 0.2 },
		{ dx: 2, dy: 6, grow: 5, share: 0.1 },
	],
	tray: [],
	tab: [
		{ dx: 0.5, dy: 1.5, grow: 0.5, share: 0.6 },
		{ dx: 1, dy: 2.5, grow: 1, share: 0.3 },
	],
	chip: [{ dx: 0, dy: 1, grow: 0.5, share: 0.45 }],
} as const satisfies Readonly<Record<string, readonly ShadowLayer[]>>;

/** Which block casts a shadow. */
type Lift = keyof typeof SHADOWS;

/** How much of a face a removed block's see-through ghost keeps. */
const GHOST_FACE = 0.5;
/** The dashed footprint a removed block leaves where it stood: its width and its dash. */
const FOOTPRINT_WIDTH = 1.5;
const FOOTPRINT_DASH = "6 4";

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
 * A line across a box at one height, which takes no pointer.
 * @param box The box it spans.
 * @param y Its height.
 * @param paint How it is stroked.
 * @returns The line.
 */
function across(box: Box, y: number, paint: Attributes): string {
	return tag("line", {
		x1: coord(box.x),
		y1: coord(y),
		x2: coord(box.x + box.width),
		y2: coord(y),
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
 * The see-through face a ghost keeps.
 * @param palette The theme's colours.
 * @returns Its paint.
 */
function ghostFace(palette: Palette): Attributes {
	return { fill: palette.slabFace, "fill-opacity": GHOST_FACE };
}

/**
 * Where a removed block stood: its face, flat and see-through, and a dashed
 * footprint in the standing's ink just inside its box.
 * @param box The block's box.
 * @param radius Its corners.
 * @param palette The theme's colours.
 * @returns The ghost.
 */
function ghost(box: Box, radius: number, palette: Palette): string {
	const inset = FOOTPRINT_WIDTH / 2;
	return lines([
		plate(box, radius, ghostFace(palette)),
		plate(
			{
				x: box.x + inset,
				y: box.y + inset,
				width: box.width - 2 * inset,
				height: box.height - 2 * inset,
			},
			Math.max(0, radius - inset),
			{
				fill: "none",
				stroke: palette.standingRemoved,
				"stroke-width": FOOTPRINT_WIDTH,
				"stroke-dasharray": FOOTPRINT_DASH,
			},
		),
	]);
}

/**
 * What a block leaves on what it stands on, under the selection ring: the
 * shadow it casts; or, for a part a proposal removed, its ghost ({@link ghost}),
 * which a selection ring drawn at its footprint covers rather than doubles.
 * @param box The block's box.
 * @param radius Its corners.
 * @param lift Which sort of block it is.
 * @param palette The theme's colours.
 * @param standing How the part stands, when this is a proposal.
 * @returns The shadow's layers, or the ghost.
 */
function slabShadow(
	box: Box,
	radius: number,
	lift: Lift,
	palette: Palette,
	standing?: SubjectStanding,
): string {
	if (standing === "removed") return ghost(box, radius, palette);
	return castShadow(box, lift, palette, (layer, grow, paint) => plate(layer, radius + grow, paint));
}

/**
 * The layers of the shadow a block casts, each drawn in the block's own
 * shape, so a block that is not a rounded rect casts a shadow of its shape.
 * @param box The block's box.
 * @param lift Which sort of block it is.
 * @param palette The theme's colours.
 * @param shape Draws the block's shape over a box grown by some amount, painted as asked.
 * @returns The shadow's layers.
 */
function castShadow(
	box: Box,
	lift: Lift,
	palette: Palette,
	shape: (layer: Box, grow: number, paint: Attributes) => string,
): string {
	return lines(
		SHADOWS[lift].map(({ dx, dy, grow, share }) =>
			shape(
				{
					x: box.x + dx - grow,
					y: box.y + dy - grow,
					width: box.width + 2 * grow,
					height: box.height + 2 * grow,
				},
				grow,
				{ fill: palette.slabShadow, "fill-opacity": share, "pointer-events": "none" },
			),
		),
	);
}

/**
 * The hatch that says a part changed, over one face.
 * @param box The face.
 * @param radius Its corners.
 * @param strength How much of the hatch's strength it takes.
 * @returns The hatch.
 */
function hatched(box: Box, radius: number, strength = 1): string {
	return plate(box, radius, {
		fill: `url(#${HATCH_ID})`,
		"fill-opacity": strength < 1 ? strength : undefined,
	});
}

/**
 * What a standing does to a block's face: an added one washed in its ink, a
 * changed one washed and, where the block takes one, hatched, in place of the
 * tint of its group, which its front edge still carries. A removed block draws
 * no face ({@link ghost}).
 * @param look How the block looks.
 * @param standing How the part stands, or undefined when this is not a proposal.
 * @param palette The theme's colours.
 * @returns The top face's colour, and whether it is hatched.
 */
function standingFace(
	look: SlabLook,
	standing: SubjectStanding | undefined,
	palette: Palette,
): { readonly top: string; readonly hatch: boolean } {
	const ink = standing === undefined ? undefined : standingInk(standing, palette);
	return {
		top: ink === undefined ? look.face : washed(look.ground ?? look.face, ink, WASH, palette),
		hatch: standing === "changed" && look.hatch === true,
	};
}

/**
 * One block, standing in its box: its body in the tone of its front edge, and
 * its face over that with the highlight along its top edge and the light
 * falling off down it. The face says how a proposal treats the part
 * ({@link standingFace}). A removed part has lost its block: what is left of
 * it is drawn under the selection ring ({@link slabShadow}), and this draws
 * nothing.
 * @param box The part's box.
 * @param look How the block looks.
 * @param palette The theme's colours.
 * @param standing How the part stands, when this is a proposal.
 * @returns The block.
 */
function slab(box: Box, look: SlabLook, palette: Palette, standing?: SubjectStanding): string {
	if (standing === "removed") return "";
	const { top, hatch } = standingFace(look, standing, palette);
	// The top face is the box without its front edge.
	const face = { ...box, height: box.height - look.thickness };
	const lit = { ...face, y: face.y + GLINT_WIDTH, height: face.height - GLINT_WIDTH };
	return lines([
		plate(box, look.radius, { fill: look.edge }),
		plate(face, look.radius, { fill: glintOf(top, palette) }),
		plate(lit, look.radius, { fill: top }),
		look.sheen ? plate(lit, look.radius, { fill: `url(#${sheenOf(look, standing)})` }) : "",
		hatch ? hatched(lit, look.radius) : "",
	]);
}

/**
 * The light that falls off down a face, from the sheen at its top edge to
 * nothing at its foot, one gradient in the face's own box so every face of
 * any size shares it.
 * @param id The gradient's id.
 * @param sheen The light at the top edge.
 * @returns The gradient.
 */
function sheenGradient(id: string, sheen: string): string {
	return wrap(
		"linearGradient",
		{ id, x1: 0, y1: 0, x2: 0, y2: 1 },
		tag("stop", { offset: 0, "stop-color": sheen }) +
			tag("stop", { offset: 1, "stop-color": sheen, "stop-opacity": 0 }),
	);
}

/**
 * Which light falls off down a face: a tinted face's, a group's or a
 * standing's, takes the softer one ({@link SOFT_SHEEN}).
 * @param look How the block looks.
 * @param standing How the part stands, when this is a proposal.
 * @returns The id of its gradient.
 */
function sheenOf(look: SlabLook, standing: SubjectStanding | undefined): string {
	const coloured = look.ground !== undefined || standing === "added" || standing === "changed";
	return coloured ? SOFT_SHEEN_ID : SHEEN_ID;
}

/**
 * The definitions every slab reaches for: the light that falls off down a face,
 * full on a plain face and softer on a tinted one; and the hatch over a changed
 * face, at one pitch across the page.
 * @param palette The theme's colours.
 * @returns The gradient and the pattern.
 */
function slabDefinitions(palette: Palette): string {
	const hatch = lightDark(
		translucent(palette.standingChanged, HATCH.light),
		translucent(palette.standingChanged, HATCH.dark),
	);
	return (
		sheenGradient(SHEEN_ID, palette.slabSheen) +
		sheenGradient(
			SOFT_SHEEN_ID,
			lightDark(translucent(palette.slabGlint, SOFT_SHEEN), palette.slabSheen),
		) +
		wrap(
			"pattern",
			{
				id: HATCH_ID,
				width: HATCH_PITCH,
				height: HATCH_PITCH,
				patternUnits: "userSpaceOnUse",
				patternTransform: "rotate(45)",
			},
			tag("rect", { width: HATCH_STROKE, height: HATCH_PITCH, fill: hatch }),
		)
	);
}

export {
	type Share,
	type SlabLook,
	FOOTPRINT_WIDTH,
	GLINT_WIDTH,
	across,
	castShadow,
	ghostFace,
	glintOf,
	hatched,
	plate,
	slab,
	slabDefinitions,
	slabSeat,
	slabShadow,
	tinted,
	washed,
};
