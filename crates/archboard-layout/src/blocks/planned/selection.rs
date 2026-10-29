//! Resolve corridor conflicts without revisiting independent route choices.
use super::{fixed::route_cost, model::Model, shape::Shape, topology::Topology};
use crate::blocks::assembly::PlacedLine;

pub(super) fn greedy(
    model: &Model<'_>,
    topology: &Topology,
    base: &Shape,
    paths: &[Vec<PlacedLine>],
) -> Result<Vec<PlacedLine>, usize> {
    let mut failed = None;
    let mut windows = base.fallbacks;
    for variant in [1, 0, 2, 3] {
        let mut repairs = 0;
        let result = order(model, topology, base, paths, variant)
            .into_iter()
            .try_fold(base.clone(), |shape, edge| {
                next(
                    model,
                    topology,
                    &shape,
                    paths,
                    edge,
                    &mut repairs,
                    &mut windows,
                )
                .ok_or(edge)
            });
        match result {
            Ok(shape) => return Ok(shape.routes),
            Err(edge) => failed = Some(edge),
        }
    }
    Err(failed.expect("an unfinished route"))
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
        .or_else(|| fan_join(model, topology, shape, &paths[edge], edge))
        .or_else(|| dynamic(model, topology, shape, edge, super::fixed::Search::Channels))
        .or_else(|| repair(model, topology, shape, paths, edge, repairs))
        .or_else(|| hierarchy(model, topology, shape, edge, windows))
        .or_else(|| dynamic(model, topology, shape, edge, super::fixed::Search::Ports))
}
fn dynamic(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    edge: usize,
    search: super::fixed::Search,
) -> Option<Shape> {
    super::fixed::choose(model, topology, edge, shape, None, None, search)
        .iter()
        .find_map(|line| append(model, topology, shape, line))
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
    let mut corridors = shape.clone();
    corridors.labels.clear();
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
fn directed(points: &[crate::geometry::Point], forward: bool) -> Vec<crate::geometry::Point> {
    let mut points = points.to_vec();
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
            let trunk = directed(&old.points, source);
            for path in paths.iter().take(32) {
                joined.extend(
                    splices(&trunk, &directed(&path.points, source))
                        .into_iter()
                        .map(|points| super::geometry::clean(directed(&points, source))),
                );
            }
        }
    }
    let mut seen = rustc_hash::FxHashSet::default();
    let mut corridors = shape.clone();
    corridors.labels.clear();
    joined.retain(|points| {
        seen.insert(
            points
                .iter()
                .map(|p| [p.x.to_bits(), p.y.to_bits()])
                .collect::<Vec<_>>(),
        ) && super::fixed::feasible(model, topology, edge, &corridors, points)
    });
    joined.sort_by(|a, b| route_cost(a).total_cmp(&route_cost(b)));
    joined.dedup();
    joined.into_iter().find_map(|points| {
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
    if !shape
        .routes
        .iter()
        .all(|old| super::channel::shared_junction(model, topology, edge, &line.points, old))
    {
        return None;
    }
    let mut next = shape.clone();
    next.routes.push(line.clone());
    if !super::runs::accepts(model, &shape.routes, line) {
        return None;
    }
    super::route_labels::arrange(model, &mut next)?;
    Some(next)
}
