//! Peer-facing wall candidates and local channel templates. No grid search.

use rustc_hash::FxHashMap;
use std::{cell::RefCell, rc::Rc};

use crate::blocks::assembly::PlacedLine;
use crate::constants::{BEND_RADIUS, STRAIGHT_RUN, STRAND, approach_of, fans_at_bend};
use crate::geometry::{Point, Rect, inflate};

use super::geometry::{contains, intersection, length, meets_itself};
use super::model::Model;
use super::ports::port;
use super::shape::{LINE_CLEAR, Shape};
use super::topology::Topology;

/// The option a line carries when it draws an arrowhead at both ends.
pub(super) const TWO_WAY: &str = "archboard.relationship.two-way";

pub(super) fn feasible(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    shape: &Shape,
    points: &[Point],
    bounds: Rect,
) -> bool {
    Probe::new(model, topology, index, shape, bounds)
        .refusal(points)
        .is_none()
}

/// Every route candidate of one edge uses the same fixed obstacles.
#[derive(Default)]
pub(super) struct GeometryCache(RefCell<FxHashMap<(usize, bool), Rc<FixedGeometry>>>);

struct FixedGeometry {
    cards: super::clearance::Clearance,
    captions: super::clearance::Clearance,
    foreign: super::clearance::Clearance,
}

impl FixedGeometry {
    /// What the line at `index`, whose ink reaches `half` to either side, keeps clear of.
    fn of(
        model: &Model<'_>,
        topology: &Topology,
        (index, half): (usize, f64),
        shape: &Shape,
    ) -> Self {
        let cards = shape
            .endpoints
            .keys()
            .map(|&id| shape.clearance((model.ends[index], half), model.endpoints[id].foot, id))
            .collect();
        let captions = (shape.drawing.regions.iter())
            .map(|r| inflate(r.caption, 16.0 + half))
            .collect();
        let foreign = shape
            .scopes
            .iter()
            .filter(|(scope, _)| foreign(model, topology, index, **scope))
            .map(|(_, placed)| inflate(placed.bounds, LINE_CLEAR + half))
            .collect();
        Self {
            cards: super::clearance::Clearance::new(cards),
            captions: super::clearance::Clearance::new(captions),
            foreign: super::clearance::Clearance::new(foreign),
        }
    }
}

/// The obstacles a piece of one width must clear.
struct Obstacles {
    fixed: Rc<FixedGeometry>,
    labels: super::clearance::Clearance,
    half: f64,
}

impl Obstacles {
    fn refusal(&self, points: &[Point]) -> Option<&'static str> {
        if !self.fixed.cards.clear(points) {
            return Some("card");
        }
        if !self.labels.clear(points) {
            return Some("label");
        }
        if !self.fixed.captions.clear(points) {
            return Some("caption");
        }
        if !self.fixed.foreign.clear(points) {
            return Some("foreign scope");
        }
        None
    }
}

/// The guard borrows one immutable candidate set and indexes its fixed obstacles.
pub(super) struct Probe<'a, 'g> {
    model: &'a Model<'g>,
    topology: &'a Topology,
    index: usize,
    shape: &'a Shape,
    bounds: Rect,
    body: Obstacles,
    fan: Option<Obstacles>,
    /// Whether the guard keeps the line off the words of the shape and on its own words.
    words: bool,
    junctions: Option<Vec<Junction<'a>>>,
    /// Scratch buffer holding the current candidate's inked pieces, populated lazily once per
    /// candidate across all junction and fan obstacle checks.
    pieces: RefCell<Vec<super::junctions::Piece>>,
    /// The line that refused the last candidate. Candidates of one search share their ends,
    /// so it most likely refuses the next one too, and it is tested first.
    blocker: std::cell::Cell<usize>,
}
impl<'a, 'g> Probe<'a, 'g> {
    pub(super) fn new(
        model: &'a Model<'g>,
        topology: &'a Topology,
        index: usize,
        shape: &'a Shape,
        bounds: Rect,
    ) -> Self {
        Self::guarding(model, topology, (index, shape, bounds), true)
    }
    /// The guard of the shape's corridors alone, as if the shape had no words yet.
    pub(super) fn bare(
        model: &'a Model<'g>,
        topology: &'a Topology,
        index: usize,
        shape: &'a Shape,
        bounds: Rect,
    ) -> Self {
        Self::guarding(model, topology, (index, shape, bounds), false)
    }
    fn guarding(
        model: &'a Model<'g>,
        topology: &'a Topology,
        (index, shape, bounds): (usize, &'a Shape, Rect),
        words: bool,
    ) -> Self {
        let obstacles = |fan, half| Obstacles {
            fixed: Rc::clone(
                shape
                    .channel_geometry
                    .0
                    .borrow_mut()
                    .entry((index, fan))
                    .or_insert_with(|| {
                        Rc::new(FixedGeometry::of(model, topology, (index, half), shape))
                    }),
            ),
            labels: super::clearance::Clearance::new(
                shape
                    .labels
                    .iter()
                    .filter(|(id, _)| words && **id != index)
                    .map(|(_, &r)| inflate(r, 12.01 + half))
                    .collect(),
            ),
            half,
        };
        let (half, reach) = model.ink(index);
        Self {
            model,
            topology,
            index,
            shape,
            bounds,
            body: obstacles(false, half),
            fan: (reach > half).then(|| obstacles(true, reach)),
            words,
            junctions: shape
                .routes
                .iter()
                .filter(|line| line.id != model.edges[index].id)
                .map(|line| Junction::new(model, topology, index, line))
                .collect(),
            pieces: RefCell::new(Vec::new()),
            blocker: std::cell::Cell::new(0),
        }
    }
    pub(super) fn refusal(&self, points: &[Point]) -> Option<&'static str> {
        let (model, topology, index, shape) = (self.model, self.topology, self.index, self.shape);
        let (from, to) = model.ends[index];
        if let Some(reason) = basic(
            (points, model.ink(index)),
            shape.endpoints[&from],
            shape.endpoints[&to],
            self.bounds,
        ) {
            return Some(reason);
        }
        if (self.words.then(|| shape.labels.get(&index)).flatten())
            .is_some_and(|&label| !label_run(points, label))
        {
            return Some("label run");
        }
        // Most candidates fall here, so test them before the box indexes.
        let bounds = super::junctions::Envelope::new(points);
        let Some(pairs) = self.junctions.as_ref() else {
            return Some("junction");
        };
        let mut pieces = self.pieces.borrow_mut();
        pieces.clear();
        let first = self.blocker.get();
        if pairs
            .get(first)
            .is_some_and(|pair| !pair.clear(points, bounds, &mut pieces))
        {
            return Some("junction");
        }
        if let Some(at) = (pairs.iter().enumerate())
            .position(|(at, pair)| at != first && !pair.clear(points, bounds, &mut pieces))
        {
            self.blocker.set(at);
            return Some("junction");
        }
        let refusal = if let Some(fan) = &self.fan {
            if pieces.is_empty() {
                super::junctions::pieces_into(points, model.ink(index), &mut pieces);
            }
            pieces.iter().find_map(|piece| {
                let obstacles = if piece.ink() > self.body.half {
                    fan
                } else {
                    &self.body
                };
                let ends = piece.ends();
                obstacles.refusal(&ends).or_else(|| {
                    (piece.ink() > self.body.half && hugs_wall(shape, &ends, piece.ink()))
                        .then_some("wall lane")
                })
            })
        } else {
            self.body.refusal(points)
        };
        if refusal.is_some() {
            return refusal;
        }
        if hugs_wall(shape, points, self.body.half) {
            return Some("wall lane");
        }
        if !super::portals::follows(&topology.routes[index], shape, points) {
            return Some("portal");
        }
        None
    }
}

pub(super) fn ancestor(model: &Model<'_>, mut inner: usize, outer: usize) -> bool {
    loop {
        if inner == outer {
            return true;
        }
        let Some(parent) = model.scopes[inner].parent else {
            return false;
        };
        inner = parent;
    }
}

/// The final polyline must retain both padded label pins after normalization.
pub(super) fn label_run(points: &[Point], label: Rect) -> bool {
    let y = label.y + label.height / 2.0;
    points.windows(2).any(|pair| {
        (pair[0].y - y).abs() < 1e-6
            && (pair[1].y - y).abs() < 1e-6
            && pair[0].x.min(pair[1].x) <= label.x - 16.0
            && pair[0].x.max(pair[1].x) >= label.x + label.width + 16.0
            || (pair[0].x - label.x - label.width / 2.0).abs() < 1e-6
                && (pair[1].x - label.x - label.width / 2.0).abs() < 1e-6
                && pair[0].y.min(pair[1].y) <= label.y - 16.0
                && pair[0].y.max(pair[1].y) >= label.y + label.height + 16.0
    })
}

struct Junction<'a> {
    line: &'a PlacedLine,
    /// How far a candidate's ink reaches along its body and at its cards (`Model::ink`).
    ours: (f64, f64),
    /// The line's straight pieces, each with its ink (`junctions::pieces`).
    theirs: Vec<super::junctions::Piece>,
    /// How much further than two lone lines' the two lines' ink reaches between them at the most.
    most: f64,
    bounds: super::junctions::Envelope,
    shared: bool,
    /// Whether the two share their source, and their target.
    ends: [bool; 2],
    /// Whether the two share their source and either draws an arrowhead there, and whether
    /// they share their target.
    arrows: [bool; 2],
}
impl<'a> Junction<'a> {
    fn new(
        model: &Model<'_>,
        topology: &Topology,
        index: usize,
        line: &'a PlacedLine,
    ) -> Option<Self> {
        let &other = model.edge_index.get(line.id.as_str())?;
        let source = model.ends[index].0 == model.ends[other].0;
        let target = model.ends[index].1 == model.ends[other].1;
        let two_way = |edge: usize| model.edges[edge].option(TWO_WAY).is_some();
        Some(Self {
            line,
            ours: model.ink(index),
            theirs: super::junctions::pieces(&line.points, model.ink(other)),
            most: model.reach(index) + model.reach(other),
            bounds: super::junctions::Envelope::new(&line.points),
            shared: topology.memberships[index]
                .iter()
                .flatten()
                .any(|fan| topology.memberships[other].contains(&Some(*fan))),
            ends: [source, target],
            arrows: [source && (two_way(index) || two_way(other)), target],
        })
    }
    fn clear(
        &self,
        points: &[Point],
        bounds: super::junctions::Envelope,
        ours_pieces: &mut Vec<super::junctions::Piece>,
    ) -> bool {
        if bounds.apart_by(self.bounds, self.most) {
            return true;
        }
        if self.shared
            && !(super::junctions::sharing(
                points,
                &self.line.points,
                self.ends[0],
                self.ends[1],
            ) && super::junctions::readable(
                points,
                &self.line.points,
                self.arrows[0],
                self.arrows[1],
            ))
        {
            return false;
        }
        if ours_pieces.is_empty() {
            super::junctions::pieces_into(points, self.ours, ours_pieces);
        }
        super::junctions::ordered_pieces(ours_pieces, (self.bounds, &self.theirs), self.shared)
    }
}
/// The junctions of one line's candidates with every placed route, each route indexed once.
pub(super) struct Junctions<'a> {
    /// The junction with each placed route, if the route is a line of the model.
    pairs: Vec<Option<Junction<'a>>>,
    /// Scratch buffer holding the current candidate's inked pieces.
    pieces: RefCell<Vec<super::junctions::Piece>>,
    /// The route that refused the last candidate, tested first.
    blocker: std::cell::Cell<usize>,
}
impl<'a> Junctions<'a> {
    pub(super) fn new(
        model: &Model<'_>,
        topology: &Topology,
        index: usize,
        routes: &'a [PlacedLine],
    ) -> Self {
        Self {
            pairs: (routes.iter())
                .map(|line| Junction::new(model, topology, index, line))
                .collect(),
            pieces: RefCell::new(Vec::new()),
            blocker: std::cell::Cell::new(0),
        }
    }
    /// Whether a candidate keeps `shared_junction` with every placed route.
    pub(super) fn clear(&self, points: &[Point]) -> bool {
        let bounds = super::junctions::Envelope::new(points);
        let mut pieces = self.pieces.borrow_mut();
        pieces.clear();
        let first = self.blocker.get();
        if first < self.pairs.len() && !self.shares_with(first, points, bounds, &mut pieces) {
            return false;
        }
        if let Some(at) = (0..self.pairs.len())
            .position(|at| at != first && !self.shares_with(at, points, bounds, &mut pieces))
        {
            self.blocker.set(at);
            return false;
        }
        true
    }
    /// `shared_junction` of a candidate, whose envelope is `bounds`, with the placed route at
    /// `at`, reusing `ours_pieces` across routes of the same candidate.
    pub(super) fn shares_with(
        &self,
        at: usize,
        points: &[Point],
        bounds: super::junctions::Envelope,
        ours_pieces: &mut Vec<super::junctions::Piece>,
    ) -> bool {
        self.pairs[at]
            .as_ref()
            .is_some_and(|pair| pair.clear(points, bounds, ours_pieces))
    }
}

pub(super) fn shared_junction(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    points: &[Point],
    line: &PlacedLine,
) -> bool {
    let bounds = super::junctions::Envelope::new(points);
    // A line far from this one clears it whatever their fans and ends.
    let spread = model.reach(index)
        + (model.edge_index.get(line.id.as_str())).map_or(0.0, |&other| model.reach(other));
    if bounds.apart_by(super::junctions::Envelope::new(&line.points), spread) {
        return model.edge_index.contains_key(line.id.as_str());
    }
    let mut pieces = Vec::new();
    Junction::new(model, topology, index, line)
        .is_some_and(|pair| pair.clear(points, bounds, &mut pieces))
}

pub(super) fn shared_fragment(
    model: &Model<'_>,
    edge: usize,
    points: &[Point],
    line: &PlacedLine,
) -> bool {
    if !intersection(points, &line.points).0 {
        return true;
    }
    let Some(&other) = model.edge_index.get(line.id.as_str()) else {
        return false;
    };
    model.treatments[edge] == model.treatments[other]
        && (model.ends[edge].0 == model.ends[other].0 || model.ends[edge].1 == model.ends[other].1)
}

/// How many times its direct way a route may run, past the long detour's length: a
/// ring round the page is refused, and placement makes room for the direct way instead.
const DETOUR_LIMIT: f64 = 2.5;

/// How far a cable stands its strands out on each side of a run's end bends: its fan on a first
/// or last run that fans out whole (`constants::fans_at_bend`), its body elsewhere, where an end run
/// steps its strands out only at its apron.
fn out_of(run: usize, runs: usize, (half, reach): (f64, f64), [first, last]: [bool; 2]) -> f64 {
    if (run == 0 && first) || (run + 1 == runs && last) {
        reach
    } else {
        half
    }
}

/// Rounded corners must leave the complete arrow approach after painting (`approach_of`), on
/// the inner strand of a cable too, which turns as much sooner as the run before the last stands
/// its strands out (`out_of`). A line with no bend needs only the room its marks take.
pub(super) fn approaches(points: &[Point], ink: (f64, f64)) -> bool {
    let runs = points.len().saturating_sub(1);
    if runs <= 1 {
        return points.len() < 2 || length(points) >= STRAIGHT_RUN;
    }
    let spread = fans_at_bend(points, ink);
    length(&points[..2]) >= approach_of(out_of(1, runs, ink, spread))
        && length(&points[runs - 1..]) >= approach_of(out_of(runs - 2, runs, ink, spread))
}

/// Whether a cable keeps every strand the right way round: between two bends that turn the same
/// way, the inner strand's run is shorter by how far the runs on either side stand their strands
/// out (`out_of`), and still holds both rounded corners with a straight between them as long as
/// the strands stand apart along the body. Corners that met with no straight between them would
/// turn the inner strand in one S, unlike the strands beside it. Between opposite turns, the
/// offsets shorten one side by their difference, so that strand must still run forward.
fn turns_clear(points: &[Point], ink: (f64, f64)) -> bool {
    let turn = |at: usize| {
        let (a, b, c) = (points[at - 1], points[at], points[at + 1]);
        ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)).signum()
    };
    let runs = points.len() - 1;
    let spread = fans_at_bend(points, ink);
    ink.0 == 0.0
        || (1..runs.saturating_sub(1)).all(|at| {
            let before = out_of(at - 1, runs, ink, spread);
            let after = out_of(at + 1, runs, ink, spread);
            let run = length(&points[at..at + 2]);
            if turn(at) == turn(at + 1) {
                run >= before + after + 2.0 * BEND_RADIUS + STRAND
            } else {
                run > (before - after).abs()
            }
        })
}

/// Whether a line keeps off a scope: it crosses no wall of it and ends on no frame of it.
pub(super) fn foreign(model: &Model<'_>, topology: &Topology, edge: usize, scope: usize) -> bool {
    let route = &topology.routes[edge];
    let (from, to) = model.ends[edge];
    let frame = model.scopes[scope].header;
    !route.outward.contains(&scope)
        && !route.inward.contains(&scope)
        && !ancestor(model, route.scope, scope)
        && frame != Some(from)
        && frame != Some(to)
}

/// Source approaches depend on the endpoint geometry.
pub(super) fn tails(model: &Model<'_>, index: usize, shape: &Shape) -> Vec<Vec<Point>> {
    model.endpoints[model.ends[index].0]
        .walls
        .into_iter()
        .filter_map(|side| port(model, index, true, side, shape))
        .map(|port| vec![port.attachment, port.approach])
        .collect()
}

pub(super) fn attached(at: Point, next: Point, bounds: Rect) -> bool {
    attached_by(at, next, bounds, 0.0)
}

/// `attached` for a line whose ink reaches `half` to either side: a cable's every strand ends on
/// the wall, so its middle stands half its width in from each end of the wall.
fn attached_by(at: Point, next: Point, bounds: Rect, half: f64) -> bool {
    let near = |a: f64, b: f64| (a - b).abs() < 0.1;
    if at.x == next.x {
        at.x >= bounds.x + half
            && at.x <= bounds.x + bounds.width - half
            && (near(at.y, bounds.y) && next.y < at.y
                || near(at.y, bounds.y + bounds.height) && next.y > at.y)
    } else if at.y == next.y {
        at.y >= bounds.y + half
            && at.y <= bounds.y + bounds.height - half
            && (near(at.x, bounds.x) && next.x < at.x
                || near(at.x, bounds.x + bounds.width) && next.x > at.x)
    } else {
        false
    }
}

fn hugs_wall(shape: &Shape, points: &[Point], half: f64) -> bool {
    shape
        .scopes
        .iter()
        .filter(|(id, _)| **id != 0)
        .any(|(_, scope)| {
            let r = scope.bounds;
            points.windows(2).any(|p| {
                let vertical = p[0].x == p[1].x;
                let (at, lo, hi, start, end, walls) = if vertical {
                    (
                        p[0].x,
                        p[0].y.min(p[1].y),
                        p[0].y.max(p[1].y),
                        r.y,
                        r.y + r.height,
                        [r.x, r.x + r.width],
                    )
                } else {
                    (
                        p[0].y,
                        p[0].x.min(p[1].x),
                        p[0].x.max(p[1].x),
                        r.x,
                        r.x + r.width,
                        [r.y, r.y + r.height],
                    )
                };
                let overlap = hi.min(end) - lo.max(start);
                walls.iter().any(|wall| {
                    let gap = (at - wall).abs();
                    // Even a short overlap can put outer strands on the wrong side of the wall.
                    (overlap > 16.0 && gap < 16.0 + half - 1e-6)
                        || (overlap > 0.0 && half > 0.0 && gap <= half)
                })
            })
        })
}

fn basic(
    (points, ink): (&[Point], (f64, f64)),
    source: Rect,
    target: Rect,
    bounds: Rect,
) -> Option<&'static str> {
    if points
        .windows(2)
        .any(|p| p[0].x != p[1].x && p[0].y != p[1].y)
    {
        return Some("slanted");
    }
    if points.len() < 2 || !approaches(points, ink) || !turns_clear(points, ink) {
        return Some("approach");
    }
    if meets_itself(points) {
        return Some("loop");
    }
    let (_, reach) = ink;
    if !attached_by(points[0], points[1], source, reach)
        || !attached_by(
            points[points.len() - 1],
            points[points.len() - 2],
            target,
            reach,
        )
    {
        return Some("attachment wall");
    }
    if super::reading::runs_beyond(points, DETOUR_LIMIT) {
        return Some("detour");
    }
    if !points.iter().all(|point| {
        contains(
            bounds,
            Rect {
                x: point.x,
                y: point.y,
                width: 0.0,
                height: 0.0,
            },
        )
    }) {
        return Some("bounds");
    }
    None
}

#[cfg(test)]
mod tests;
