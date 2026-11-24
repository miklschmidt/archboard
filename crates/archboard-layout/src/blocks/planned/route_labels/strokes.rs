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

/// A read-only view of a base `StrokeIndex` plus an optional small set of extra candidate strokes,
/// avoiding cloning the base index per candidate.
#[derive(Clone, Copy)]
pub(in crate::blocks::planned) struct StrokeView<'a> {
    pub(super) base: &'a StrokeIndex,
    extra: [&'a [Stroke]; 2],
}

/// An owned overlay of one candidate route's strokes on top of a borrowed base `StrokeIndex`.
pub(in crate::blocks::planned) struct StrokeOverlay<'a> {
    base: &'a StrokeIndex,
    extra: Strokes,
}

impl StrokeOverlay<'_> {
    pub(in crate::blocks::planned) fn view(&self) -> StrokeView<'_> {
        StrokeView {
            base: self.base,
            extra: [&self.extra[0], &self.extra[1]],
        }
    }

    /// Whether any extra stroke (from the overlaid candidate route) crosses `rect` for `edge`.
    pub(super) fn extra_crosses(&self, edge: usize, rect: Rect) -> bool {
        slice_crosses([&self.extra[0], &self.extra[1]], edge, rect)
    }
}

fn rect_axes(horizontal: bool, rect: Rect) -> (f64, f64, f64, f64) {
    if horizontal {
        (rect.y, rect.y + rect.height, rect.x, rect.x + rect.width)
    } else {
        (rect.x, rect.x + rect.width, rect.y, rect.y + rect.height)
    }
}

fn stroke_crosses(stroke: &Stroke, edge: usize, (low, high, start, end): (f64, f64, f64, f64)) -> bool {
    stroke.edge != edge
        && stroke.across + stroke.half > low
        && stroke.across - stroke.half < high
        && stroke.lo - stroke.half < end
        && stroke.hi + stroke.half > start
}

fn slice_crosses(axes: [&[Stroke]; 2], edge: usize, rect: Rect) -> bool {
    for horizontal in [true, false] {
        let bounds = rect_axes(horizontal, rect);
        if axes[usize::from(horizontal)]
            .iter()
            .any(|stroke| stroke_crosses(stroke, edge, bounds))
        {
            return true;
        }
    }
    false
}

fn stroke_box(horizontal: bool, stroke: &Stroke) -> Rect {
    let (h, len) = (stroke.half, stroke.hi - stroke.lo);
    if horizontal {
        Rect {
            x: stroke.lo - h,
            y: stroke.across - h,
            width: len + 2.0 * h,
            height: 2.0 * h,
        }
    } else {
        Rect {
            x: stroke.across - h,
            y: stroke.lo - h,
            width: 2.0 * h,
            height: len + 2.0 * h,
        }
    }
}

fn visit_touching(
    strokes: &[Stroke],
    horizontal: bool,
    edge: usize,
    (low, high, start, end): (f64, f64, f64, f64),
    visit: &mut impl FnMut(Rect),
) {
    for stroke in strokes {
        if stroke.edge != edge
            && stroke.across + stroke.half >= low
            && stroke.across - stroke.half <= high
            && stroke.lo - stroke.half <= end
            && stroke.hi + stroke.half >= start
        {
            visit(stroke_box(horizontal, stroke));
        }
    }
}

impl StrokeView<'_> {
    pub(super) fn extra_crosses(self, edge: usize, rect: Rect) -> bool {
        slice_crosses(self.extra, edge, rect)
    }

    pub(super) fn touching(self, edge: usize, rect: Rect, mut visit: impl FnMut(Rect)) {
        for horizontal in [true, false] {
            let bounds = rect_axes(horizontal, rect);
            let near = self.base.nearby(horizontal, bounds.0, bounds.1);
            visit_touching(near, horizontal, edge, bounds, &mut visit);
            visit_touching(
                self.extra[usize::from(horizontal)],
                horizontal,
                edge,
                bounds,
                &mut visit,
            );
        }
    }

    pub(super) fn private(self, edge: usize, path: &[Point]) -> Vec<Span> {
        let mut spans = Vec::with_capacity(path.len().saturating_sub(1));
        let mut parts: Vec<(f64, f64)> = Vec::new();
        let mut before = 0.0;
        for pair in path.windows(2) {
            let horizontal = pair[0].y == pair[1].y;
            let (across, a, b) = if horizontal {
                (pair[0].y, pair[0].x, pair[1].x)
            } else {
                (pair[0].x, pair[0].y, pair[1].y)
            };
            let key = bin((across * 1e6).round());
            let base = self.base.range(horizontal, key - 1, key + 1);
            let extra = self.extra[usize::from(horizontal)];
            if base.is_empty() && extra.is_empty() {
                spans.push(Span {
                    a: pair[0],
                    b: pair[1],
                    before,
                });
                before += length(pair);
                continue;
            }
            parts.clear();
            parts.push((a.min(b), a.max(b)));
            subtract_strokes(base, edge, across, &mut parts);
            subtract_strokes(extra, edge, across, &mut parts);
            push_private_spans(&parts, (horizontal, across, a, b, before), &mut spans);
            before += length(pair);
        }
        spans
    }
}

fn subtract_strokes(strokes: &[Stroke], edge: usize, across: f64, parts: &mut Vec<(f64, f64)>) {
    for stroke in strokes {
        let (Some(first), Some(last)) = (parts.first(), parts.last()) else {
            return;
        };
        if stroke.edge != edge
            && (stroke.across - across).abs() < 1e-6
            && stroke.hi > first.0
            && stroke.lo < last.1
        {
            subtract(parts, stroke.lo, stroke.hi);
        }
    }
}

fn push_private_spans(
    parts: &[(f64, f64)],
    (horizontal, across, a, b, before): (bool, f64, f64, f64, f64),
    spans: &mut Vec<Span>,
) {
    let point = |at| {
        if horizontal {
            Point { x: at, y: across }
        } else {
            Point { x: across, y: at }
        }
    };
    for &(lo, hi) in parts {
        let (start, end) = span_ends(lo, hi, a < b);
        spans.push(Span {
            a: point(start),
            b: point(end),
            before: before + (a - start).abs(),
        });
    }
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
        let mut pieces = Vec::new();
        for line in &shape.routes {
            let edge = model.edge_index[line.id.as_str()];
            push_strokes_of(model, edge, &line.points, &mut pieces, &mut strokes);
            max_half = max_half.max(model.reach(edge));
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

    pub(in crate::blocks::planned) fn view(&self) -> StrokeView<'_> {
        StrokeView {
            base: self,
            extra: [&[], &[]],
        }
    }

    /// Borrow this index with one candidate route's strokes overlaid, without cloning `self`.
    pub(in crate::blocks::planned) fn overlay(
        &self,
        model: &Model<'_>,
        edge: usize,
        path: &[Point],
    ) -> StrokeOverlay<'_> {
        let mut extra: Strokes = Default::default();
        let mut pieces = Vec::new();
        push_strokes_of(model, edge, path, &mut pieces, &mut extra);
        StrokeOverlay { base: self, extra }
    }

    /// The index of these routes and one more route after them, as `new` makes it.
    #[cfg(test)]
    pub(in crate::blocks::planned) fn with(
        &self,
        model: &Model<'_>,
        edge: usize,
        path: &[Point],
    ) -> Self {
        let mut strokes = self.strokes.clone();
        let mut extra: Strokes = Default::default();
        let mut pieces = Vec::new();
        push_strokes_of(model, edge, path, &mut pieces, &mut extra);
        for (axis, added) in strokes.iter_mut().zip(extra) {
            for stroke in added {
                // A later stroke follows every stroke of its bin, as the stable sort of `new` puts it.
                axis.insert(axis.partition_point(|s| s.bin <= stroke.bin), stroke);
            }
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
        if start == strokes.len() || strokes[start].bin > last {
            return &[];
        }
        let end = start + strokes[start..].partition_point(|stroke| stroke.bin <= last);
        &strokes[start..end]
    }
    /// The bins that can contain ink between `low` and `high`, even when its centre is outside.
    fn nearby(&self, horizontal: bool, low: f64, high: f64) -> &[Stroke] {
        let first = bin(((low - self.max_half) * 1e6).floor()) - 1;
        let last = bin(((high + self.max_half) * 1e6).ceil()) + 1;
        self.range(horizontal, first, last)
    }
    pub(super) fn crosses(&self, edge: usize, rect: Rect) -> bool {
        for horizontal in [true, false] {
            let bounds = rect_axes(horizontal, rect);
            if self
                .nearby(horizontal, bounds.0, bounds.1)
                .iter()
                .any(|stroke| stroke_crosses(stroke, edge, bounds))
            {
                return true;
            }
        }
        false
    }
    #[cfg(test)]
    pub(super) fn touching(&self, edge: usize, rect: Rect, visit: impl FnMut(Rect)) {
        self.view().touching(edge, rect, visit);
    }
    pub(super) fn private(&self, edge: usize, path: &[Point]) -> Vec<Span> {
        self.view().private(edge, path)
    }
}

/// Push the strokes of one route into `out`, reusing `pieces` to avoid per-route allocations.
fn push_strokes_of(
    model: &Model<'_>,
    edge: usize,
    path: &[Point],
    pieces: &mut Vec<super::super::junctions::Piece>,
    out: &mut Strokes,
) {
    super::super::junctions::pieces_into(path, model.ink(edge), pieces);
    for piece in pieces.iter() {
        let (horizontal, stroke) = Stroke::of((edge, piece.ink()), &piece.ends());
        out[usize::from(horizontal)].push(stroke);
    }
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
