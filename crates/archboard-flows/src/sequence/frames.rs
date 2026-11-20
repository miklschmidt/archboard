//! Where a decision's or loop's frame stands across a sequence.
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
use archboard_scene::{Span, activation_span, fragment_bounds, js};

use crate::sequence::design::NEST_INSET;
use crate::sequence::layout::{ActiveAt, FrameRows, PlacedFrame, PlacedStep};
use crate::sequence::messages::drawn;

/// What one message claims across a frame: its ink, and the lifelines it runs
/// between with the bars on them, so a frame's side never lies on a bar.
fn ink_of(placed: &PlacedStep<'_>, active: &ActiveAt<'_>) -> Rect {
    let bar = activation_span(js::min([placed.from_x, placed.to_x]));
    let left = bar.x;
    let width = (placed.to_x - placed.from_x).abs() + bar.width;
    covering(
        drawn(placed, active).bounds,
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
pub(super) fn place_frames<'a>(
    frames: Vec<FrameRows<'a>>,
    steps: &[PlacedStep<'_>],
    active: &ActiveAt<'_>,
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
        let frame = sided(rows, &held, columns_x, columns_width);
        boxes.insert(frame.rows.step.id().to_owned(), frame.bounds);
        placed.push(frame);
    }
    placed
}

/// One frame with its sides, round the ink it holds.
fn sided<'a>(
    rows: FrameRows<'a>,
    held: &[Rect],
    columns_x: f64,
    columns_width: f64,
) -> PlacedFrame<'a> {
    let ink = union(held.iter().copied()).map(|ink| Span {
        x: ink.x,
        width: ink.width,
    });
    let columns = Span {
        x: columns_x,
        width: columns_width,
    };
    let span = fragment_bounds(ink, columns, &rows.head);
    let tab = rows.head.tab;
    PlacedFrame {
        bounds: Rect {
            x: span.x,
            y: rows.top,
            width: span.width,
            height: rows.bottom - rows.top,
        },
        tab: Rect {
            x: span.x,
            y: rows.top,
            width: tab.width,
            height: tab.height,
        },
        rows,
    }
}

/// A flow's span across the page, grown to hold its decisions' and loops'
/// frames with the inset its columns keep, in whole units.
pub(super) fn span_around((x, width): (f64, f64), frames: &[PlacedFrame<'_>]) -> (f64, f64) {
    let mut left = x;
    let mut right = x + width;
    for frame in frames {
        let bounds = frame.bounds;
        left = js::min([left, (bounds.x - NEST_INSET).floor()]);
        right = js::max([right, (bounds.x + bounds.width + NEST_INSET).ceil()]);
    }
    (left, right - left)
}
