//! Labels use existing private ink. They never alter a route's bends.

use super::{
    geometry::{contains, length},
    model::Model,
    shape::Shape,
};
use crate::geometry::{Point, Rect, inflate};

#[derive(Clone, Copy)]
struct Span {
    a: Point,
    b: Point,
    before: f64,
}

fn subtract(parts: &mut Vec<(f64, f64)>, a: f64, b: f64) {
    let mut index = 0;
    while index < parts.len() {
        let (lo, hi) = parts[index];
        if b <= lo || a >= hi {
            index += 1;
            continue;
        }
        let left = (lo < a).then_some((lo, a));
        let right = (b < hi).then_some((b, hi));
        let retained = usize::from(left.is_some()) + usize::from(right.is_some());
        parts.splice(index..=index, left.into_iter().chain(right));
        index += retained;
    }
}

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

struct StrokeIndex {
    strokes: Strokes,
    clearance: std::cell::RefCell<rustc_hash::FxHashMap<(usize, [u64; 4]), bool>>,
}
impl StrokeIndex {
    fn new(model: &Model<'_>, shape: &Shape) -> Self {
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
    fn crosses(&self, edge: usize, rect: Rect) -> bool {
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
    fn touching(&self, edge: usize, rect: Rect, mut visit: impl FnMut(Rect)) {
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
    fn private(&self, edge: usize, path: &[Point]) -> Vec<Span> {
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
fn clear(
    shape: &Shape,
    edge: usize,
    at: Rect,
    strokes: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> bool {
    let key = (edge, [at.x, at.y, at.width, at.height].map(f64::to_bits));
    *strokes
        .clearance
        .borrow_mut()
        .entry(key)
        .or_insert_with(|| {
            contains(shape.scopes[&0].bounds, at)
                && shape
                    .label_geometry
                    .get_or_init(|| super::label_space::Protection::new(shape))
                    .clear(at)
                && !strokes.crosses(edge, inflate(at, 12.01))
        })
        && labels.clear(at, &shape.labels)
}

fn at(span: Span, position: f64, size: Rect) -> Rect {
    let (x, y) = if span.a.y == span.b.y {
        (position, span.a.y)
    } else {
        (span.a.x, position)
    };
    Rect {
        x: x - size.width / 2.0,
        y: y - size.height / 2.0,
        ..size
    }
}

/// One immutable candidate set shares its stroke and label indexes.
pub(super) struct Slots<'a> {
    shape: &'a Shape,
    strokes: StrokeIndex,
    labels: super::label_space::Labels,
}
impl<'a> Slots<'a> {
    pub(super) fn new(model: &Model<'_>, shape: &'a Shape) -> Self {
        Self {
            shape,
            strokes: StrokeIndex::new(model, shape),
            labels: super::label_space::Labels::new(&shape.labels),
        }
    }
    pub(super) fn slot(
        &self,
        model: &Model<'_>,
        edge: usize,
        path: &[Point],
    ) -> Option<(Rect, bool)> {
        slot_index(model, edge, self.shape, path, &self.strokes, &self.labels)
    }
}

fn slot_index(
    model: &Model<'_>,
    edge: usize,
    shape: &Shape,
    path: &[Point],
    index: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> Option<(Rect, bool)> {
    let label = model.edges[edge].label()?;
    let size = Rect {
        x: 0.0,
        y: 0.0,
        width: label.width.unwrap_or(0.0),
        height: label.height.unwrap_or(0.0),
    };
    let mut spans = index.private(edge, path);
    // Every plate in a stack must meet its own line, not only the stack's envelope.
    spans.retain(|span| !label.stacked || span.a.x == span.b.x);
    spans.sort_by(|a, b| {
        length(&[b.a, b.b])
            .total_cmp(&length(&[a.a, a.b]))
            .then(a.before.total_cmp(&b.before))
    });
    for &span in &spans {
        let horizontal = span.a.y == span.b.y;
        let required = if horizontal { size.width } else { size.height };
        if length(&[span.a, span.b]) < required + 32.0 {
            continue;
        }
        let position = if horizontal {
            f64::midpoint(span.a.x, span.b.x)
        } else {
            f64::midpoint(span.a.y, span.b.y)
        };
        let label = at(span, position, size);
        if clear(shape, edge, label, index, labels) {
            return Some((label, false));
        }
    }
    nearest(&spans, size, shape, edge, index, labels).map(|at| (at, true))
}

fn nearest(
    spans: &[Span],
    size: Rect,
    shape: &Shape,
    edge: usize,
    index: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> Option<Rect> {
    let mut best: Option<(f64, Rect)> = None;
    for &span in spans {
        // Every spot lies at or beyond the start of its private span.
        if best.is_some_and(|(distance, _)| span.before > distance) {
            continue;
        }
        for spot in spots_for(span, size, shape, edge, index, labels) {
            if best.is_none_or(|(distance, _)| spot.0.total_cmp(&distance).is_lt()) {
                best = Some(spot);
            }
        }
    }
    best.map(|(_, at)| at)
}

fn spots_for(
    span: Span,
    size: Rect,
    shape: &Shape,
    edge: usize,
    index: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> Vec<(f64, Rect)> {
    let mut spots = Vec::new();
    let horizontal = span.a.y == span.b.y;
    let (a, b, across, along_half, across_half) = projection(span, size);
    let (lo, hi) = (a.min(b) + along_half + 16.01, a.max(b) - along_half - 16.01);
    if hi < lo {
        return Vec::new();
    }
    let mut free = vec![(lo, hi)];
    let mut protect = |r: Rect| {
        let (low, high, left, right) = if horizontal {
            (r.x, r.x + r.width, r.y, r.y + r.height)
        } else {
            (r.y, r.y + r.height, r.x, r.x + r.width)
        };
        if across + across_half >= left && across - across_half <= right {
            subtract(&mut free, low - along_half, high + along_half);
        }
    };
    let geometry = shape
        .label_geometry
        .get_or_init(|| super::label_space::Protection::new(shape));
    geometry.nearby(horizontal, across, across_half, &mut protect);
    for &r in shape.labels.values() {
        protect(inflate(r, 8.02));
    }
    let window = search_window(a, b, across, across_half, horizontal);
    index.touching(edge, window, |r| protect(inflate(r, 12.02)));
    spots.extend(free.into_iter().filter_map(|(lo, hi)| {
        let position = if a < b { lo } else { hi };
        let label = at(span, position, size);
        clear(shape, edge, label, index, labels)
            .then_some((span.before + (position - a).abs(), label))
    }));
    spots
}

fn projection(span: Span, size: Rect) -> (f64, f64, f64, f64, f64) {
    let horizontal = span.a.y == span.b.y;
    if horizontal {
        (
            span.a.x,
            span.b.x,
            span.a.y,
            size.width / 2.0,
            size.height / 2.0,
        )
    } else {
        (
            span.a.y,
            span.b.y,
            span.a.x,
            size.height / 2.0,
            size.width / 2.0,
        )
    }
}

fn search_window(a: f64, b: f64, across: f64, across_half: f64, horizontal: bool) -> Rect {
    if horizontal {
        Rect {
            x: a.min(b),
            y: across - across_half - 12.01,
            width: (a - b).abs(),
            height: 2.0 * across_half + 24.02,
        }
    } else {
        Rect {
            x: across - across_half - 12.01,
            y: a.min(b),
            width: 2.0 * across_half + 24.02,
            height: (a - b).abs(),
        }
    }
}

pub(super) fn arrange(model: &Model<'_>, shape: &mut Shape) -> Option<usize> {
    let strokes = StrokeIndex::new(model, shape);
    shape.labels.clear();
    let mut labels = super::label_space::Labels::default();
    let indices: Vec<_> = shape
        .routes
        .iter()
        .map(|line| model.edge_index.get(line.id.as_str()).copied())
        .collect::<Option<_>>()?;
    available(model, shape, &indices, &strokes, &labels)?;
    let mut order: Vec<_> = (0..shape.routes.len()).collect();
    order.sort_by(|&a, &b| {
        let area = |index: usize| {
            model.edges[indices[index]]
                .label()
                .map_or(0.0, |l| l.width.unwrap_or(0.0) * l.height.unwrap_or(0.0))
        };
        area(b).total_cmp(&area(a)).then(a.cmp(&b))
    });
    seed(shape, &indices, &order, &strokes, &mut labels);
    let mut fallbacks = 0;
    for _ in 0..4 {
        let (count, changed) = update(model, shape, &indices, &order, &strokes, &mut labels)?;
        fallbacks = count;
        if !changed {
            return Some(fallbacks);
        }
    }
    consistent(model, shape, &indices, &order, &strokes, &labels)?;
    Some(fallbacks)
}

fn available(
    model: &Model<'_>,
    shape: &Shape,
    indices: &[usize],
    strokes: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> Option<()> {
    // A new or covered label needs a private spot even before other labels take space.
    for (line, &edge) in shape.routes.iter().zip(indices) {
        if model.edges[edge].label().is_some()
            && line
                .label
                .is_none_or(|at| !clear(shape, edge, at, strokes, labels))
        {
            slot_index(model, edge, shape, &line.points, strokes, labels)?;
        }
    }
    Some(())
}

fn consistent(
    model: &Model<'_>,
    shape: &mut Shape,
    indices: &[usize],
    order: &[usize],
    strokes: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> Option<()> {
    for &index in order {
        let edge = indices[index];
        if model.edges[edge].label().is_none() {
            continue;
        }
        let old = shape.labels.remove(&edge)?;
        let (label, _) = slot_index(
            model,
            edge,
            shape,
            &shape.routes[index].points,
            strokes,
            labels,
        )?;
        shape.labels.insert(edge, old);
        if old != label {
            return None;
        }
    }
    Some(())
}
fn seed(
    shape: &mut Shape,
    indices: &[usize],
    order: &[usize],
    strokes: &StrokeIndex,
    labels: &mut super::label_space::Labels,
) {
    for &index in order {
        let line = &shape.routes[index];
        if let Some(label) = line.label
            && clear(shape, indices[index], label, strokes, labels)
        {
            let edge = indices[index];
            shape.labels.insert(edge, label);
            labels.remember(edge, label);
        }
    }
}
fn update(
    model: &Model<'_>,
    shape: &mut Shape,
    indices: &[usize],
    order: &[usize],
    strokes: &StrokeIndex,
    labels: &mut super::label_space::Labels,
) -> Option<(usize, bool)> {
    let mut changed = false;
    let mut fallbacks = 0;
    for &index in order {
        let edge = indices[index];
        if model.edges[edge].label().is_none() {
            continue;
        }
        let old = shape.labels.remove(&edge);
        let (label, fallback) = slot_index(
            model,
            edge,
            shape,
            &shape.routes[index].points,
            strokes,
            labels,
        )?;
        changed |= old != Some(label);
        shape.labels.insert(edge, label);
        labels.remember(edge, label);
        shape.routes[index].label = Some(label);
        fallbacks += usize::from(fallback);
    }
    Some((fallbacks, changed))
}

#[cfg(test)]
mod tests;
