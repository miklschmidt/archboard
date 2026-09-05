// Path focus: the non-persistent dimming of everything not connected to the
// selected element. Pure: no React, no DOM, and nothing here writes the board.

export {
	projectConnectedPath,
	type ConnectedPathProjection,
	type PathFocusElement,
} from "@/ui/path-focus/lib/connected-path";
export {
	describePathFocusReason,
	samePathFocusOverlay,
	samePathFocusSnapshot,
	type ConnectedPathFocus,
	type InactivePathFocus,
	type NoPathFocus,
	type PathFocusOverlay,
	type PathFocusReason,
	type PathFocusSnapshot,
	type ViewportRectangle,
} from "@/ui/path-focus/lib/snapshot";
