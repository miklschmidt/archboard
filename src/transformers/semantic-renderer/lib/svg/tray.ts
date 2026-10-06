// A container is a tray cut into whatever holds it: the page, or the floor of
// the tray it is nested in. It is the opposite of the blocks that stand on it
// (`slab.ts`), built of the same flat shapes and lit from the same upper left.
//
// Its walls show inside its box. The top and left walls are the ones the light
// comes over, so a reader sees their inner faces in shade, a band a step
// thicker than a card's front edge. The bottom and right walls face the light:
// a reader sees a lip of it along them, and outside that lip a crease where the
// tray meets what it is cut into. The floor lies a step below what holds it,
// quietly tinted by the container's kind, and the top and left walls throw a
// short shadow on it. A tray nested in another is cut a step deeper into that
// one's floor. Nothing about a tray floats: it casts no shadow.
//
// Its nameplate is a plate seated on the floor against the top wall, as wide as
// the floor, in the container's kind, with a front edge of its own and a short
// shadow on the floor below it. What the container itself relates to leaves
// from the foot of that front edge, so the edge is the line's visible origin.
//
// A proposal's standing washes the floor, in place of the kind's tint, which the
// nameplate keeps; a changed container's nameplate is hatched as well. A
// removed container leaves the ghost every removed block leaves (`slab.ts`).
//
// Every shape is a rect at an offset from the container's box or a line across
// or down it, so a viewer that carries a container from one picture to the next
// (`picture-cards.ts`) draws each at the moving box: every rect reaches the
// foot of the box, and a tone that ends partway down, the nameplate's, is
// covered from there by the next.

import {
	BAND_RADIUS,
	PLATE_THICKNESS,
	TRAY_CREASE,
	TRAY_LIP,
	TRAY_WALL,
} from "@/transformers/semantic-renderer/lib/design";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lines, tag, type Attributes } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	across,
	hatched,
	plate,
	washed,
	type Share,
} from "@/transformers/semantic-renderer/lib/svg/slab";
import {
	standingInk,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";

/** How a tray looks: its floor, its walls and its nameplate. */
interface TrayLook {
	/** Its floor, tinted by its kind. */
	readonly floor: string;
	/**
	 * Its floor before its kind tinted it, which a standing washes in place of
	 * the kind: one tint to a face, which the nameplate still carries.
	 */
	readonly ground: string;
	/** The inner faces of its top and left walls, in shade. */
	readonly wall: string;
	/**
	 * Its nameplate: how far down the box it reaches, from the top of the box to
	 * the foot of its front edge, and its face and front edge.
	 */
	readonly nameplate: { readonly height: number; readonly face: string; readonly edge: string };
}

/** The corners of a tray's floor and nameplate: its box's, inside its walls. */
const FLOOR_RADIUS = BAND_RADIUS - TRAY_WALL;

/**
 * How much of its standing's ink an added or changed tray's floor is washed
 * with: less than a card's face, so the cards standing on it still read over it.
 */
const FLOOR_WASH: Share = { light: 0.08, dark: 0.14 };

/**
 * How much of the hatch's strength a nameplate takes: enough to texture it,
 * little enough that its kind's tint still reads and the words on it, and a
 * line that crosses it, keep their contrast.
 */
const PLATE_HATCH = 0.5;

/**
 * The short shadows on a tray's floor, as bands each a unit and a half deep and
 * fainter than the one before: the nameplate's under its front edge, and the
 * top and left walls' along their feet, which are shallower. Lines rather than
 * one gradient, so each stretches with the floor it lies on.
 */
const LEDGE = [1, 0.6, 0.3, 0.12] as const;
const WALL_SHADOW = [0.7, 0.35, 0.12] as const;
const SHADOW_BAND = 1.5;

/**
 * The floor's box: the tray's box inside its top and left walls and inside the
 * lip and the crease along its bottom and right.
 * @param box The tray's box.
 * @returns The floor's box.
 */
function floorOf(box: Box): Box {
	const far = TRAY_LIP + TRAY_CREASE;
	return {
		x: box.x + TRAY_WALL,
		y: box.y + TRAY_WALL,
		width: box.width - TRAY_WALL - far,
		height: box.height - TRAY_WALL - far,
	};
}

/**
 * The face of a tray's nameplate, the words of its heading stand on: the floor
 * from under the top wall to the plate's front edge.
 * @param box The tray's box.
 * @param height How far down the box the nameplate reaches, its front edge included.
 * @returns The plate's face.
 */
function plateFace(box: Box, height: number): Box {
	const floor = floorOf(box);
	return { ...floor, height: height - TRAY_WALL - PLATE_THICKNESS };
}

/**
 * A line down a box at one place across it, which takes no pointer.
 * @param box The box it spans.
 * @param x Its place across.
 * @param paint How it is stroked.
 * @returns The line.
 */
function down(box: Box, x: number, paint: Attributes): string {
	return tag("line", {
		x1: coord(x),
		y1: coord(box.y),
		x2: coord(x),
		y2: coord(box.y + box.height),
		"pointer-events": "none",
		...paint,
	});
}

/**
 * Bands of shadow from one edge of a face, each fainter than the one before.
 * @param shares How dark each band is, from the edge.
 * @param band Draws one band at a distance from the edge, stroked as asked.
 * @param palette The theme's colours.
 * @returns The bands.
 */
function bands(
	shares: readonly number[],
	band: (offset: number, paint: Attributes) => string,
	palette: Palette,
): string {
	return lines(
		shares.map((share, index) =>
			band((index + 0.5) * SHADOW_BAND, {
				stroke: palette.slabShadow,
				"stroke-opacity": share,
				"stroke-width": SHADOW_BAND,
			}),
		),
	);
}

/**
 * The floor from one height down to its foot, in one tone. It is drawn as the
 * rounded floor from that height and a stroke as wide as the corners are round
 * along its top, which squares those corners off, so the step from the tone
 * above is one straight line across the floor.
 * @param floor The floor's box.
 * @param top Where the tone starts.
 * @param fill The tone.
 * @returns The floor below that height, or nothing when too little is left of it.
 */
function floorFrom(floor: Box, top: number, fill: string): string {
	const rest = { ...floor, y: top, height: floor.y + floor.height - top };
	if (rest.height <= 2 * FLOOR_RADIUS) return "";
	return lines([
		plate(rest, FLOOR_RADIUS, { fill }),
		across(floor, top + FLOOR_RADIUS / 2, { stroke: fill, "stroke-width": FLOOR_RADIUS }),
	]);
}

/**
 * One tray, cut into what holds it: the crease and the lip along its bottom and
 * right, its walls, its nameplate seated against the top wall and its floor
 * below that, with the shadows the walls and the plate throw on it. A removed
 * container has lost its tray: its ghost is drawn under the selection ring
 * (`slabShadow`), and this draws nothing.
 * @param box The container's box.
 * @param look How the tray looks.
 * @param palette The theme's colours.
 * @param standing How the container stands, when this is a proposal.
 * @returns The tray.
 */
function tray(box: Box, look: TrayLook, palette: Palette, standing?: SubjectStanding): string {
	if (standing === "removed") return "";
	const ink = standing === undefined ? undefined : standingInk(standing, palette);
	const floorTone = ink === undefined ? look.floor : washed(look.ground, ink, FLOOR_WASH, palette);
	const floor = floorOf(box);
	const foot = box.y + look.nameplate.height;
	return lines([
		// The crease is the shadow's tone, so it reads on any ground it is cut into.
		plate(box, BAND_RADIUS, { fill: palette.slabShadow }),
		plate(
			{ ...box, width: box.width - TRAY_CREASE, height: box.height - TRAY_CREASE },
			BAND_RADIUS,
			{
				fill: palette.trayLip,
			},
		),
		plate(
			{
				...box,
				width: box.width - TRAY_CREASE - TRAY_LIP,
				height: box.height - TRAY_CREASE - TRAY_LIP,
			},
			BAND_RADIUS,
			{ fill: look.wall },
		),
		plate(floor, FLOOR_RADIUS, { fill: look.nameplate.face }),
		standing === "changed" ? hatched(floor, FLOOR_RADIUS, PLATE_HATCH) : "",
		floorFrom(floor, foot - PLATE_THICKNESS, look.nameplate.edge),
		floorFrom(floor, foot, floorTone),
		bands(WALL_SHADOW, (offset, paint) => across(floor, floor.y + offset, paint), palette),
		bands(LEDGE, (offset, paint) => across(floor, foot + offset, paint), palette),
		bands(WALL_SHADOW, (offset, paint) => down(floor, floor.x + offset, paint), palette),
	]);
}

export { type TrayLook, floorOf, plateFace, tray };
