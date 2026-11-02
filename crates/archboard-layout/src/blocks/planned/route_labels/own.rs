//! A relationship's own route: its words ride one stretch and stand clear of the rest.

use super::{Span, StrokeIndex, clear};
use crate::blocks::planned::{label_space::Labels, shape::Shape};
use crate::geometry::{Point, Rect, inflate};

/// The relationship whose words are placed, and the route they ride.
#[derive(Clone, Copy)]
pub(super) struct Own<'a> {
    pub(super) edge: usize,
    pub(super) path: &'a [Point],
}

/// One stretch of a route, as a box with no width.
fn stretch(pair: &[Point]) -> Rect {
    Rect {
        x: pair[0].x.min(pair[1].x),
        y: pair[0].y.min(pair[1].y),
        width: (pair[0].x - pair[1].x).abs(),
        height: (pair[0].y - pair[1].y).abs(),
    }
}

/// Whether a box and a stretch of line, which has no width, meet.
pub(super) fn meets(area: Rect, stretch: Rect) -> bool {
    stretch.x <= area.x + area.width
        && stretch.x + stretch.width >= area.x
        && stretch.y <= area.y + area.height
        && stretch.y + stretch.height >= area.y
}

/// Whether a stretch of a route holds a span of it.
fn carries(pair: &[Point], span: Span) -> bool {
    let holds = |lo: f64, hi: f64, a: f64, b: f64| lo.min(hi) <= a.min(b) && lo.max(hi) >= a.max(b);
    if pair[0].y == pair[1].y {
        pair[0].y == span.a.y
            && span.a.y == span.b.y
            && holds(pair[0].x, pair[1].x, span.a.x, span.b.x)
    } else {
        pair[0].x == span.a.x
            && span.a.x == span.b.x
            && holds(pair[0].y, pair[1].y, span.a.y, span.b.y)
    }
}

impl Own<'_> {
    /// Every stretch of the route but the one that holds the span the words ride.
    pub(super) fn others(self, span: Span) -> impl Iterator<Item = Rect> {
        self.path
            .windows(2)
            .filter(move |pair| !carries(pair, span))
            .map(stretch)
    }

    /// Whether words stand on one stretch of the route and clear of the rest.
    pub(super) fn rides_one(self, words: Rect) -> bool {
        let kept = inflate(words, 12.01);
        let met = self.path.windows(2).map(stretch);
        met.filter(|&stretch| meets(kept, stretch)).count() <= 1
    }
}

/// Whether a drawing dressed with its trunks' words keeps a plate where it stands: each
/// plate there was seated around the others, and moving one can unseat the next.
pub(super) fn keeps(
    shape: &Shape,
    own: Own<'_>,
    at: Rect,
    strokes: &StrokeIndex,
    labels: &Labels,
) -> bool {
    !shape.trunk.is_empty() && own.rides_one(at) && clear(shape, own.edge, at, strokes, labels)
}
