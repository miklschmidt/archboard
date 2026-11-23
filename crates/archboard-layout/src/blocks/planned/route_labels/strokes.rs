//! The ink of every route, indexed by the coordinate each stretch lies on, so that a label
//! finds the private stretches of its own route and the other lines that pass near a spot.

use super::{Span, subtract};
use crate::blocks::planned::{geometry::length, model::Model, shape::Shape};
use crate::geometry::{Point, Rect};

#[derive(Clone)]
struct Stroke {
    edge: usize,
    /// How far the stroke's ink reaches to either side: a cable's half, a lone line's nothing.
    half: f64,
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

pub(in crate::blocks::planned) struct StrokeIndex {
    strokes: Strokes,
    /// The largest distance a cable's ink reaches from its indexed centre.
    max_half: f64,
    pub(super) clearance: std::cell::RefCell<rustc_hash::FxHashMap<(usize, [u64; 4]), bool>>,
}
impl StrokeIndex {
    pub(in crate::blocks::planned) fn new(model: &Model<'_>, shape: &Shape) -> Self {
        let mut strokes: Strokes = Default::default();
        let mut max_half: f64 = 0.0;
        for line in &shape.routes {
            let edge = model.edge_index[line.id.as_str()];
            for (horizontal, stroke) in strokes_of(model, edge, &line.points) {
                max_half = max_half.max(stroke.half);
                strokes[usize::from(horizontal)].push(stroke);
            }
        }
        // Stable bins retain the original subtraction order within each coordinate.
        for axis in &mut strokes {
            axis.sort_by_key(|stroke| stroke.bin);
        }
        Self {
            strokes,
            max_half,
            clearance: std::cell::RefCell::default(),
        }
    }
    /// The index of these routes and one more route after them, as `new` makes it.
    pub(in crate::blocks::planned) fn with(
        &self,
        model: &Model<'_>,
        edge: usize,
        path: &[Point],
    ) -> Self {
        let mut strokes = self.strokes.clone();
        for (horizontal, stroke) in strokes_of(model, edge, path) {
            let axis = &mut strokes[usize::from(horizontal)];
            // A later stroke follows every stroke of its bin, as the stable sort of `new` puts it.
            axis.insert(axis.partition_point(|s| s.bin <= stroke.bin), stroke);
        }
        Self {
            strokes,
            max_half: self.max_half.max(model.reach(edge)),
            clearance: std::cell::RefCell::default(),
        }
    }
    fn range(&self, horizontal: bool, first: i64, last: i64) -> &[Stroke] {
        let strokes = &self.strokes[usize::from(horizontal)];
        let start = strokes.partition_point(|stroke| stroke.bin < first);
        let end = strokes.partition_point(|stroke| stroke.bin <= last);
        &strokes[start..end]
    }
    /// The bins that can contain ink between `low` and `high`, even when its centre is outside.
    fn nearby(&self, horizontal: bool, low: f64, high: f64) -> &[Stroke] {
        let first = bin(((low - self.max_half) * 1e6).floor()) - 1;
        let last = bin(((high + self.max_half) * 1e6).ceil()) + 1;
        self.range(horizontal, first, last)
    }
    /// Whether a route of a line would cross a box in an index of another line: `crosses` for
    /// the strokes of that route alone.
    pub(super) fn path_crosses(
        model: &Model<'_>,
        (line, path): (usize, &[Point]),
        edge: usize,
        rect: Rect,
    ) -> bool {
        strokes_of(model, line, path).any(|(horizontal, stroke)| {
            let (low, high, start, end) = if horizontal {
                (rect.y, rect.y + rect.height, rect.x, rect.x + rect.width)
            } else {
                (rect.x, rect.x + rect.width, rect.y, rect.y + rect.height)
            };
            stroke.edge != edge
                && stroke.across + stroke.half > low
                && stroke.across - stroke.half < high
                && stroke.lo - stroke.half < end
                && stroke.hi + stroke.half > start
        })
    }
    pub(super) fn crosses(&self, edge: usize, rect: Rect) -> bool {
        for horizontal in [true, false] {
            let (low, high, start, end) = if horizontal {
                (rect.y, rect.y + rect.height, rect.x, rect.x + rect.width)
            } else {
                (rect.x, rect.x + rect.width, rect.y, rect.y + rect.height)
            };
            if self.nearby(horizontal, low, high).iter().any(|stroke| {
                stroke.edge != edge
                    && stroke.across + stroke.half > low
                    && stroke.across - stroke.half < high
                    && stroke.lo - stroke.half < end
                    && stroke.hi + stroke.half > start
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
            for stroke in self.nearby(horizontal, low, high).iter().filter(|stroke| {
                stroke.edge != edge
                    && stroke.across + stroke.half >= low
                    && stroke.across - stroke.half <= high
                    && stroke.lo - stroke.half <= end
                    && stroke.hi + stroke.half >= start
            }) {
                let (h, length) = (stroke.half, stroke.hi - stroke.lo);
                visit(if horizontal {
                    Rect {
                        x: stroke.lo - h,
                        y: stroke.across - h,
                        width: length + 2.0 * h,
                        height: 2.0 * h,
                    }
                } else {
                    Rect {
                        x: stroke.across - h,
                        y: stroke.lo - h,
                        width: 2.0 * h,
                        height: length + 2.0 * h,
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

/// The strokes of a route of a line, each as wide as the line's ink on that piece: a cable's fan
/// where its strands stand a lane apart at its cards, its body elsewhere (`junctions::pieces`).
fn strokes_of<'p>(
    model: &Model<'_>,
    edge: usize,
    path: &'p [Point],
) -> impl Iterator<Item = (bool, Stroke)> + 'p {
    let pieces = super::super::junctions::pieces(path, model.ink(edge));
    pieces
        .into_iter()
        .map(move |piece| Stroke::of((edge, piece.ink()), &piece.ends()))
}

impl Stroke {
    /// The stroke of one run of a route, and whether it runs across the page.
    fn of((edge, half): (usize, f64), pair: &[Point]) -> (bool, Self) {
        let horizontal = pair[0].y == pair[1].y;
        let (across, a, b) = if horizontal {
            (pair[0].y, pair[0].x, pair[1].x)
        } else {
            (pair[0].x, pair[0].y, pair[1].y)
        };
        let stroke = Self {
            edge,
            half,
            across,
            lo: a.min(b),
            hi: a.max(b),
            bin: bin((across * 1e6).round()),
        };
        (horizontal, stroke)
    }
}

fn span_ends(lo: f64, hi: f64, forward: bool) -> (f64, f64) {
    if forward { (lo, hi) } else { (hi, lo) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::assembly::{Placed, PlacedLine};
    use serde_json::json;

    #[test]
    fn a_cable_reaches_a_plate_its_middle_misses() {
        let graph = serde_json::from_value(json!({
            "id": "root", "children": [{"id": "a"}, {"id": "b"}], "edges": [{
                "id": "cable", "sources": ["a"], "targets": ["b"],
                "layoutOptions": {"archboard.cable": "one;two;three"}
            }]
        }))
        .unwrap();
        let model = Model::new(&graph).unwrap();
        let mut shape = Shape::new(Placed {
            width: 100.0,
            height: 100.0,
            cards: vec![],
            frames: vec![],
            regions: vec![],
            edges: vec![],
            titles: vec![],
            routed: None,
        });
        let path = vec![Point { x: 20.0, y: 30.0 }, Point { x: 80.0, y: 30.0 }];
        let added = StrokeIndex::new(&model, &shape).with(&model, 0, &path);
        shape.routes.push(PlacedLine {
            id: "cable".to_owned(),
            points: path,
            label: None,
        });
        let plate = Rect {
            x: 40.0,
            y: 15.0,
            width: 20.0,
            height: 10.0,
        };
        for strokes in [added, StrokeIndex::new(&model, &shape)] {
            assert!(strokes.crosses(1, plate));
            let mut found = false;
            strokes.touching(1, plate, |_| found = true);
            assert!(found);
        }
    }
}
