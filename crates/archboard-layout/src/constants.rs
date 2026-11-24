//! The distances the layout keeps, in diagram units, and its target page shape.
//! Shared sizes come from the scene that the layout places.

use archboard_scene::geometry::{Point, bend_radius, route_tolerance};
use archboard_scene::paint::design::card_radius;

/// The radius of every bend a route takes.
pub(crate) const BEND_RADIUS: f64 = bend_radius();
/// How far apart the strands of a cable stand along its body: half a lane, so that a cable reads
/// as one ribbon.
pub(crate) const STRAND: f64 = crate::lanes::chains::LANE / 2.0;
/// How far apart the strands of a cable stand on its first and last runs, where it reaches its
/// cards: a lane, as far as the heads of separate lines on one wall, which holds the widest mark
/// at its one size (a wedge 15 across), so that every strand's head lands on its own port, side by
/// side with the others.
pub(crate) const FAN: f64 = crate::lanes::chains::LANE;
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
/// Required straight run after the final bend, for every arrow: as long as the
/// painter's longest mark needs.
pub(crate) const APPROACH_STRAIGHT: f64 = archboard_scene::paint::design::approach_straight();
/// The least length of an arrow with no bend: the painter's marks at its ends
/// and a little body. With no bend, a head needs no approach.
pub(crate) const STRAIGHT_RUN: f64 = archboard_scene::paint::design::straight_run();

/// How far from its card a cable's strands stand at most a lane apart on an end run (the
/// apron): a head's straight approach and two bends for the jog that steps each outer strand out
/// from its body to its port, as far out again as the fan is wider than the body. Beyond the apron
/// the strands run as one ribbon.
pub(crate) fn apron(half: f64, reach: f64) -> f64 {
    APPROACH_STRAIGHT + 2.0 * BEND_RADIUS + reach - half
}

/// How far from the card a strand steps out, given its distance from the middle of the body.
pub(crate) fn fan_jog_depth(offset: f64) -> f64 {
    APPROACH_STRAIGHT + 2.0 * BEND_RADIUS + (offset - STRAND / 2.0).max(0.0)
}

/// Which end runs spread at their bend. An end can jog only if its shortest strand has room for
/// the outermost jog and the corner. With one bend the two end runs shorten one another.
pub(crate) fn fans_at_bend(points: &[Point], (half, reach): (f64, f64)) -> [bool; 2] {
    if points.len() <= 2 || half == 0.0 {
        return [true; 2];
    }
    let run_length = |a: Point, b: Point| (b.x - a.x).abs() + (b.y - a.y).abs();
    let last = points.len() - 1;
    let first = run_length(points[0], points[1]);
    let end = run_length(points[last - 1], points[last]);
    let jog = fan_jog_depth(half) + 3.0 * BEND_RADIUS;
    let first_spreads = first < jog + half;
    let last_spreads = end < jog + half;
    [
        first_spreads || (last == 2 && last_spreads && first < jog + reach),
        last_spreads || (last == 2 && first_spreads && end < jog + reach),
    ]
}

/// The room between a wall and a turn, including the cable's innermost strand and its marks.
pub(crate) fn approach_of(half: f64) -> f64 {
    APPROACH_STRAIGHT + BEND_RADIUS + half
}

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
