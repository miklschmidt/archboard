//! Resolve corridor conflicts without revisiting independent route choices.
use std::cell::OnceCell;

use super::{
    channel::{Junctions, Probe},
    fixed::route_cost,
    model::Model,
    port_spacing::Peer,
    route_labels::{Seating, own::words_clear},
    shape::Shape,
    topology::Topology,
};
use crate::blocks::assembly::PlacedLine;

/// The route orders of `order`, the longest routes first.
pub(super) const ORDERS: [usize; 4] = [1, 0, 2, 3];

pub(super) fn greedy(
    model: &Model<'_>,
    topology: &Topology,
    base: &Shape,
    paths: &[Vec<PlacedLine>],
    orders: &[usize],
) -> Result<Vec<PlacedLine>, Vec<usize>> {
    let mut failed = Vec::new();
    let mut windows = base.fallbacks;
    for &variant in orders {
        match ordered(model, topology, base, paths, variant, &mut windows) {
            Ok(shape) => {
                return Ok(
                    improve(model, topology, base, paths, variant, shape, &mut windows).routes,
                );
            }
            Err(edge) => failed.push(edge),
        }
    }
    Err(failed)
}

fn ordered(
    model: &Model<'_>,
    topology: &Topology,
    base: &Shape,
    paths: &[Vec<PlacedLine>],
    variant: usize,
    windows: &mut usize,
) -> Result<Shape, usize> {
    let mut repairs = 0;
    order(model, topology, base, paths, variant)
        .into_iter()
        .try_fold(base.clone(), |shape, edge| {
            next(model, topology, &shape, paths, edge, &mut repairs, windows).ok_or(edge)
        })
}

fn improve(
    model: &Model<'_>,
    topology: &Topology,
    base: &Shape,
    paths: &[Vec<PlacedLine>],
    variant: usize,
    chosen: Shape,
    windows: &mut usize,
) -> Shape {
    // Compare the existing route orders when a small view has a detour or a crowded approach.
    if variant != 1 || paths.len() > super::REFINEMENT_LIMIT {
        return chosen;
    }
    let score = quality(&chosen.routes, paths, model);
    if score.0 == 0 && score.1 == 0 {
        return chosen;
    }
    let mut best = chosen;
    let mut score = score;
    for variant in [2, 0, 3] {
        if variant != 2 && score.0 == 0 {
            break;
        }
        if let Ok(next) = ordered(model, topology, base, paths, variant, windows) {
            let next_score = quality(&next.routes, paths, model);
            if next_score < score {
                best = next;
                score = next_score;
            }
        }
    }
    best
}

fn quality(
    lines: &[PlacedLine],
    paths: &[Vec<PlacedLine>],
    model: &Model<'_>,
) -> (usize, usize, u64) {
    let mut detours = 0;
    for line in lines {
        let shortest = paths[model.edge_index[line.id.as_str()]]
            .iter()
            .map(|line| super::geometry::length(&line.points))
            .fold(f64::INFINITY, f64::min);
        let length = super::geometry::length(&line.points);
        detours += usize::from(length > shortest * 1.5 && length > shortest + 120.0);
    }
    let (approaches, cost) = super::reading::rank(lines);
    (approaches, detours, cost)
}

fn order(
    model: &Model<'_>,
    topology: &Topology,
    base: &Shape,
    paths: &[Vec<PlacedLine>],
    variant: usize,
) -> Vec<usize> {
    let mut order: Vec<_> = (0..paths.len()).collect();
    order.sort_by(|&a, &b| {
        let crossings =
            |e: usize| topology.routes[e].outward.len() + topology.routes[e].inward.len();
        let distance = |e: usize| {
            super::geometry::length(&[
                super::ports::center(base.endpoints[&model.ends[e].0]),
                super::ports::center(base.endpoints[&model.ends[e].1]),
            ])
        };
        match variant {
            0 => crossings(b)
                .cmp(&crossings(a))
                .then(paths[a].len().cmp(&paths[b].len()))
                .then(a.cmp(&b)),
            1 => distance(b).total_cmp(&distance(a)).then(a.cmp(&b)),
            2 => distance(a).total_cmp(&distance(b)).then(a.cmp(&b)),
            _ => paths[a]
                .len()
                .cmp(&paths[b].len())
                .then(distance(b).total_cmp(&distance(a)))
                .then(a.cmp(&b)),
        }
    });
    order
}
fn next(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    paths: &[Vec<PlacedLine>],
    edge: usize,
    repairs: &mut usize,
    windows: &mut usize,
) -> Option<Shape> {
    bus(model, topology, edge)
        .then(|| fan_join(model, topology, shape, &paths[edge], edge))
        .flatten()
        .or_else(|| {
            first_fit(&Fit::new(model, topology, shape, edge), &paths[edge]).map(|chosen| {
                shorten(model, topology, shape, paths, edge, repairs, &chosen).unwrap_or(chosen)
            })
        })
        .or_else(|| fan_join(model, topology, shape, &paths[edge], edge))
        .or_else(|| dynamic(model, topology, shape, edge, super::fixed::Search::Channels))
        // Repair follows a first fit that found no route of the pool.
        .or_else(|| repair(model, topology, shape, paths, edge, repairs, true))
        .or_else(|| hierarchy(model, topology, shape, edge, windows))
        .or_else(|| dynamic(model, topology, shape, edge, super::fixed::Search::Ports))
}
/// The first route that fits, or a later one when that first one stands words on their own line.
fn first_fit(fit: &Fit<'_, '_>, lines: &[PlacedLine]) -> Option<Shape> {
    let model = fit.model;
    let mut fits = lines.iter().filter_map(|line| fit.append(line));
    let first = fits.next()?;
    if words_clear(model, &first) {
        return Some(first);
    }
    Some(
        fits.find(|later| words_clear(model, later))
            .unwrap_or(first),
    )
}

/// How many unworded lines of one kind to one end make a bus (rule 5).
const BUS_LINES: usize = 3;

/// Whether a line belongs to a bus, whose lines join one trunk before any other route.
fn bus(model: &Model<'_>, topology: &Topology, edge: usize) -> bool {
    model.edges[edge].label().is_none()
        && topology.memberships[edge].iter().flatten().any(|&fan| {
            let members = &topology.fans[fan].members;
            members.len() >= BUS_LINES && members.iter().all(|&m| model.edges[m].label().is_none())
        })
}

fn shorten(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    paths: &[Vec<PlacedLine>],
    edge: usize,
    repairs: &mut usize,
    chosen: &Shape,
) -> Option<Shape> {
    if paths.len() > super::REFINEMENT_LIMIT {
        return None;
    }
    let length = |line: &PlacedLine| super::geometry::length(&line.points);
    let shortest = paths[edge].iter().map(length).fold(f64::INFINITY, f64::min);
    let picked = length(chosen.routes.last()?);
    if picked <= shortest * 1.5 || picked <= shortest + 300.0 {
        return None;
    }
    let mut shorter = paths.to_vec();
    shorter[edge].retain(|line| length(line) < picked - 300.0);
    let repaired = repair(model, topology, shape, &shorter, edge, repairs, false)?;
    let total = |s: &Shape| {
        s.routes
            .iter()
            .map(|line| route_cost(&line.points))
            .sum::<f64>()
    };
    let clear = words_clear(model, &repaired) || !words_clear(model, chosen);
    (clear && total(&repaired) < total(chosen)).then_some(repaired)
}

fn dynamic(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    edge: usize,
    search: super::fixed::Search,
) -> Option<Shape> {
    let fit = Fit::new(model, topology, shape, edge);
    super::choices::search(model, topology, edge, shape, None, None, search)
        .find_map(|line| fit.append(&line))
}
fn repair(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    paths: &[Vec<PlacedLine>],
    edge: usize,
    repairs: &mut usize,
    blocked: bool,
) -> Option<Shape> {
    if *repairs >= 8 {
        return None;
    }
    *repairs += 1;
    super::repair::reconsider(model, topology, shape, paths, edge, blocked)
}
fn hierarchy(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    edge: usize,
    windows: &mut usize,
) -> Option<Shape> {
    let mut corridors = shape.without_labels();
    for line in &mut corridors.routes {
        line.label = None;
    }
    let fit = Fit::new(model, topology, shape, edge);
    super::hierarchy::candidates(model, topology, edge, &corridors)
        .iter()
        .find_map(|line| fit.append(line))
        .or_else(|| bounded(&fit, windows))
}
fn bounded(fit: &Fit<'_, '_>, windows: &mut usize) -> Option<Shape> {
    if *windows >= 4 {
        return None;
    }
    let (model, topology, shape, edge) = (fit.model, fit.topology, fit.shape, fit.edge);
    let (lines, used) =
        super::hierarchy::bounded_candidates(model, topology, edge, shape, 4 - *windows);
    *windows += used;
    lines.iter().find_map(|line| fit.append(line)).or_else(|| {
        if *windows >= 4 {
            return None;
        }
        let line = super::direct::route(model, topology, edge, shape, windows)?;
        fit.append(&line)
    })
}
fn directed(mut points: Vec<crate::geometry::Point>, forward: bool) -> Vec<crate::geometry::Point> {
    if !forward {
        points.reverse();
    }
    points
}
fn fan_join(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    paths: &[PlacedLine],
    edge: usize,
) -> Option<Shape> {
    let branches = [true, false].map(|forward| {
        paths
            .iter()
            .take(32)
            .map(|line| directed(line.points.clone(), forward))
            .collect::<Vec<_>>()
    });
    let mut seen = rustc_hash::FxHashSet::default();
    let mut joined = Vec::new();
    for old in shape
        .routes
        .iter()
        .filter(|old| model.treatments[model.edge_index[old.id.as_str()]] == model.treatments[edge])
    {
        let other = model.edge_index[old.id.as_str()];
        for source in [true, false]
            .into_iter()
            .filter(|&source| same_end(model, edge, other, source))
        {
            let trunk = directed(old.points.clone(), source);
            for branch in &branches[usize::from(!source)] {
                joined.extend(
                    splices(&trunk, branch)
                        .into_iter()
                        .map(|points| super::geometry::clean(directed(points, source)))
                        .filter(|points| {
                            seen.insert(
                                points
                                    .iter()
                                    .map(|p| [p.x.to_bits(), p.y.to_bits()])
                                    .collect::<Vec<_>>(),
                            )
                        }),
                );
            }
        }
    }
    joined.sort_by(|a, b| route_cost(a).total_cmp(&route_cost(b)));
    joined.dedup();
    let fit = Fit::new(model, topology, shape, edge);
    joined
        .into_iter()
        .filter(|points| fit.probe().refusal(points).is_none())
        .find_map(|points| {
            fit.append(&PlacedLine {
                id: model.edges[edge].id.clone(),
                points,
                label: None,
            })
        })
}
fn same_end(model: &Model<'_>, one: usize, other: usize, source: bool) -> bool {
    if source {
        model.ends[one].0 == model.ends[other].0
    } else {
        model.ends[one].1 == model.ends[other].1
    }
}
fn splices(
    trunk: &[crate::geometry::Point],
    branch: &[crate::geometry::Point],
) -> Vec<Vec<crate::geometry::Point>> {
    let mut joined = Vec::new();
    for (i, p) in trunk.windows(2).enumerate() {
        for (j, q) in branch.windows(2).enumerate() {
            if let Some(at) = crossing(p, q) {
                let mut points = trunk[..=i].to_vec();
                points.push(at);
                points.extend_from_slice(&branch[j + 1..]);
                joined.push(points);
            }
        }
    }
    joined
}
fn crossing(
    p: &[crate::geometry::Point],
    q: &[crate::geometry::Point],
) -> Option<crate::geometry::Point> {
    let ph = p[0].y == p[1].y;
    let qh = q[0].y == q[1].y;
    if ph == qh {
        return None;
    }
    let (h, v) = if ph { (p, q) } else { (q, p) };
    let at = crate::geometry::Point {
        x: v[0].x,
        y: h[0].y,
    };
    (at.x >= h[0].x.min(h[1].x)
        && at.x <= h[0].x.max(h[1].x)
        && at.y >= v[0].y.min(v[1].y)
        && at.y <= v[0].y.max(v[1].y))
    .then_some(at)
}

/// The guards of one shape for the candidate routes of one line. Every candidate of the line
/// meets the same placed routes, so each guard indexes them once, when a candidate first needs it.
pub(super) struct Fit<'a, 'g> {
    pub(super) model: &'a Model<'g>,
    pub(super) topology: &'a Topology,
    pub(super) shape: &'a Shape,
    pub(super) edge: usize,
    /// The placed routes that end on one subject with an end of the line.
    peers: OnceCell<Vec<Peer<'a>>>,
    /// The guard of the shape's corridors, without its words, which a fit places again.
    probe: OnceCell<Probe<'a, 'g>>,
    junctions: OnceCell<Junctions<'a>>,
    /// The words of the placed routes, which find room beside a candidate before it is copied.
    words: OnceCell<Option<Seating<'a>>>,
}
impl<'a, 'g> Fit<'a, 'g> {
    pub(super) fn new(
        model: &'a Model<'g>,
        topology: &'a Topology,
        shape: &'a Shape,
        edge: usize,
    ) -> Self {
        Self {
            model,
            topology,
            shape,
            edge,
            peers: OnceCell::new(),
            probe: OnceCell::new(),
            junctions: OnceCell::new(),
            words: OnceCell::new(),
        }
    }

    pub(super) fn probe(&self) -> &Probe<'a, 'g> {
        self.probe.get_or_init(|| {
            let bounds = self.shape.scopes[&self.topology.routes[self.edge].scope].bounds;
            Probe::bare(self.model, self.topology, self.edge, self.shape, bounds)
        })
    }

    /// The shape with one more route of the line, and its words placed again, if every guard
    /// passes. A route whose ends stand too close to a peer's slides them apart first.
    pub(super) fn append(&self, line: &PlacedLine) -> Option<Shape> {
        let (model, shape, edge) = (self.model, self.shape, self.edge);
        debug_assert_eq!(model.edge_index[line.id.as_str()], edge);
        let peers =
            (self.peers).get_or_init(|| super::port_spacing::peers(model, &shape.routes, edge));
        if peers.iter().any(|peer| peer.conflicts(&line.points)) {
            let alternatives = super::port_spacing::alternatives(model, shape, line, peers);
            if alternatives.is_empty() {
                return None;
            }
            let probe = self.probe();
            return alternatives.iter().find_map(|candidate| {
                probe
                    .refusal(&candidate.points)
                    .is_none()
                    .then(|| self.guarded(candidate))
                    .flatten()
            });
        }
        let junctions = (self.junctions)
            .get_or_init(|| Junctions::new(model, self.topology, edge, &shape.routes));
        if !junctions.clear(&line.points) {
            return None;
        }
        self.guarded(line)
    }

    /// The shape with one more route and its words arranged again, as `route_labels::arrange`
    /// arranges them. Most routes leave some line's words no room, so that test runs first, on
    /// the placed routes as they stand.
    fn guarded(&self, line: &PlacedLine) -> Option<Shape> {
        let (model, shape, edge) = (self.model, self.shape, self.edge);
        if !super::runs::accepts(model, &shape.routes, line) {
            return None;
        }
        let seating = (self.words)
            .get_or_init(|| Seating::new(model, shape))
            .as_ref()?;
        let strokes = seating.admit(model, edge, line)?;
        let mut next = shape.without_labels();
        next.routes.push(line.clone());
        let indices: Vec<_> = seating.indices().chain([edge]).collect();
        super::route_labels::seated(model, &mut next, &indices, &strokes)?;
        Some(next)
    }
}
