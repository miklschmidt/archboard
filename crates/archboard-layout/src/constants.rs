//! The distances the layout keeps, in diagram units, and its target page shape.
//! Shared sizes come from the scene that the layout places.

pub(crate) use archboard_scene::geometry::BEND_RADIUS;
pub(crate) use archboard_scene::paint::design::{
    ARCHITECTURE_HEADER_PADDING, CARD_RADIUS, HEADER_SLAB_INSET, REGION_INSET,
};

/// Equal space below a container title and at its sides and bottom.
pub(crate) const CONTAINER_INSET: f64 = 20.0;
/// Label-to-card whitespace.
pub(crate) const LABEL_CARD_CLEARANCE: f64 = 16.0;
/// Whitespace between separate label boxes.
pub(crate) const LABEL_LABEL_CLEARANCE: f64 = 24.0;
/// Required straight run after the final bend, for every arrow.
pub(crate) const APPROACH_STRAIGHT: f64 = 12.0;

/// The page shape the renderer lays a board out for: width over height.
pub(crate) const LAYOUT_ASPECT: f64 = 1.4;

/// The width of the one viewport the shell supports.
const SHELL_WIDTH: f64 = 1920.0;
const NAVIGATOR_WIDTH: f64 = 320.0;
const HANDLE_WIDTH: f64 = 1.0;
const SIDEBAR_WIDTH: f64 = 280.0;
const FIT_MARGIN: f64 = 24.0;

/// The stage a lone pane draws its picture on.
const STAGE_WIDTH: f64 = SHELL_WIDTH - NAVIGATOR_WIDTH - HANDLE_WIDTH;
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
