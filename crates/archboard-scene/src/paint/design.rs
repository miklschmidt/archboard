//! The sizes, faces and icons the painter draws with. The core's sequence and
//! flowchart layout (`archboard-flows`) and its board layout
//! (`archboard-layout`) read them from here.

use crate::drawing::{DiagramFont, FontFamily};

pub use super::icons::{FALLBACK_ICON, FLOW_ICON, OWN_ICONS};
pub use super::sequence_messages::arrow_standoff;
pub use super::shadow::SHADOW_REACH;

/// A card's name, and a container's or a flow's on its header slab.
pub const CARD_TITLE_FONT: DiagramFont = DiagramFont {
    family: FontFamily::Sans,
    weight: 500,
};
/// What a card, a container or a flow is responsible for.
pub const CARD_NOTE_FONT: DiagramFont = DiagramFont {
    family: FontFamily::Sans,
    weight: 400,
};
/// What a connection carries: small, technical, and on a plate.
pub const PILL_FONT: DiagramFont = DiagramFont {
    family: FontFamily::Sans,
    weight: 500,
};

/// The corner radius of a container's tray and of a flow's frame.
pub(crate) const BAND_RADIUS: f64 = 10.0;
/// The size of a measured part's name: a card's, and a container's or a flow's on its header slab.
pub(crate) const PART_TITLE_SIZE: f64 = 14.0;
/// The room one line of such a name takes.
pub const PART_TITLE_LINE: f64 = 20.0;
/// The size of a measured part's responsibility, set on the same card or header slab.
pub(crate) const PART_NOTE_SIZE: f64 = 11.0;
/// The room one line of such a responsibility takes.
pub const PART_NOTE_LINE: f64 = 17.0;
/// The height of a line of a sequence note, as a multiple of its text size.
pub const TEXT_LINE_HEIGHT: f64 = 1.35;
/// How strong a line is on each ground.
pub(crate) const LINE_STRENGTH_LIGHT: f64 = 1.0;
/// The same share on the dark ground: four fifths, which keeps every colour's line above the floor for a mark (APCA Lc 30).
pub(crate) const LINE_STRENGTH_DARK: f64 = 0.8;
/// How round a card's corner is to the layout, which keeps a line's port clear of it.
pub const CARD_RADIUS: f64 = 6.0;
/// The corner radius of a slab: a card's face and a header slab.
pub(crate) const SLAB_RADIUS: f64 = 8.0;
/// How tall a card's front edge shows.
pub(crate) const CARD_THICKNESS: f64 = 4.0;
/// How thick a container's tray shows its walls, the top wall and the two side walls alike.
pub(crate) const TRAY_WALL: f64 = 6.0;
/// How far the lit lip of a tray shows below its walls.
pub(crate) const TRAY_LIP: f64 = 2.0;
/// The thin shadow line under a tray's lip, at its foot.
pub(crate) const TRAY_CREASE: f64 = 1.0;
/// The floor a tray shows round its header slab, above it and at its sides.
pub(crate) const WELL_GAP: f64 = 2.0;
/// How far a header slab stands in from the outer edge of its tray, on the top and on either side.
pub const HEADER_SLAB_INSET: f64 = TRAY_WALL + WELL_GAP;
/// How tall a type chip's front edge shows.
pub(crate) const CHIP_THICKNESS: f64 = 1.5;
/// How tall a label plate's front edge shows.
pub(crate) const PILL_THICKNESS: f64 = 2.0;
/// The side of a type chip's square.
pub const ICON_CHIP_SIZE: f64 = 24.0;
/// The room between a sequence card's chip and its words.
pub const ICON_CHIP_GAP: f64 = 10.0;
/// The corner radius of a type chip.
pub(crate) const ICON_CHIP_RADIUS: f64 = 5.0;
/// The size of a sequence card's name before it is fitted to the room it has.
pub const TITLE_SIZE: f64 = 13.0;
/// The size of a note: a sequence card's responsibility and a step's note.
pub const NOTE_SIZE: f64 = 9.5;
/// How tall a message label's plate is for one line of words.
pub const PILL_HEIGHT: f64 = 15.0;
/// The room between a message label's plate and its words, on the left and the right.
pub const PILL_PADDING_X: f64 = 8.0;
/// The size of the words on a label plate.
pub const PILL_TEXT_SIZE: f64 = 9.0;
/// The corner radius of a label plate.
pub(crate) const PILL_RADIUS: f64 = 4.0;

/// The size of words inside a flowchart shape.
pub const SHAPE_TEXT_SIZE: f64 = 11.0;
/// The height of one line inside a flowchart shape.
pub const SHAPE_TEXT_LINE: f64 = 14.0;

/// The space around the final drawing.
pub const DIAGRAM_MARGIN: f64 = 20.0;
/// The extra space a planned board's page adds around the drawing to hold its frame.
pub(crate) const PLANNED_FRAME_MARGIN: f64 = 16.0;
/// The distance from the page edge to a planned board's dashed frame.
pub(crate) const PLANNED_FRAME_INSET: f64 = 8.0;
/// The space below a group region's caption tab and at its sides and bottom.
pub const REGION_INSET: f64 = 14.0;
/// The room between an architecture card's edge and its chip and words.
pub const ARCHITECTURE_CARD_PADDING: f64 = 16.0;
/// The room between an architecture card's chip and its words.
pub(crate) const ARCHITECTURE_ICON_GAP: f64 = 12.0;
/// The room between a part's name and its responsibility under it.
pub const ARCHITECTURE_NOTE_GAP: f64 = 2.0;
/// How far a container's words stand in from the sides of its box: on its header slab, as a card's stand on its own.
pub const ARCHITECTURE_HEADER_PADDING: f64 = HEADER_SLAB_INSET + ARCHITECTURE_CARD_PADDING;
/// The room inside a relationship's label plate, on the left and the right of its words.
pub(crate) const ARCHITECTURE_LABEL_PADDING_X: f64 = 10.0;
/// The room inside a relationship's label plate, above and below its words.
pub(crate) const ARCHITECTURE_LABEL_PADDING_Y: f64 = 8.0;

/// The room inside a sequence card either side of its words.
pub const CARD_PADDING_X: f64 = 13.0;
/// The room a drill-down mark takes beside a card's words.
pub use super::drill_mark::DRILL_MARK_ROOM;
/// Half the width of a sequence's activation bar, and how far it holds arrows
/// off the lifeline.
pub const ACTIVATION_HALF_WIDTH: f64 = 6.0;
/// How far right a self-message reaches, how far it drops before turning
/// back, and the radius of its two bends.
pub const SELF_LOOP_REACH: f64 = 52.0;
/// How far a self-message drops before it turns back.
pub const SELF_LOOP_DROP: f64 = 8.0;
/// The radius of the two bends of a self-message.
pub const SELF_LOOP_CORNER: f64 = 8.0;
/// The step from one line of a wrapped message label to the next.
pub const MESSAGE_LINE_STEP: f64 = 12.0;
/// How far a step's note holds its words in from its plate's edges.
pub const STEP_NOTE_PADDING_X: f64 = 4.0;
/// How far a step's note holds its words in from the top of its plate.
pub const STEP_NOTE_PADDING_Y: f64 = 2.0;
/// A decision's or loop's frame: the row its operator tab and words stand
/// on, the row an alternative's label stands on, the room between its sides
/// and the ink it holds, and the padding of the tab around its operator.
pub const FRAME_HEAD_HEIGHT: f64 = 18.0;
/// The height of the row an alternative's label stands on.
pub const FRAME_GUARD_HEIGHT: f64 = 16.0;
/// The room between a frame's sides and the ink it holds.
pub const FRAME_PAD: f64 = 10.0;
/// The padding of a frame's tab around its operator.
pub const FRAME_TAB_PADDING: f64 = 6.0;
