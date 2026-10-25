//! The distances the layout keeps, in diagram points, and the page shape it
//! lays a board out for. `packages/renderer/src/shared/constants` holds the
//! same numbers for what the host still lays out and measures.

/// Equal space below a container title and at its sides and bottom.
pub(crate) const CONTAINER_INSET: f64 = 20.0;
/// Equal space below a group region's caption tab and at its sides and bottom.
pub(crate) const REGION_INSET: f64 = 14.0;
/// Label-to-card whitespace.
pub(crate) const LABEL_CARD_CLEARANCE: f64 = 16.0;
/// Whitespace between separate label boxes.
pub(crate) const LABEL_LABEL_CLEARANCE: f64 = 24.0;
/// Fixed radius of ordinary edge bends.
pub(crate) const BEND_RADIUS: f64 = 8.0;
/// Required straight run after the final bend, for every arrow.
pub(crate) const APPROACH_STRAIGHT: f64 = 12.0;
/// Padding inside measured architecture cards.
pub(crate) const ARCHITECTURE_CARD_PADDING: f64 = 16.0;

/// How thick a container's tray shows its walls.
const TRAY_WALL: f64 = 6.0;
/// The floor a tray shows round its header slab.
const WELL_GAP: f64 = 2.0;
/// How far a header slab stands in from the outer edge of its tray.
const HEADER_SLAB_INSET: f64 = TRAY_WALL + WELL_GAP;
/// How far a container's words stand in from the sides of its box.
pub(crate) const ARCHITECTURE_HEADER_PADDING: f64 = HEADER_SLAB_INSET + ARCHITECTURE_CARD_PADDING;
/// How round a card's corner is to the layout, which keeps a line's port clear of it.
pub(crate) const CARD_RADIUS: f64 = 6.0;

/// The page shape the renderer lays a board out for: width over height.
pub(crate) const LAYOUT_ASPECT: f64 = 1.4;

/// The one viewport the shell supports.
const SHELL_WIDTH: f64 = 1920.0;
const SHELL_HEIGHT: f64 = 1080.0;
const NAVIGATOR_WIDTH: f64 = 320.0;
const HANDLE_WIDTH: f64 = 1.0;
const CHROME_HEIGHT: f64 = 40.0;
const SIDEBAR_WIDTH: f64 = 280.0;
const FIT_MARGIN: f64 = 24.0;

/// The stage a lone pane draws its picture on.
const STAGE_WIDTH: f64 = SHELL_WIDTH - NAVIGATOR_WIDTH - HANDLE_WIDTH;
#[allow(dead_code)]
const STAGE_HEIGHT: f64 = SHELL_HEIGHT - CHROME_HEIGHT;
/// A lone pane's picture beside its docked sidebar, less the fit margin on either side.
const REFERENCE_WIDTH: f64 = STAGE_WIDTH - SIDEBAR_WIDTH - 2.0 * FIT_MARGIN;
/// The reference pane a drawing's fit is measured against.
const REFERENCE_PANE_WIDTH: f64 = REFERENCE_WIDTH;
const REFERENCE_PANE_HEIGHT: f64 = REFERENCE_WIDTH / LAYOUT_ASPECT;

/// A drawing's fit in the reference pane: the scale that shows it whole,
/// capped at one (`fitIn` of shell-geometry.ts).
pub(crate) fn fit_in(width: f64, height: f64) -> f64 {
    let scale = crate::ecma::js_min(REFERENCE_PANE_WIDTH / width, REFERENCE_PANE_HEIGHT / height);
    crate::ecma::js_min(1.0, scale)
}
