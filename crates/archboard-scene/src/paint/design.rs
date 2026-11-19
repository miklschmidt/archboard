//! The sizes, faces and icons of the painter that the core's sequence and
//! flowchart layout (`archboard-flows`), its picture layout
//! (`archboard-layout`) and the frontends that paint a scene read: each a
//! function, so the sheet itself stays the crate's own.

use crate::drawing::DiagramFont;
use crate::sizes::{
    ACTIVATION_HALF_WIDTH, ARCHITECTURE_CARD_PADDING, ARCHITECTURE_HEADER_PADDING, CARD_NOTE_FONT,
    CARD_PADDING_X, CARD_RADIUS, CARD_TITLE_FONT, DIAGRAM_MARGIN, DRILL_MARK_ROOM, FAR_SCALE,
    FLOW_HEADING, FLOW_HEADING_WITH_NOTE, FLOW_KIND, FRAME_GUARD_HEIGHT, FRAME_HEAD_HEIGHT,
    FRAME_PAD, FRAME_TAB_PADDING, HERO_LINE_WIDTH, ICON_CHIP_GAP, ICON_CHIP_SIZE, LINE_WIDTH,
    MESSAGE_LINE_STEP, NOTE_SIZE, PILL_FONT, PILL_HEIGHT, PILL_TEXT_SIZE, RAIL_GAP, RAILS,
    SELF_LOOP_CORNER, SELF_LOOP_DROP, SELF_LOOP_REACH, SHAPE_TEXT_LINE, SHAPE_TEXT_SIZE,
    STEP_NOTE_PADDING_X, STEP_NOTE_PADDING_Y, TAB_PADDING, TAB_SHOULDER, TITLE_SIZE,
};

pub use super::sequence_messages::arrow_standoff;

/// The line widths a far view draws wider: a line of normal weight, of hero
/// weight, and a double line's rails.
const FAR_WIDENED: [f64; 3] = [LINE_WIDTH, HERO_LINE_WIDTH, RAILS];

/// A card's name, and a container's or a flow's on its tab.
pub const fn card_title_font() -> DiagramFont {
    CARD_TITLE_FONT
}

/// What a card, a container or a flow is responsible for.
pub const fn card_note_font() -> DiagramFont {
    CARD_NOTE_FONT
}

/// What a connection carries: small, technical, and on a plate.
pub const fn pill_font() -> DiagramFont {
    PILL_FONT
}

/// The space around the final drawing.
pub const fn diagram_margin() -> f64 {
    DIAGRAM_MARGIN
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

/// The room inside a frame's edge tab, on either side of its words.
pub const fn tab_padding() -> f64 {
    TAB_PADDING
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

/// The room between an architecture card's edge and its chip and words.
pub const fn architecture_card_padding() -> f64 {
    ARCHITECTURE_CARD_PADDING
}

/// How tall a flow's heading stands in its tab.
pub const fn flow_heading() -> f64 {
    FLOW_HEADING
}

/// How tall a flow's heading stands in its tab with its summary.
pub const fn flow_heading_with_note() -> f64 {
    FLOW_HEADING_WITH_NOTE
}

/// The kind of a flowchart's frame, which holds a flow.
pub const fn flow_kind() -> &'static str {
    FLOW_KIND
}

/// Whether a node's kind is that of a flowchart's frame.
pub fn is_flow_kind(kind: &str) -> bool {
    kind == FLOW_KIND
}

/// The side of a type chip's square.
pub const fn icon_chip_size() -> f64 {
    ICON_CHIP_SIZE
}

/// The room between a sequence card's chip and its words.
pub const fn icon_chip_gap() -> f64 {
    ICON_CHIP_GAP
}

/// The room inside a sequence card either side of its words.
pub const fn card_padding_x() -> f64 {
    CARD_PADDING_X
}

/// What a part keeps clear beside its name for a drill-down mark.
pub const fn drill_mark_room() -> f64 {
    DRILL_MARK_ROOM
}

/// The size of a sequence card's name before it is fitted to the room it has.
pub const fn title_size() -> f64 {
    TITLE_SIZE
}

/// The size of a note: a sequence card's responsibility and a step's note.
pub const fn note_size() -> f64 {
    NOTE_SIZE
}

/// How tall a message label's plate is for one line of words.
pub const fn pill_height() -> f64 {
    PILL_HEIGHT
}

/// The size of the words on a label plate.
pub const fn pill_text_size() -> f64 {
    PILL_TEXT_SIZE
}

/// The size of words in a flowchart's diamonds, loops and terminals.
pub const fn shape_text_size() -> f64 {
    SHAPE_TEXT_SIZE
}

/// The room one line of a flowchart shape's words takes.
pub const fn shape_text_line() -> f64 {
    SHAPE_TEXT_LINE
}

/// Half the width of a sequence's activation bar, and how far it holds arrows
/// off the lifeline.
pub const fn activation_half_width() -> f64 {
    ACTIVATION_HALF_WIDTH
}

/// How far right a self-message reaches.
pub const fn self_loop_reach() -> f64 {
    SELF_LOOP_REACH
}

/// How far a self-message drops before it turns back.
pub const fn self_loop_drop() -> f64 {
    SELF_LOOP_DROP
}

/// The radius of the two bends of a self-message.
pub const fn self_loop_corner() -> f64 {
    SELF_LOOP_CORNER
}

/// The step from one line of a wrapped message label to the next.
pub const fn message_line_step() -> f64 {
    MESSAGE_LINE_STEP
}

/// How far a step's note holds its words in from its plate's sides.
pub const fn step_note_padding_x() -> f64 {
    STEP_NOTE_PADDING_X
}

/// How far a step's note holds its words in from the top of its plate.
pub const fn step_note_padding_y() -> f64 {
    STEP_NOTE_PADDING_Y
}

/// The row a decision's or loop's operator tab and words stand on.
pub const fn frame_head_height() -> f64 {
    FRAME_HEAD_HEIGHT
}

/// The height of the row an alternative's label stands on.
pub const fn frame_guard_height() -> f64 {
    FRAME_GUARD_HEIGHT
}

/// The room between a decision's or loop's sides and the ink it holds.
pub const fn frame_pad() -> f64 {
    FRAME_PAD
}

/// The padding of a decision's or loop's tab around its operator.
pub const fn frame_tab_padding() -> f64 {
    FRAME_TAB_PADDING
}

/// How far a card's shadow reaches past its face.
pub const fn shadow_reach() -> f64 {
    super::shadow::SHADOW_REACH
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
