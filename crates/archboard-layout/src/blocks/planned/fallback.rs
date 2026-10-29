//! A difficult local join uses bounded search around the complete obstacle set.

use super::{model::Model, shape::Shape};
use crate::geometry::{Point, Rect, inflate};

/// Immediate child cells cover all their cards and labels. The search stays in this scope.
pub(super) fn local(
    model: &Model<'_>,
    edge: usize,
    shape: &Shape,
    scope: usize,
    start: Point,
    end: Point,
) -> Option<Vec<Point>> {
    let point = |p: Point| router::Point { x: p.x, y: p.y };
    let rect = |r: Rect| router::Rect {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
    };
    let obstacles = obstacles(model, shape, scope);
    let connector = |a: Point, b: Point, subjects| router::Connector {
        ends: (
            router::End::Free { at: point(a) },
            router::End::Free { at: point(b) },
        ),
        subjects,
    };
    let subjects = |other: usize| {
        let treatment = model
            .treatments
            .iter()
            .position(|treatment| *treatment == model.treatments[other])
            .expect("a relationship treatment");
        (
            Some(model.ends[other].0 * model.edges.len() + treatment),
            Some(model.ends[other].1 * model.edges.len() + treatment),
        )
    };
    let scene = router::Scene {
        obstacles: obstacles.into_iter().map(rect).collect(),
        minimum: None,
        connectors: vec![connector(start, end, subjects(edge))],
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
            let other = *model.edge_index.get(line.id.as_str())?;
            Some((
                connector(*line.points.first()?, *line.points.last()?, subjects(other)),
                line.points.iter().copied().map(point).collect(),
            ))
        })
        .collect();
    let bounds = shape.scopes[&scope].bounds;
    let inside = |p: Point| {
        p.x >= bounds.x
            && p.x <= bounds.x + bounds.width
            && p.y >= bounds.y
            && p.y <= bounds.y + bounds.height
    };
    let window = if inside(start) && inside(end) {
        bounds
    } else {
        inflate(bounds, 16.0)
    };
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
        router::Route::Routed(path) => {
            Some(path.into_iter().map(|p| Point { x: p.x, y: p.y }).collect())
        }
        router::Route::Unroutable => None,
    }
}
use archboard_router as router;

fn obstacles(model: &Model<'_>, shape: &Shape, scope: usize) -> Vec<Rect> {
    let mut obstacles: Vec<_> = model.scopes[scope]
        .children
        .iter()
        .map(|child| match child {
            super::model::Child::Endpoint(id) => shape.endpoints[id],
            super::model::Child::Scope(id) => shape.scopes[id].bounds,
        })
        .map(|r| inflate(r, 16.0))
        .collect();
    if let Some(header) = model.scopes[scope].header {
        obstacles.push(inflate(shape.endpoints[&header], 16.0));
        obstacles.extend(
            shape
                .labels
                .iter()
                .filter(|(e, _)| model.ends[**e].0 == header)
                .map(|(_, r)| inflate(*r, 4.0)),
        );
    }
    if let Some(group) = model.scopes[scope].group {
        obstacles.extend(
            shape
                .drawing
                .regions
                .iter()
                .filter(|r| r.group == group)
                .map(|r| inflate(r.caption, 16.0)),
        );
    }
    obstacles
}
