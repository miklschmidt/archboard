// Path focus: the non-persistent dimming of everything not connected to the
// selected element. Pure: no React, no DOM, and nothing here writes the board.

/** Why no path could be focused from the current selection. */
type PathFocusReason = "empty" | "multiple" | "missing" | "isolated" | "broken";

/** Focus is off. */
interface InactivePathFocus {
	kind: "inactive";
}

/** Focus was asked for, but the selection has no connected path. */
interface NoPathFocus {
	kind: "no-path";
	reason: PathFocusReason;
	/** The selected element, or null when the reason is `empty`. */
	selectedId: string | null;
}

/** Focus is on: the selected element and everything reachable through arrows. */
interface ConnectedPathFocus {
	kind: "connected";
	selectedId: string;
	/** Every element on the path, the selected one included, in board order. */
	elementIds: readonly string[];
}

/** The state of path focus for the active pane. */
type PathFocusSnapshot = InactivePathFocus | NoPathFocus | ConnectedPathFocus;

/** One rectangle in a pane's viewport pixels, origin at the stage's top-left. */
interface ViewportRectangle {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Where the focused elements are on one pane's stage, so the dimming can leave them clear. */
interface PathFocusOverlay {
	paneId: string;
	rectangles: readonly ViewportRectangle[];
}

/** Plain words for each reason, for the inspector. */
const PATH_FOCUS_REASON_TEXT: Readonly<Record<PathFocusReason, string>> = {
	empty: "Select an element to focus its path.",
	multiple: "Select one element to focus its path.",
	missing: "The selected element is no longer on the board.",
	isolated: "The selected element has no arrows connecting it to anything.",
	broken: "An arrow on this path points at an element that is not on the board.",
};

/**
 * Plain words for a reason.
 * @param reason Why no path could be focused.
 * @returns One sentence for the person.
 */
function describePathFocusReason(reason: PathFocusReason): string {
	return PATH_FOCUS_REASON_TEXT[reason];
}

/**
 * Whether two id lists hold the same ids in the same order.
 * @param left One list.
 * @param right The other.
 * @returns True when they match element for element.
 */
function sameIds(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * Whether two snapshots would render identically.
 * @param left One snapshot.
 * @param right The other.
 * @returns True when nothing the stage or inspector shows differs.
 */
function samePathFocusSnapshot(left: PathFocusSnapshot, right: PathFocusSnapshot): boolean {
	if (left.kind === "inactive") {
		return right.kind === "inactive";
	}
	if (left.kind === "no-path") {
		return sameNoPath(left, right);
	}
	return sameConnected(left, right);
}

/**
 * Whether a no-path snapshot matches another snapshot.
 * @param left The no-path snapshot.
 * @param right Any snapshot.
 * @returns True when the other is no-path with the same reason and selection.
 */
function sameNoPath(left: NoPathFocus, right: PathFocusSnapshot): boolean {
	return (
		right.kind === "no-path" && left.reason === right.reason && left.selectedId === right.selectedId
	);
}

/**
 * Whether a connected snapshot matches another snapshot.
 * @param left The connected snapshot.
 * @param right Any snapshot.
 * @returns True when the other is connected with the same selection and ids.
 */
function sameConnected(left: ConnectedPathFocus, right: PathFocusSnapshot): boolean {
	return (
		right.kind === "connected" &&
		left.selectedId === right.selectedId &&
		sameIds(left.elementIds, right.elementIds)
	);
}

/**
 * Whether two rectangles cover the same pixels.
 * @param left One rectangle.
 * @param right The other.
 * @returns True when every side matches.
 */
function sameRectangle(left: ViewportRectangle, right: ViewportRectangle): boolean {
	return (
		left.x === right.x &&
		left.y === right.y &&
		left.width === right.width &&
		left.height === right.height
	);
}

/**
 * Whether two overlays would paint the same holes on the same pane.
 * @param left One overlay.
 * @param right The other.
 * @returns True when the pane and every rectangle match.
 */
function samePathFocusOverlay(left: PathFocusOverlay, right: PathFocusOverlay): boolean {
	return (
		left.paneId === right.paneId &&
		left.rectangles.length === right.rectangles.length &&
		left.rectangles.every((rectangle, index) => {
			const other = right.rectangles[index];
			return other !== undefined && sameRectangle(rectangle, other);
		})
	);
}

export {
	type PathFocusReason,
	type InactivePathFocus,
	type NoPathFocus,
	type ConnectedPathFocus,
	type PathFocusSnapshot,
	type ViewportRectangle,
	type PathFocusOverlay,
	describePathFocusReason,
	samePathFocusSnapshot,
	samePathFocusOverlay,
};
