//! Where a decision's or loop's frame stands across a sequence (ADR 0053).
//!
//! UML draws a choice as an `alt` fragment and a repetition as a `loop`
//! fragment: a frame round the messages it governs, an operator in a tab at
//! its corner, and a guard on each operand. Here the tab says `alt` or `loop`,
//! the words beside it are the decision's question or the loop's condition,
//! and each alternative's label stands at the start of its own operand.
//!
//! A frame reaches across the ink of what it holds and no further, so a choice
//! between two columns does not span the whole page, and a frame inside
//! another stands inside it with the same room on every side. It widens to the
//! right when its own words need more room than its messages do.

use std::collections::HashMap;

use archboard_scene::geometry::{Rect, covering, union};
use archboard_scene::js;
use archboard_scene::request::FrameOperator;

use crate::sequence::design::{
    ACTIVATION_HALF_WIDTH, FRAME_HEAD_HEIGHT, FRAME_PAD, FRAME_TAB_PADDING, NEST_INSET,
    PILL_TEXT_SIZE,
};
use crate::sequence::layout::{ActiveAt, FrameRows, FrameStep, PlacedFrame, PlacedStep};
use crate::sequence::messages::step_box;
use crate::text::{PILL_FONT, Text};

/// How wide some words of a frame are drawn.
fn words_width(text: &impl Text, words: &str) -> f64 {
    text.width(words, PILL_FONT, PILL_TEXT_SIZE)
}

/// What one frame's tab and head row say: its operator, and the words beside it.
fn head_of(step: FrameStep) -> (FrameOperator, String) {
    match step {
        FrameStep::Decision(decision) => (FrameOperator::Alt, decision.question.clone()),
        FrameStep::Loop(repeat) => (FrameOperator::Loop, format!("[{}]", repeat.condition)),
    }
}

/// The narrowest a frame may be and still hold its own words: the tab and the
/// words beside it, and each alternative's label.
fn own_width(text: &impl Text, rows: &FrameRows, tab_width: f64, words: &str) -> f64 {
    let mut widest = tab_width + FRAME_TAB_PADDING + words_width(text, words) + FRAME_PAD;
    for guard in &rows.guards {
        widest = js::js_max(
            widest,
            words_width(text, &format!("[{}]", guard.label)) + FRAME_PAD * 2.0,
        );
    }
    widest.ceil()
}

/// What one message claims across a frame: its ink, and the lifelines it runs
/// between with the bars on them, so a frame's side never lies on a bar.
fn ink_of(placed: &PlacedStep, active: &ActiveAt) -> Rect {
    let left = js::js_min(placed.from_x, placed.to_x) - ACTIVATION_HALF_WIDTH;
    let width = (placed.to_x - placed.from_x).abs() + ACTIVATION_HALF_WIDTH * 2.0;
    covering(
        step_box(placed, active),
        Rect {
            x: left,
            y: placed.y,
            width,
            height: 0.0,
        },
    )
}

/// Every frame of one flow, with its sides: round the ink of its messages and
/// of the frames inside it, by the frame's room on each side, and wide enough
/// for its own words. The frames arrive each after the frames inside it, so a
/// frame's inner frames are placed before it. A frame that holds no drawn ink
/// spans the flow's columns.
pub fn place_frames<'a>(
    text: &impl Text,
    frames: Vec<FrameRows<'a>>,
    steps: &[PlacedStep],
    active: &ActiveAt,
    columns_x: f64,
    columns_width: f64,
) -> Vec<PlacedFrame<'a>> {
    let inks: HashMap<&str, Rect> = steps
        .iter()
        .map(|placed| (placed.step.id.as_str(), ink_of(placed, active)))
        .collect();
    let mut boxes: HashMap<String, Rect> = HashMap::new();
    let mut placed = Vec::with_capacity(frames.len());
    for rows in frames {
        let held: Vec<Rect> = rows
            .messages
            .iter()
            .filter_map(|id| inks.get(id.as_str()).copied())
            .chain(rows.inner.iter().filter_map(|id| boxes.get(id).copied()))
            .collect();
        let frame = sided(text, rows, &held, columns_x, columns_width);
        boxes.insert(frame.rows.step.id().to_owned(), frame.bounds);
        placed.push(frame);
    }
    placed
}

/// One frame with its sides, round the ink it holds.
fn sided<'a>(
    text: &impl Text,
    rows: FrameRows<'a>,
    held: &[Rect],
    columns_x: f64,
    columns_width: f64,
) -> PlacedFrame<'a> {
    let (left, right) = match union(held.iter().copied()) {
        None => (columns_x, columns_x + columns_width),
        Some(ink) => (
            (ink.x - FRAME_PAD).floor(),
            (ink.x + ink.width + FRAME_PAD).ceil(),
        ),
    };
    let (operator, words) = head_of(rows.step);
    let word = match operator {
        FrameOperator::Alt => "alt",
        FrameOperator::Loop => "loop",
    };
    let tab_width = (words_width(text, word) + FRAME_TAB_PADDING * 2.0).ceil();
    let width = js::js_max(right - left, own_width(text, &rows, tab_width, &words));
    PlacedFrame {
        bounds: Rect {
            x: left,
            y: rows.top,
            width,
            height: rows.bottom - rows.top,
        },
        tab: Rect {
            x: left,
            y: rows.top,
            width: tab_width,
            height: FRAME_HEAD_HEIGHT,
        },
        operator,
        words,
        rows,
    }
}

/// A flow's span across the page, grown to hold its decisions' and loops'
/// frames with the inset its columns keep, in whole units.
pub fn span_around((x, width): (f64, f64), frames: &[PlacedFrame]) -> (f64, f64) {
    let mut left = x;
    let mut right = x + width;
    for frame in frames {
        let bounds = frame.bounds;
        left = js::js_min(left, (bounds.x - NEST_INSET).floor());
        right = js::js_max(right, (bounds.x + bounds.width + NEST_INSET).ceil());
    }
    (left, right - left)
}
