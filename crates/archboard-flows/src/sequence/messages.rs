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

/// How one message is drawn, as the painter and the frames around it read it.
#[derive(Clone, Copy, Debug)]
pub(super) struct Drawn {
    /// Which way it crosses the page: 1 right, -1 left, 0 a message that
    /// never leaves its sender.
    pub travel: i8,
    /// Where its line begins.
    pub start: f64,
    /// Where its arrowhead lands; a message to itself ends at its loop's start.
    pub end: f64,
    /// Its label's plate.
    pub label: Rect,
    /// The row it owns: what it draws, grown to the pitch the layout gave it.
    /// An arrow is a line and a loop is barely taller, so the tight bounds of
    /// either make a poor thing to put a rim round or to scroll to. The row is
    /// the space the layout set aside for this message and no other, and its
    /// words come with it: a message lit without its words cannot be named.
    pub bounds: Rect,
}

/// Which way a message crosses the page.
fn travel_of(kind: MessageKind, from_x: f64, to_x: f64) -> i8 {
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
fn ends_for(placed: &PlacedStep<'_>, active: &ActiveAt<'_>, direction: i8) -> (f64, f64) {
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
    (
        placed.from_x + direction * leaving,
        placed.to_x - direction * (arriving + arrow_standoff(placed.step.kind)),
    )
}

/// How big a message's label plate is: as wide as its widest line, and one
/// pill tall with a line's step more for every line past the first.
fn pill_size(placed: &PlacedStep<'_>) -> (f64, f64) {
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

/// A self-message: its loop leaves its lifeline, or its bar's edge, and comes
/// back to it. Its label stands above the loop's outgoing run, a little past
/// the lifeline. Above rather than beside: columns are narrow and stand a
/// seam apart, so a plate beside the loop would lie across the next column.
/// Its ink is the loop with its label.
fn self_drawn(placed: &PlacedStep<'_>, active: &ActiveAt<'_>) -> (f64, f64, Rect, Rect) {
    let start = placed.from_x
        + if active.at(&placed.step.from, placed.y) {
            ACTIVATION_HALF_WIDTH
        } else {
            0.0
        };
    let (width, height) = pill_size(placed);
    let label = Rect {
        x: start + SELF_LABEL_GAP,
        y: placed.y - MESSAGE_LABEL_GAP - height,
        width,
        height,
    };
    let loop_box = Rect {
        x: start,
        y: placed.y,
        width: SELF_LOOP_REACH + SELF_LOOP_CORNER,
        height: SELF_LOOP_EXTENT,
    };
    (start, start, label, covering(loop_box, label))
}

/// A crossing message: its arrow between the ends `ends_for` gives, its label
/// centred on the gap between lifelines its layout chose, just above the
/// arrow. Its ink is the arrow with its label.
fn straight_drawn(
    placed: &PlacedStep<'_>,
    active: &ActiveAt<'_>,
    travel: i8,
) -> (f64, f64, Rect, Rect) {
    let (start, end) = ends_for(placed, active, travel);
    let (width, height) = pill_size(placed);
    let centre = placed
        .words
        .centre
        .unwrap_or_else(|| f64::midpoint(start, end));
    let label = Rect {
        x: centre - width / 2.0,
        y: placed.y - MESSAGE_LABEL_GAP - height,
        width,
        height,
    };
    let arrow = Rect {
        x: js::js_min(start, end),
        y: placed.y,
        width: (end - start).abs(),
        height: 0.0,
    };
    (start, end, label, covering(arrow, label))
}

/// How one message is drawn, whichever sort of message it is.
pub(super) fn drawn(placed: &PlacedStep<'_>, active: &ActiveAt<'_>) -> Drawn {
    let travel = travel_of(placed.step.kind, placed.from_x, placed.to_x);
    let (start, end, label, ink) = if travel == 0 {
        self_drawn(placed, active)
    } else {
        straight_drawn(placed, active, travel)
    };
    let pitch = pitch_of(placed.step.kind);
    let row = Rect {
        x: ink.x,
        y: ink.y + ink.height / 2.0 - pitch / 2.0,
        width: ink.width,
        height: pitch,
    };
    // A note is the message's own words too, and its row grew to hold it.
    let bounds = match &placed.note {
        None => row,
        Some(note) => covering(row, note.bounds),
    };
    Drawn {
        travel,
        start,
        end,
        label,
        bounds,
    }
}

/// Where a flow's frame stands across the page: round its columns, and round
/// every message's ink as well, with the inset the columns keep. A frame that
/// grows left moves the page, not the columns. In whole units once it grows.
pub(super) fn frame_span(
    steps: &[PlacedStep<'_>],
    active: &ActiveAt<'_>,
    x: f64,
    width: f64,
) -> (f64, f64) {
    let mut left = x;
    let mut right = x + width;
    for placed in steps {
        let ink = drawn(placed, active).bounds;
        left = js::js_min(left, (ink.x - NEST_INSET).floor());
        right = js::js_max(right, (ink.x + ink.width + NEST_INSET).ceil());
    }
    (left, right - left)
}
