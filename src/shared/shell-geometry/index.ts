// The desktop shell's fixed geometry, in one place, and the reference pane a
// drawing is measured against, derived from it (ADR 0028).
//
// The shell is desktop-only at one viewport, so the pane a reader gets is a
// fixed rectangle: the viewport less the navigator, the header, the pane bar
// and the collapsed dock, less the inspector drawn over the diagram's right
// edge, less the fit margin on every side. The camera fits a diagram into a
// pane with the arithmetic below; the layout suite and the measure script fit
// it into this pane with the same arithmetic, so "fit 0.65" means the same
// thing in a test, in a note and on a screen. `tests/system/browser/
// shell-layout.test.ts` holds the mounted shell to these numbers.
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

/** The navigator column, which the header's wordmark section shares. */
const NAVIGATOR_WIDTH = 320;

/** The sidebar beside a semantic diagram, holding the board's key and the selection. */
const SIDEBAR_WIDTH = 280;

/** The header row. */
const HEADER_HEIGHT = 56;

/** The pane bar under the header. */
const PANE_BAR_HEIGHT = 36;

/** The collapsed workbench dock: its bar, and the rule drawn above it. */
const DOCK_BAR_HEIGHT = 41;

/** The breathing room a fit leaves around the diagram, in viewport pixels. */
const FIT_MARGIN = 24;

/** The stage every pane draws into: the viewport less the shell's chrome. */
const STAGE: Size = {
	width: SHELL_VIEWPORT.width - NAVIGATOR_WIDTH,
	height: SHELL_VIEWPORT.height - HEADER_HEIGHT - PANE_BAR_HEIGHT - DOCK_BAR_HEIGHT,
};

/**
 * The reference pane: the stage with the sidebar open and the fit margin
 * taken off every side. What a drawing's fit is measured against.
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
	DOCK_BAR_HEIGHT,
	FIT_MARGIN,
	HEADER_HEIGHT,
	NAVIGATOR_WIDTH,
	PANE_BAR_HEIGHT,
	SIDEBAR_WIDTH,
	REFERENCE_PANE,
	SHELL_VIEWPORT,
	STAGE,
	fitIn,
	fitScale,
	type Size,
};
