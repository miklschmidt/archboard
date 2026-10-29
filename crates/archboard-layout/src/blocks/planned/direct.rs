//! A bounded obstacle-aware join between peer-facing endpoint approaches.
use super::{
    geometry::{clean, length},
    model::Model,
    ports::{center, port},
    shape::Shape,
    topology::Topology,
};
use crate::{
    blocks::assembly::PlacedLine,
    geometry::{Point, Rect, Side, inflate},
};
use archboard_router as router;

pub(super) fn route(
    model: &Model<'_>,
    topology: &Topology,
    edge: usize,
    shape: &Shape,
    windows: &mut usize,
) -> Option<PlacedLine> {
    let (from, to) = model.ends[edge];
    let a = center(shape.endpoints[&from]);
    let b = center(shape.endpoints[&to]);
    let mut choices = Vec::new();
    for source in [Side::Bottom, Side::Right, Side::Top, Side::Left] {
        let Some(tail) = port(model, edge, true, source, shape, b) else {
            continue;
        };
        for target in [Side::Top, Side::Left, Side::Bottom, Side::Right] {
            let Some(head) = port(model, edge, false, target, shape, a) else {
                continue;
            };
            let cost = length(&[tail.approach, head.approach])
                + length(&[a, tail.approach])
                + length(&[head.approach, b]);
            choices.push((cost, tail, head));
        }
    }
    choices.sort_by(|a, b| a.0.total_cmp(&b.0));
    for (_, tail, head) in choices.into_iter().take(4) {
        if *windows >= 4 {
            return None;
        }
        *windows += 1;
        let Some(middle) = join(model, topology, edge, shape, tail.approach, head.approach) else {
            continue;
        };
        let points = clean(
            std::iter::once(tail.attachment)
                .chain(middle)
                .chain([head.attachment])
                .collect(),
        );
        if !super::fixed::feasible(model, topology, edge, shape, &points) {
            continue;
        }
        let label = None;
        return Some(PlacedLine {
            id: model.edges[edge].id.clone(),
            points,
            label,
        });
    }
    None
}
fn join(
    model: &Model<'_>,
    topology: &Topology,
    edge: usize,
    shape: &Shape,
    a: Point,
    b: Point,
) -> Option<Vec<Point>> {
    let owner = shape.scopes[&topology.routes[edge].scope].bounds;
    let margin = 96.0;
    let x = (a.x.min(b.x) - margin).max(owner.x);
    let y = (a.y.min(b.y) - margin).max(owner.y);
    let window = Rect {
        x,
        y,
        width: (a.x.max(b.x) + margin).min(owner.x + owner.width) - x,
        height: (a.y.max(b.y) + margin).min(owner.y + owner.height) - y,
    };
    let crosses = |r: &Rect| {
        r.x <= window.x + window.width
            && r.x + r.width >= window.x
            && r.y <= window.y + window.height
            && r.y + r.height >= window.y
    };
    let boxes = obstacles(model, topology, edge, shape);
    let rect = |r: Rect| router::Rect {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
    };
    let point = |p: Point| router::Point { x: p.x, y: p.y };
    let subjects = |edge: usize| {
        let treatment = model
            .treatments
            .iter()
            .position(|one| one == &model.treatments[edge])
            .expect("a treatment");
        let (source, target) = model.ends[edge];
        (
            Some(source * model.edges.len() + treatment),
            Some(target * model.edges.len() + treatment),
        )
    };
    let connector = |a: Point, b: Point, e| router::Connector {
        ends: (
            router::End::Free { at: point(a) },
            router::End::Free { at: point(b) },
        ),
        subjects: subjects(e),
    };
    let scene = router::Scene {
        obstacles: boxes.into_iter().filter(crosses).map(rect).collect(),
        minimum: None,
        connectors: vec![connector(a, b, edge)],
        params: router::Params {
            clearance: 0.0,
            lane: 16.0,
            bend: 60.0,
            crossing: 96.0,
        },
    };
    let fixed: Vec<_> = shape
        .routes
        .iter()
        .filter_map(|line| {
            let other = model.edge_index.get(line.id.as_str()).copied()?;
            Some((
                connector(*line.points.first()?, *line.points.last()?, other),
                line.points.iter().copied().map(point).collect(),
            ))
        })
        .collect();
    match router::route_bounded(
        &scene,
        &fixed,
        rect(window),
        router::Limits {
            obstacles: 128,
            coordinates: 192,
            states: 32768,
        },
    )
    .into_iter()
    .next()?
    {
        router::Route::Routed(points) => Some(
            points
                .into_iter()
                .map(|p| Point { x: p.x, y: p.y })
                .collect(),
        ),
        router::Route::Unroutable => None,
    }
}

fn obstacles(model: &Model<'_>, topology: &Topology, edge: usize, shape: &Shape) -> Vec<Rect> {
    let mut boxes: Vec<_> = shape
        .endpoints
        .values()
        .map(|&r| inflate(r, 16.0))
        .collect();
    boxes.extend(shape.labels.values().map(|&r| inflate(r, 12.01)));
    boxes.extend(
        shape
            .drawing
            .regions
            .iter()
            .map(|r| inflate(r.caption, 16.0)),
    );
    let route = &topology.routes[edge];
    boxes.extend(
        shape
            .scopes
            .iter()
            .filter(|(id, _)| {
                !route.outward.contains(id)
                    && !route.inward.contains(id)
                    && !super::channel::ancestor(model, route.scope, **id)
            })
            .map(|(_, s)| inflate(s.bounds, 16.0)),
    );
    for line in &shape.routes {
        let other = model
            .edges
            .iter()
            .position(|e| e.id == line.id)
            .expect("a relationship");
        let shared = model.treatments[other] == model.treatments[edge]
            && (model.ends[other].0 == model.ends[edge].0
                || model.ends[other].1 == model.ends[edge].1);
        if !shared {
            for point in &line.points {
                boxes.push(Rect {
                    x: point.x - 16.0,
                    y: point.y - 16.0,
                    width: 32.0,
                    height: 32.0,
                });
            }
        }
    }
    let covered: Vec<bool> = boxes
        .iter()
        .enumerate()
        .map(|(index, &r)| {
            boxes.iter().enumerate().any(|(other, &outer)| {
                other != index
                    && super::geometry::contains(outer, r)
                    && (outer != r || other < index)
            })
        })
        .collect();
    boxes = boxes
        .into_iter()
        .enumerate()
        .filter_map(|(index, r)| (!covered[index]).then_some(r))
        .collect();
    boxes
}
