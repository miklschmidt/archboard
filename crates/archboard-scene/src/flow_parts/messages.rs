//! A message's parts: its label's plate, where its arrow starts and stops, the
//! bar a busy column stands as, and a message to itself's loop.

use crate::drawing::TextRun;
use crate::geometry::{Point, Rect};
use crate::js;
use crate::measure::{message_lines, note_lines};
use crate::request::{MessageKind, WordLine};
use crate::sizes::{
    ACTIVATION_HALF_WIDTH, MESSAGE_LINE_STEP, NOTE_SIZE, PILL_HEIGHT, PILL_TEXT_SIZE,
    SELF_LOOP_CORNER, SELF_LOOP_DROP, SELF_LOOP_REACH, STEP_NOTE_PADDING_X, STEP_NOTE_PADDING_Y,
    TEXT_LINE_HEIGHT, arrow_standoff,
};

use super::Span;

/// The room between a label's plate and its words, on the left and the right.
const PILL_PADDING_X: f64 = 8.0;
/// `Number.MAX_SAFE_INTEGER`: the width of a line nothing stands beside.
const UNBOUNDED: f64 = 9_007_199_254_740_991.0;

/// A message's words on their plate.
#[derive(Clone, Debug)]
pub struct MessagePlate {
    /// Every line, whole, with its painted width.
    pub lines: Vec<WordLine>,
    /// How wide the plate is.
    pub width: f64,
    /// How tall the plate is.
    pub height: f64,
    /// How much taller the plate stands than a plate of one line.
    pub taller_by: f64,
}

/// A step's note on its plate.
#[derive(Clone, Debug)]
pub struct NotePlate {
    /// Every line, whole, its baseline measured from the plate's inner top.
    pub lines: Vec<TextRun>,
    /// How wide the plate is.
    pub width: f64,
    /// How tall the plate is.
    pub height: f64,
}

/// Where a message's arrow runs.
#[derive(Clone, Copy, Debug)]
pub struct ArrowEnds {
    /// Which way it crosses the page: 1 right, -1 left, 0 a message that
    /// never leaves its sender.
    pub travel: i8,
    /// Where its line begins.
    pub start: f64,
    /// Where its line ends, its head's tip touching what it points at; a
    /// message to itself ends where it starts.
    pub end: f64,
}

/// A message's words wrapped, balanced, to the room its plate has, which may be
/// unbounded, on a plate as wide as its widest line.
pub fn message_plate(label: &str, room: f64) -> MessagePlate {
    let limit = if room.is_finite() {
        room - PILL_PADDING_X * 2.0
    } else {
        UNBOUNDED
    };
    let lines = message_lines(label, limit, PILL_TEXT_SIZE, MESSAGE_LINE_STEP);
    let widest = lines
        .iter()
        .fold(0.0, |widest, line| js::js_max(widest, line.width));
    let taller_by = (lines.len() as f64 - 1.0) * MESSAGE_LINE_STEP;
    MessagePlate {
        lines,
        width: widest + PILL_PADDING_X * 2.0,
        height: PILL_HEIGHT + taller_by,
        taller_by,
    }
}

/// A step's note wrapped to a width, whole, on a plate that holds it: the
/// painted width wins over the wrap width, as on a card, because whole-line
/// kerning can run a hair past the measure, and no word is cut to fit.
pub fn note_plate(note: &str, wrap: f64) -> NotePlate {
    let line_height = NOTE_SIZE * TEXT_LINE_HEIGHT;
    let lines = note_lines(
        note,
        wrap - STEP_NOTE_PADDING_X * 2.0,
        NOTE_SIZE,
        line_height,
    );
    let widest = lines
        .iter()
        .fold(0.0, |widest, run| js::js_max(widest, run.width));
    NotePlate {
        width: widest.ceil() + STEP_NOTE_PADDING_X * 2.0,
        height: lines.len() as f64 * line_height + STEP_NOTE_PADDING_Y * 2.0,
        lines,
    }
}

/// Where a message's arrow starts and stops, between the lifelines it leaves
/// and reaches, and whether the column it leaves and the one it reaches are
/// busy there. A busy column is a bar rather than a line, so an arrow touching
/// one stops at the bar's edge, short of it by what its head reaches past the
/// line's end. A message to itself leaves its lifeline, or its bar's edge.
pub fn message_ends(kind: MessageKind, from_x: f64, to_x: f64, busy: (bool, bool)) -> ArrowEnds {
    let bar = |busy: bool| if busy { ACTIVATION_HALF_WIDTH } else { 0.0 };
    let leaving = bar(busy.0);
    if kind == MessageKind::Myself {
        let start = from_x + leaving;
        return ArrowEnds {
            travel: 0,
            start,
            end: start,
        };
    }
    let travel: i8 = if to_x >= from_x { 1 } else { -1 };
    let direction = f64::from(travel);
    ArrowEnds {
        travel,
        start: from_x + direction * leaving,
        end: to_x - direction * (bar(busy.1) + arrow_standoff(kind)),
    }
}

/// The bar a busy column stands as across, about its lifeline.
pub fn activation_span(centre: f64) -> Span {
    Span {
        x: centre - ACTIVATION_HALF_WIDTH,
        width: ACTIVATION_HALF_WIDTH * 2.0,
    }
}

/// The box a message to itself loops through, from where it leaves its column.
/// It runs out to the right, turns down round a bend, drops, and bends back.
pub fn self_loop(start: Point) -> Rect {
    Rect {
        x: start.x,
        y: start.y,
        width: SELF_LOOP_REACH + SELF_LOOP_CORNER,
        height: SELF_LOOP_DROP + SELF_LOOP_CORNER * 2.0,
    }
}
