//! Reserve distinct lines across opposite walls before accepting a route.

use super::{model::Model, shape::Shape};
use crate::{blocks::assembly::PlacedLine, geometry::Point, track::chains::LANE};

/// How far apart two lines at opposite walls of one card must stand to read
/// as two lines, not as one line behind the card: one lane, the gap between
/// two parallel lines.
const APART: f64 = LANE;

const OFFSETS: [f64; 4] = [APART, -APART, 2.0 * APART, -2.0 * APART];

fn end(points: &[Point], source: bool) -> (Point, Point) {
    if source {
        (points[0], points[1])
    } else {
        (points[points.len() - 1], points[points.len() - 2])
    }
}

fn endpoint(model: &Model<'_>, edge: usize, source: bool) -> usize {
    if source {
        model.ends[edge].0
    } else {
        model.ends[edge].1
    }
}

/// Whether two endpoints are one thing on the page: a frame and the foot of its tab.
fn one_subject(model: &Model<'_>, one: usize, other: usize) -> bool {
    one == other
        || model.endpoints[one].foot == Some(other)
        || model.endpoints[other].foot == Some(one)
}

fn opposite_offset((at, next): (Point, Point), (other, away): (Point, Point)) -> Option<f64> {
    let horizontal = at.y == next.y && other.y == away.y;
    let vertical = at.x == next.x && other.x == away.x;
    if horizontal && (next.x - at.x) * (away.x - other.x) < 0.0 {
        Some(other.y - at.y)
    } else if vertical && (next.y - at.y) * (away.y - other.y) < 0.0 {
        Some(other.x - at.x)
    } else {
        None
    }
}

fn conflicts_at(
    model: &Model<'_>,
    edge: usize,
    points: &[Point],
    source: bool,
    old: &PlacedLine,
) -> bool {
    // The ends' geometry is cheaper than the lookup of the other line, so it goes first.
    let near = [true, false].map(|os| {
        opposite_offset(end(points, source), end(&old.points, os))
            .is_some_and(|by| by.abs() < APART)
    });
    if near == [false, false] {
        return false;
    }
    let other = model.edge_index[old.id.as_str()];
    edge != other
        && [true, false].into_iter().zip(near).any(|(os, near)| {
            near && one_subject(
                model,
                endpoint(model, edge, source),
                endpoint(model, other, os),
            )
        })
}

pub(super) fn conflicts(
    model: &Model<'_>,
    edge: usize,
    points: &[Point],
    old: &PlacedLine,
) -> bool {
    [true, false]
        .into_iter()
        .any(|source| conflicts_at(model, edge, points, source, old))
}

pub(super) fn clear(model: &Model<'_>, routes: &[PlacedLine]) -> bool {
    routes.iter().enumerate().all(|(i, line)| {
        let edge = model.edge_index[line.id.as_str()];
        routes[i + 1..]
            .iter()
            .all(|other| !conflicts(model, edge, &line.points, other))
    })
}

fn offsets(
    model: &Model<'_>,
    shape: &Shape,
    edge: usize,
    points: &[Point],
    source: bool,
    peers: &[Peer<'_>],
) -> Vec<f64> {
    let mut offsets = OFFSETS.map(|by| if source { by } else { -by }).to_vec();
    let (at, next) = end(points, source);
    let horizontal = at.y == next.y;
    let (lo, hi) = wall_span(model, shape, edge, source, horizontal);
    let position = if horizontal { at.y } else { at.x };
    offsets.extend([lo - position, hi - position]);
    for peer in peers {
        for (os, meets) in [true, false]
            .into_iter()
            .zip(peer.meets[usize::from(!source)])
        {
            if !meets {
                continue;
            }
            if let Some(by) = opposite_offset(end(points, source), end(&peer.line.points, os)) {
                offsets.extend([by + APART, by - APART]);
            }
        }
    }
    let mut seen = rustc_hash::FxHashSet::default();
    offsets.retain(|by| by.abs() > 0.1 && seen.insert(by.to_bits()));
    offsets
}

/// A placed route that ends on one subject with an end of a line: the only kind of route that
/// the line's ends can conflict with.
pub(super) struct Peer<'a> {
    line: &'a PlacedLine,
    /// For the line's source and its target, whether the peer's source and its target stand on
    /// the same subject. A route of the line's own relationship stands on none.
    meets: [[bool; 2]; 2],
}
impl Peer<'_> {
    /// `conflicts_at` with this peer.
    fn conflicts_at(&self, points: &[Point], source: bool) -> bool {
        let meets = self.meets[usize::from(!source)];
        [true, false].into_iter().zip(meets).any(|(os, meets)| {
            meets
                && opposite_offset(end(points, source), end(&self.line.points, os))
                    .is_some_and(|by| by.abs() < APART)
        })
    }

    /// `conflicts` with this peer.
    pub(super) fn conflicts(&self, points: &[Point]) -> bool {
        [true, false]
            .into_iter()
            .any(|source| self.conflicts_at(points, source))
    }
}

/// The peers of a line among some placed routes, in their order.
pub(super) fn peers<'a>(model: &Model<'_>, routes: &'a [PlacedLine], edge: usize) -> Vec<Peer<'a>> {
    let (from, to) = model.ends[edge];
    routes
        .iter()
        .filter_map(|line| {
            let other = model.edge_index[line.id.as_str()];
            let (a, b) = model.ends[other];
            let meets = [from, to].map(|at| [a, b].map(|end| one_subject(model, at, end)));
            (meets != [[false; 2]; 2]).then_some(Peer {
                line,
                meets: if edge == other {
                    [[false; 2]; 2]
                } else {
                    meets
                },
            })
        })
        .collect()
}

/// Slide an endpoint run and keep its bends and remaining corridor, clear of the line's peers.
pub(super) fn alternatives(
    model: &Model<'_>,
    shape: &Shape,
    line: &PlacedLine,
    peers: &[Peer<'_>],
) -> Vec<PlacedLine> {
    let edge = model.edge_index[line.id.as_str()];
    let mut paths = Paths::new(line.points.clone());
    for source in [true, false] {
        if !peers
            .iter()
            .any(|peer| peer.conflicts_at(&line.points, source))
        {
            continue;
        }
        let offsets = offsets(model, shape, edge, &line.points, source, peers);
        for at in 0..paths.all.len() {
            for &offset in &offsets {
                if let Some(path) = slide(model, shape, edge, &paths.all[at], source, offset) {
                    paths.add(path);
                }
            }
        }
    }
    let movement = |points: &[Point]| {
        [true, false]
            .into_iter()
            .map(|source| {
                super::geometry::length(&[end(&line.points, source).0, end(points, source).0])
            })
            .sum::<f64>()
    };
    let mut alternatives: Vec<_> = (paths.all.into_iter().skip(1))
        .filter(|points| !peers.iter().any(|peer| peer.conflicts(points)))
        .map(|points| (movement(&points), super::geometry::length(&points), points))
        .collect();
    alternatives.sort_by(|a, b| a.0.total_cmp(&b.0).then_with(|| a.1.total_cmp(&b.1)));
    (alternatives.into_iter())
        .map(|(_, _, points)| PlacedLine {
            id: line.id.clone(),
            label: line
                .label
                .filter(|&label| super::channel::label_run(&points, label)),
            points,
        })
        .collect()
}

/// Distinct paths, bit for bit, in the order they first came.
struct Paths {
    all: Vec<Vec<Point>>,
    hashes: rustc_hash::FxHashSet<u64>,
}
impl Paths {
    fn new(first: Vec<Point>) -> Self {
        let mut paths = Self {
            all: Vec::new(),
            hashes: rustc_hash::FxHashSet::default(),
        };
        paths.add(first);
        paths
    }

    fn add(&mut self, path: Vec<Point>) {
        let bits = |p: &Point| [p.x.to_bits(), p.y.to_bits()];
        let hash = {
            use std::hash::{Hash, Hasher};
            let mut hasher = rustc_hash::FxHasher::default();
            for p in &path {
                bits(p).hash(&mut hasher);
            }
            hasher.finish()
        };
        // A new hash is a new path. A known hash is a path seen before, or a collision.
        if !self.hashes.insert(hash)
            && (self.all.iter()).any(|seen| seen.iter().map(bits).eq(path.iter().map(bits)))
        {
            return;
        }
        self.all.push(path);
    }
}

fn slide(
    model: &Model<'_>,
    shape: &Shape,
    edge: usize,
    points: &[Point],
    source: bool,
    offset: f64,
) -> Option<Vec<Point>> {
    let (at, next) = end(points, source);
    let horizontal = at.y == next.y;
    let mut path = points.to_vec();
    let count = path.len();
    let run = if source {
        &mut path[..2]
    } else {
        &mut path[count - 2..]
    };
    for point in run {
        if horizontal {
            point.y += offset;
        } else {
            point.x += offset;
        }
    }
    let inside = [true, false]
        .into_iter()
        .filter(|&end| end == source || points.len() == 2)
        .all(|end_source| {
            let (at, _) = end(&path, end_source);
            let (lo, hi) = wall_span(model, shape, edge, end_source, horizontal);
            let position = if horizontal { at.y } else { at.x };
            position >= lo && position <= hi
        });
    inside.then_some(path)
}

fn wall_span(
    model: &Model<'_>,
    shape: &Shape,
    edge: usize,
    source: bool,
    horizontal: bool,
) -> (f64, f64) {
    let card = shape.endpoints[&endpoint(model, edge, source)];
    let margin = if source { 12.0 } else { 20.0 };
    let (start, span) = if horizontal {
        (card.y, card.height)
    } else {
        (card.x, card.width)
    };
    (start + margin, start + span - margin)
}
