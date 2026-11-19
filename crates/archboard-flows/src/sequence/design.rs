//! The measurements a message sequence is laid out with. Participants stand in
//! columns, their dashed lifelines show progression down the sequence, messages
//! cross between them, and activation bars mark where a participant is busy.
//! The card, label, margin and type sizes the painter shares are
//! `archboard_scene::paint::design`'s.

use archboard_scene::drawing::DiagramFont;
use archboard_scene::paint::design;

pub(super) const PILL_FONT: DiagramFont = design::pill_font();
pub(super) const ARCHITECTURE_CARD_PADDING: f64 = design::architecture_card_padding();
pub(super) const DIAGRAM_MARGIN: f64 = design::diagram_margin();
pub(super) const FLOW_HEADING: f64 = design::flow_heading();
pub(super) const FLOW_HEADING_WITH_NOTE: f64 = design::flow_heading_with_note();
pub(super) const FRAME_GUARD_HEIGHT: f64 = design::frame_guard_height();
pub(super) const FRAME_HEAD_HEIGHT: f64 = design::frame_head_height();
pub(super) const FRAME_PAD: f64 = design::frame_pad();
pub(super) const FRAME_TAB_PADDING: f64 = design::frame_tab_padding();
pub(super) const NOTE_SIZE: f64 = design::note_size();
pub(super) const PILL_TEXT_SIZE: f64 = design::pill_text_size();
pub(super) const STEP_NOTE_PADDING_X: f64 = design::step_note_padding_x();
pub(super) const STEP_NOTE_PADDING_Y: f64 = design::step_note_padding_y();
pub(super) const TAB_PADDING: f64 = design::tab_padding();

/// The height of a line of a sequence note, as a multiple of its text size.
pub(super) const TEXT_LINE_HEIGHT: f64 = 1.35;

/// How far a container's well holds what it holds in from its walls.
pub(super) const NEST_INSET: f64 = 18.0;
/// The room under a container's last row.
pub(super) const CONTAINER_BOTTOM_PAD: f64 = 14.0;

/// Bounds for the uniform participant-column width. The maximum keeps one
/// long name from widening every column; longer names fit their card's text.
pub(super) const COLUMN_MIN_WIDTH: f64 = 112.0;
pub(super) const COLUMN_MAX_WIDTH: f64 = 192.0;

/// Space between participant columns: a visible seam and no more. A message's
/// label sits above its arrow and spans the lifelines it joins, so the gap
/// carries no words; ten participants at the old 78 ran a request across a
/// page four times wider than it was tall.
pub(super) const COLUMN_GAP: f64 = 16.0;

/// How far the first message sits below the lifeline of the tallest card.
pub(super) const FIRST_MESSAGE_DROP: f64 = 36.0;
/// The vertical step from one message to the next, and from one self-message.
pub(super) const MESSAGE_PITCH: f64 = 40.0;
pub(super) const SELF_MESSAGE_PITCH: f64 = 58.0;
/// The run of empty lifeline under the last message, before the frame closes.
pub(super) const FLOW_BOTTOM_PADDING: f64 = 20.0;
/// The air between one flow's frame and the next.
pub(super) const FLOW_GAP: f64 = 32.0;

/// How far an activation bar runs past the call that starts it and the reply
/// that ends it: past its rounded corner and half an arrowhead (5.5 for a head
/// 11 long), so the arrow meets a straight side.
pub(super) const BAR_OVERHANG: f64 = 9.0;

/// Gap between a message's label and its arrow. Labels sit above horizontal
/// arrows to keep their direction visible. A wide label reaches over the
/// arrowhead, so the gap clears the half of the head that stands above its
/// line (5.5 for a head 11 long) with a little air.
pub(super) const MESSAGE_LABEL_GAP: f64 = 7.0;
/// How far a self-message's label stands off the loop it names.
pub(super) const SELF_LABEL_GAP: f64 = 8.0;
/// How far a message's label keeps from the bars and lifelines either side of it.
pub(super) const LABEL_BAR_CLEARANCE: f64 = 4.0;

/// A step's note: a caveat drawn under the message it qualifies, in the card
/// note's face, on a plate of the frame's own ground so a lifeline it crosses
/// passes behind the words. It wraps to the hop it annotates, never narrower
/// than a readable measure and never wider than a comfortable line, and the
/// message's row grows to hold it, so the next message never lands on it.
pub(super) const STEP_NOTE_GAP: f64 = 4.0;
pub(super) const STEP_NOTE_INSET: f64 = 8.0;
pub(super) const STEP_NOTE_MIN_WIDTH: f64 = 180.0;
pub(super) const STEP_NOTE_MAX_WIDTH: f64 = 320.0;

/// The air between a decision's or loop's frame (`frames.rs`) and the rows
/// around it.
pub(super) const FRAME_GAP: f64 = 6.0;

/// Most pulses per repeated step, keeping them countable and keeping a high
/// repetition count from delaying the rest of the sequence.
pub(super) const MAX_PULSES_PER_STEP: u32 = 3;
