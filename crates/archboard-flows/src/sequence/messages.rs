//! Where one message's arrow starts and stops, where its words go, and how
//! much of the page the whole thing claims.
//!
//! Forked from the geometry half of PR Lens's `svg/dataflow.ts`, kept out of
//! the painter: the same numbers decide what is drawn and what the atlas
//! reports, and two copies of them would one day disagree about where a
//! message is. A message's label sits above its arrow rather than astride it
//! (`MESSAGE_LABEL_GAP`), so the line a reader follows runs unbroken from the
//! sender to the arrowhead. Where the arrow stops and how big its plate is are
//! the measure's (`archboard_scene::message_ends`, `message_plate`).

use archboard_geometry::{Point, Rect, covering};
use archboard_scene::{ArrowEnds, message_ends, self_loop};

use crate::sequence::design::{MESSAGE_LABEL_GAP, NEST_INSET, SELF_LABEL_GAP};
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

/// Where a message's arrow starts and stops: a busy column is a bar rather
/// than a line, so the arrow stops at, and leaves from, a bar's edge.
fn ends_of(placed: &PlacedStep<'_>, active: &ActiveAt<'_>) -> ArrowEnds {
    message_ends(
        placed.step.kind,
        placed.from_x,
        placed.to_x,
        (
            active.at(&placed.step.from, placed.y),
            active.at(&placed.step.to, placed.y),
        ),
    )
}

/// A self-message: its loop leaves its lifeline, or its bar's edge, and comes
/// back to it. Its label stands above the loop's outgoing run, a little past
/// the lifeline. Above rather than beside: columns are narrow and stand a
/// seam apart, so a plate beside the loop would lie across the next column.
/// Its ink is the loop with its label.
fn self_drawn(placed: &PlacedStep<'_>, start: f64) -> (Rect, Rect) {
    let plate = &placed.words.plate;
    let label = Rect {
        x: start + SELF_LABEL_GAP,
        y: placed.y - MESSAGE_LABEL_GAP - plate.height,
        width: plate.width,
        height: plate.height,
    };
    let loop_box = self_loop(Point {
        x: start,
        y: placed.y,
    });
    (label, covering(loop_box, label))
}

/// A crossing message: its arrow between the ends `ends_of` gives, its label
/// centred on the gap between lifelines its layout chose, just above the
/// arrow. Its ink is the arrow with its label.
fn straight_drawn(placed: &PlacedStep<'_>, start: f64, end: f64) -> (Rect, Rect) {
    let plate = &placed.words.plate;
    let centre = placed
        .words
        .centre
        .unwrap_or_else(|| f64::midpoint(start, end));
    let label = Rect {
        x: centre - plate.width / 2.0,
        y: placed.y - MESSAGE_LABEL_GAP - plate.height,
        width: plate.width,
        height: plate.height,
    };
    let arrow = Rect {
        x: archboard_ecma::min([start, end]),
        y: placed.y,
        width: (end - start).abs(),
        height: 0.0,
    };
    (label, covering(arrow, label))
}

/// How one message is drawn, whichever sort of message it is.
pub(super) fn drawn(placed: &PlacedStep<'_>, active: &ActiveAt<'_>) -> Drawn {
    let ArrowEnds { travel, start, end } = ends_of(placed, active);
    let (label, ink) = if travel == 0 {
        self_drawn(placed, start)
    } else {
        straight_drawn(placed, start, end)
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
        left = archboard_ecma::min([left, (ink.x - NEST_INSET).floor()]);
        right = archboard_ecma::max([right, (ink.x + ink.width + NEST_INSET).ceil()]);
    }
    (left, right - left)
}
