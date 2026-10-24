// Typography and visual styling. Layout clearances live in spacing.ts.
//
// Forked from PR Lens's `design.ts` and retuned for Archboard's operator shell.
// Anything to do with a pull request — badge strips, dead bands, pulse timings —
// is gone rather than retuned. Its parts are drawn as blocks with a visible
// thickness (`crates/archboard-scene/src/paint/slab.rs`): the thicknesses and the corners are here.
// The renderer core paints with its own copy of what it draws (ADR 0057); the
// layout and measurement here read these until the core lays out too.

import { ARCHITECTURE_CARD_PADDING, ARCHITECTURE_NOTE_GAP } from "#shared/constants/spacing.ts";

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
/** Minimum participant-card heights; each additional responsibility line adds its line height. */
const CARD_HEIGHT = 46;
const CARD_HEIGHT_WITH_NOTE = 58;

const ICON_CHIP_SIZE = 24;
const ICON_CHIP_GAP = 10;
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

/** The farthest a card's shadow reaches below its foot, which a layout keeps clear. */
const SHADOW_REACH = 12;

/**
 * What a part keeps clear beside its name for the mark of a board it opens:
 * the mark's ring, 6.5 units in radius, and a gap before it.
 */
const DRILL_MARK_ROOM = 2 * 6.5 + 8;

/** A flowchart shape's words: a size and the room one line of them takes. */
const SHAPE_TEXT = { size: 11, line: 14 } as const;

export {
	SHADOW_REACH,
	DRILL_MARK_ROOM,
	SHAPE_TEXT,
	HEADER_HEIGHT,
	HEADER_HEIGHT_WITH_NOTE,
	ARCHITECTURE_HEADER_PADDING,
	HEADER_SLAB_INSET,
	PART_TITLE,
	PART_NOTE,
	TEXT_LINE_HEIGHT,
	CARD_RADIUS,
	CARD_HEIGHT,
	CARD_HEIGHT_WITH_NOTE,
	ICON_CHIP_SIZE,
	ICON_CHIP_GAP,
	ICON_MIN_CARD_WIDTH,
	TITLE_SIZE,
	TITLE_SIZE_SMALL,
	TITLE_SIZE_MIN,
	TITLE_SIZE_STEP,
	NOTE_SIZE,
	PILL_HEIGHT,
	PILL_PADDING_X,
	PILL_TEXT_SIZE,
	LINE_STRENGTH,
};
