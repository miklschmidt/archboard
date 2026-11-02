//! A relationship's own route: its words ride one stretch and stand clear of the rest.

use super::Span;
use crate::geometry::{Point, Rect};

/// The relationship whose words are placed, and the route they ride.
#[derive(Clone, Copy)]
pub(super) struct Own<'a> {
    pub(super) edge: usize,
    pub(super) path: &'a [Point],
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
            .map(|pair| Rect {
                x: pair[0].x.min(pair[1].x),
                y: pair[0].y.min(pair[1].y),
                width: (pair[0].x - pair[1].x).abs(),
                height: (pair[0].y - pair[1].y).abs(),
            })
    }
}
