//! The measurements a message sequence is laid out with. Participants stand in
//! columns, their dashed lifelines show progression down the sequence, messages
//! cross between them, and activation bars mark where a participant is busy.
//! The card, label, margin and type sizes the painter shares are
//! `archboard_scene::paint::design`'s.

use archboard_scene::paint::styles::{Head, head_reach};

pub use archboard_scene::paint::design::{
    ARCHITECTURE_CARD_PADDING, ARCHITECTURE_NOTE_GAP, DIAGRAM_MARGIN, HEADER_SLAB_INSET,
    ICON_CHIP_GAP, ICON_CHIP_SIZE, NOTE_SIZE, PART_NOTE_LINE, PART_TITLE_LINE, PILL_HEIGHT,
    PILL_PADDING_X, PILL_TEXT_SIZE, TEXT_LINE_HEIGHT, TITLE_SIZE,
};
pub use archboard_scene::paint::shadow::SHADOW_REACH;

use crate::board::MessageKind;

/// How far a container's well holds what it holds in from its walls.
pub const NEST_INSET: f64 = 18.0;
/// The room under a container's last row.
pub const CONTAINER_BOTTOM_PAD: f64 = 14.0;
/// The room inside a sequence card either side of its words.
pub const CARD_PADDING_X: f64 = 13.0;
/// The radius of every bend a line takes.
pub const BEND_RADIUS: f64 = 8.0;

/// A participant card's height, and its height with a responsibility.
pub const CARD_HEIGHT: f64 = 46.0;
pub const CARD_HEIGHT_WITH_NOTE: f64 = 58.0;
/// Below this a participant's title starts a size down, to keep its room.
pub const ICON_MIN_CARD_WIDTH: f64 = 190.0;
pub const TITLE_SIZE_SMALL: f64 = 11.5;
/// How a participant's title that overruns its shared column gives way:
/// half a point at a time, to a floor, before the column widens.
pub const TITLE_SIZE_MIN: f64 = 10.5;
pub const TITLE_SIZE_STEP: f64 = 0.5;
/// What a part keeps clear beside its name for the mark of a board it opens.
pub const DRILL_MARK_ROOM: f64 = 2.0 * 6.5 + 8.0;
/// A flow's header row, with and without its summary.
pub const HEADER_HEIGHT: f64 = PART_TITLE_LINE;
pub const HEADER_HEIGHT_WITH_NOTE: f64 = PART_TITLE_LINE + ARCHITECTURE_NOTE_GAP + PART_NOTE_LINE;

/// Bounds for the uniform participant-column width. The maximum keeps one
/// long name from widening every column; longer names fit their card's text.
pub const COLUMN_MIN_WIDTH: f64 = 112.0;
pub const COLUMN_MAX_WIDTH: f64 = 192.0;

/// Space between participant columns: a visible seam and no more. A message's
/// label sits above its arrow and spans the lifelines it joins, so the gap
/// carries no words; ten participants at the old 78 ran a request across a
/// page four times wider than it was tall.
pub const COLUMN_GAP: f64 = 16.0;

/// The card's full shadow reach, plus air for the selected lifeline's stroke.
pub const LIFELINE_GAP: f64 = SHADOW_REACH + 1.0;
/// How far the first message sits below the lifeline of the tallest card.
pub const FIRST_MESSAGE_DROP: f64 = 36.0;
/// The vertical step from one message to the next, and from one self-message.
pub const MESSAGE_PITCH: f64 = 40.0;
pub const SELF_MESSAGE_PITCH: f64 = 58.0;
/// The run of empty lifeline under the last message, before the frame closes.
pub const FLOW_BOTTOM_PADDING: f64 = 20.0;
/// The air between one flow's frame and the next.
pub const FLOW_GAP: f64 = 32.0;

/// Half the width of an activation bar, and how far it holds arrows off the lifeline.
pub const ACTIVATION_HALF_WIDTH: f64 = 6.0;
/// How far an activation bar runs past the call that starts it and the reply
/// that ends it: past its rounded corner and half an arrowhead (5.5 for a head
/// 11 long), so the arrow meets a straight side.
pub const BAR_OVERHANG: f64 = 9.0;

/// How far right a self-message reaches, and how far it drops before turning back.
pub const SELF_LOOP_REACH: f64 = 52.0;
pub const SELF_LOOP_DROP: f64 = 8.0;
pub const SELF_LOOP_CORNER: f64 = BEND_RADIUS;
/// How far below its own row a self-message loop reaches.
pub const SELF_LOOP_EXTENT: f64 = SELF_LOOP_DROP + SELF_LOOP_CORNER * 2.0;

/// Gap between a message's label and its arrow. Labels sit above horizontal
/// arrows to keep their direction visible. A wide label reaches over the
/// arrowhead, so the gap clears the half of the head that stands above its
/// line (5.5 for a head 11 long) with a little air.
pub const MESSAGE_LABEL_GAP: f64 = 7.0;
/// How far a self-message's label stands off the loop it names.
pub const SELF_LABEL_GAP: f64 = 8.0;
/// The step from one line of a wrapped message label to the next.
pub const MESSAGE_LINE_STEP: f64 = 12.0;
/// How far a message's label keeps from the bars and lifelines either side of it.
pub const LABEL_BAR_CLEARANCE: f64 = 4.0;

/// A step's note: a caveat drawn under the message it qualifies, in the card
/// note's face, on a plate of the frame's own ground so a lifeline it crosses
/// passes behind the words. It wraps to the hop it annotates, never narrower
/// than a readable measure and never wider than a comfortable line, and the
/// message's row grows to hold it, so the next message never lands on it.
pub const STEP_NOTE_GAP: f64 = 4.0;
pub const STEP_NOTE_INSET: f64 = 8.0;
pub const STEP_NOTE_PADDING_X: f64 = 4.0;
pub const STEP_NOTE_PADDING_Y: f64 = 2.0;
pub const STEP_NOTE_MIN_WIDTH: f64 = 180.0;
pub const STEP_NOTE_MAX_WIDTH: f64 = 320.0;

/// A decision's or loop's frame (`frames.rs`): the air between a frame's edge
/// and the rows around it, the row its operator tab and words stand on, the
/// row an alternative's label stands on, the room between its sides and the
/// ink it holds, and the padding of the tab around its operator.
pub const FRAME_GAP: f64 = 6.0;
pub const FRAME_HEAD_HEIGHT: f64 = 18.0;
pub const FRAME_GUARD_HEIGHT: f64 = 16.0;
pub const FRAME_PAD: f64 = 10.0;
pub const FRAME_TAB_PADDING: f64 = 6.0;

/// Most pulses per repeated step, keeping them countable and keeping a high
/// repetition count from delaying the rest of the sequence.
pub const MAX_PULSES_PER_STEP: u32 = 3;

/// The arrowhead each message kind ends in.
///
/// A deliberate deviation from strict UML 2, which draws replies with an open
/// head as well, inherited from PR Lens with its reasoning intact: here the
/// open head is the one mark of "nobody is waiting on this". The dash already
/// says "this is an answer", so an open-headed reply would put the
/// asynchronous signature on every reply.
fn step_head(kind: MessageKind) -> Head {
    match kind {
        MessageKind::Async => Head::Open,
        MessageKind::Sync | MessageKind::Return | MessageKind::Myself => Head::Filled,
    }
}

/// How far short of the bar or lifeline it arrives at a message's line stops:
/// exactly the reach of its head, so the tip touches what it points at. Every
/// message is drawn at one weight: a flow's steps carry no emphasis.
pub fn arrow_standoff(kind: MessageKind) -> f64 {
    head_reach(step_head(kind))
}
