//! Keep ports apart across opposite walls and along walls of doors and cards with cables.

use super::{model::Model, shape::Shape};
use crate::{blocks::assembly::PlacedLine, geometry::Point, lanes::chains::LANE};

/// The gap that keeps two distinct ports readable: one lane.
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

#[derive(Clone, Copy)]
enum WallPair {
    Opposite,
    Either { shared_port: bool },
}

impl WallPair {
    fn offset(self, (at, next): (Point, Point), (other, away): (Point, Point)) -> Option<f64> {
        let (on, off, their_on, their_off, by) = if at.y == next.y && other.y == away.y {
            (at.x, next.x, other.x, away.x, other.y - at.y)
        } else if at.x == next.x && other.x == away.x {
            (at.y, next.y, other.y, away.y, other.x - at.x)
        } else {
            return None;
        };
        let opposite = (off - on) * (their_off - their_on) < 0.0;
        let same = (on - their_on).abs() < 0.1;
        let distinct = matches!(self, Self::Either { shared_port } if !shared_port || by != 0.0);
        (opposite || (same && distinct)).then_some(by)
    }
}

pub(super) fn conflicts(
    model: &Model<'_>,
    edge: usize,
    points: &[Point],
    old: &PlacedLine,
) -> bool {
    Peer::of(model, edge, old).is_some_and(|peer| peer.conflicts(points))
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
    peers: &[Peer],
) -> Vec<f64> {
    let mut offsets = OFFSETS.map(|by| if source { by } else { -by }).to_vec();
    let (at, next) = end(points, source);
    let horizontal = at.y == next.y;
    let (lo, hi) = wall_span(model, shape, edge, source, horizontal);
    let position = if horizontal { at.y } else { at.x };
    offsets.extend([lo - position, hi - position]);
    for peer in peers {
        for by in peer.offsets(points, source).into_iter().flatten() {
            offsets.extend([by + peer.apart, by - peer.apart]);
        }
    }
    let mut seen = rustc_hash::FxHashSet::default();
    offsets.retain(|by| by.abs() > 0.1 && seen.insert(by.to_bits()));
    offsets
}

/// A placed route that ends on one subject with an end of a line: the only kind of route that
/// the line's ends can conflict with.
#[derive(Clone, Copy)]
pub(super) struct Peer {
    ends: [(Point, Point); 2],
    /// How far apart the two lines' ends stand at the least: a lane, and each cable's half.
    apart: f64,
    /// For each of the line's ends, which walls its port must keep clear of at each peer end.
    walls: [[Option<WallPair>; 2]; 2],
}
impl Peer {
    fn offsets(&self, points: &[Point], source: bool) -> [Option<f64>; 2] {
        let mine = end(points, source);
        let row = self.walls[usize::from(!source)];
        [
            row[0].and_then(|w| w.offset(mine, self.ends[0])),
            row[1].and_then(|w| w.offset(mine, self.ends[1])),
        ]
    }

    fn conflicts_at(&self, points: &[Point], source: bool) -> bool {
        let mine = end(points, source);
        let row = self.walls[usize::from(!source)];
        let limit = self.apart - 1e-6;
        row[0]
            .and_then(|w| w.offset(mine, self.ends[0]))
            .is_some_and(|by| by.abs() < limit)
            || row[1]
                .and_then(|w| w.offset(mine, self.ends[1]))
                .is_some_and(|by| by.abs() < limit)
    }

    pub(super) fn conflicts(&self, points: &[Point]) -> bool {
        self.conflicts_at(points, true) || self.conflicts_at(points, false)
    }

    /// A placed route as a peer of a line, if it is one.
    pub(super) fn of(model: &Model<'_>, edge: usize, line: &PlacedLine) -> Option<Self> {
        let other = model.edge_index[line.id.as_str()];
        if edge == other {
            return None;
        }
        let ends = |edge| {
            let (from, to) = model.ends[edge];
            [(from, true), (to, false)]
        };
        let cable = model.reach(edge) > 0.0 || model.reach(other) > 0.0;
        let walls = ends(edge).map(|(at, source)| {
            ends(other).map(|(end, other_source)| {
                if at == end && (model.endpoints[at].door || cable) {
                    Some(WallPair::Either {
                        shared_port: !cable
                            && source == other_source
                            && model.treatments[edge] == model.treatments[other],
                    })
                } else {
                    one_subject(model, at, end).then_some(WallPair::Opposite)
                }
            })
        });
        walls.iter().flatten().any(Option::is_some).then_some(Self {
            ends: [end(&line.points, true), end(&line.points, false)],
            apart: APART + model.reach(edge) + model.reach(other),
            walls,
        })
    }
}

/// The peers of a line among some placed routes, in their order.
pub(super) fn peers(model: &Model<'_>, routes: &[PlacedLine], edge: usize) -> Vec<Peer> {
    (routes.iter())
        .filter_map(|line| Peer::of(model, edge, line))
        .collect()
}

/// Slide an endpoint run and keep its bends and remaining corridor, clear of the line's peers.
pub(super) fn alternatives(
    model: &Model<'_>,
    shape: &Shape,
    line: &PlacedLine,
    peers: &[Peer],
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
    // The corner margin belongs to the outer strand of a cable.
    let margin = (if source { 12.0 } else { 20.0 }) + model.reach(edge);
    let (start, span) = if horizontal {
        (card.y, card.height)
    } else {
        (card.x, card.width)
    };
    (start + margin, start + span - margin)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn centred_cable_ports_keep_their_places_despite_rounding() {
        let graph = serde_json::from_value(serde_json::json!({
            "id": "root",
            "children": [{"id": "source"}, {"id": "left"}, {"id": "right"}],
            "edges": [
                {
                    "id": "left", "sources": ["source"], "targets": ["left"],
                    "layoutOptions": {"archboard.cable": "sync;async"}
                },
                {"id": "right", "sources": ["source"], "targets": ["right"]}
            ]
        }))
        .unwrap();
        let model = Model::new(&graph).unwrap();
        let route = |id: &str, x| PlacedLine {
            id: id.into(),
            points: vec![Point { x, y: 80.0 }, Point { x, y: 180.0 }],
            label: None,
        };
        let middle = 250.4;
        let cable = route("left", middle - 12.0);
        assert!(clear(
            &model,
            &[cable.clone(), route("right", middle + 12.0)]
        ));
        assert!(!clear(&model, &[cable, route("right", middle + 11.0)]));
    }
}
