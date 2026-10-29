//! Candidate channels between fixed endpoint ports.
use super::{
    fixed::{page_bounds, route_rank},
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
    let mut paths = guide_paths(guide);
    let obstacles = super::clearance::Clearance::new(obstacles(model, topology, edge, shape));
    let usable = |port: &super::ports::Port| {
        contains(
            bounds,
            Rect {
                x: port.approach.x,
                y: port.approach.y,
                width: 0.0,
                height: 0.0,
            },
        ) && obstacles.clear(&[port.attachment, port.approach])
    };
    let sources: Vec<_> = super::endpoint_choices::ends(model, edge, true, shape, guide, search)
        .into_iter()
        .filter(usable)
        .collect();
    let targets: Vec<_> = super::endpoint_choices::ends(model, edge, false, shape, guide, search)
        .into_iter()
        .filter(usable)
        .collect();
    for tail in sources {
        for &head in &targets {
            let pairs = super::endpoint_choices::aligned(model, edge, shape, tail, head);
            for (tail, head) in pairs {
                paths.extend(connect(
                    model,
                    edge,
                    shape,
                    (tail, head),
                    (bounds, guide, hint),
                    &obstacles,
                    search,
                ));
            }
        }
    }
    select(model, topology, edge, shape, paths)
}

fn select<'a>(
    model: &'a Model<'_>,
    topology: &'a Topology,
    edge: usize,
    shape: &'a Shape,
    mut paths: Vec<Vec<Point>>,
) -> impl Iterator<Item = PlacedLine> + 'a {
    let bounds = shape.scopes[&topology.routes[edge].scope].bounds;
    let ink_bounds = page_bounds(shape);
    paths.sort_by_cached_key(|path| route_rank(model, ink_bounds, path));
    paths.dedup();
    let mut pool = Pool::default();
    let slots = super::route_labels::Slots::new(model, shape);
    let probe = super::channel::Probe::new(model, topology, edge, shape, bounds);
    let limit = if model.edges.len() > 64 { 64 } else { 128 };
    paths
        .into_iter()
        .filter_map(move |points| pool.keep(model, edge, &slots, &probe, points))
        .take(limit)
}

#[derive(Default)]
struct Pool {
    homes: std::collections::BTreeSet<(u64, u64, u64, u64, u64, u64)>,
    families: std::collections::BTreeMap<(bool, u64), usize>,
}
impl Pool {
    fn keep(
        &mut self,
        model: &Model<'_>,
        edge: usize,
        slots: &super::route_labels::Slots<'_>,
        probe: &super::channel::Probe<'_, '_>,
        points: Vec<Point>,
    ) -> Option<PlacedLine> {
        if probe.refusal(&points).is_some() {
            return None;
        }
        let label = label_for(model, edge, &points, slots).ok()?;
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
            points,
            label,
        })
    }
}

fn obstacles(model: &Model<'_>, topology: &Topology, edge: usize, shape: &Shape) -> Vec<Rect> {
    let (from, to) = model.ends[edge];
    let route = &topology.routes[edge];
    let mut obstacles: Vec<_> = shape
        .endpoints
        .iter()
        .map(|(&id, &r)| {
            if id == from || id == to {
                r
            } else {
                inflate(r, 16.0)
            }
        })
        .collect();
    obstacles.extend(
        shape
            .labels
            .iter()
            .filter(|(id, _)| **id != edge)
            .map(|(_, &r)| inflate(r, 12.01)),
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
        .filter(|(id, _)| {
            !route.outward.contains(id)
                && !route.inward.contains(id)
                && !super::channel::ancestor(model, route.scope, **id)
        })
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
    model: &Model<'_>,
    edge: usize,
    shape: &Shape,
    pair: (super::ports::Port, super::ports::Port),
    guidance: (Rect, Option<&PlacedLine>, Option<super::lanes::Hint>),
    obstacles: &super::clearance::Clearance,
    search: Search,
) -> Vec<Vec<Point>> {
    let (tail, head) = pair;
    let (bounds, guide, hint) = guidance;
    let (from, to) = model.ends[edge];
    let a = shape.endpoints[&from];
    let b = shape.endpoints[&to];
    let mut paths = Vec::new();
    for middle in super::corridors::joins(
        tail.approach,
        head.approach,
        bounds,
        shape,
        (guide, hint),
        obstacles,
        search == Search::Simple,
    ) {
        let points = clean(
            std::iter::once(tail.attachment)
                .chain(middle)
                .chain([head.attachment])
                .collect(),
        );
        if points.len() >= 2
            && super::channel::approaches(&points)
            && super::channel::attached(points[0], points[1], a)
            && super::channel::attached(points[points.len() - 1], points[points.len() - 2], b)
        {
            paths.push(points);
        }
    }
    paths
}

fn label_for(
    model: &Model<'_>,
    edge: usize,
    points: &[Point],
    slots: &super::route_labels::Slots<'_>,
) -> Result<Option<Rect>, ()> {
    if model.edges[edge].label().is_none() {
        return Ok(None);
    }
    slots
        .slot(model, edge, points)
        .map(|(label, _)| Some(label))
        .ok_or(())
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
