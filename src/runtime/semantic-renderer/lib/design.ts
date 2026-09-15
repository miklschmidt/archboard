// The measurements of the picture, in one place. These are the design system:
// change a number here and every diagram moves with it.
//
// Forked from PR Lens's `design.ts` and retuned for Archboard's operator shell,
// which is flat and dense: small corner radii, one-pixel rules, no shadow and
// no gradient. Anything to do with a pull request — badge strips, dead bands,
// pulse timings — is gone rather than retuned.

const DIAGRAM_MARGIN = 20;

const BAND_RADIUS = 6;

/**
 * How far a sequence frame's participant columns are set in from its box.
 */
const NEST_INSET = 18;

/** The air between a flow's title block and its participant cards. */
const HEADER_GAP = 8;
/** The air between a flow's title block and the top edge of its frame. */
const CONTAINER_TOP_PAD = 8;
/** The air between a flow's last message and the bottom edge of its frame. */
const CONTAINER_BOTTOM_PAD = 14;

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
 * Nothing measures height — not here, and not in `measure-text`, which says so
 * itself. This is a chosen constant, set where Nunito's descenders clear the
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
const CARD_PADDING_X = 13;

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

/**
 * A turn's bend radius comes from the shorter of its two legs, capped here.
 * Deriving it from the longer leg balloons a route with one short leg and one
 * long one clear out of the channel the layout left for it.
 * Smaller than PR Lens's 34: the shell's chrome turns tight corners, and a
 * generous sweep reads as a different product.
 */
const BEND_RADIUS_MAX = 14;

/**
 * How much of the line an arrowhead covers, measured back from the tip: the
 * largest of `HEAD_SIZE` in `svg/document.ts`, drawn for a hero. A label that
 * comes nearer than this sits on the head and hides where the line points.
 */
const HEAD_REACH = 7.5;

/**
 * The smallest turn that still reads as one: under this an arc is barely longer
 * than the line is wide. Not a floor the rounding enforces — a leg too short to
 * turn on still comes out square — but the room the router leaves beside a
 * card, so a turn taken there has something to round with.
 */
const BEND_RADIUS_MIN = 8;

/**
 * How much dead-straight line an endpoint keeps before the route turns.
 *
 * A rounded corner takes its radius off BOTH of its legs — that is what makes
 * it tangent to each — so a route whose last leg was fourteen units long used
 * to arrive on seven units of straight line and seven of arc, with the
 * arrowhead sitting across the join. A head that meets a card at an angle
 * reads as pointing somewhere other than where it points, and the marker's own
 * rounding makes it worse: the widest head this renderer draws is 7.5 units, so
 * anything under that is a head drawn on a curve.
 *
 * Twelve is that head plus a little air. It is a floor on the straight run, not
 * a fixed stub: a leg with room to spare still rounds at `BEND_RADIUS_MAX`, and
 * a leg too short to give twelve gives everything it has and rounds not at all.
 */
const APPROACH_STRAIGHT = 12;

/** Small raised shoulders distinguish a crossing without rerouting its corridor. */
const BRIDGE_RADIUS = 7;
/** Clear air between bridge ink and unrelated turns, labels or cards. */
const BRIDGE_CLEARANCE = 3;

export {
	DIAGRAM_MARGIN,
	BAND_RADIUS,
	NEST_INSET,
	HEADER_GAP,
	CONTAINER_TOP_PAD,
	CONTAINER_BOTTOM_PAD,
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
	CARD_PADDING_X,
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
	APPROACH_STRAIGHT,
	BRIDGE_RADIUS,
	BRIDGE_CLEARANCE,
	BEND_RADIUS_MAX,
	BEND_RADIUS_MIN,
	HEAD_REACH,
};
