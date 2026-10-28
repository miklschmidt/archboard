//! Conservative emission for adjacent unlabelled chains.

use crate::blocks::assembly::PlacedLine;
use crate::geometry::Point;

use super::model::{Child, Model};
use super::shape::Shape;

/// Only an authored adjacent chain can use a straight channel at this checkpoint.
pub(super) fn eligible(model: &Model<'_>) -> bool {
    if model.scopes.len() != 1
        || model
            .edges
            .iter()
            .any(|edge| edge.label_count() > 0 || edge.option(crate::graph::FROM_POINTS).is_some())
    {
        return false;
    }
    let children = &model.scopes[0].children;
    let pairs: Vec<_> = children
        .windows(2)
        .filter_map(|pair| match pair {
            [Child::Endpoint(from), Child::Endpoint(to)] => Some((*from, *to)),
            _ => None,
        })
        .collect();
    model.ends.iter().all(|ends| pairs.contains(ends))
        && model
            .ends
            .iter()
            .enumerate()
            .all(|(index, ends)| !model.ends[..index].contains(ends))
}

/// Ports, straight approaches, and capacity are fixed before any route is emitted.
pub(super) fn emit(model: &Model<'_>, shape: &mut Shape) -> bool {
    let mut lines = Vec::new();
    for (edge, &(from, to)) in model.ends.iter().enumerate() {
        let source = shape.endpoints[&from];
        let target = shape.endpoints[&to];
        let start = Point {
            x: source.x + source.width / 2.0,
            y: source.y + source.height,
        };
        let end = Point {
            x: target.x + target.width / 2.0,
            y: target.y,
        };
        if start.x != end.x || end.y - start.y < super::shape::CLEAR {
            return false;
        }
        lines.push(PlacedLine {
            id: model.edges[edge].id.clone(),
            points: vec![start, end],
            label: None,
        });
    }
    shape.drawing.edges = lines;
    true
}
