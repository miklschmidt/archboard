//! Labels use existing private ink. They never alter a route's bends.

mod nearest;
pub(super) mod own;
mod plate;
mod seating;
mod strokes;
mod trunk;

use nearest::nearest;
use own::{Own, keeps, meets};
use plate::Plate;
pub(super) use seating::Seating;
pub(super) use strokes::{StrokeIndex, StrokeOverlay, StrokeView};
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
    strokes: StrokeView<'_>,
    labels: &super::label_space::Labels,
) -> bool {
    let key = (edge, [at.x, at.y, at.width, at.height].map(f64::to_bits));
    let base_clear = *strokes
        .base
        .clearance
        .borrow_mut()
        .entry(key)
        .or_insert_with(|| {
            contains(shape.scopes[&0].bounds, at)
                && shape
                    .label_geometry
                    .get_or_init(|| super::label_space::Protection::new(shape))
                    .clear(at)
                && !strokes.base.crosses(edge, inflate(at, 12.01))
        });
    base_clear
        && !strokes.extra_crosses(edge, inflate(at, 12.01))
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
        let (shape, strokes, labels) = (self.shape, self.strokes.view(), &self.labels);
        let spans = spans(edge, path, shape, strokes);
        spot_for(
            model,
            Own::new(edge, path),
            (shape, &spans),
            (strokes, labels),
        )
    }
    /// A spot that stands beside the route's other stretches, for a route whose words find no
    /// spot clear of them. It is always a fallback.
    pub(super) fn beside(
        &self,
        model: &Model<'_>,
        edge: usize,
        path: &[Point],
    ) -> Option<(Rect, bool)> {
        let (shape, strokes, labels) = (self.shape, self.strokes.view(), &self.labels);
        let spans = spans(edge, path, shape, strokes);
        let own = Own {
            beside: true,
            ..Own::new(edge, path)
        };
        spot_for(model, own, (shape, &spans), (strokes, labels))
    }
}

/// Where a route's words stand: clear of the route's other stretches, or as a fallback beside
/// them when the route leaves no such spot, because a line keeps its words. Words never stand
/// over another stretch of their own line, where a reader takes them for a different line's.
/// Words wrap onto their narrow plate before they stand beside their line or the line takes a
/// longer way round.
fn slot_with_spans(
    model: &Model<'_>,
    edge: usize,
    shape: &Shape,
    (path, spans): (&[Point], &[Span]),
    index: StrokeView<'_>,
    labels: &super::label_space::Labels,
) -> Option<(Rect, bool)> {
    [false, true].into_iter().find_map(|beside| {
        let own = Own {
            beside,
            ..Own::new(edge, path)
        };
        spot_for(model, own, (shape, spans), (index, labels))
    })
}

fn slot_index(
    model: &Model<'_>,
    edge: usize,
    shape: &Shape,
    path: &[Point],
    index: StrokeView<'_>,
    labels: &super::label_space::Labels,
) -> Option<(Rect, bool)> {
    let spans = spans(edge, path, shape, index);
    slot_with_spans(model, edge, shape, (path, &spans), index, labels)
}

/// The spot of `slot_index` that keeps the words clear of the route's other stretches, or
/// that stands beside them when `own` says so, on the route's `spans`, and whether it is a
/// fallback.
fn spot_for(
    model: &Model<'_>,
    own: Own<'_>,
    (shape, spans): (&Shape, &[Span]),
    (index, labels): (StrokeView<'_>, &super::label_space::Labels),
) -> Option<(Rect, bool)> {
    let spot = |narrow| spot_on(model, own, spans, shape, index, labels, narrow);
    let (at, fallback) = spot(false).or_else(|| spot(true))?;
    Some((at, fallback || own.beside))
}

/// The stretches of a route that no other line shares, where its words can stand: the longest
/// first, or along the route from its part for a line of a door's trunk.
fn spans(edge: usize, path: &[Point], shape: &Shape, index: StrokeView<'_>) -> Vec<Span> {
    if let Some(&part_first) = shape.trunk.get(&edge) {
        return index.private(edge, &from_part(path, part_first));
    }
    let mut spans = index.private(edge, path);
    spans.sort_by(|a, b| {
        length(&[b.a, b.b])
            .total_cmp(&length(&[a.a, a.b]))
            .then(a.before.total_cmp(&b.before))
    });
    spans
}

/// A spot for a route's words on its `spans`, as `spans` finds them, and whether it is a
/// fallback.
fn spot_on(
    model: &Model<'_>,
    own: Own<'_>,
    spans: &[Span],
    shape: &Shape,
    index: StrokeView<'_>,
    labels: &super::label_space::Labels,
    narrow: bool,
) -> Option<(Rect, bool)> {
    let plate = Plate::of(model, own, narrow)?;
    let ink = model.ink(own.edge);
    let pieces = if ink.0 > 0.0 {
        super::junctions::pieces(own.path, ink)
    } else {
        Vec::new()
    };
    let own = Own {
        pieces: &pieces,
        ..own
    };
    if shape.trunk.contains_key(&own.edge) {
        return nearest(spans, plate, shape, own, index, labels).map(|at| (at, false));
    }
    let midway = midway(spans, plate, shape, own, index, labels);
    midway
        .map(|at| (at, false))
        .or_else(|| nearest(spans, plate, shape, own, index, labels).map(|at| (at, true)))
}

/// The middle of the longest run that holds the words.
fn midway(
    spans: &[Span],
    plate: Plate,
    shape: &Shape,
    own: Own<'_>,
    index: StrokeView<'_>,
    labels: &super::label_space::Labels,
) -> Option<Rect> {
    spans.iter().find_map(|&span| {
        let size = plate.size;
        let room = plate.room_at(span.a, own).max(plate.room_at(span.b, own));
        let horizontal = span.a.y == span.b.y;
        let required = if horizontal { size.width } else { size.height };
        let position = if horizontal {
            f64::midpoint(span.a.x, span.b.x)
        } else {
            f64::midpoint(span.a.y, span.b.y)
        };
        let label = at(span, position, size);
        let kept = inflate(label, own.keep(12.01));
        (length(&[span.a, span.b]) >= required + 2.0 * room
            && own.others(span).all(|stretch| !meets(kept, stretch))
            && clear(shape, own.edge, label, index, labels))
        .then_some(label)
    })
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
        strokes.view(),
    )?;
    seated(model, shape, &indices, strokes.view())
}

/// The rest of `arrange`, for a shape without words whose lines `available` found room for.
/// `indices` are the lines of its routes, and `strokes` the index of their ink.
pub(super) fn seated(
    model: &Model<'_>,
    shape: &mut Shape,
    indices: &[usize],
    strokes: StrokeView<'_>,
) -> Option<()> {
    debug_assert!(shape.labels.is_empty());
    let mut labels = super::label_space::Labels::default();
    // Private spans stay fixed while words settle, and unlabeled routes never seat words.
    let cached_spans: Vec<Vec<Span>> = (shape.routes.iter().zip(indices))
        .map(|(line, &edge)| {
            if model.edges[edge].label().is_some() || line.label.is_some() {
                spans(edge, &line.points, shape, strokes)
            } else {
                Vec::new()
            }
        })
        .collect();
    // The words with the least room choose first: the longest run their line has to itself,
    // then the larger words.
    let room: Vec<f64> = (cached_spans.iter())
        .map(|route_spans| {
            route_spans
                .iter()
                .map(|span| length(&[span.a, span.b]))
                .fold(0.0, f64::max)
        })
        .collect();
    let mut order: Vec<_> = (0..shape.routes.len())
        .filter(|&index| {
            model.edges[indices[index]].label().is_some() || shape.routes[index].label.is_some()
        })
        .collect();
    order.sort_by(|&a, &b| {
        let area = |index: usize| {
            model.edges[indices[index]]
                .label()
                .map_or(0.0, |l| l.width.unwrap_or(0.0) * l.height.unwrap_or(0.0))
        };
        (room[a].total_cmp(&room[b]))
            .then(area(b).total_cmp(&area(a)))
            .then(a.cmp(&b))
    });
    seed(model, shape, indices, &order, strokes, &mut labels);
    let mut moves = Moves {
        count: 0,
        searched: vec![None; indices.len()],
    };
    for _ in 0..4 {
        let changed = update(
            model,
            shape,
            (indices, &order, &cached_spans),
            strokes,
            &mut labels,
            &mut moves,
        )?;
        if !changed {
            return Some(());
        }
    }
    consistent(
        model,
        shape,
        (indices, &order, &cached_spans),
        strokes,
        &labels,
    )
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
    strokes: StrokeView<'_>,
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

fn consistent(
    model: &Model<'_>,
    shape: &mut Shape,
    (indices, order, cached_spans): (&[usize], &[usize], &[Vec<Span>]),
    strokes: StrokeView<'_>,
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
        let (label, _) = slot_with_spans(
            model,
            edge,
            shape,
            (path, &cached_spans[index]),
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
    model: &Model<'_>,
    shape: &mut Shape,
    indices: &[usize],
    order: &[usize],
    strokes: StrokeView<'_>,
    labels: &mut super::label_space::Labels,
) {
    for &index in order {
        let line = &shape.routes[index];
        let edge = indices[index];
        // Contraction can carry a cable's plate over the marks at its ends or its inner bend.
        // Give the plate a new seat on the contracted route.
        if model.half(edge) > 0.0 {
            continue;
        }
        if let Some(label) = line.label
            && clear(shape, edge, label, strokes, labels)
        {
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
    (indices, order, cached_spans): (&[usize], &[usize], &[Vec<Span>]),
    strokes: StrokeView<'_>,
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
        let label = slot_with_spans(
            model,
            edge,
            shape,
            (path, &cached_spans[index]),
            strokes,
            labels,
        )
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
