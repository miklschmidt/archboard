// The navigator's one grid. Every row, whatever it names, is the same four
// columns placed by its depth alone: the disclosure, the marker, the name and
// the facts. A deeper row moves right by one step, which is the width of the
// disclosure column, so a row's disclosure sits under its parent's marker and
// the guide of each open row runs through the middle of its disclosure. The
// filter and Working now put their icon and text on the columns of depth zero.
// Pure: every horizontal length the navigator lays out comes from here, in
// pixels, and every x is measured from the navigator's left edge.

/** The disclosure column: a chevron, or the space one would take. */
const DISCLOSURE_WIDTH = 16;

/** How far each depth moves a row right: one disclosure column. */
const TREE_STEP = DISCLOSURE_WIDTH;

/** From the navigator's left edge to the disclosure column of depth zero. */
const TREE_INSET = 8;

/** The marker column: what kind of row it is, and an agent at work. */
const MARKER_WIDTH = 16;

/** Between the marker column and the name. */
const NAME_GAP = 6;

/** Between the name and the facts. */
const FACTS_GAP = 8;

/** The margin a row's tone keeps from the navigator's edges. */
const ROW_GUTTER = 4;

/** From the facts' right edge to the navigator's right edge. */
const FACTS_INSET = 12;

/** The smallest pointer target the shell allows; a chevron's reaches past its column. */
const TARGET_SIZE = 24;

/**
 * Where the disclosure column of a depth starts.
 * @param depth The depth, 0 at the top.
 * @returns The distance from the navigator's left edge.
 */
function disclosureX(depth: number): number {
	return TREE_INSET + depth * TREE_STEP;
}

/**
 * Where the marker column of a depth starts.
 * @param depth The depth.
 * @returns The distance from the navigator's left edge.
 */
function markerX(depth: number): number {
	return disclosureX(depth) + DISCLOSURE_WIDTH;
}

/**
 * Where the name of a row at a depth starts.
 * @param depth The depth.
 * @returns The distance from the navigator's left edge.
 */
function nameX(depth: number): number {
	return markerX(depth) + MARKER_WIDTH + NAME_GAP;
}

/**
 * Where the guide of an open row at a depth runs: the middle of its disclosure.
 * @param depth The open row's depth.
 * @returns The distance from the navigator's left edge.
 */
function guideX(depth: number): number {
	return disclosureX(depth) + DISCLOSURE_WIDTH / 2;
}

export {
	DISCLOSURE_WIDTH,
	FACTS_GAP,
	FACTS_INSET,
	MARKER_WIDTH,
	NAME_GAP,
	ROW_GUTTER,
	TARGET_SIZE,
	disclosureX,
	guideX,
	markerX,
	nameX,
};
