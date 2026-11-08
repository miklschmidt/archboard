//! A relationship's own route: its words ride one stretch and stand clear of the rest.

use super::{Span, StrokeIndex, clear};
use crate::blocks::planned::{label_space::Labels, model::Model, shape::Shape};
use crate::geometry::{Point, Rect, inflate};

/// The relationship whose words are placed, and the route they ride.
#[derive(Clone, Copy)]
pub(super) struct Own<'a> {
    pub(super) edge: usize,
    pub(super) path: &'a [Point],
    /// Whether the words may stand beside the route's other stretches, within the clearance
    /// they keep from other lines, for a route that leaves them no spot clear of its own ink.
    /// They still never stand over another stretch of it.
    pub(super) beside: bool,
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

impl<'a> Own<'a> {
    /// The words of a route, kept clear of its other stretches.
    pub(super) fn new(edge: usize, path: &'a [Point]) -> Self {
        Self {
            edge,
            path,
            beside: false,
        }
    }

    /// How far the words keep from the route's other stretches: a clearance, or only off
    /// them for words that stand beside them.
    pub(super) fn keep(self, clearance: f64) -> f64 {
        if self.beside { 0.01 } else { clearance }
    }

    /// Every stretch of the route but the one that holds the span the words ride.
    pub(super) fn others(self, span: Span) -> impl Iterator<Item = Rect> {
        self.path
            .windows(2)
            .filter(move |pair| !carries(pair, span))
            .map(stretch)
    }

    /// Whether a box meets one stretch of the route at most.
    pub(super) fn rides_one(self, area: Rect) -> bool {
        let met = self.path.windows(2).map(stretch);
        met.filter(|&stretch| meets(area, stretch)).count() <= 1
    }
}

/// Whether every line's words in a drawing stand clear of the line's other stretches.
pub(in crate::blocks::planned) fn words_clear(model: &Model<'_>, shape: &Shape) -> bool {
    shape.routes.iter().all(|line| {
        let edge = model.edge_index[line.id.as_str()];
        let path = line.points.as_slice();
        let own = Own::new(edge, path);
        shape
            .labels
            .get(&edge)
            .is_none_or(|&words| own.rides_one(words))
    })
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
    !shape.trunk.is_empty()
        && own.rides_one(inflate(at, 12.01))
        && clear(shape, own.edge, at, strokes, labels)
}
