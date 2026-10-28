//! Final geometry is checked against the complete drawing, not a fallback window.

use super::{geometry::contains, model::Model, shape::Shape, topology::Topology};
use crate::geometry::Rect;

fn overlaps(a: Rect, b: Rect) -> bool {
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

pub(super) fn complete(model: &Model<'_>, topology: &Topology, shape: &Shape) -> bool {
    shape.drawing.edges.len() == model.edges.len()
        && shape.endpoints.len() == model.endpoints.len()
        && shape.labels.len() == topology.labels.len()
        && shape.endpoints.iter().all(|(&id, &at)| {
            contains(shape.scopes[&model.endpoints[id].scope].bounds, at)
                && shape
                    .endpoints
                    .iter()
                    .all(|(&other, &box_)| id == other || !overlaps(at, box_))
        })
        && topology
            .labels
            .iter()
            .all(|label| contains(shape.scopes[&label.scope].bounds, shape.labels[&label.edge]))
        && shape.drawing.edges.iter().all(|line| {
            let Some(edge) = model.edges.iter().position(|edge| edge.id == line.id) else {
                return false;
            };
            super::channel::feasible(
                model,
                topology,
                edge,
                shape,
                &line.points,
                shape.scopes[&topology.routes[edge].scope].bounds,
            )
        })
}
