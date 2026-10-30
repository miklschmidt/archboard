//! Route a measured legacy placement without moving its cards or frames.

use super::{
    geometry::{contains, crosses_box, length},
    model::Model,
    shape::{ScopePlacement, Shape},
    topology::Topology,
};
use crate::{
    blocks::assembly::{Placed, PlacedLine},
    constants::HEADER_SLAB_INSET,
    geometry::{Point, Rect, inflate},
    graph::Node,
};

pub(super) use super::choices::{Search, choose};

pub(super) fn route(graph: &Node, drawing: Placed) -> Result<Placed, super::Refused> {
    let model = Model::new(graph)?;
    let topology = Topology::new(&model);
    debug_assert!(model.complete() && topology.complete(&model));
    let mut shape = placement(&model, drawing)?;
    let previous = std::mem::take(&mut shape.routes);
    let candidates = candidates(&model, &topology, &mut shape, &previous)?;
    shape.routes = super::selection::greedy(&model, &topology, &shape, &candidates)
        .map_err(|edges| blocked(&model, &edges))?;
    if let Some(drawing) = super::compact::drawing(&shape)
        && let Ok(mut compact) = placement(&model, drawing)
        && let Ok(drawing) = finish(&model, &topology, &mut compact)
    {
        return Ok(drawing);
    }
    finish(&model, &topology, &mut shape)
}

/// Place each label on the final runs and guard every emitted part of the drawing.
fn finish(
    model: &Model<'_>,
    topology: &Topology,
    shape: &mut Shape,
) -> Result<Placed, super::Refused> {
    super::route_labels::arrange(model, shape).ok_or("No clear private label spot")?;
    let complete = shape.routes.iter().all(|line| {
        let edge = model.edge_index[line.id.as_str()];
        feasible(model, topology, edge, shape, &line.points)
            && (line.label.is_some() == model.edges[edge].label().is_some())
    });
    if !complete || !super::port_spacing::clear(model, &shape.routes) {
        return Err("The complete hybrid drawing failed its geometry guard".into());
    }
    super::runs::freeze(model, &shape.routes)
        .map(|frozen| frozen.emit(model, (*shape.drawing).clone()))
        .ok_or_else(|| super::Refused::from("The hybrid drawing has an ambiguous fan tree"))
}

fn blocked(model: &Model<'_>, edges: &[usize]) -> super::Refused {
    let edge = *edges.last().expect("an unfinished route");
    super::Refused {
        message: format!("No clear planned channel for {}", model.edges[edge].id),
        blocked: edges
            .iter()
            .flat_map(|&edge| {
                let (from, to) = model.ends[edge];
                [from, to].map(|endpoint| model.endpoints[endpoint].node.id.clone())
            })
            .collect(),
    }
}

fn placement(model: &Model<'_>, drawing: Placed) -> Result<Shape, String> {
    let mut shape = Shape::new(drawing);
    for (index, endpoint) in model.endpoints.iter().enumerate() {
        let id = &endpoint.node.id;
        let at = if let Some(card) = shape.drawing.cards.iter().find(|card| card.id == *id) {
            card.bx
        } else {
            let frame = shape
                .drawing
                .frames
                .iter()
                .find(|frame| frame.id == *id)
                .ok_or_else(|| format!("No placed endpoint for {id}"))?;
            Rect {
                x: frame.bx.x + HEADER_SLAB_INSET,
                y: frame.bx.y + HEADER_SLAB_INSET,
                ..endpoint.bounds
            }
        };
        std::rc::Rc::make_mut(&mut shape.endpoints).insert(index, at);
    }
    for (index, scope) in model.scopes.iter().enumerate() {
        let bounds = if let Some(header) = scope.header {
            shape
                .drawing
                .frames
                .iter()
                .find(|frame| frame.id == model.endpoints[header].node.id)
                .map(|frame| frame.bx)
        } else if let Some(group) = scope.group {
            shape
                .drawing
                .regions
                .iter()
                .find(|region| {
                    region.group == group && region.parent.as_deref() == scope.semantic_parent
                })
                .map(|region| region.bx)
        } else {
            Some(Rect {
                x: 0.0,
                y: 0.0,
                width: shape.drawing.width,
                height: shape.drawing.height,
            })
        }
        .ok_or_else(|| format!("No placed scope {index}"))?;
        std::rc::Rc::make_mut(&mut shape.scopes).insert(index, ScopePlacement { bounds });
    }
    audit_endpoints(model, &shape)?;
    Ok(shape)
}

pub(super) fn feasible(
    model: &Model<'_>,
    topology: &Topology,
    edge: usize,
    shape: &Shape,
    path: &[Point],
) -> bool {
    super::channel::feasible(
        model,
        topology,
        edge,
        shape,
        path,
        shape.scopes[&topology.routes[edge].scope].bounds,
    )
}

fn overlap(a: Rect, b: Rect) -> bool {
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

pub(super) fn compatible(
    model: &Model<'_>,
    topology: &Topology,
    edge: usize,
    a: &PlacedLine,
    b: &PlacedLine,
) -> bool {
    if super::port_spacing::conflicts(model, edge, &a.points, b) {
        return false;
    }
    let bounds = |path: &[Point]| {
        let x = path.iter().map(|p| p.x).fold(f64::INFINITY, f64::min);
        let y = path.iter().map(|p| p.y).fold(f64::INFINITY, f64::min);
        Rect {
            x,
            y,
            width: path.iter().map(|p| p.x).fold(f64::NEG_INFINITY, f64::max) - x,
            height: path.iter().map(|p| p.y).fold(f64::NEG_INFINITY, f64::max) - y,
        }
    };
    if a.label
        .is_some_and(|r| crosses_box(&b.points, inflate(r, 12.01)))
        || b.label
            .is_some_and(|r| crosses_box(&a.points, inflate(r, 12.01)))
        || a.label
            .zip(b.label)
            .is_some_and(|(a, b)| overlap(inflate(a, 8.0), b))
    {
        return false;
    }
    if !overlap(
        inflate(bounds(&a.points), 1.0),
        inflate(bounds(&b.points), 1.0),
    ) {
        return true;
    }
    super::channel::shared_junction(model, topology, edge, &a.points, b)
}

pub(super) fn route_cost(path: &[Point]) -> f64 {
    length(path) + 120.0 * path.len().saturating_sub(2) as f64
}

pub(super) fn route_rank(model: &Model<'_>, bounds: Rect, path: &[Point]) -> (u64, u64) {
    let page = page_cost(bounds, path).to_bits();
    let route = route_cost(path).to_bits();
    if model.edges.len() <= super::REFINEMENT_LIMIT {
        (route, page)
    } else {
        (page, route)
    }
}

pub(super) fn page_bounds(shape: &Shape) -> Rect {
    let boxes = shape.endpoints.values().chain(
        shape
            .scopes
            .iter()
            .filter(|(id, _)| **id != 0)
            .map(|(_, scope)| &scope.bounds),
    );
    let (mut left, mut top, mut right, mut bottom) = (
        f64::INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
    );
    for r in boxes {
        left = left.min(r.x);
        top = top.min(r.y);
        right = right.max(r.x + r.width);
        bottom = bottom.max(r.y + r.height);
    }
    Rect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    }
}

pub(super) fn page_cost(bounds: Rect, path: &[Point]) -> f64 {
    let (mut left, mut top, mut right, mut bottom) = (
        bounds.x,
        bounds.y,
        bounds.x + bounds.width,
        bounds.y + bounds.height,
    );
    let original = bounds.width * bounds.height;
    for p in path {
        left = left.min(p.x);
        top = top.min(p.y);
        right = right.max(p.x);
        bottom = bottom.max(p.y);
    }
    (right - left) * (bottom - top) - original
}

fn candidates(
    model: &Model<'_>,
    topology: &Topology,
    shape: &mut Shape,
    previous: &[PlacedLine],
) -> Result<Vec<Vec<PlacedLine>>, super::Refused> {
    let hints: std::collections::BTreeMap<_, _> = (0..model.scopes.len())
        .flat_map(|scope| super::lanes::corridors(model, topology, scope, shape))
        .collect();
    let bounds = page_bounds(shape);
    let mut candidates = Vec::new();
    for edge in 0..model.edges.len() {
        let guide = previous.iter().find(|line| line.id == model.edges[edge].id);
        let mut choices = choose(
            model,
            topology,
            edge,
            shape,
            guide,
            hints.get(&edge).copied(),
            Search::Simple,
        );
        let (from, to) = model.ends[edge];
        let direct = length(&[
            super::ports::center(shape.endpoints[&from]),
            super::ports::center(shape.endpoints[&to]),
        ]);
        if choices.first().is_none_or(|line| {
            model.edges.len() <= super::REFINEMENT_LIMIT
                && length(&line.points) > direct + 300.0
                && length(&line.points) > 1.5 * direct
        }) {
            choices.extend(choose(
                model,
                topology,
                edge,
                shape,
                guide,
                hints.get(&edge).copied(),
                Search::Channels,
            ));
        }
        if choices.len() < 4 {
            choices.extend(
                super::hierarchy::candidates(model, topology, edge, shape)
                    .into_iter()
                    .map(|mut line| {
                        line.label = None;
                        line
                    }),
            );
        }
        if choices.is_empty() {
            let mut windows = shape.fallbacks;
            if let Some(line) = super::direct::route(model, topology, edge, shape, &mut windows) {
                choices.push(line);
            }
            shape.fallbacks = windows;
        }
        if choices.is_empty() {
            return Err(blocked(model, &[edge]));
        }
        choices.sort_by_cached_key(|line| route_rank(model, bounds, &line.points));
        candidates.push(choices);
    }
    Ok(candidates)
}

fn audit_endpoints(model: &Model<'_>, shape: &Shape) -> Result<(), String> {
    for (&id, &at) in shape.endpoints.iter() {
        if !contains(
            inflate(shape.scopes[&model.endpoints[id].scope].bounds, 1e-6),
            at,
        ) {
            return Err(format!(
                "Placed endpoint {} is outside scope {}",
                model.endpoints[id].node.id, model.endpoints[id].scope
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::assembly::PlacedCard;
    use serde_json::json;

    #[test]
    fn opposite_wall_ports_keep_distinct_routes_off_one_line() {
        let graph: Node = serde_json::from_value(json!({"id":"root","children":[
            {"id":"a","width":160,"height":80},
            {"id":"b","width":160,"height":80},
            {"id":"c","width":160,"height":80}],
            "edges":[{"id":"ab","sources":["b"],"targets":["a"]},
                {"id":"bc","sources":["b"],"targets":["c"]}]}))
        .unwrap();
        let drawing = Placed {
            width: 1000.0,
            height: 400.0,
            cards: ["a", "b", "c"]
                .into_iter()
                .enumerate()
                .map(|(i, id)| PlacedCard {
                    id: id.into(),
                    bx: Rect {
                        x: 100.0 + i as f64 * 300.0,
                        y: 100.0,
                        width: 160.0,
                        height: 80.0,
                    },
                    depth: 0,
                    header: None,
                })
                .collect(),
            frames: vec![],
            regions: vec![],
            edges: vec![],
            titles: vec![],
        };
        let result = route(&graph, drawing).unwrap();
        let left = &result.edges.iter().find(|e| e.id == "ab").unwrap().points;
        let right = &result.edges.iter().find(|e| e.id == "bc").unwrap().points;
        assert_eq!(left.len(), 2);
        assert_eq!(right.len(), 2);
        assert!((left[0].y - right[0].y).abs() >= 16.0);
        // Empty bands contract while the measured cards and their ports stay intact.
        assert!(result.width < 1000.0 && result.height < 400.0);
        assert!(
            result
                .cards
                .iter()
                .all(|card| card.bx.width == 160.0 && card.bx.height == 80.0)
        );
    }
}
