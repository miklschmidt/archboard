// A container is a tray cut into whatever holds it: the page, or the floor of
// the tray it is nested in. It is the opposite of the blocks that stand on it
// (`slab.ts`), built of the same flat shapes and lit as they are, from straight
// above, like a tray cut into a table under a lamp.
//
// Its walls show inside its box. The top wall faces the reader and turns away
// from the light: a reader sees its face in shade, a band a step thicker than a
// card's front edge, and it throws a short, soft shadow straight down on what
// lies under it. The side walls are alike, a narrow band each, and quieter: the
// light only grazes them. The bottom wall faces the light: a reader sees a lip
// of it, and below that lip a crease where the tray meets what it is cut into.
// The walls are shades of the floor with no colour of their own. The floor lies
// a step below what holds it, quietly tinted by the container's kind. A tray
// nested in another is cut a step deeper into that one's floor. Nothing about a
// tray floats: it casts no shadow.
//
// Its nameplate is a plate seated on the floor against the top wall, as wide as
// the floor, in the container's kind, with a front edge of its own. What the
// container itself relates to leaves from the foot of that front edge, so the
// edge is the line's visible origin.
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
	TRAY_SIDE,
	TRAY_WALL,
} from "@/transformers/semantic-renderer/lib/design";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lines } from "@/transformers/semantic-renderer/lib/svg/primitives";
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
	/** The face of its top wall, in shade, and of its side walls, quieter. */
	readonly walls: { readonly top: string; readonly side: string };
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
 * The short, soft shadow the top wall throws straight down on what lies under
 * it, as bands each a unit and a half deep and fainter than the one before.
 * Lines rather than one gradient, so each stretches with the floor it lies on.
 */
const WALL_SHADOW = [0.5, 0.2] as const;
const SHADOW_BAND = 1.5;

/**
 * The floor's box: the tray's box inside its walls and inside the lip and the
 * crease along its bottom.
 * @param box The tray's box.
 * @returns The floor's box.
 */
function floorOf(box: Box): Box {
	return {
		x: box.x + TRAY_SIDE,
		y: box.y + TRAY_WALL,
		width: box.width - 2 * TRAY_SIDE,
		height: box.height - TRAY_WALL - TRAY_LIP - TRAY_CREASE,
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
 * A face from one height down to its foot, in one tone. It is drawn as the
 * rounded face from that height and a stroke as wide as the corners are round
 * along its top, which squares those corners off, so the step from the tone
 * above is one straight line across the face.
 * @param face The face.
 * @param top Where the tone starts.
 * @param fill The tone.
 * @param radius The face's corners.
 * @returns The face below that height, or nothing when too little is left of it.
 */
function toneFrom(face: Box, top: number, fill: string, radius: number): string {
	const rest = { ...face, y: top, height: face.y + face.height - top };
	if (rest.height <= 2 * radius) return "";
	return lines([
		plate(rest, radius, { fill }),
		across(face, top + radius / 2, { stroke: fill, "stroke-width": radius }),
	]);
}

/**
 * One tray, cut into what holds it: the crease and the lip along its bottom,
 * its top wall and its side walls, its nameplate seated against the top wall
 * and its floor below that, with the shadow the top wall throws on what lies
 * under it. A removed container has lost its tray: its ghost is drawn under
 * the selection ring (`slabShadow`), and this draws nothing.
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
	// The walls, above the lip.
	const walls = { ...box, height: box.height - TRAY_CREASE - TRAY_LIP };
	return lines([
		// The crease is the shadow's tone, so it reads on any ground it is cut into.
		plate(box, BAND_RADIUS, { fill: palette.slabShadow }),
		plate({ ...box, height: box.height - TRAY_CREASE }, BAND_RADIUS, { fill: palette.trayLip }),
		plate(walls, BAND_RADIUS, { fill: look.walls.top }),
		// The side walls under the top wall. Their rounded top corners turn the top
		// wall down round the corners of the box, as the lip turns up round its foot.
		plate({ ...walls, y: walls.y + TRAY_WALL, height: walls.height - TRAY_WALL }, BAND_RADIUS, {
			fill: look.walls.side,
		}),
		plate(floor, FLOOR_RADIUS, { fill: look.nameplate.face }),
		standing === "changed" ? hatched(floor, FLOOR_RADIUS, PLATE_HATCH) : "",
		toneFrom(floor, foot - PLATE_THICKNESS, look.nameplate.edge, FLOOR_RADIUS),
		toneFrom(floor, foot, floorTone, FLOOR_RADIUS),
		...WALL_SHADOW.map((share, index) =>
			across(floor, floor.y + (index + 0.5) * SHADOW_BAND, {
				stroke: palette.slabShadow,
				"stroke-opacity": share,
				"stroke-width": SHADOW_BAND,
			}),
		),
	]);
}

export { type TrayLook, floorOf, plateFace, tray };
