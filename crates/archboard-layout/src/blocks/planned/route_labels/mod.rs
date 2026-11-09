//! Labels use existing private ink. They never alter a route's bends.

pub(super) mod own;
mod strokes;
mod trunk;

use own::{Own, keeps, meets};
pub(super) use strokes::StrokeIndex;
pub(super) use trunk::{branches, from_part, seat};

use super::{
    geometry::{contains, length},
    model::Model,
    shape::Shape,
};
use crate::{
    blocks::assembly::PlacedLine,
    geometry::{Point, Rect, inflate},
};

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
        let (shape, strokes, labels) = (self.shape, &self.strokes, &self.labels);
        spot_for(model, edge, (shape, path), (strokes, labels), false)
    }
    /// A spot that stands beside the route's other stretches, for a route whose words find no
    /// spot clear of them. It is always a fallback.
    pub(super) fn beside(
        &self,
        model: &Model<'_>,
        edge: usize,
        path: &[Point],
    ) -> Option<(Rect, bool)> {
        let (shape, strokes, labels) = (self.shape, &self.strokes, &self.labels);
        spot_for(model, edge, (shape, path), (strokes, labels), true)
    }
}

/// Where a route's words stand: clear of the route's other stretches, or as a fallback beside
/// them when the route leaves no such spot, because a line keeps its words. Words never stand
/// over another stretch of their own line, where a reader takes them for a different line's.
/// Words wrap onto their narrow plate before they stand beside their line or the line takes a
/// longer way round.
fn slot_index(
    model: &Model<'_>,
    edge: usize,
    shape: &Shape,
    path: &[Point],
    index: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> Option<(Rect, bool)> {
    [false, true]
        .into_iter()
        .find_map(|beside| spot_for(model, edge, (shape, path), (index, labels), beside))
}

/// The spot of `slot_index` that keeps the words clear of the route's other stretches, or
/// that stands beside them when `beside` says so, and whether it is a fallback.
fn spot_for(
    model: &Model<'_>,
    edge: usize,
    (shape, path): (&Shape, &[Point]),
    (index, labels): (&StrokeIndex, &super::label_space::Labels),
    beside: bool,
) -> Option<(Rect, bool)> {
    let own = Own {
        beside,
        ..Own::new(edge, path)
    };
    let spot = |narrow| spot_on(model, own, path, shape, index, labels, narrow);
    let (at, fallback) = spot(false).or_else(|| spot(true))?;
    Some((at, fallback || beside))
}

/// The size of a label's plate, or of its narrow plate where its words wrap narrower.
fn plate(model: &Model<'_>, edge: usize, narrow: bool) -> Option<Rect> {
    let label = model.edges[edge].label()?;
    let (width, height) = if narrow {
        let plate = label.narrow?;
        (plate.width, plate.height)
    } else {
        (label.width.unwrap_or(0.0), label.height.unwrap_or(0.0))
    };
    Some(Rect {
        x: 0.0,
        y: 0.0,
        width,
        height,
    })
}

fn spot_on(
    model: &Model<'_>,
    own: Own<'_>,
    path: &[Point],
    shape: &Shape,
    index: &StrokeIndex,
    labels: &super::label_space::Labels,
    narrow: bool,
) -> Option<(Rect, bool)> {
    let edge = own.edge;
    let size = plate(model, edge, narrow)?;
    if let Some(&part_first) = shape.trunk.get(&edge) {
        let spans = index.private(edge, &from_part(path, part_first));
        return nearest(&spans, size, shape, own, index, labels).map(|at| (at, false));
    }
    let mut spans = index.private(edge, path);
    spans.sort_by(|a, b| {
        length(&[b.a, b.b])
            .total_cmp(&length(&[a.a, a.b]))
            .then(a.before.total_cmp(&b.before))
    });
    let midway = midway(&spans, size, shape, own, index, labels);
    midway
        .map(|at| (at, false))
        .or_else(|| nearest(&spans, size, shape, own, index, labels).map(|at| (at, true)))
}

/// The middle of the longest run that holds the words.
fn midway(
    spans: &[Span],
    size: Rect,
    shape: &Shape,
    own: Own<'_>,
    index: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> Option<Rect> {
    spans.iter().find_map(|&span| {
        let horizontal = span.a.y == span.b.y;
        let required = if horizontal { size.width } else { size.height };
        let position = if horizontal {
            f64::midpoint(span.a.x, span.b.x)
        } else {
            f64::midpoint(span.a.y, span.b.y)
        };
        let label = at(span, position, size);
        let kept = inflate(label, own.keep(12.01));
        (length(&[span.a, span.b]) >= required + 32.0
            && own.others(span).all(|stretch| !meets(kept, stretch))
            && clear(shape, own.edge, label, index, labels))
        .then_some(label)
    })
}

fn nearest(
    spans: &[Span],
    size: Rect,
    shape: &Shape,
    own: Own<'_>,
    index: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> Option<Rect> {
    let mut best: Option<(f64, Rect)> = None;
    for &span in spans {
        // Every spot lies at or beyond the start of its private span.
        if best.is_some_and(|(distance, _)| span.before > distance) {
            continue;
        }
        for spot in spots_for(span, size, shape, own, index, labels) {
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
    own: Own<'_>,
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
    for stretch in own.others(span) {
        protect(inflate(stretch, own.keep(12.02)));
    }
    let window = search_window(a, b, across, across_half, horizontal);
    index.touching(own.edge, window, |r| protect(inflate(r, 12.02)));
    spots.extend(free.into_iter().filter_map(|(lo, hi)| {
        let position = if a < b { lo } else { hi };
        let label = at(span, position, size);
        clear(shape, own.edge, label, index, labels)
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

/// Place the words of every route of a shape, if each finds a spot.
pub(super) fn arrange(model: &Model<'_>, shape: &mut Shape) -> Option<()> {
    let strokes = StrokeIndex::new(model, shape);
    shape.labels.clear();
    let indices: Vec<_> = shape
        .routes
        .iter()
        .map(|line| model.edge_index.get(line.id.as_str()).copied())
        .collect::<Option<_>>()?;
    available(
        model,
        shape,
        shape.routes.iter().zip(indices.iter().copied()),
        &strokes,
    )?;
    seated(model, shape, &indices, &strokes)
}

/// The rest of `arrange`, for a shape without words whose lines `available` found room for.
/// `indices` are the lines of its routes, and `strokes` the index of their ink.
pub(super) fn seated(
    model: &Model<'_>,
    shape: &mut Shape,
    indices: &[usize],
    strokes: &StrokeIndex,
) -> Option<()> {
    debug_assert!(shape.labels.is_empty());
    let mut labels = super::label_space::Labels::default();
    let mut order: Vec<_> = (0..shape.routes.len()).collect();
    order.sort_by(|&a, &b| {
        let area = |index: usize| {
            model.edges[indices[index]]
                .label()
                .map_or(0.0, |l| l.width.unwrap_or(0.0) * l.height.unwrap_or(0.0))
        };
        area(b).total_cmp(&area(a)).then(a.cmp(&b))
    });
    seed(shape, indices, &order, strokes, &mut labels);
    let mut moves = Moves {
        count: 0,
        searched: vec![None; indices.len()],
    };
    for _ in 0..4 {
        let changed = update(
            model,
            shape,
            (indices, &order),
            strokes,
            &mut labels,
            &mut moves,
        )?;
        if !changed {
            return Some(());
        }
    }
    consistent(model, shape, indices, &order, strokes, &labels)
}

/// How many times a line's words moved while `seated` places them, and for each route how
/// many had moved when its words last found their spot.
struct Moves {
    count: usize,
    searched: Vec<Option<usize>>,
}

/// Whether every worded line, each with its index, has a spot for its words along its route
/// before any words take space: the first test of `arrange`. `shape` holds no words, and
/// `strokes` indexes the ink of the lines.
fn available<'l>(
    model: &Model<'_>,
    shape: &Shape,
    lines: impl IntoIterator<Item = (&'l PlacedLine, usize)>,
    strokes: &StrokeIndex,
) -> Option<()> {
    debug_assert!(shape.labels.is_empty());
    let labels = &super::label_space::Labels::default();
    // A new or covered label needs a private spot even before other labels take space.
    for (line, edge) in lines {
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

/// When a placed line's words need a spot of their own once one more route joins.
#[derive(Clone, Copy)]
enum Need {
    /// The line has no words.
    Never,
    /// The line has no spot yet, or the placed ink covers its words.
    Always,
    /// Where the new route's ink covers the words.
    Covered(Rect),
}

/// The words of a shape's placed routes, ready for one more route at a time. Whether the
/// placed ink leaves a line's words clear is the same for every new route, so `available`
/// tests only the new route's ink against them.
pub(in crate::blocks::planned) struct Seating<'a> {
    /// The placement without routes or words.
    bare: Shape,
    /// The placed routes, each with its line and what its words need.
    lines: Vec<(&'a PlacedLine, usize, Need)>,
    /// The ink of the placed routes.
    strokes: StrokeIndex,
}
impl<'a> Seating<'a> {
    /// The seating of a shape's routes, if each is a line of the model.
    pub(in crate::blocks::planned) fn new(model: &Model<'_>, shape: &'a Shape) -> Option<Self> {
        let strokes = StrokeIndex::new(model, shape);
        let bare = shape.bare();
        let labels = &super::label_space::Labels::default();
        let lines = (shape.routes.iter())
            .map(|line| {
                let edge = *model.edge_index.get(line.id.as_str())?;
                let need = match line.label {
                    _ if model.edges[edge].label().is_none() => Need::Never,
                    Some(at) if clear(&bare, edge, at, &strokes, labels) => Need::Covered(at),
                    _ => Need::Always,
                };
                Some((line, edge, need))
            })
            .collect::<Option<_>>()?;
        Some(Self {
            bare,
            lines,
            strokes,
        })
    }

    /// The lines of the placed routes.
    pub(in crate::blocks::planned) fn indices(&self) -> impl Iterator<Item = usize> {
        self.lines.iter().map(|&(_, edge, _)| edge)
    }

    /// `available` for the placed routes and one more route of a line, with the index of the
    /// ink of them all, which `seated` takes next.
    pub(in crate::blocks::planned) fn admit(
        &self,
        model: &Model<'_>,
        edge: usize,
        line: &PlacedLine,
    ) -> Option<StrokeIndex> {
        let strokes = self.strokes.with(edge, &line.points);
        let labels = &super::label_space::Labels::default();
        for &(placed, other, need) in &self.lines {
            let covered = match need {
                Need::Never => false,
                Need::Always => true,
                Need::Covered(words) => {
                    StrokeIndex::path_crosses(edge, &line.points, other, inflate(words, 12.01))
                }
            };
            if covered {
                slot_index(model, other, &self.bare, &placed.points, &strokes, labels)?;
            }
        }
        available(model, &self.bare, [(line, edge)], &strokes)?;
        Some(strokes)
    }
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
        let path = &shape.routes[index].points;
        if keeps(shape, Own::new(edge, path), old, strokes, labels) {
            shape.labels.insert(edge, old);
            continue;
        }
        let (label, _) = slot_index(model, edge, shape, path, strokes, labels)?;
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
/// Find each line's words a spot again, and tell whether any moved. A line's spot depends on
/// its own words and the other lines' words, so while no other words move, the line's words
/// keep the spot they found last, and its search is not run again.
fn update(
    model: &Model<'_>,
    shape: &mut Shape,
    (indices, order): (&[usize], &[usize]),
    strokes: &StrokeIndex,
    labels: &mut super::label_space::Labels,
    moves: &mut Moves,
) -> Option<bool> {
    let mut changed = false;
    for &index in order {
        let edge = indices[index];
        if model.edges[edge].label().is_none() || moves.searched[index] == Some(moves.count) {
            continue;
        }
        let old = shape.labels.remove(&edge);
        let path = &shape.routes[index].points;
        if let Some(kept) =
            old.filter(|&at| keeps(shape, Own::new(edge, path), at, strokes, labels))
        {
            shape.labels.insert(edge, kept);
            labels.remember(edge, kept);
            moves.searched[index] = Some(moves.count);
            continue;
        }
        // A plate that contraction carried with its run can fill the room it has exactly, so
        // that no search finds it, and it can stay where it stands.
        let label = slot_index(model, edge, shape, path, strokes, labels)
            .map(|(at, _)| at)
            .or_else(|| {
                let own = Own::new(edge, path);
                old.filter(|&at| own.rides_one(at) && clear(shape, edge, at, strokes, labels))
            })?;
        if old != Some(label) {
            changed = true;
            moves.count += 1;
        }
        moves.searched[index] = Some(moves.count);
        shape.labels.insert(edge, label);
        labels.remember(edge, label);
        shape.routes[index].label = Some(label);
    }
    Some(changed)
}

#[cfg(test)]
mod tests;
