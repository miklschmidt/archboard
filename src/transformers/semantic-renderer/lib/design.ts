// Typography and visual styling. Layout clearances live in ../config.ts.
//
// Forked from PR Lens's `design.ts` and retuned for Archboard's operator shell.
// Anything to do with a pull request — badge strips, dead bands, pulse timings —
// is gone rather than retuned. Its parts are drawn as blocks with a visible
// thickness (`lib/svg/slab.ts`): the thicknesses and the corners are here.

import {
	ARCHITECTURE_CARD_PADDING,
	ARCHITECTURE_NOTE_GAP,
} from "@/transformers/semantic-renderer/config";

/** The corners of a container's tray and of a group's region. */
const BAND_RADIUS = 10;

/**
 * A measured part's name and what it is responsible for: a card's, and a
 * container's or a flow's on its header slab. Each is a size and the room one
 * line of it takes.
 */
const PART_TITLE = { size: 14, line: 20 } as const;
const PART_NOTE = { size: 11, line: 17 } as const;

/**
 * A flow header's height with a name alone, and with a summary under it: set
 * as a container's header is, so a flow's frame and a container are one family.
 */
const HEADER_HEIGHT = PART_TITLE.line;
const HEADER_HEIGHT_WITH_NOTE = PART_TITLE.line + ARCHITECTURE_NOTE_GAP + PART_NOTE.line;

/**
 * The ratio between a font size and the vertical room one line of it takes.
 *
 * Nothing measures height — not here, and not the canvas, which is asked only
 * for widths. This is a chosen constant, set where the descenders clear the
 * next line's ascenders at the sizes this file uses, and it is the only place
 * a line's height is decided.
 */
const TEXT_LINE_HEIGHT = 1.35;

/**
 * How strong a coloured line is drawn, as its share of its colour over the
 * page, on each ground. On the light ground it is the colour itself, which
 * gives the most contrast a colour has there. On the dark ground it is three
 * quarters, which is 3.9:1 or more for every colour. The neutral line keeps
 * its own ink, `--diagram-edge`. A pulse is lighter than either line.
 */
const LINE_STRENGTH = { light: 1, dark: 0.75 } as const;

/**
 * How round a card's corner is to the layout, which keeps a line's port clear
 * of it, and to a pulse, which is held in a card for the way round its edge.
 */
const CARD_RADIUS = 6;
/**
 * How round a card is drawn: rounder than the layout's corner, which changes
 * no route. A port the layout keeps clear of its own corner stands at most a
 * quarter unit off this one's curve.
 */
const SLAB_RADIUS = 8;
/** How thick a card's slab is: its front edge, inside its box along its foot. */
const CARD_THICKNESS = 4;
/**
 * A container's tray (`lib/svg/tray.ts`), cut into what holds it and lit from
 * straight above: how thick its top wall shows, a step thicker than a card's
 * front edge; how thick each side wall shows, both alike; how wide the lit lip
 * along its bottom is; and the crease below that lip, where the tray meets
 * what it is cut into. A side wall is as wide as the lip and the crease
 * together, so the floor lies as far in from each side as from the bottom.
 */
const TRAY_WALL = 7;
const TRAY_SIDE = 3;
const TRAY_LIP = 2;
const TRAY_CREASE = 1;
/**
 * The floor a tray shows round its header slab, above it and at its sides: a
 * gap just wide enough to see, so the walls and the depth of the well show
 * round the header. The slab stands inside the walls, this far from each. The
 * room under it, down to the first row, is the container's inset as at its
 * sides (`CONTAINER_INSET`).
 */
const WELL_GAP = 5;
/** How far a header slab stands in from the sides of its tray's box, and how far below its top. */
const HEADER_SLAB_INSET = TRAY_SIDE + WELL_GAP;
const HEADER_SLAB_TOP = TRAY_WALL + WELL_GAP;
/**
 * How far a container's words stand in from the sides of its box: on its
 * header slab, as a card's stand on its own.
 */
const ARCHITECTURE_HEADER_PADDING = HEADER_SLAB_INSET + ARCHITECTURE_CARD_PADDING;
/** How thick an icon chip is: a small tile raised off the face it sits on. */
const CHIP_THICKNESS = 1.5;
/** How thick a relationship's label is: a tile as low as a chip, which sits on its line. */
const PILL_THICKNESS = 2;
/** Minimum participant-card heights; each additional responsibility line adds its line height. */
const CARD_HEIGHT = 46;
const CARD_HEIGHT_WITH_NOTE = 58;

const ICON_CHIP_SIZE = 24;
const ICON_CHIP_GAP = 10;
const ICON_CHIP_RADIUS = 5;
/** Below this a sequence participant's title starts a size down, to keep its room. */
const ICON_MIN_CARD_WIDTH = 190;

const TITLE_SIZE = 13;
const TITLE_SIZE_SMALL = 11.5;

/**
 * How a sequence participant title that overruns its shared column gives way.
 * Those cards cannot widen independently, so a longer name steps down in
 * half-points until it fits and is cut only once it would go below the floor.
 *
 * Half-points because the step has to be coarse enough that two cards side by
 * side do not look randomly sized, and fine enough that one step is usually
 * the whole of it.
 */
const TITLE_SIZE_MIN = 10.5;
const TITLE_SIZE_STEP = 0.5;

/** Responsibility text under a sequence participant's name. */
const NOTE_SIZE = 9.5;

const PILL_HEIGHT = 15;
const PILL_PADDING_X = 8;
const PILL_TEXT_SIZE = 9;
const PILL_RADIUS = 4;

export {
	BAND_RADIUS,
	HEADER_HEIGHT,
	HEADER_HEIGHT_WITH_NOTE,
	ARCHITECTURE_HEADER_PADDING,
	HEADER_SLAB_INSET,
	HEADER_SLAB_TOP,
	PART_TITLE,
	PART_NOTE,
	TEXT_LINE_HEIGHT,
	CARD_RADIUS,
	SLAB_RADIUS,
	CARD_THICKNESS,
	TRAY_WALL,
	TRAY_SIDE,
	TRAY_LIP,
	TRAY_CREASE,
	CHIP_THICKNESS,
	PILL_THICKNESS,
	CARD_HEIGHT,
	CARD_HEIGHT_WITH_NOTE,
	ICON_CHIP_SIZE,
	ICON_CHIP_GAP,
	ICON_CHIP_RADIUS,
	ICON_MIN_CARD_WIDTH,
	TITLE_SIZE,
	TITLE_SIZE_SMALL,
	TITLE_SIZE_MIN,
	TITLE_SIZE_STEP,
	NOTE_SIZE,
	PILL_HEIGHT,
	PILL_PADDING_X,
	PILL_TEXT_SIZE,
	PILL_RADIUS,
	LINE_STRENGTH,
};

export {
	DIAGRAM_MARGIN,
	NEST_INSET,
	CONTAINER_BOTTOM_PAD,
	CARD_PADDING_X,
	BEND_RADIUS,
	APPROACH_STRAIGHT,
	BRIDGE_RADIUS,
	BRIDGE_CLEARANCE,
} from "@/transformers/semantic-renderer/config";
