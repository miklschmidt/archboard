//! The distances the layout keeps, in diagram units, and its target page shape.
//! Shared sizes come from the scene that the layout places.

use archboard_scene::geometry::{bend_radius, route_tolerance};
use archboard_scene::paint::design::card_radius;

/// The radius of every bend a route takes.
pub(crate) const BEND_RADIUS: f64 = bend_radius();
/// How round a card's corner is, which keeps a line's port clear of it.
pub(crate) const CARD_RADIUS: f64 = card_radius();
/// How close two points must be to be one, and the least a turn may move.
pub(crate) const EPSILON: f64 = route_tolerance();

/// The width of the one viewport the shell supports.
const SHELL_WIDTH: f64 = 1920.0;
/// The left column of the shell (`NAVIGATOR_WIDTH` of shell-geometry.ts).
const NAVIGATOR_WIDTH: f64 = 280.0;
/// The line between the left column and the panes.
const HANDLE_WIDTH: f64 = 1.0;
/// The right panel beside the picture of a reading.
const RIGHT_PANEL_WIDTH: f64 = 360.0;
/// The breathing room a fit leaves on either side of a picture.
const FIT_MARGIN: f64 = 24.0;
/// The room a picture lands in on the one screen the shell supports: the pane
/// beside the right panel at 1920 by 1080, less the camera's margin.
pub(crate) const LANDING_ROOM: (f64, f64) = (
    SHELL_WIDTH - NAVIGATOR_WIDTH - HANDLE_WIDTH - RIGHT_PANEL_WIDTH - 2.0 * FIT_MARGIN,
    955.0,
);

/// How far a region stands in from what it holds.
pub(crate) const REGION_INSET: f64 = 14.0;

/// Equal space below a container title and at its sides and bottom.
pub(crate) const CONTAINER_INSET: f64 = 20.0;
/// Label-to-card whitespace.
pub(crate) const LABEL_CARD_CLEARANCE: f64 = 16.0;
/// Whitespace between separate label boxes.
pub(crate) const LABEL_LABEL_CLEARANCE: f64 = 24.0;
/// Required straight run after the final bend, for every arrow.
pub(crate) const APPROACH_STRAIGHT: f64 = 12.0;

/// The page shape the renderer lays a picture out for: width over height.
pub(crate) const LAYOUT_ASPECT: f64 = 1.4;

const SIDEBAR_WIDTH: f64 = 280.0;

/// The stage a lone pane draws its picture on.
const STAGE_WIDTH: f64 = SHELL_WIDTH - NAVIGATOR_WIDTH - HANDLE_WIDTH;
/// A lone pane's picture beside its docked sidebar, less the fit margin on either side.
const REFERENCE_WIDTH: f64 = STAGE_WIDTH - SIDEBAR_WIDTH - 2.0 * FIT_MARGIN;
/// The reference pane a drawing's fit is measured against.
const REFERENCE_PANE_WIDTH: f64 = REFERENCE_WIDTH;
const REFERENCE_PANE_HEIGHT: f64 = REFERENCE_WIDTH / LAYOUT_ASPECT;

/// A drawing's fit in the reference pane: the scale that shows it whole,
/// capped at one (`fitIn` of shell-geometry.ts).
pub fn fit_in(width: f64, height: f64) -> f64 {
    let scale = crate::ecma::js_min(REFERENCE_PANE_WIDTH / width, REFERENCE_PANE_HEIGHT / height);
    crate::ecma::js_min(1.0, scale)
}
