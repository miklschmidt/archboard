//! Where one message's arrow starts and stops, where its words go, and how
//! much of the page the whole thing claims.
//!
//! Forked from the geometry half of PR Lens's `svg/dataflow.ts`, kept out of
//! the painter: the same numbers decide what is drawn and what the atlas
//! reports, and two copies of them would one day disagree about where a
//! message is. A message's label sits above its arrow rather than astride it
//! (`MESSAGE_LABEL_GAP`), so the line a reader follows runs unbroken from the
//! sender to the arrowhead.

use archboard_scene::geometry::{Rect, covering};
use archboard_scene::js;

use crate::board::MessageKind;
use crate::sequence::design::{
    ACTIVATION_HALF_WIDTH, MESSAGE_LABEL_GAP, MESSAGE_LINE_STEP, NEST_INSET, PILL_HEIGHT,
    PILL_PADDING_X, SELF_LABEL_GAP, SELF_LOOP_CORNER, SELF_LOOP_EXTENT, SELF_LOOP_REACH,
    arrow_standoff,
};
use crate::sequence::layout::{ActiveAt, PlacedStep};
use crate::sequence::rows::pitch_of;

/// Where one message's arrow begins and where its arrowhead lands.
#[derive(Clone, Copy, Debug)]
pub struct Ends {
    pub start: f64,
    pub end: f64,
}

/// Which way a message crosses the page: 1 right, -1 left, 0 a message that
/// never leaves its sender.
pub fn travel_of(kind: MessageKind, from_x: f64, to_x: f64) -> i8 {
    if kind == MessageKind::Myself {
        0
    } else if to_x >= from_x {
        1
    } else {
        -1
    }
}

/// Where a crossing message's arrow starts and stops. A busy column is a bar
/// rather than a line, so an arrow touching one stops at the bar's edge, short
/// of it by what the arrowhead's tip reaches past the line's end.
pub fn ends_for(placed: &PlacedStep, active: &ActiveAt, direction: i8) -> Ends {
    let direction = f64::from(direction);
    let leaving = if active.at(&placed.step.from, placed.y) {
        ACTIVATION_HALF_WIDTH
    } else {
        0.0
    };
    let arriving = if active.at(&placed.step.to, placed.y) {
        ACTIVATION_HALF_WIDTH
    } else {
        0.0
    };
    Ends {
        start: placed.from_x + direction * leaving,
        end: placed.to_x - direction * (arriving + arrow_standoff(placed.step.kind)),
    }
}

/// Where a self-message's loop leaves its lifeline.
pub fn self_start(placed: &PlacedStep, activated: bool) -> f64 {
    placed.from_x
        + if activated {
            ACTIVATION_HALF_WIDTH
        } else {
            0.0
        }
}

/// How big a message's label plate is: as wide as its widest line, and one
/// pill tall with a line's step more for every line past the first.
fn pill_size(placed: &PlacedStep) -> (f64, f64) {
    let widest = placed
        .words
        .lines
        .iter()
        .fold(0.0, |widest, line| js::js_max(widest, line.width));
    (
        widest + PILL_PADDING_X * 2.0,
        PILL_HEIGHT + (placed.words.lines.len() as f64 - 1.0) * MESSAGE_LINE_STEP,
    )
}

/// A crossing message's label: centred on the gap between lifelines its
/// layout chose, just above the arrow.
fn pill_box(placed: &PlacedStep, ends: Ends) -> Rect {
    let (width, height) = pill_size(placed);
    let centre = placed.words.centre.unwrap_or((ends.start + ends.end) / 2.0);
    Rect {
        x: centre - width / 2.0,
        y: placed.y - MESSAGE_LABEL_GAP - height,
        width,
        height,
    }
}

/// A self-message's label: above the loop's outgoing run, a little past the
/// lifeline. Above rather than beside: columns are narrow and stand a seam
/// apart, so a plate beside the loop would lie across the next column.
fn self_pill_box(placed: &PlacedStep, activated: bool) -> Rect {
    let (width, height) = pill_size(placed);
    Rect {
        x: self_start(placed, activated) + SELF_LABEL_GAP,
        y: placed.y - MESSAGE_LABEL_GAP - height,
        width,
        height,
    }
}

/// Where one message's label goes, whichever sort of message it is.
pub fn label_box(placed: &PlacedStep, active: &ActiveAt) -> Rect {
    let direction = travel_of(placed.step.kind, placed.from_x, placed.to_x);
    if direction == 0 {
        return self_pill_box(placed, active.at(&placed.step.from, placed.y));
    }
    pill_box(placed, ends_for(placed, active, direction))
}

/// The ink a self-message's loop puts on the page, label included.
fn self_drawn(placed: &PlacedStep, activated: bool) -> Rect {
    covering(
        Rect {
            x: self_start(placed, activated),
            y: placed.y,
            width: SELF_LOOP_REACH + SELF_LOOP_CORNER,
            height: SELF_LOOP_EXTENT,
        },
        self_pill_box(placed, activated),
    )
}

/// The ink a crossing message puts on the page, label included.
fn straight_drawn(placed: &PlacedStep, ends: Ends) -> Rect {
    covering(
        Rect {
            x: js::js_min(ends.start, ends.end),
            y: placed.y,
            width: (ends.end - ends.start).abs(),
            height: 0.0,
        },
        pill_box(placed, ends),
    )
}

/// The row one message owns: what it draws, grown to the pitch the layout
/// gave it. An arrow is a line and a loop is barely taller, so the tight
/// bounds of either make a poor thing to put a rim round or to scroll to. The
/// row is the space the layout set aside for this message and no other, and
/// its words come with it: a message lit without its words cannot be named.
pub fn step_box(placed: &PlacedStep, active: &ActiveAt) -> Rect {
    let direction = travel_of(placed.step.kind, placed.from_x, placed.to_x);
    let drawn = if direction == 0 {
        self_drawn(placed, active.at(&placed.step.from, placed.y))
    } else {
        straight_drawn(placed, ends_for(placed, active, direction))
    };
    let pitch = pitch_of(placed.step.kind);
    let row = Rect {
        x: drawn.x,
        y: drawn.y + drawn.height / 2.0 - pitch / 2.0,
        width: drawn.width,
        height: pitch,
    };
    // A note is the message's own words too, and its row grew to hold it.
    match &placed.note {
        None => row,
        Some(note) => covering(row, note.bounds),
    }
}

/// Where a flow's frame stands across the page: round its columns, and round
/// every message's ink as well, with the inset the columns keep. A frame that
/// grows left moves the page, not the columns. In whole units once it grows.
pub fn frame_span(steps: &[PlacedStep], active: &ActiveAt, x: f64, width: f64) -> (f64, f64) {
    let mut left = x;
    let mut right = x + width;
    for placed in steps {
        let ink = step_box(placed, active);
        left = js::js_min(left, (ink.x - NEST_INSET).floor());
        right = js::js_max(right, (ink.x + ink.width + NEST_INSET).ceil());
    }
    (left, right - left)
}
