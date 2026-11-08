//! The ink of every route, indexed by the coordinate each stretch lies on, so that a label
//! finds the private stretches of its own route and the other lines that pass near a spot.

use super::{Span, subtract};
use crate::blocks::planned::{geometry::length, model::Model, shape::Shape};
use crate::geometry::{Point, Rect};

struct Stroke {
    edge: usize,
    across: f64,
    lo: f64,
    hi: f64,
    bin: i64,
}

type Strokes = [Vec<Stroke>; 2];

#[expect(
    clippy::cast_possible_truncation,
    reason = "the rounded coordinate is an integer bin, never a drawing coordinate"
)]
fn bin(at: f64) -> i64 {
    at as i64
}

pub(super) struct StrokeIndex {
    strokes: Strokes,
    pub(super) clearance: std::cell::RefCell<rustc_hash::FxHashMap<(usize, [u64; 4]), bool>>,
}
impl StrokeIndex {
    pub(super) fn new(model: &Model<'_>, shape: &Shape) -> Self {
        let mut strokes: Strokes = Default::default();
        for line in &shape.routes {
            let edge = model.edge_index[line.id.as_str()];
            for pair in line.points.windows(2) {
                let horizontal = pair[0].y == pair[1].y;
                let (across, a, b) = if horizontal {
                    (pair[0].y, pair[0].x, pair[1].x)
                } else {
                    (pair[0].x, pair[0].y, pair[1].y)
                };
                strokes[usize::from(horizontal)].push(Stroke {
                    edge,
                    across,
                    lo: a.min(b),
                    hi: a.max(b),
                    bin: bin((across * 1e6).round()),
                });
            }
        }
        // Stable bins retain the original subtraction order within each coordinate.
        for axis in &mut strokes {
            axis.sort_by_key(|stroke| stroke.bin);
        }
        Self {
            strokes,
            clearance: std::cell::RefCell::default(),
        }
    }
    fn range(&self, horizontal: bool, first: i64, last: i64) -> &[Stroke] {
        let strokes = &self.strokes[usize::from(horizontal)];
        let start = strokes.partition_point(|stroke| stroke.bin < first);
        let end = strokes.partition_point(|stroke| stroke.bin <= last);
        &strokes[start..end]
    }
    pub(super) fn crosses(&self, edge: usize, rect: Rect) -> bool {
        for horizontal in [true, false] {
            let (low, high, start, end) = if horizontal {
                (rect.y, rect.y + rect.height, rect.x, rect.x + rect.width)
            } else {
                (rect.x, rect.x + rect.width, rect.y, rect.y + rect.height)
            };
            let first = bin((low * 1e6).floor()) - 1;
            let last = bin((high * 1e6).ceil()) + 1;
            if self.range(horizontal, first, last).iter().any(|stroke| {
                stroke.edge != edge
                    && stroke.across > low
                    && stroke.across < high
                    && stroke.lo < end
                    && stroke.hi > start
            }) {
                return true;
            }
        }
        false
    }
    pub(super) fn touching(&self, edge: usize, rect: Rect, mut visit: impl FnMut(Rect)) {
        for horizontal in [true, false] {
            let (low, high, start, end) = if horizontal {
                (rect.y, rect.y + rect.height, rect.x, rect.x + rect.width)
            } else {
                (rect.x, rect.x + rect.width, rect.y, rect.y + rect.height)
            };
            let first = bin((low * 1e6).floor()) - 1;
            let last = bin((high * 1e6).ceil()) + 1;
            for stroke in self.range(horizontal, first, last).iter().filter(|stroke| {
                stroke.edge != edge
                    && stroke.across >= low
                    && stroke.across <= high
                    && stroke.lo <= end
                    && stroke.hi >= start
            }) {
                visit(if horizontal {
                    Rect {
                        x: stroke.lo,
                        y: stroke.across,
                        width: stroke.hi - stroke.lo,
                        height: 0.0,
                    }
                } else {
                    Rect {
                        x: stroke.across,
                        y: stroke.lo,
                        width: 0.0,
                        height: stroke.hi - stroke.lo,
                    }
                });
            }
        }
    }
    pub(super) fn private(&self, edge: usize, path: &[Point]) -> Vec<Span> {
        let mut spans = Vec::new();
        let mut before = 0.0;
        for pair in path.windows(2) {
            let horizontal = pair[0].y == pair[1].y;
            let (across, a, b) = if horizontal {
                (pair[0].y, pair[0].x, pair[1].x)
            } else {
                (pair[0].x, pair[0].y, pair[1].y)
            };
            let key = bin((across * 1e6).round());
            let mut parts = vec![(a.min(b), a.max(b))];
            for stroke in self
                .range(horizontal, key - 1, key + 1)
                .iter()
                .filter(|stroke| stroke.edge != edge && (stroke.across - across).abs() < 1e-6)
            {
                subtract(&mut parts, stroke.lo, stroke.hi);
            }
            for (lo, hi) in parts {
                let point = |at| {
                    if horizontal {
                        Point { x: at, y: across }
                    } else {
                        Point { x: across, y: at }
                    }
                };
                let (start, end) = span_ends(lo, hi, a < b);
                spans.push(Span {
                    a: point(start),
                    b: point(end),
                    before: before + (a - start).abs(),
                });
            }
            before += length(pair);
        }
        spans
    }
}

fn span_ends(lo: f64, hi: f64, forward: bool) -> (f64, f64) {
    if forward { (lo, hi) } else { (hi, lo) }
}
