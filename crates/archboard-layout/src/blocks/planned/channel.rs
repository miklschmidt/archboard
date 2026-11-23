//! Peer-facing wall candidates and local channel templates. No grid search.

use rustc_hash::FxHashMap;
use std::{cell::RefCell, rc::Rc};

use crate::blocks::assembly::PlacedLine;
use crate::constants::{APPROACH_STRAIGHT, BEND_RADIUS, ECHELON, STRAIGHT_RUN};
use crate::geometry::{Point, Rect, inflate};

use super::geometry::{contains, intersection, length, meets_itself};
use super::model::Model;
use super::ports::{center, port};
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
pub(super) struct GeometryCache(RefCell<FxHashMap<usize, Rc<FixedGeometry>>>);

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

/// The guard borrows one immutable candidate set and indexes its fixed obstacles.
pub(super) struct Probe<'a, 'g> {
    model: &'a Model<'g>,
    topology: &'a Topology,
    index: usize,
    shape: &'a Shape,
    bounds: Rect,
    fixed: Rc<FixedGeometry>,
    /// Whether the guard keeps the line off the words of the shape and on its own words.
    words: bool,
    labels: super::clearance::Clearance,
    junctions: Option<Vec<Junction<'a>>>,
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
        let fixed = Rc::clone(
            shape
                .channel_geometry
                .0
                .borrow_mut()
                .entry(index)
                .or_insert_with(|| {
                    Rc::new(FixedGeometry::of(
                        model,
                        topology,
                        (index, model.half(index)),
                        shape,
                    ))
                }),
        );
        let labels = super::clearance::Clearance::new(
            (shape.labels.iter())
                .filter(|(id, _)| words && **id != index)
                .map(|(_, &r)| inflate(r, 12.01 + model.half(index)))
                .collect(),
        );
        Self {
            model,
            topology,
            index,
            shape,
            bounds,
            fixed,
            words,
            labels,
            junctions: shape
                .routes
                .iter()
                .filter(|line| line.id != model.edges[index].id)
                .map(|line| Junction::new(model, topology, index, line).map(Junction::indexed))
                .collect(),
            blocker: std::cell::Cell::new(0),
        }
    }
    pub(super) fn refusal(&self, points: &[Point]) -> Option<&'static str> {
        let (model, topology, index, shape) = (self.model, self.topology, self.index, self.shape);
        let (from, to) = model.ends[index];
        if let Some(reason) = basic(
            (points, model.girth[index]),
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
        let first = self.blocker.get();
        let refuses = |pair: &Junction<'_>| !pair.clear(points, bounds);
        if pairs.get(first).is_some_and(refuses) {
            return Some("junction");
        }
        if let Some(at) =
            (pairs.iter().enumerate()).position(|(at, pair)| at != first && refuses(pair))
        {
            self.blocker.set(at);
            return Some("junction");
        }
        if !self.fixed.cards.clear(points) {
            return Some("card");
        }
        if !self.labels.clear(points) {
            return Some("label");
        }
        if !self.fixed.captions.clear(points) {
            return Some("caption");
        }
        if hugs_wall(shape, points, model.half(index)) {
            return Some("wall lane");
        }
        if !self.fixed.foreign.clear(points) {
            return Some("foreign scope");
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
    /// How much further the two lines' ink reaches between them than two lone lines'.
    spread: f64,
    bounds: super::junctions::Envelope,
    /// The envelope of each run of the line, when a guard compares it with many candidates.
    runs: Vec<super::junctions::Envelope>,
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
            spread: model.half(index) + model.half(other),
            bounds: super::junctions::Envelope::new(&line.points),
            runs: Vec::new(),
            shared: topology.memberships[index]
                .iter()
                .flatten()
                .any(|fan| topology.memberships[other].contains(&Some(*fan))),
            ends: [source, target],
            arrows: [source && (two_way(index) || two_way(other)), target],
        })
    }
    fn clear(&self, points: &[Point], bounds: super::junctions::Envelope) -> bool {
        bounds.apart_by(self.bounds, self.spread)
            || ((!self.shared
                || super::junctions::sharing(
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
                && if self.runs.is_empty() {
                    super::junctions::ordered(points, &self.line.points, (self.shared, self.spread))
                } else {
                    super::junctions::ordered_runs(
                        points,
                        &self.line.points,
                        (self.bounds, &self.runs),
                        (self.shared, self.spread),
                    )
                })
    }
    /// The junction with its line's runs indexed, for a guard that compares many candidates.
    fn indexed(self) -> Self {
        Self {
            runs: super::junctions::runs(&self.line.points),
            ..self
        }
    }
}
/// The junctions of one line's candidates with every placed route, each route indexed once.
pub(super) struct Junctions<'a> {
    /// The junction with each placed route, if the route is a line of the model.
    pairs: Vec<Option<Junction<'a>>>,
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
                .map(|line| Junction::new(model, topology, index, line).map(Junction::indexed))
                .collect(),
            blocker: std::cell::Cell::new(0),
        }
    }
    /// Whether a candidate keeps `shared_junction` with every placed route.
    pub(super) fn clear(&self, points: &[Point]) -> bool {
        let bounds = super::junctions::Envelope::new(points);
        let first = self.blocker.get();
        let refuses = |at: usize| !self.shares(at, points, bounds);
        if first < self.pairs.len() && refuses(first) {
            return false;
        }
        if let Some(at) = (0..self.pairs.len()).position(|at| at != first && refuses(at)) {
            self.blocker.set(at);
            return false;
        }
        true
    }
    /// `shared_junction` of a candidate, whose envelope is `bounds`, with the placed route at
    /// `at`.
    pub(super) fn shares(
        &self,
        at: usize,
        points: &[Point],
        bounds: super::junctions::Envelope,
    ) -> bool {
        self.pairs[at]
            .as_ref()
            .is_some_and(|pair| pair.clear(points, bounds))
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
    let spread = model.half(index)
        + (model.edge_index.get(line.id.as_str())).map_or(0.0, |&other| model.half(other));
    if bounds.apart_by(super::junctions::Envelope::new(&line.points), spread) {
        return model.edge_index.contains_key(line.id.as_str());
    }
    Junction::new(model, topology, index, line).is_some_and(|pair| pair.clear(points, bounds))
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

/// Rounded corners must leave the complete arrow approach after painting, on the inner strand
/// of a cable too, which turns `half` sooner, and with room for the marks its strands set back
/// in echelon. A line with no bend needs only the room its marks take.
pub(super) fn approaches(points: &[Point], half: f64) -> bool {
    let echelon = if half > 0.0 { ECHELON } else { 0.0 };
    let required = if points.len() > 2 {
        APPROACH_STRAIGHT + BEND_RADIUS + half + echelon
    } else {
        STRAIGHT_RUN + 2.0 * echelon
    };
    length(&points[..2]) >= required && length(&points[points.len() - 2..]) >= required
}

/// Whether a cable as wide as `girth` keeps every strand the right way round: between two bends
/// that turn the same way, the inner strand's run is shorter by the girth, and still holds both
/// rounded corners.
fn turns_clear(points: &[Point], girth: f64) -> bool {
    let turn = |at: usize| {
        let (a, b, c) = (points[at - 1], points[at], points[at + 1]);
        ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)).signum()
    };
    girth == 0.0
        || (1..points.len().saturating_sub(2)).all(|at| {
            turn(at) != turn(at + 1) || length(&points[at..at + 2]) >= girth + 2.0 * BEND_RADIUS
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
    let target = center(shape.endpoints[&model.ends[index].1]);
    model.endpoints[model.ends[index].0]
        .walls
        .into_iter()
        .filter_map(|side| port(model, index, true, side, shape, target))
        .map(|port| vec![port.attachment, port.approach])
        .collect()
}

pub(super) fn attached(at: Point, next: Point, bounds: Rect) -> bool {
    let near = |a: f64, b: f64| (a - b).abs() < 0.1;
    if at.x == next.x {
        at.x >= bounds.x
            && at.x <= bounds.x + bounds.width
            && (near(at.y, bounds.y) && next.y < at.y
                || near(at.y, bounds.y + bounds.height) && next.y > at.y)
    } else if at.y == next.y {
        at.y >= bounds.y
            && at.y <= bounds.y + bounds.height
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
                hi.min(end) - lo.max(start) > 16.0
                    && walls
                        .iter()
                        .any(|wall| (at - wall).abs() < 16.0 + half - 1e-6)
            })
        })
}

fn basic(
    (points, girth): (&[Point], f64),
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
    if points.len() < 2 || !approaches(points, girth / 2.0) || !turns_clear(points, girth) {
        return Some("approach");
    }
    if meets_itself(points) {
        return Some("loop");
    }
    if !attached(points[0], points[1], source)
        || !attached(points[points.len() - 1], points[points.len() - 2], target)
    {
        return Some("attachment wall");
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
