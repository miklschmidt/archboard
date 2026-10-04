// The desktop shell's fixed geometry, in one place, and the reference pane a
// drawing is measured against, derived from it (ADR 0028).
//
// The shell is desktop-only at one viewport, so the pane a reader gets is a
// fixed rectangle. A lone pane's picture is the viewport less the navigator
// column, less the line between that column and the panes, and less the one
// chrome row at the top of the pane. Nothing runs under the panes: the agent
// dock is at the navigator's foot. The reference pane is that picture less the
// sidebar docked beside it, less the fit margin on every side. The camera fits
// a diagram into a pane with the arithmetic below; the layout suite and the
// measure script fit it into this pane with the same arithmetic, so "fit 0.65"
// means the same thing in a test, in a note and on a screen. The shell root
// sets the navigator's width and the chrome row's height from here, and
// `tests/system/browser/shell-layout.test.ts` holds the mounted shell to these
// numbers.
//
// Shared by the browser, the renderer's tests and a script, so nothing here
// reads `process` or a file.

/** A width and a height, in whichever units the caller is working in. */
interface Size {
	readonly width: number;
	readonly height: number;
}

/** The one viewport the shell supports: desktop only, 1920 by 1080. */
const SHELL_VIEWPORT: Size = { width: 1920, height: 1080 };

/** The navigator column: the brand bar at its top, the boards, and the agent dock at its foot. */
const NAVIGATOR_WIDTH = 320;

/**
 * The line between the navigator and the panes: the handle that drags the
 * conversation wider, which stays in its place while the conversation is shut.
 */
const HANDLE_WIDTH = 1;

/**
 * The top row of every column: the brand bar over the navigator, a pane's
 * header and the conversation's header. The stylesheet's `h-chrome` takes it
 * from the shell root.
 */
const CHROME_HEIGHT = 40;

/** The sidebar beside a semantic diagram, holding the board's key and the selection. */
const SIDEBAR_WIDTH = 280;

/**
 * The conversation panel beside the panes, while it is open, as wide as it
 * starts; the person can drag its edge to another width. It is not part of
 * the stage a drawing is measured against: it opens only when the person asks,
 * and the camera refits the narrower pane.
 */
const AGENT_PANEL_WIDTH = 440;

/** The breathing room a fit leaves around the diagram, in viewport pixels. */
const FIT_MARGIN = 24;

/**
 * The stage a lone pane draws its picture on, with the conversation shut: the
 * viewport less the navigator, the line beside it and the pane's chrome row.
 */
const STAGE: Size = {
	width: SHELL_VIEWPORT.width - NAVIGATOR_WIDTH - HANDLE_WIDTH,
	height: SHELL_VIEWPORT.height - CHROME_HEIGHT,
};

/**
 * The reference pane: the stage with the sidebar docked beside the picture
 * and the fit margin taken off every side. What a drawing's fit is measured
 * against.
 */
const REFERENCE_PANE: Size = {
	width: STAGE.width - SIDEBAR_WIDTH - 2 * FIT_MARGIN,
	height: STAGE.height - 2 * FIT_MARGIN,
};

/**
 * The scale at which a rectangle shows whole in a room: the tighter of the
 * two ratios. The camera's fit and the layout suite's fit are this one line.
 * @param room How much room there is.
 * @param size What has to fit in it.
 * @returns The scale; above one when the room is the larger.
 */
function fitScale(room: Size, size: Size): number {
	return Math.min(room.width / size.width, room.height / size.height);
}

/**
 * A drawing's fit in the reference pane: the scale that shows it whole, capped
 * at one, because a small drawing shown at its drawn size fits.
 * @param size The drawing's page.
 * @returns The fit, in (0, 1].
 */
function fitIn(size: Size): number {
	return Math.min(1, fitScale(REFERENCE_PANE, size));
}

export {
	AGENT_PANEL_WIDTH,
	CHROME_HEIGHT,
	FIT_MARGIN,
	NAVIGATOR_WIDTH,
	SIDEBAR_WIDTH,
	REFERENCE_PANE,
	SHELL_VIEWPORT,
	STAGE,
	fitIn,
	fitScale,
	type Size,
};
