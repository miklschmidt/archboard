// The measurements of the picture, in one place. These are the design system:
// change a number here and every diagram moves with it.
//
// Forked from PR Lens's `design.ts` and retuned for Archboard's operator shell,
// which is flat and dense: small corner radii, one-pixel rules, no shadow and
// no gradient. Anything to do with a pull request — badge strips, dead bands,
// pulse timings — is gone rather than retuned.

const DIAGRAM_MARGIN = 20;

const BAND_PADDING_X = 18;
const BAND_GAP = 22;
const BAND_BOTTOM_PADDING = 22;
const BAND_RADIUS = 6;

/**
 * How far a container's contents are set in from its box, which is also how far
 * one container's box is set in from the box around it.
 *
 * One number for both, so that nesting reads as a single repeated step rather
 * than as two similar-looking ones, and so that a container box drawn at any
 * depth lines up with the cards of the level outside it.
 */
const NEST_INSET = BAND_PADDING_X;
/** A nested container's corner radius: a step tighter than the box around it. */
const NEST_RADIUS = 5;

/** The air between a container's title block and the first thing under it. */
const HEADER_GAP = 8;
/** The air between a container's title block and the top edge of its box. */
const CONTAINER_TOP_PAD = 8;
/** The air between a container's last row and the bottom edge of its box. */
const CONTAINER_BOTTOM_PAD = 14;

/**
 * Every region is the same width, and that width is a constant rather than
 * anything derived from what the region holds.
 *
 * A region's width decides where the region after it starts, so a width drawn
 * from content couples every column to the contents of the ones before it:
 * adding one node with a long name to the first region would slide every card
 * in every later region sideways, and a person comparing two renders of the
 * same architecture would be shown a teleport instead of a change. The cost is
 * that a region holding something narrow is wider than it needs to be.
 * Stability is worth more.
 *
 * Sized so that two cards sharing a row still each get a readable width.
 */
const BAND_CONTENT_WIDTH = 352;

/** The header block's height with a name alone, and with a responsibility under it. */
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

/** The gap between two rows of cards, which is also the gap under a header. */
const ROW_GAP = 48;

const CARD_RADIUS = 6;
const CARD_GAP_X = 12;
const CARD_HEIGHT = 46;
const CARD_HEIGHT_WITH_NOTE = 58;
const CARD_PADDING_X = 13;

const ICON_CHIP_SIZE = 24;
const ICON_CHIP_GAP = 10;
const ICON_CHIP_RADIUS = 5;
/** Below this a card's title starts a size down, to keep its room. */
const ICON_MIN_CARD_WIDTH = 190;

const TITLE_SIZE = 13;
const TITLE_SIZE_SMALL = 11.5;

/**
 * How a title that overruns its card gives way. Cards cannot widen — their
 * width is a constant so that a rename moves nothing — so a name longer than
 * the run it was given steps down in half-points until it fits, and is cut
 * only once it would go below the floor. A reader can read a name set half a
 * point smaller; a name with its tail missing is a different name.
 *
 * Half-points because the step has to be coarse enough that two cards side by
 * side do not look randomly sized, and fine enough that one step is usually
 * the whole of it.
 */
const TITLE_SIZE_MIN = 10.5;
const TITLE_SIZE_STEP = 0.5;

/** The responsibility line under a card's name. */
const NOTE_SIZE = 9.5;

const PILL_HEIGHT = 15;
const PILL_PADDING_X = 8;
const PILL_TEXT_SIZE = 9;
const PILL_RADIUS = 4;
/** How little air a pill needs against a card, an arrowhead or a port. */
const PILL_CLEARANCE = 2;
/**
 * And how much two pills keep from each other. More than the clearance above,
 * because two labels a hair apart read as one block of text; against a card
 * there is nothing to tell apart, so that stays tight.
 */
const PILL_AIR = 6;

/**
 * A turn's bend radius comes from the shorter of its two legs, capped here.
 * Deriving it from the longer leg balloons a route with one short leg and one
 * long one — the shape every corridor run has — clear out of its corridor.
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

/**
 * Routes travel in the gaps of the grid: vertical corridors beside regions and
 * horizontal bands between rows. A track keeps this much clearance from the
 * cards on either side.
 *
 * Both of an endpoint's needs: the straight line the arrowhead sits on, and the
 * radius of the turn after it. That is one leg and it carries both, so a
 * clearance of twelve — the approach alone — drew every such turn square.
 */
const TRACK_CLEARANCE = APPROACH_STRAIGHT + BEND_RADIUS_MIN;
/**
 * Neighbouring tracks in one gap sit this far apart at most; when a gap
 * carries more traffic than the room allows, the pitch shrinks to fit. An
 * added route therefore nudges its gap-mates proportionately — an accepted
 * trade, and one that never moves a card.
 */
const TRACK_PITCH_MAX = 16;
/**
 * And never closer than this: below it, parallel runs stop reading as
 * separate lines. A gap asked to carry more traffic than the floor allows
 * does not compress further — it widens instead, corridors pushing the
 * regions beside them apart and row gaps pushing the rows, in proportion to
 * the traffic and to nothing else.
 */
const TRACK_PITCH_MIN = 10;

/** Step between neighbouring arrow ports along one card face. */
const PORT_PITCH = 15;
/** Ports keep clear of the card's rounded corners. */
const PORT_INSET = 12;

/**
 * How many dots ride a hero relationship at once.
 *
 * Three, from the renderer this was forked from: two read as a coincidence and
 * four as a dotted line. What says "busier" is the count, not the speed — the
 * pace lives in `shared/timing` with every other duration.
 */
const HERO_PULSE_COUNT = 3;

export {
	HERO_PULSE_COUNT,
	DIAGRAM_MARGIN,
	BAND_PADDING_X,
	BAND_GAP,
	BAND_BOTTOM_PADDING,
	BAND_RADIUS,
	BAND_CONTENT_WIDTH,
	NEST_INSET,
	NEST_RADIUS,
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
	ROW_GAP,
	CARD_RADIUS,
	CARD_GAP_X,
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
	PILL_AIR,
	PILL_CLEARANCE,
	TRACK_CLEARANCE,
	TRACK_PITCH_MAX,
	TRACK_PITCH_MIN,
	PORT_PITCH,
	PORT_INSET,
	APPROACH_STRAIGHT,
	BEND_RADIUS_MAX,
	BEND_RADIUS_MIN,
	HEAD_REACH,
};
