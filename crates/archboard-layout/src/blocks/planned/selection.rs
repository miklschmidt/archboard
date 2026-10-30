//! Resolve corridor conflicts without revisiting independent route choices.
use super::{fixed::route_cost, model::Model, shape::Shape, topology::Topology};
use crate::blocks::assembly::PlacedLine;

pub(super) fn greedy(
    model: &Model<'_>,
    topology: &Topology,
    base: &Shape,
    paths: &[Vec<PlacedLine>],
) -> Result<Vec<PlacedLine>, Vec<usize>> {
    let mut failed = Vec::new();
    let mut windows = base.fallbacks;
    for variant in [1, 0, 2, 3] {
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
    paths[edge]
        .iter()
        .find_map(|line| append(model, topology, shape, line))
        .map(|chosen| {
            shorten(model, topology, shape, paths, edge, repairs, &chosen).unwrap_or(chosen)
        })
        .or_else(|| fan_join(model, topology, shape, &paths[edge], edge))
        .or_else(|| dynamic(model, topology, shape, edge, super::fixed::Search::Channels))
        .or_else(|| repair(model, topology, shape, paths, edge, repairs))
        .or_else(|| hierarchy(model, topology, shape, edge, windows))
        .or_else(|| dynamic(model, topology, shape, edge, super::fixed::Search::Ports))
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
    let (from, to) = model.ends[edge];
    let reciprocal = model.outgoing[to]
        .iter()
        .any(|&other| model.ends[other].1 == from);
    if paths.len() > super::REFINEMENT_LIMIT || !reciprocal {
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
    let repaired = repair(model, topology, shape, &shorter, edge, repairs)?;
    let total = |s: &Shape| {
        s.routes
            .iter()
            .map(|line| route_cost(&line.points))
            .sum::<f64>()
    };
    (total(&repaired) < total(chosen)).then_some(repaired)
}

fn dynamic(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    edge: usize,
    search: super::fixed::Search,
) -> Option<Shape> {
    super::choices::search(model, topology, edge, shape, None, None, search)
        .find_map(|line| append(model, topology, shape, &line))
}
fn repair(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    paths: &[Vec<PlacedLine>],
    edge: usize,
    repairs: &mut usize,
) -> Option<Shape> {
    if *repairs >= 8 {
        return None;
    }
    *repairs += 1;
    super::repair::reconsider(model, topology, shape, paths, edge)
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
    super::hierarchy::candidates(model, topology, edge, &corridors)
        .iter()
        .find_map(|line| append(model, topology, shape, line))
        .or_else(|| bounded(model, topology, shape, edge, windows))
}
fn bounded(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    edge: usize,
    windows: &mut usize,
) -> Option<Shape> {
    if *windows >= 4 {
        return None;
    }
    let (lines, used) =
        super::hierarchy::bounded_candidates(model, topology, edge, shape, 4 - *windows);
    *windows += used;
    lines
        .iter()
        .find_map(|line| append(model, topology, shape, line))
        .or_else(|| {
            if *windows >= 4 {
                return None;
            }
            let line = super::direct::route(model, topology, edge, shape, windows)?;
            append(model, topology, shape, &line)
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
    let corridors = shape.without_labels();
    joined.sort_by(|a, b| route_cost(a).total_cmp(&route_cost(b)));
    joined.dedup();
    let probe = super::channel::Probe::new(
        model,
        topology,
        edge,
        &corridors,
        corridors.scopes[&topology.routes[edge].scope].bounds,
    );
    joined
        .into_iter()
        .filter(|points| probe.refusal(points).is_none())
        .find_map(|points| {
            append(
                model,
                topology,
                shape,
                &PlacedLine {
                    id: model.edges[edge].id.clone(),
                    points,
                    label: None,
                },
            )
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
pub(super) fn append(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    line: &PlacedLine,
) -> Option<Shape> {
    let edge = model.edge_index[line.id.as_str()];
    if shape
        .routes
        .iter()
        .any(|old| super::port_spacing::conflicts(model, edge, &line.points, old))
    {
        let corridors = shape.without_labels();
        let probe = super::channel::Probe::new(
            model,
            topology,
            edge,
            &corridors,
            corridors.scopes[&topology.routes[edge].scope].bounds,
        );
        return super::port_spacing::alternatives(model, shape, line)
            .iter()
            .find_map(|candidate| {
                probe
                    .refusal(&candidate.points)
                    .is_none()
                    .then(|| append_guarded(model, shape, candidate))
                    .flatten()
            });
    }
    append_reserved(model, topology, shape, line)
}

fn append_reserved(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    line: &PlacedLine,
) -> Option<Shape> {
    let edge = model.edge_index[line.id.as_str()];
    debug_assert!(
        shape
            .routes
            .iter()
            .all(|old| !super::port_spacing::conflicts(model, edge, &line.points, old))
    );
    if !shape
        .routes
        .iter()
        .all(|old| super::channel::shared_junction(model, topology, edge, &line.points, old))
    {
        return None;
    }
    append_guarded(model, shape, line)
}

fn append_guarded(model: &Model<'_>, shape: &Shape, line: &PlacedLine) -> Option<Shape> {
    let mut next = shape.without_labels();
    next.routes.push(line.clone());
    if !super::runs::accepts(model, &shape.routes, line) {
        return None;
    }
    super::route_labels::arrange(model, &mut next)?;
    Some(next)
}
