// Typography and visual styling. Layout clearances live in ../config.ts.
//
// Forked from PR Lens's `design.ts` and retuned for Archboard's operator shell,
// which is flat and dense: small corner radii, one-pixel rules, no shadow and
// no gradient. Anything to do with a pull request — badge strips, dead bands,
// pulse timings — is gone rather than retuned.

const BAND_RADIUS = 6;

/** A flow header's height with a name alone, and with a summary under it. */
const HEADER_HEIGHT = 19;
const HEADER_HEIGHT_WITH_NOTE = 33;

const HEADER_NAME_SIZE = 10.5;
/**
 * Uppercase and tracked, on top of the medium weight. Weight alone would make
 * a header look like a small card title; caps and tracking make it a label.
 */
const HEADER_NAME_TRACKING = 0.12;
const HEADER_NOTE_SIZE = 9;

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
 * Distance from a text block's top edge to the first baseline, as a multiple
 * of the font size. Roughly the cap height plus the line's leading half.
 */
const BASELINE_RATIO = 1.02;

const CARD_RADIUS = 6;
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
	HEADER_NAME_SIZE,
	HEADER_NAME_TRACKING,
	HEADER_NOTE_SIZE,
	TEXT_LINE_HEIGHT,
	BASELINE_RATIO,
	CARD_RADIUS,
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
};

export {
	DIAGRAM_MARGIN,
	NEST_INSET,
	HEADER_GAP,
	CONTAINER_TOP_PAD,
	CONTAINER_BOTTOM_PAD,
	CARD_PADDING_X,
	BEND_RADIUS,
	APPROACH_STRAIGHT,
	BRIDGE_RADIUS,
	BRIDGE_CLEARANCE,
} from "@/transformers/semantic-renderer/config";
