//! The sizes, faces and icons of the painter that the core's sequence and
//! flowchart layout (`archboard-flows`), its picture layout
//! (`archboard-layout`) and the frontends that paint a scene read: each a
//! function, so the sheet itself stays the crate's own.

use crate::sizes::{
    ARCHITECTURE_HEADER_PADDING, CARD_RADIUS, DIAGRAM_MARGIN, FLOW_KIND, TAB_SHOULDER,
};

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
