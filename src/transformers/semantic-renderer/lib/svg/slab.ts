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
// depth is flat shapes with shared gradients for the face and the shadow.
//
// A proposal's standing takes over the outline of the block's top face: a
// border in the standing's ink along the face's edge, inside it, solid for an
// added block and dashed for a changed one (`standingBorder`). The face keeps
// its group's tint and the front edge its group's colour. A removed block has
// lost its thickness: its ghost is a flat, see-through face inside the dashed
// border of a removal, round the footprint where the block stood, with no
// front edge and no shadow.
//
// Each shape a block is built of is a rect at an offset from the part's box, or
// a line across it, so a viewer that carries a card from one picture to the
// next (`picture-cards.ts`) draws each one at the moving box and stretches it
// with the box. A card, a container or a relationship's label opens with its
// seat, its box unpainted, which is the one shape of it that takes the pointer
// and the first shape a reader of the markup finds.

import {
	shadowDefinitions,
	smoothShadow,
	SHADOW_REACH,
} from "@/transformers/semantic-renderer/lib/svg/shadow";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lightDark, mixed, translucent } from "@/transformers/semantic-renderer/lib/svg/colour";
import {
	intersection,
	inset,
	polygonPath,
	translated,
	type Polygon,
} from "@/transformers/semantic-renderer/lib/svg/polygon";
import {
	lines,
	tag,
	wrap,
	type Attributes,
} from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	MEMBERS_ATTRIBUTE,
	PART_ATTRIBUTE,
	OUTLINE_DASH,
	OUTLINE_WIDTH,
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
	/**
	 * Its top face before a card's group tinted it, set on a face a group may
	 * tint, which takes the softer light ({@link SOFT_SHEEN_ID}).
	 */
	readonly ground?: string;
	/** Its front edge, the side of the block that faces the reader. */
	readonly edge: string;
	/** How tall its front edge shows, inside its box along its foot. */
	readonly thickness: number;
	readonly radius: number;
	/** Whether light falls off down its face: a card's and a chip's, not a container's broad top. */
	readonly sheen: boolean;
}

/** How wide the highlight along the top edge of a face is. */
const GLINT_WIDTH = 1;

/**
 * How far the highlight mixes a face toward the glint, on each ground. On the
 * light ground it is a soft highlight, under half way to white, so no face
 * starts at white.
 */
const GLINT: Share = { light: 0.45, dark: 0.09 };

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
 * The same light on a face a group's colour tints. The plain
 * sheen is nearly white on the light ground: over a near-white face it is a
 * faint change, but over a tinted face it bleached the top and left the colour
 * pooled at the foot. On the light ground this one is the glint at a fifth of
 * the sheen's strength, so a tinted face changes from top to foot as gently as
 * a plain one; on the dark ground it is the plain sheen, which is faint already.
 */
const SOFT_SHEEN_ID = "ab-slab-sheen-soft";
const SOFT_SHEEN = 0.2;

/** The shadow reach of a card, a small chip, or a sunken tray. */
const SHADOWS = { card: SHADOW_REACH, tray: 0, chip: 2 } as const;

/**
 * The class of the group a card's or a label's shadow is drawn in, under the
 * lines and the cards ({@link shadowUnder}), so a viewer that carries the card
 * or the label from one picture to the next can hold it back until the picture
 * lands.
 */
const SHADOW_CLASS = "ab-shadow";

/** Which block casts a shadow. */
type Lift = keyof typeof SHADOWS;

/** How much of a face a removed block's see-through ghost keeps. */
const GHOST_FACE = 0.5;

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
 * The border a standing draws round a face: the standing's ink along the
 * face's own edge, inside it, its outer edge on the face's and its corners the
 * face's, so it is the face's outline rather than a second box in or round it.
 * A removed block's border goes round its footprint (`slab.ts`).
 * @param face The face.
 * @param radius Its corners.
 * @param standing How the part stands, or undefined when this is not a proposal.
 * @param palette The theme's colours.
 * @returns The border, or nothing for a part that stands unchanged.
 */
function standingBorder(
	face: Box,
	radius: number,
	standing: SubjectStanding | undefined,
	palette: Palette,
): string {
	const ink = standing === undefined ? undefined : standingInk(standing, palette);
	if (standing === undefined || ink === undefined) return "";
	const half = OUTLINE_WIDTH / 2;
	return tag("rect", {
		x: coord(face.x + half),
		y: coord(face.y + half),
		width: coord(face.width - OUTLINE_WIDTH),
		height: coord(face.height - OUTLINE_WIDTH),
		rx: coord(Math.max(0, radius - half)),
		fill: "none",
		stroke: ink,
		"stroke-width": OUTLINE_WIDTH,
		"stroke-dasharray": OUTLINE_DASH[standing],
		"pointer-events": "none",
	});
}

/**
 * Where a removed block stood: its face, flat and see-through, inside the
 * dashed border a removal draws, round its footprint.
 * @param box The block's box.
 * @param radius Its corners.
 * @param palette The theme's colours.
 * @returns The ghost.
 */
function ghost(box: Box, radius: number, palette: Palette): string {
	return lines([
		plate(box, radius, ghostFace(palette)),
		standingBorder(box, radius, "removed", palette),
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
	return lift === "tray" ? "" : smoothShadow(box, radius, SHADOWS[lift]);
}

/**
 * A shadow in a group of its own, so a picture can lay every shadow under every
 * block and every line: no shadow is then drawn over a block, its own or one
 * beside it, and no line is shadowed. It lists what cast it, so a viewer veils
 * and lights it with that, and holds it back while the picture is in flight. It
 * is no subject of its own and takes no pointer.
 * @param shadow The shadow's layers.
 * @param member The id of what cast it, when it is a subject a viewer lights.
 * @param part The part of the subject that casts the shadow, when it is not its card.
 * @returns The shadow's group.
 */
function shadowGroup(shadow: string, member?: string, part?: string): string {
	return wrap(
		"g",
		{
			class: SHADOW_CLASS,
			[MEMBERS_ATTRIBUTE]: member,
			[PART_ATTRIBUTE]: part,
			"pointer-events": "none",
		},
		shadow,
	);
}

/**
 * The shadow a block casts ({@link shadowGroup}). A removed block casts none:
 * its ghost is drawn with it ({@link slabShadow}).
 * @param member The id of what cast it.
 * @param box The block's box.
 * @param radius Its corners.
 * @param lift Which sort of block it is.
 * @param palette The theme's colours.
 * @param standing How it stands, when this is a proposal.
 * @param part The part of the subject that casts the shadow, when it is not its card.
 * @returns The shadow's group, or nothing for a removed block.
 */
function shadowUnder(
	member: string,
	box: Box,
	radius: number,
	lift: Lift,
	palette: Palette,
	standing: SubjectStanding | undefined,
	part?: string,
): string {
	return standing === "removed"
		? ""
		: shadowGroup(slabShadow(box, radius, lift, palette), member, part);
}

/**
 * A clip as paint refers to it.
 * @param cut The clip's id, if any.
 * @returns The reference, or nothing.
 */
function clipped(cut: string | undefined): string | undefined {
	return cut === undefined ? undefined : `url(#${cut})`;
}

/**
 * One block, standing in its box: its body in the tone of its front edge, and
 * its face over that with the highlight along its top edge and the light
 * falling off down it. A proposal's standing borders the face
 * (`standingBorder`). A removed part has lost its block: what is left of it is
 * drawn under the selection ring ({@link slabShadow}), and this draws nothing.
 * @param box The part's box.
 * @param look How the block looks.
 * @param palette The theme's colours.
 * @param standing How the part stands, when this is a proposal.
 * @param cut The clip a card's ports are cut through its front edge by, if it has any (`ports.ts`).
 * @returns The block.
 */
function slab(
	box: Box,
	look: SlabLook,
	palette: Palette,
	standing?: SubjectStanding,
	cut?: string,
): string {
	if (standing === "removed") return "";
	// The top face is the box without its front edge.
	const face = { ...box, height: box.height - look.thickness };
	const lit = { ...face, y: face.y + GLINT_WIDTH, height: face.height - GLINT_WIDTH };
	return lines([
		plate(box, look.radius, { "clip-path": clipped(cut), fill: look.edge }),
		plate(face, look.radius, { fill: glintOf(look.face, palette) }),
		plate(lit, look.radius, { fill: look.face }),
		look.sheen ? plate(lit, look.radius, { fill: `url(#${sheenOf(look)})` }) : "",
		standingBorder(face, look.radius, standing, palette),
	]);
}

/**
 * A shape that is not a box, painted: a polygon that takes no pointer.
 * @param polygon The shape.
 * @param radius How round its corners are.
 * @param paint How it is painted.
 * @returns The path.
 */
function solid(polygon: Polygon, radius: number, paint: Attributes): string {
	return tag("path", { d: polygonPath(polygon, radius), "pointer-events": "none", ...paint });
}

/**
 * A shape's seat: its outline, unpainted, which takes the pointer for the
 * whole of it while every shape painted over it takes none.
 * @param polygon The shape.
 * @param radius How round its corners are.
 * @returns The seat.
 */
function solidSeat(polygon: Polygon, radius: number): string {
	return solid(polygon, radius, { fill: "none", "pointer-events": "all" });
}

/**
 * The border a standing draws round the face of a block that is not a box
 * ({@link standingBorder}): the standing's ink along the face's edge, inside it.
 * @param face The face's outline.
 * @param radius How round the face's corners are.
 * @param standing How the part stands, or undefined when this is not a proposal.
 * @param palette The theme's colours.
 * @returns The border, or nothing for a part that stands unchanged.
 */
function solidBorder(
	face: Polygon,
	radius: number,
	standing: SubjectStanding | undefined,
	palette: Palette,
): string {
	const ink = standing === undefined ? undefined : standingInk(standing, palette);
	if (standing === undefined || ink === undefined) return "";
	const half = OUTLINE_WIDTH / 2;
	return solid(inset(face, half), Math.max(0, radius - half), {
		fill: "none",
		stroke: ink,
		"stroke-width": OUTLINE_WIDTH,
		"stroke-dasharray": OUTLINE_DASH[standing],
	});
}

/**
 * Where a removed block that is not a box stood ({@link ghost}).
 * @param polygon The block's outline.
 * @param radius How round its corners are.
 * @param palette The theme's colours.
 * @returns The ghost.
 */
function solidGhost(polygon: Polygon, radius: number, palette: Palette): string {
	return lines([
		solid(polygon, radius, ghostFace(palette)),
		solidBorder(polygon, radius, "removed", palette),
	]);
}

/**
 * A block that is not a box, as {@link slab} builds one: its body in the tone
 * of its front edge, and its face over that. The face is the body cut by
 * itself lifted by the block's thickness, so the front edge shows along every
 * side that faces down and nowhere else, as it does along a box's foot; the
 * highlight is the face cut by itself lowered, along every side that faces up.
 * @param body The block's outline, its silhouette.
 * @param look How the block looks, its radius how round its corners are.
 * @param palette The theme's colours.
 * @param standing How the part stands, when this is a proposal.
 * @returns The block.
 */
function solidSlab(
	body: Polygon,
	look: SlabLook,
	palette: Palette,
	standing?: SubjectStanding,
): string {
	if (standing === "removed") return "";
	const { radius } = look;
	const face = intersection(body, translated(body, { x: 0, y: -look.thickness }));
	const lit = intersection(face, translated(face, { x: 0, y: GLINT_WIDTH }));
	return lines([
		solid(body, radius, { fill: look.edge }),
		solid(face, radius, { fill: glintOf(look.face, palette) }),
		solid(lit, radius, { fill: look.face }),
		look.sheen ? solid(lit, radius, { fill: `url(#${sheenOf(look)})` }) : "",
		solidBorder(face, radius, standing, palette),
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
 * Which light falls off down a face: a face a group may tint takes the softer
 * one ({@link SOFT_SHEEN}).
 * @param look How the block looks.
 * @returns The id of its gradient.
 */
function sheenOf(look: Pick<SlabLook, "ground">): string {
	return look.ground === undefined ? SHEEN_ID : SOFT_SHEEN_ID;
}

/**
 * The definitions every slab reaches for: the light that falls off down a face,
 * full on a plain face and softer on a tinted one.
 * @param palette The theme's colours.
 * @returns The gradients.
 */
function slabDefinitions(palette: Palette): string {
	return (
		shadowDefinitions(palette) +
		sheenGradient(SHEEN_ID, palette.slabSheen) +
		sheenGradient(
			SOFT_SHEEN_ID,
			lightDark(translucent(palette.slabGlint, SOFT_SHEEN), palette.slabSheen),
		)
	);
}

export {
	type Share,
	type SlabLook,
	GLINT_WIDTH,
	across,
	ghostFace,
	glintOf,
	plate,
	shadowGroup,
	shadowUnder,
	slab,
	slabDefinitions,
	slabSeat,
	slabShadow,
	solidGhost,
	solidSeat,
	solidSlab,
	standingBorder,
	tinted,
};
