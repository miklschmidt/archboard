// Typography and visual styling. Layout clearances live in spacing.ts.
//
// Forked from PR Lens's `design.ts` and retuned for Archboard's operator shell.
// Anything to do with a pull request — badge strips, dead bands, pulse timings —
// is gone rather than retuned. Its parts are drawn as blocks with a visible
// thickness (`crates/archboard-scene/src/paint/slab.rs`): the thicknesses and the corners are here.
// The renderer core paints with its own copy of what it draws (ADR 0057); the
// layout and measurement here read these until the core lays out too.

import { ARCHITECTURE_CARD_PADDING } from "#shared/constants/spacing.ts";

/**
 * A measured part's name and what it is responsible for: a card's, and a
 * container's or a flow's on its header slab. Each is a size and the room one
 * line of it takes.
 */
const PART_TITLE = { size: 14, line: 20 } as const;
const PART_NOTE = { size: 11, line: 17 } as const;

/**
 * How strong a coloured line is drawn, as its share of its colour over the
 * page, on each ground. On the light ground it is the colour itself, which
 * gives the most contrast a colour has there. On the dark ground it is four
 * fifths, which keeps APCA Lc 30 or more, the floor for a mark, for every
 * colour. The neutral line keeps its own ink, `--diagram-edge`. A pulse is
 * lighter than either line.
 */
const LINE_STRENGTH = { light: 1, dark: 0.8 } as const;

/**
 * How round a card's corner is to the layout, which keeps a line's port clear
 * of it, and to a pulse, which is held in a card for the way round its edge.
 */
const CARD_RADIUS = 6;
/**
 * How thick a container's tray shows its walls, the top wall and the two side
 * walls alike, a step thicker than a card's front edge, so its header slab
 * stands as far from the outer edge on the top as on either side.
 */
const TRAY_WALL = 6;
/**
 * The floor a tray shows round its header slab, above it and at its sides: a
 * gap only just there, so the slab looks friction fit in the well with the
 * walls round it. The room under the slab, down to the first row, is the
 * container's inset as at its sides (`CONTAINER_INSET`).
 */
const WELL_GAP = 2;
/** How far a header slab stands in from the outer edge of its tray, on the top and on either side. */
const HEADER_SLAB_INSET = TRAY_WALL + WELL_GAP;
/**
 * How far a container's words stand in from the sides of its box: on its
 * header slab, as a card's stand on its own.
 */
const ARCHITECTURE_HEADER_PADDING = HEADER_SLAB_INSET + ARCHITECTURE_CARD_PADDING;

const ICON_CHIP_SIZE = 24;

/**
 * What a part keeps clear beside its name for the mark of a board it opens:
 * the mark's ring, 6.5 units in radius, and a gap before it.
 */
const DRILL_MARK_ROOM = 2 * 6.5 + 8;

export {
	DRILL_MARK_ROOM,
	ARCHITECTURE_HEADER_PADDING,
	HEADER_SLAB_INSET,
	PART_TITLE,
	PART_NOTE,
	CARD_RADIUS,
	ICON_CHIP_SIZE,
	LINE_STRENGTH,
};
