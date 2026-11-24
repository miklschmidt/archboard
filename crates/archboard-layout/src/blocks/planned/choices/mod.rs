//! Candidate channels between fixed endpoint ports.
use std::cell::OnceCell;
use std::hash::{Hash, Hasher};

use rustc_hash::{FxHashMap, FxHashSet, FxHasher};

use super::{
    corridors::{CorridorBase, CorridorScratch},
    fixed::{RouteRanker, page_bounds},
    geometry::{clean, contains, length},
    model::Model,
    ports::center,
    shape::Shape,
    topology::Topology,
};
use crate::{
    blocks::assembly::PlacedLine,
    geometry::{Point, Rect, inflate},
};

/// Distinct candidate polylines in first-seen order, avoiding cloning and sorting duplicates.
#[derive(Default)]
struct PathSet {
    paths: Vec<Vec<Point>>,
    first: FxHashMap<u64, usize>,
    overflow: Vec<(u64, usize)>,
}

impl PathSet {
    fn hash_of(points: &[Point]) -> u64 {
        let mut hasher = FxHasher::default();
        points.len().hash(&mut hasher);
        for p in points {
            let x = if p.x == 0.0 { 0_u64 } else { p.x.to_bits() };
            let y = if p.y == 0.0 { 0_u64 } else { p.y.to_bits() };
            x.hash(&mut hasher);
            y.hash(&mut hasher);
        }
        hasher.finish()
    }

    fn insert_slice(&mut self, points: &[Point]) {
        let hash = Self::hash_of(points);
        if let Some(&idx) = self.first.get(&hash) {
            if self.paths[idx] == points
                || self
                    .overflow
                    .iter()
                    .any(|&(h, j)| h == hash && self.paths[j] == points)
            {
                return;
            }
            self.overflow.push((hash, self.paths.len()));
        } else {
            self.first.insert(hash, self.paths.len());
        }
        self.paths.push(points.to_vec());
    }

    fn insert_vec(&mut self, points: Vec<Point>) {
        let hash = Self::hash_of(&points);
        if let Some(&idx) = self.first.get(&hash) {
            if self.paths[idx] == points
                || self
                    .overflow
                    .iter()
                    .any(|&(h, j)| h == hash && self.paths[j] == points)
            {
                return;
            }
            self.overflow.push((hash, self.paths.len()));
        } else {
            self.first.insert(hash, self.paths.len());
        }
        self.paths.push(points);
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Search {
    Simple,
    Channels,
    Ports,
}

pub(super) fn choose(
    model: &Model<'_>,
    topology: &Topology,
    edge: usize,
    shape: &Shape,
    guide: Option<&PlacedLine>,
    hint: Option<super::lanes::Hint>,
    search: Search,
) -> Vec<PlacedLine> {
    self::search(model, topology, edge, shape, guide, hint, search).collect()
}

fn port_usable(
    bounds: Rect,
    obstacles: &super::clearance::Clearance,
    port: &super::ports::Port,
) -> bool {
    contains(
        bounds,
        Rect {
            x: port.approach.x,
            y: port.approach.y,
            width: 0.0,
            height: 0.0,
        },
    ) && obstacles.clear(&[port.attachment, port.approach])
}

/// Check candidates on demand, preserving the pool order and its limits.
pub(super) fn search<'a>(
    model: &'a Model<'_>,
    topology: &'a Topology,
    edge: usize,
    shape: &'a Shape,
    guide: Option<&PlacedLine>,
    hint: Option<super::lanes::Hint>,
    search: Search,
) -> impl Iterator<Item = PlacedLine> + 'a {
    let bounds = shape.scopes[&topology.routes[edge].scope].bounds;
    let (from, to) = model.ends[edge];
    let geom = (
        shape.endpoints[&from],
        shape.endpoints[&to],
        bounds,
        model.ink(edge),
    );
    let mut paths = PathSet::default();
    for path in guide_paths(guide) {
        if super::channel::basic_ok((&path, geom.3), geom.0, geom.1, geom.2) {
            paths.insert_vec(path);
        }
    }
    let obstacles = super::clearance::Clearance::new(obstacles(model, topology, edge, shape));
    let sources: Vec<_> = super::endpoint_choices::ends(model, edge, true, shape, guide, search)
        .into_iter()
        .map(|port| (port, port_usable(bounds, &obstacles, &port)))
        .collect();
    let targets: Vec<_> = super::endpoint_choices::ends(model, edge, false, shape, guide, search)
        .into_iter()
        .map(|port| (port, port_usable(bounds, &obstacles, &port)))
        .collect();
    let base = CorridorBase::new(bounds, shape, guide, hint);
    let mut scratch = CorridorScratch::default();
    let mut points = Vec::with_capacity(7);
    let usable = |port, orig, ok| {
        if port == orig {
            ok
        } else {
            port_usable(bounds, &obstacles, &port)
        }
    };
    for &(orig_tail, tail_ok) in &sources {
        for &(orig_head, head_ok) in &targets {
            for (tail, head) in
                super::endpoint_choices::aligned(model, edge, shape, orig_tail, orig_head)
            {
                let pair_ok = (
                    usable(tail, orig_tail, tail_ok),
                    usable(head, orig_head, head_ok),
                );
                add_pair(
                    geom,
                    (tail, head),
                    pair_ok,
                    (&base, &obstacles, search),
                    (&mut scratch, &mut points, &mut paths),
                );
            }
        }
    }
    select(model, topology, edge, shape, paths.paths)
}

fn add_pair(
    geom: (Rect, Rect, Rect, (f64, f64)),
    (tail, head): (super::ports::Port, super::ports::Port),
    (t_ok, h_ok): (bool, bool),
    (base, obstacles, search): (&CorridorBase, &super::clearance::Clearance, Search),
    state: (&mut CorridorScratch, &mut Vec<Point>, &mut PathSet),
) {
    if !t_ok || !h_ok {
        // A bend approach can extend past the opposite wall of a straight span.
        let span = [tail.attachment, head.attachment];
        if (span[0].x == span[1].x || span[0].y == span[1].y)
            && super::channel::basic_ok((&span, geom.3), geom.0, geom.1, geom.2)
            && obstacles.clear(&span)
        {
            state.2.insert_slice(&span);
        }
        return;
    }
    connect(geom, (tail, head), (base, obstacles, search), state);
}

type RankEntry = std::cmp::Reverse<((bool, u64, u64), usize)>;

struct SelectIter<'a> {
    model: &'a Model<'a>,
    edge: usize,
    shape: &'a Shape,
    paths: Vec<Vec<Point>>,
    heap: std::collections::BinaryHeap<RankEntry>,
    beside: Vec<usize>,
    beside_at: usize,
    pool: Pool,
    slots: OnceCell<super::route_labels::Slots<'a>>,
    probe: super::channel::Probe<'a, 'a>,
    has_label: bool,
    remaining: usize,
}

impl SelectIter<'_> {
    fn try_primary(&mut self, at: usize) -> Option<PlacedLine> {
        let points = &self.paths[at];
        if self.probe.refusal_checked(points).is_some() {
            return None;
        }
        let label = if self.has_label {
            let slots = self
                .slots
                .get_or_init(|| super::route_labels::Slots::new(self.model, self.shape));
            let Some((label, _)) = slots.slot(self.model, self.edge, points) else {
                self.beside.push(at);
                return None;
            };
            Some(label)
        } else {
            None
        };
        self.pool.keep(self.model, self.edge, points, label)
    }

    fn try_beside(&mut self, at: usize) -> Option<PlacedLine> {
        let points = &self.paths[at];
        let slots = self
            .slots
            .get_or_init(|| super::route_labels::Slots::new(self.model, self.shape));
        let label = Some(slots.beside(self.model, self.edge, points)?.0);
        self.pool.keep(self.model, self.edge, points, label)
    }
}

impl Iterator for SelectIter<'_> {
    type Item = PlacedLine;

    fn next(&mut self) -> Option<PlacedLine> {
        if self.remaining == 0 {
            return None;
        }
        while let Some(std::cmp::Reverse((_, at))) = self.heap.pop() {
            if let Some(line) = self.try_primary(at) {
                self.remaining -= 1;
                return Some(line);
            }
        }
        while self.beside_at < self.beside.len() {
            let at = self.beside[self.beside_at];
            self.beside_at += 1;
            if let Some(line) = self.try_beside(at) {
                self.remaining -= 1;
                return Some(line);
            }
        }
        None
    }
}

fn select<'a>(
    model: &'a Model<'_>,
    topology: &'a Topology,
    edge: usize,
    shape: &'a Shape,
    paths: Vec<Vec<Point>>,
) -> impl Iterator<Item = PlacedLine> + 'a {
    let bounds = shape.scopes[&topology.routes[edge].scope].bounds;
    let ink_bounds = page_bounds(shape);
    let mut ranker = RouteRanker::new(model, shape, edge, ink_bounds);
    // O(N) heapify preserves exact stable rank order lazily without sorting unconsumed candidates.
    let ranked: Vec<RankEntry> = paths
        .iter()
        .enumerate()
        .map(|(at, path)| std::cmp::Reverse((ranker.rank(path), at)))
        .collect();
    let limit = if model.edges.len() > 64 { 64 } else { 128 };
    SelectIter {
        model,
        edge,
        shape,
        paths,
        heap: std::collections::BinaryHeap::from(ranked),
        beside: Vec::new(),
        beside_at: 0,
        pool: Pool::default(),
        slots: OnceCell::new(),
        probe: super::channel::Probe::new(model, topology, edge, shape, bounds),
        has_label: model.edges[edge].label().is_some(),
        remaining: limit,
    }
}

#[derive(Default)]
struct Pool {
    homes: FxHashSet<(u64, u64, u64, u64, u64, u64)>,
    /// How many candidates each family keeps: the routes whose longest run shares one line,
    /// and that leave their source and target walls the same ways. A route that leaves
    /// another wall keeps its own place, so ports that later fail together do not crowd out
    /// a route from another wall.
    families: FxHashMap<([Side; 2], bool, u64), usize>,
}
impl Pool {
    /// Keep a route that the guard passed, with its words, unless the pool holds its place.
    fn keep(
        &mut self,
        model: &Model<'_>,
        edge: usize,
        points: &[Point],
        label: Option<Rect>,
    ) -> Option<PlacedLine> {
        let longest = points
            .windows(2)
            .max_by(|a, b| length(a).total_cmp(&length(b)))
            .expect("a nonempty candidate route");
        let at = label.map_or_else(
            || Point {
                x: f64::midpoint(longest[0].x, longest[1].x),
                y: f64::midpoint(longest[0].y, longest[1].y),
            },
            center,
        );
        if !self.homes.insert((
            at.x.to_bits(),
            at.y.to_bits(),
            points[0].x.to_bits(),
            points[0].y.to_bits(),
            points
                .last()
                .expect("a nonempty candidate route")
                .x
                .to_bits(),
            points
                .last()
                .expect("a nonempty candidate route")
                .y
                .to_bits(),
        )) {
            return None;
        }
        let horizontal = longest[0].y == longest[1].y;
        let family = (
            walls(points),
            horizontal,
            (if horizontal {
                longest[0].y
            } else {
                longest[0].x
            })
            .to_bits(),
        );
        let members = self.families.entry(family).or_default();
        if *members >= 8 {
            return None;
        }
        *members += 1;
        Some(PlacedLine {
            id: model.edges[edge].id.clone(),
            points: points.to_vec(),
            label,
        })
    }
}

/// The way a line leaves a wall: right, left, down or up the page.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum Side {
    Right,
    Left,
    Down,
    Up,
}

fn side(at: Point, next: Point) -> Side {
    if next.x > at.x {
        Side::Right
    } else if next.x < at.x {
        Side::Left
    } else if next.y > at.y {
        Side::Down
    } else {
        Side::Up
    }
}

/// The ways a route leaves its source wall and its target wall.
fn walls(points: &[Point]) -> [Side; 2] {
    let last = points.len() - 1;
    [
        side(points[0], points[1]),
        side(points[last], points[last - 1]),
    ]
}

fn obstacles(model: &Model<'_>, topology: &Topology, edge: usize, shape: &Shape) -> Vec<Rect> {
    let (from, to) = model.ends[edge];
    let mut obstacles: Vec<_> = shape
        .endpoints
        .keys()
        .map(|&id| shape.clearance(((from, to), model.half(edge)), model.endpoints[id].foot, id))
        .collect();
    obstacles.extend(
        shape
            .labels
            .iter()
            .filter(|(id, _)| **id != edge)
            .map(|(_, &r)| inflate(r, 12.01 + model.half(edge))),
    );
    obstacles.extend(
        shape
            .drawing
            .regions
            .iter()
            .map(|r| inflate(r.caption, 16.0)),
    );
    let foreign: Vec<_> = shape
        .scopes
        .iter()
        .filter(|(id, _)| super::channel::foreign(model, topology, edge, **id))
        .map(|(_, s)| inflate(s.bounds, 16.0))
        .collect();
    obstacles.retain(|r| !foreign.iter().any(|&outer| contains(outer, *r)));
    obstacles.extend(
        foreign
            .iter()
            .enumerate()
            .filter(|&(i, r)| {
                !foreign
                    .iter()
                    .enumerate()
                    .any(|(j, outer)| i != j && contains(*outer, *r) && (outer != r || j < i))
            })
            .map(|(_, r)| *r),
    );
    obstacles
}

fn guide_paths(guide: Option<&PlacedLine>) -> Vec<Vec<Point>> {
    let mut paths = Vec::new();
    let Some(guide) = guide else {
        return paths;
    };
    let guide_points = normalized_guide(&guide.points);
    let guide_points = clean(guide_points);
    paths.push(guide_points.clone());
    for i in 1..guide_points.len().saturating_sub(2) {
        let horizontal = guide_points[i].y == guide_points[i + 1].y;
        for offset in [-48.0, -32.0, -16.0, 16.0, 32.0, 48.0] {
            paths.push(shifted(&guide_points, i, horizontal, offset));
        }
    }
    paths
}

fn normalized_guide(points: &[Point]) -> Vec<Point> {
    let mut guide_points: Vec<Point> = Vec::new();
    for &point in points {
        let mut point = point;
        if let Some(last) = guide_points.last() {
            if (point.x - last.x).abs() < 1e-6 {
                point.x = last.x;
            }
            if (point.y - last.y).abs() < 1e-6 {
                point.y = last.y;
            }
        }
        guide_points.push(point);
    }
    guide_points
}

fn connect(
    (source, target, bounds, ink): (Rect, Rect, Rect, (f64, f64)),
    (tail, head): (super::ports::Port, super::ports::Port),
    (base, obstacles, search): (&CorridorBase, &super::clearance::Clearance, Search),
    (scratch, points, paths): (&mut CorridorScratch, &mut Vec<Point>, &mut PathSet),
) {
    base.joins(
        (tail.approach, head.approach),
        obstacles,
        search == Search::Simple,
        scratch,
        |middle| {
            super::geometry::clean_with_ends(tail.attachment, middle, head.attachment, points);
            if super::channel::basic_ok((points, ink), source, target, bounds) {
                paths.insert_slice(points);
            }
        },
    );
}

fn shifted(guide: &[Point], index: usize, horizontal: bool, offset: f64) -> Vec<Point> {
    let mut points = guide.to_vec();
    for p in &mut points[index..=index + 1] {
        if horizontal {
            p.y += offset;
        } else {
            p.x += offset;
        }
    }
    clean(points)
}

#[cfg(test)]
mod tests;
