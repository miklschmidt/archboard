// The desktop shell's fixed geometry, in one place, and the page shape the
// renderer lays a document out for (ADR 0028, ADR 0039, ADR 0043).
//
// Two kinds of number live here. The shell's are measured facts: the shell is
// desktop-only at one viewport, and a lone pane's picture is the viewport less
// the navigator column, less the line between that column and the panes, and
// less the one chrome row at the top of the pane. Nothing runs under the
// panes: the agent dock is at the navigator's foot. The shell root sets the
// navigator's width and the chrome row's height from here, and
// `tests/system/browser/shell-layout.test.ts` holds the mounted shell to them.
//
// The renderer's page shape is not one of them. It is a tuned aspect ratio,
// `LAYOUT_ASPECT`, which the layouts were chosen for. The reference pane takes
// its width from the shell, so "fit 0.65" means the same thing in a test, in a
// note and on a screen, and its height from that aspect, so a row of the shell
// that changes height never lays every document out again (ADR 0043).
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

/**
 * The navigator column: the brand bar at its top, the keys of History and Measures, one list of
 * modules, flows and walkthroughs, and the agent dock at its foot. It is a sidebar of the usual
 * width, because History and Measures open in dialogs of their own and a list needs no more. The
 * core keeps the same number (`NAVIGATOR_WIDTH` in `crates/archboard-layout/src/constants.rs`).
 */
const NAVIGATOR_WIDTH = 280;

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

/** The sidebar beside a semantic diagram, holding the document's key and the selection. */
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
 * The page shape the renderer lays a document out for: width over height. A
 * tuned ratio the layouts were chosen for, not a measure of the shell: a
 * plain 1.4, close to the 1272 by 899 pane the layouts were tuned against
 * before the shell lost two rows (ADR 0043). Changing it lays documents out
 * again: which columns loose cards take, where a wide rank wraps, and which
 * fold or packing fits best (ADR 0039).
 */
const LAYOUT_ASPECT = 1.4;

/**
 * A lone pane's picture beside a docked sidebar, less the fit margin on either side. The canonical
 * reader's picture is narrower, because its right column stands beside it. The fit numbers keep this
 * width, and a landing uses the reader's own room (`LANDING_ROOM` in the core).
 */
const REFERENCE_WIDTH = STAGE.width - SIDEBAR_WIDTH - 2 * FIT_MARGIN;

/**
 * The reference pane a drawing's fit is measured against: as wide as the
 * shell gives a drawing, and as tall as the page shape makes that width.
 */
const REFERENCE_PANE: Size = { width: REFERENCE_WIDTH, height: REFERENCE_WIDTH / LAYOUT_ASPECT };

/**
 * The scale at which a picture shows whole in a room, no larger than a ceiling: the tighter of the
 * two ratios. The camera's fit and the layout suite's fit are this one line.
 * @param size What has to fit: the picture's page, or the part of it to show.
 * @param room How much room there is; the reference pane, which already leaves the fit margin
 *   around the picture, when absent.
 * @param ceiling How far the fit may magnify; at its drawn size, because a small picture shown at
 *   its drawn size fits.
 * @returns The scale.
 */
function fit(size: Size, room: Size = REFERENCE_PANE, ceiling = 1): number {
	return Math.min(ceiling, room.width / size.width, room.height / size.height);
}

/** The shell's measures a caller lays out by, in CSS pixels. */
const SHELL = Object.freeze({
	navigator: NAVIGATOR_WIDTH,
	sidebar: SIDEBAR_WIDTH,
	agentPanel: AGENT_PANEL_WIDTH,
	chrome: CHROME_HEIGHT,
	fitMargin: FIT_MARGIN,
	viewport: SHELL_VIEWPORT,
	referencePane: REFERENCE_PANE,
});

/**
 * One measure of the shell: the navigator's or a sidebar's width, the agent panel's, the chrome
 * row's height, the margin a fitted picture keeps from each edge of its room, the viewport, or
 * the pane a layout is fitted to.
 * @param key Which one.
 * @returns It, in CSS pixels.
 */
function shell<K extends keyof typeof SHELL>(key: K): (typeof SHELL)[K] {
	return SHELL[key];
}

export { fit, shell, type Size };
