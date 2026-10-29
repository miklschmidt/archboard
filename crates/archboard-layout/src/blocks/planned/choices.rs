//! Candidate channels between fixed endpoint ports.
use super::{
    fixed::{page_bounds, page_cost, route_cost},
    geometry::{clean, contains, crosses_box, length},
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
    let bounds = shape.scopes[&topology.routes[edge].scope].bounds;
    let mut paths = guide_paths(guide);
    let obstacles = obstacles(model, topology, edge, shape);
    let usable = |port: &super::ports::Port| {
        contains(
            bounds,
            Rect {
                x: port.approach.x,
                y: port.approach.y,
                width: 0.0,
                height: 0.0,
            },
        ) && !obstacles
            .iter()
            .any(|&r| crosses_box(&[port.attachment, port.approach], r))
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

fn select(
    model: &Model<'_>,
    topology: &Topology,
    edge: usize,
    shape: &Shape,
    mut paths: Vec<Vec<Point>>,
) -> Vec<PlacedLine> {
    let bounds = shape.scopes[&topology.routes[edge].scope].bounds;
    let ink_bounds = page_bounds(shape);
    paths.sort_by_cached_key(|path| {
        (
            page_cost(ink_bounds, path).to_bits(),
            route_cost(path).to_bits(),
        )
    });
    paths.dedup();
    let mut pool = Pool::default();
    let limit = if model.edges.len() > 64 { 64 } else { 128 };
    paths
        .into_iter()
        .filter_map(|points| pool.keep(model, topology, edge, shape, bounds, points))
        .take(limit)
        .collect()
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
        topology: &Topology,
        edge: usize,
        shape: &Shape,
        bounds: Rect,
        points: Vec<Point>,
    ) -> Option<PlacedLine> {
        if super::channel::refusal(model, topology, edge, shape, &points, bounds).is_some() {
            return None;
        }
        let label = label_for(model, edge, shape, &points).ok()?;
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
    obstacles: &[Rect],
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
    shape: &Shape,
    points: &[Point],
) -> Result<Option<Rect>, ()> {
    if model.edges[edge].label().is_none() {
        return Ok(None);
    }
    super::route_labels::slot(model, edge, shape, points)
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
