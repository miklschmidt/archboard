//! The sizes, faces and icons of the painter that the core's sequence and
//! flowchart layout (`archboard-flows`), its picture layout
//! (`archboard-layout`) and the frontends that paint a scene read: each a
//! function, so the sheet itself stays the crate's own.

use crate::sizes::{
    ARCHITECTURE_HEADER_PADDING, CARD_RADIUS, DIAGRAM_MARGIN, FAR_SCALE, FLOW_KIND,
    HERO_LINE_WIDTH, LINE_WIDTH, RAIL_GAP, RAILS, TAB_SHOULDER,
};

/// The line widths a far view draws wider: a line of normal weight, of hero
/// weight, and a double line's rails.
const FAR_WIDENED: [f64; 3] = [LINE_WIDTH, HERO_LINE_WIDTH, RAILS];

/// The space around the final drawing.
pub const fn diagram_margin() -> f64 {
    DIAGRAM_MARGIN
}

/// The length of a drawing with a diagram margin at both ends.
pub fn with_diagram_margins(length: f64) -> f64 {
    length + 2.0 * DIAGRAM_MARGIN
}

/// How round a card's corner is to the layout, which keeps a line's port clear of it.
pub const fn card_radius() -> f64 {
    CARD_RADIUS
}

/// The width of a frame's edge tab on a frame of some width: the tab stops
/// short of the frame's right edge by its foot and the frame's corner.
pub fn tab_width(frame_width: f64) -> f64 {
    frame_width - TAB_SHOULDER
}

/// The room a container's words have in a header of some width: its words
/// stand in from both sides of its box.
pub fn header_words_width(header_width: f64) -> f64 {
    header_width - ARCHITECTURE_HEADER_PADDING
}

/// The narrowest a container's header is that holds words of some width.
pub fn header_width_for(words_width: f64) -> f64 {
    words_width + ARCHITECTURE_HEADER_PADDING
}

/// The kind of a flowchart's frame, which holds a flow.
pub const fn flow_kind() -> &'static str {
    FLOW_KIND
}

/// Whether a node's kind is that of a flowchart's frame.
pub fn is_flow_kind(kind: &str) -> bool {
    kind == FLOW_KIND
}

/// The gap a double line's rails leave down its middle.
pub const fn rail_gap() -> f64 {
    RAIL_GAP
}

/// Whether a far view draws a line of this stroke width wider.
pub fn widens_far(width: f64) -> bool {
    FAR_WIDENED.contains(&width)
}

/// How much wider a far view draws a line it widens, `far` of the way from
/// the near view (0) to the far view (1).
pub fn far_line_scale(far: f64) -> f64 {
    1.0 + (FAR_SCALE - 1.0) * far
}

/// Each line width a far view widens, with the width it draws it at there.
pub fn far_line_widths() -> [(f64, f64); 3] {
    FAR_WIDENED.map(|width| (width, width * FAR_SCALE))
}

/// The icon a part without a known icon is drawn with.
pub const fn fallback_icon() -> &'static str {
    super::icons::FALLBACK_ICON
}

/// The icon of a flow's frame.
pub const fn flow_icon() -> &'static str {
    super::icons::FLOW_ICON
}

/// Every icon a picture can draw, whatever its policy says.
pub const fn own_icons() -> [&'static str; 2] {
    super::icons::OWN_ICONS
}
