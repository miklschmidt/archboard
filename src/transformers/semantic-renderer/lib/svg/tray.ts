// A container is a tray cut into whatever holds it: the page, or the floor of
// the tray it is nested in, a well its cards stand in. It is the opposite of
// the blocks that stand on it (`slab.ts`), built of the same flat shapes and
// lit as they are, from straight above, like a tray cut into a table under a
// lamp.
//
// Its walls show inside its box. The top wall faces the reader and turns away
// from the light: a reader sees its face in shade, a band a step thicker than a
// card's front edge, and it throws a short, soft shadow straight down on the
// floor under it. The side walls are alike, a narrow band each, and quieter:
// the light only grazes them. The bottom wall faces the light: a reader sees a
// lip of it, and below that lip a crease where the tray meets what it is cut
// into. The floor lies a step below what holds it, a neutral only just darker
// than the page, and nothing about the well has a colour of its own. A tray
// nested in another is cut a step deeper into that one's floor. Nothing about
// a tray floats: it casts no shadow.
//
// Its header is a slab like a card's (`slab`), standing on the floor and rising
// to the level of what the tray is cut into. It stands inside the walls, a
// small gap from the top wall and from each side wall (`WELL_GAP`), so the
// walls and the depth of the well show round it. It takes its colour from the group
// that places the container, as a card does. What the container itself
// relates to leaves from the foot of the header's front edge, so the edge is
// the line's visible origin. A proposal's standing borders the header's face,
// as it does a card's; a removed container leaves the ghost every removed block
// leaves (`slab.ts`).
//
// Every shape of the well is a rect at an offset from the container's box or a
// line across it, so a viewer that carries a container from one picture to the
// next (`picture-cards.ts`) draws each at the moving box.

import {
	BAND_RADIUS,
	HEADER_SLAB_INSET,
	HEADER_SLAB_TOP,
	SLAB_RADIUS,
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
	plate,
	slab,
	slabShadow,
	type SlabLook,
} from "@/transformers/semantic-renderer/lib/svg/slab";
import type { SubjectStanding } from "@/transformers/semantic-renderer/lib/svg/standing";

/** How a tray looks: its floor, its walls and its header. */
interface TrayLook {
	/** Its floor, a neutral a step below what holds it. */
	readonly floor: string;
	/** The face of its top wall, in shade, and of its side walls, quieter. */
	readonly walls: { readonly top: string; readonly side: string };
	/** Its header slab: its box (`headerOf`) and how it looks. */
	readonly header: { readonly box: Box; readonly look: SlabLook };
}

/** The corners of a tray's floor: its box's, inside its walls. */
const FLOOR_RADIUS = BAND_RADIUS - TRAY_WALL;

/**
 * The short, soft shadow the top wall throws straight down on the floor, as
 * bands each a unit and a half deep and fainter than the one before. Lines
 * rather than one gradient, so each stretches with the floor it lies on.
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
 * The box of a tray's header slab: inside its walls, a small gap from the top
 * wall and from each side wall, and its foot where the header ends.
 * @param box The tray's box.
 * @param height How far down the box the header reaches, to the slab's foot.
 * @returns The slab's box.
 */
function headerOf(box: Box, height: number): Box {
	return {
		x: box.x + HEADER_SLAB_INSET,
		y: box.y + HEADER_SLAB_TOP,
		width: box.width - 2 * HEADER_SLAB_INSET,
		height: height - HEADER_SLAB_TOP,
	};
}

/**
 * One tray, cut into what holds it: the crease and the lip along its bottom,
 * its top wall and its side walls, its floor with the shadow the top wall
 * throws on it, and its header slab standing on the floor. A removed container
 * has lost its tray: its ghost is drawn under the selection ring
 * (`slabShadow`), and this draws nothing.
 * @param box The container's box.
 * @param look How the tray looks.
 * @param palette The theme's colours.
 * @param standing How the container stands, when this is a proposal.
 * @returns The tray.
 */
function tray(box: Box, look: TrayLook, palette: Palette, standing?: SubjectStanding): string {
	if (standing === "removed") return "";
	const floor = floorOf(box);
	const header = look.header.box;
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
		plate(floor, FLOOR_RADIUS, { fill: look.floor }),
		...WALL_SHADOW.map((share, index) =>
			across(floor, floor.y + (index + 0.5) * SHADOW_BAND, {
				stroke: palette.slabShadow,
				"stroke-opacity": share,
				"stroke-width": SHADOW_BAND,
			}),
		),
		slabShadow(header, SLAB_RADIUS, "card", palette),
		slab(header, look.header.look, palette, standing),
	]);
}

export { type TrayLook, floorOf, headerOf, tray };
