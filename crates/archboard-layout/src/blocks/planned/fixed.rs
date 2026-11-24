//! Route a measured legacy placement without moving its cards or frames.

use super::{
    geometry::{contains, crosses_box, length},
    model::{Endpoint, Model, Scope},
    shape::{ScopePlacement, Shape},
    topology::Topology,
};
use crate::{
    blocks::assembly::{Placed, PlacedArea, PlacedLine},
    geometry::{Point, Rect, inflate},
    graph::Node,
};

pub(super) use super::choices::{Search, choose};

pub(super) fn route(
    graph: &Node,
    drawing: Placed,
    orders: &[usize],
) -> Result<Placed, super::Refused> {
    let model = Model::new(graph)?;
    let topology = Topology::new(&model);
    debug_assert!(model.complete() && topology.complete(&model));
    let mut shape = placement(&model, drawing)?;
    let previous = std::mem::take(&mut shape.routes);
    let candidates = candidates(&model, &topology, &mut shape, &previous)?;
    shape.routes = super::selection::greedy(&model, &topology, &shape, &candidates, orders)
        .map_err(|edges| blocked(&model, &edges))?;
    super::swaps::untangle(&model, &topology, &mut shape);
    let routed = shape.routed();
    let mut drawing = settled(&model, &topology, &mut shape)?;
    drawing.routed = Some(std::rc::Rc::new(routed));
    Ok(drawing)
}

/// Close the space that a routed shape leaves, and guard what is left.
pub(super) fn settled(
    model: &Model<'_>,
    topology: &Topology,
    shape: &mut Shape,
) -> Result<Placed, super::Refused> {
    let two_way: Vec<&str> = (model.edges.iter())
        .filter(|edge| edge.option(super::channel::TWO_WAY).is_some())
        .map(|edge| edge.id.as_str())
        .collect();
    let inks: rustc_hash::FxHashMap<&str, f64> = (model.edges.iter().enumerate())
        .filter(|&(edge, _)| model.girth[edge] > 0.0)
        .map(|(edge, line)| (line.id.as_str(), model.reach(edge)))
        .collect();
    for clear in [8.0, 12.0, 16.0, 24.0, 32.0] {
        if let Some(drawing) = super::compact::drawing(shape, clear, (&two_way, &inks))
            && let Ok(mut compact) = placement(model, drawing)
        {
            compact.trunk = std::rc::Rc::clone(&shape.trunk);
            if let Ok(drawing) = finish(model, topology, &mut compact) {
                return Ok(drawing);
            }
        }
    }
    finish(model, topology, shape)
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
        .map(|frozen| reach_shoulders(model, shape, frozen.emit(model, (*shape.drawing).clone())))
        .ok_or_else(|| super::Refused::from("The hybrid drawing has an ambiguous fan tree"))
}

/// A line that ends on a frame's top wall beyond the tab stands in the air by
/// the tab's height, so it runs on down to the frame's shoulder.
fn reach_shoulders(model: &Model<'_>, shape: &Shape, mut drawing: Placed) -> Placed {
    let shoulder = |end: &mut Point, endpoint: usize| {
        let Some(tab) = shape.tabs.get(&endpoint) else {
            return;
        };
        if (end.y - tab.y).abs() < 1.0 && end.x > tab.x + tab.width {
            end.y = tab.y + tab.height;
        }
    };
    for line in &mut drawing.edges {
        let (from, to) = model.ends[model.edge_index[line.id.as_str()]];
        if let Some(end) = line.points.first_mut() {
            shoulder(end, from);
        }
        if let Some(end) = line.points.last_mut() {
            shoulder(end, to);
        }
    }
    drawing
}

/// No clear planned channel for these lines.
fn blocked(model: &Model<'_>, edges: &[usize]) -> super::Refused {
    super::Refused {
        blocked: edges
            .iter()
            .rev()
            .map(|&edge| {
                let (from, to) = model.ends[edge];
                [from, to].map(|endpoint| model.endpoints[endpoint].node.id.clone())
            })
            .collect(),
    }
}

/// The band a frame's title takes across its top: its tab, in a dense drawing.
fn title_band(drawing: &Placed, frame: Rect, width: f64) -> Rect {
    let held = drawing.titles.iter().find(|title| title.stands_in(frame));
    held.map_or(
        Rect {
            width,
            height: 0.0,
            ..frame
        },
        |title| title.band,
    )
}

/// The box an endpoint ends on, with a frame's tab for a frame's outer endpoint.
fn endpoint_box(endpoint: &Endpoint<'_>, drawing: &Placed) -> Result<(Rect, Option<Rect>), String> {
    let id = &endpoint.node.id;
    if let Some(card) = drawing.cards.iter().find(|card| card.id == *id) {
        return Ok((card.bx, None));
    }
    let frame = drawing
        .frames
        .iter()
        .find(|frame| frame.id == *id)
        .ok_or_else(|| format!("No placed endpoint for {id}"))?
        .bx;
    let tab = title_band(drawing, frame, endpoint.bounds.width);
    if endpoint.foot.is_some() {
        return Ok((frame, Some(tab)));
    }
    let foot = Rect {
        y: tab.y + tab.height,
        height: 0.0,
        ..tab
    };
    Ok((foot, None))
}

/// The room a scope holds: a frame's body, a group's region, or the whole page.
fn scope_bounds(model: &Model<'_>, scope: &Scope<'_>, drawing: &Placed) -> Option<Rect> {
    if let Some(header) = scope.header {
        let endpoint = &model.endpoints[header];
        let frame = drawing
            .frames
            .iter()
            .find(|frame| frame.id == endpoint.node.id)?;
        let tab = title_band(drawing, frame.bx, endpoint.bounds.width).height;
        return Some(Rect {
            y: frame.bx.y + tab,
            height: frame.bx.height - tab,
            ..frame.bx
        });
    }
    if let Some(group) = scope.group {
        let held = |region: &&PlacedArea| {
            region.group == group && region.parent.as_deref() == scope.semantic_parent
        };
        return drawing.regions.iter().find(held).map(|region| region.bx);
    }
    Some(Rect {
        x: 0.0,
        y: 0.0,
        width: drawing.width,
        height: drawing.height,
    })
}

pub(super) fn placement(model: &Model<'_>, drawing: Placed) -> Result<Shape, String> {
    let mut shape = Shape::new(drawing);
    for (index, endpoint) in model.endpoints.iter().enumerate() {
        let (at, tab) = endpoint_box(endpoint, &shape.drawing)?;
        if let Some(tab) = tab {
            std::rc::Rc::make_mut(&mut shape.tabs).insert(index, tab);
        }
        std::rc::Rc::make_mut(&mut shape.endpoints).insert(index, at);
    }
    for (index, scope) in model.scopes.iter().enumerate() {
        let bounds = scope_bounds(model, scope, &shape.drawing)
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

/// The placed routes of a shape as the candidates of one line meet them. Whether a candidate
/// can stand beside a placed route depends on the route's ends, box, words and junctions,
/// which each placed route finds once.
pub(super) struct Meeting<'a> {
    routes: Vec<Met<'a>>,
    /// How far the line's ink reaches to either side of its route.
    half: f64,
    junctions: super::channel::Junctions<'a>,
}

/// One placed route of a meeting.
struct Met<'a> {
    edge: usize,
    line: &'a PlacedLine,
    peer: Option<super::port_spacing::Peer<'a>>,
    /// The route's box, a point wider each way.
    reach: Rect,
    /// The route's words, with the room a line keeps from them.
    kept: Option<Rect>,
    /// How far the route's ink reaches to either side of it.
    half: f64,
}

impl<'a> Meeting<'a> {
    pub(super) fn new(
        model: &Model<'_>,
        topology: &Topology,
        edge: usize,
        routes: &'a [PlacedLine],
    ) -> Self {
        let met = |line: &'a PlacedLine| {
            let other = model.edge_index[line.id.as_str()];
            Met {
                edge: other,
                line,
                peer: super::port_spacing::Peer::of(model, edge, line),
                reach: inflate(bounds(&line.points), 1.0 + model.reach(other)),
                kept: line.label.map(|r| inflate(r, 12.01)),
                half: model.reach(other),
            }
        };
        Self {
            routes: routes.iter().map(met).collect(),
            half: model.reach(edge),
            junctions: super::channel::Junctions::new(model, topology, edge, routes),
        }
    }

    /// The lines of the placed routes that a candidate route of the line cannot stand beside:
    /// its ends stand too close to theirs, its ink or words cover their words, or the two
    /// meet in a junction that does not read.
    pub(super) fn blocking(&self, line: &PlacedLine) -> impl Iterator<Item = usize> {
        let reach = inflate(bounds(&line.points), 1.0 + self.half);
        let envelope = super::junctions::Envelope::new(&line.points);
        let compatible = move |at: usize, old: &Met<'_>| {
            if (old.peer.as_ref()).is_some_and(|peer| peer.conflicts(&line.points)) {
                return false;
            }
            let kept = line.label.map(|r| inflate(r, 12.01));
            if kept.is_some_and(|r| crosses_box(&old.line.points, inflate(r, old.half)))
                || old
                    .kept
                    .is_some_and(|r| crosses_box(&line.points, inflate(r, self.half)))
                || (line.label.zip(old.line.label))
                    .is_some_and(|(a, b)| overlap(inflate(a, 8.0), b))
            {
                return false;
            }
            !overlap(reach, old.reach) || self.junctions.shares(at, &line.points, envelope)
        };
        (self.routes.iter().enumerate())
            .filter(move |&(at, old)| !compatible(at, old))
            .map(|(_, old)| old.edge)
    }
}

fn bounds(path: &[Point]) -> Rect {
    let x = path.iter().map(|p| p.x).fold(f64::INFINITY, f64::min);
    let y = path.iter().map(|p| p.y).fold(f64::INFINITY, f64::min);
    Rect {
        x,
        y,
        width: path.iter().map(|p| p.x).fold(f64::NEG_INFINITY, f64::max) - x,
        height: path.iter().map(|p| p.y).fold(f64::NEG_INFINITY, f64::max) - y,
    }
}

pub(super) fn route_cost(path: &[Point]) -> f64 {
    length(path) + 120.0 * path.len().saturating_sub(2) as f64
}

/// How a route ranks among the routes of its line. A route that meets a door on a side that
/// faces its far end comes before every route that does not, so a line meets a door from
/// behind only when no other route passes the guards.
/// What an end that stands off its wall's centred port (`ports::port`) costs a route: more than a
/// bend, so an end leaves the centre to save a way round, never to save a few units.
const OFF_CENTRE: f64 = 200.0;

/// How a candidate route of a line ranks: a route that meets a door from behind last, then its
/// length, each end off its centred port as costly as `OFF_CENTRE`, and the page it takes.
pub(super) fn route_rank(
    (model, shape, edge): (&Model<'_>, &Shape, usize),
    bounds: Rect,
    path: &[Point],
) -> (bool, u64, u64) {
    let behind = !super::ports::faces_far_end(model, shape, edge, path);
    let off = super::ports::off_centre(model, shape, edge, path) as f64;
    let page = page_cost(bounds, path).to_bits();
    let route = (route_cost(path) + OFF_CENTRE * off).to_bits();
    if model.edges.len() <= super::REFINEMENT_LIMIT {
        (behind, route, page)
    } else {
        (behind, page, route)
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
        choices.sort_by_cached_key(|line| route_rank((model, shape, edge), bounds, &line.points));
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
    fn the_final_guard_keeps_distinct_ports_a_lane_apart_on_one_wall() {
        for (door, kind, cable, gap) in [
            ("across", "event", None, 16.0),
            ("across", "http", None, 16.0),
            ("", "event", Some("left;strand"), 24.0),
        ] {
            check_port_gap(door, kind, cable, gap);
        }
    }

    fn check_port_gap(door: &str, kind: &str, cable: Option<&str>, gap: f64) {
        let door_options = if door.is_empty() {
            json!({})
        } else {
            json!({"archboard.door":door})
        };
        let mut left_options = json!({"archboard.relationship.kind":"http"});
        if let Some(cable) = cable {
            left_options["archboard.cable"] = json!(cable);
        }
        let graph: Node = serde_json::from_value(json!({"id":"root","children":[
            {"id":"door","layoutOptions":door_options},
            {"id":"left"}, {"id":"right"}],
            "edges":[{"id":"left","sources":["door"],"targets":["left"],
                "layoutOptions":left_options},
                {"id":"right","sources":["door"],"targets":["right"],
                "layoutOptions":{"archboard.relationship.kind":kind}}]}))
        .unwrap();
        let model = Model::new(&graph).unwrap();
        let topology = Topology::new(&model);
        let card = |id: &str, x, y, width, height| PlacedCard {
            id: id.into(),
            bx: Rect {
                x,
                y,
                width,
                height,
            },
            depth: 0,
            header: None,
        };
        let drawing = Placed {
            width: 550.0,
            height: 400.0,
            cards: vec![
                card("door", 180.0, 80.0, 140.0, 34.0),
                card("left", 40.0, 180.0, 140.0, 80.0),
                card("right", 320.0, 180.0, 140.0, 80.0),
            ],
            frames: vec![],
            regions: vec![],
            edges: vec![],
            titles: vec![],
            routed: None,
        };
        let route = |id: &str, x, far| PlacedLine {
            id: id.into(),
            points: vec![
                Point { x, y: 114.02 },
                Point { x, y: 220.0 },
                Point { x: far, y: 220.0 },
            ],
            label: None,
        };
        let mut shape = placement(&model, drawing).unwrap();
        let routes = |separation| {
            vec![
                route("left", 250.0 - separation / 2.0, 180.02),
                route("right", 250.0 + separation / 2.0, 319.98),
            ]
        };
        shape.routes = routes(gap - 2.0);
        finish(&model, &topology, &mut shape).expect_err("the ports leave less than a lane");
        shape.routes = routes(gap);
        finish(&model, &topology, &mut shape).expect("the outer strands leave a full lane");
    }

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
            routed: None,
        };
        let result = route(&graph, drawing, &super::super::selection::ORDERS).unwrap();
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
