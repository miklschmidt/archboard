//! A door's lines share a trunk. They are routed without their words, and each then
//! wears them on its own branch, beside the part that owns it. A branch that cannot
//! hold them leaves its part by a stem that can, or a gap it crosses grows. A line that
//! still has no room takes a route of its own.

use std::{collections::BTreeMap, rc::Rc};

use super::{
    Refused,
    channel::{Probe, TWO_WAY, shared_junction},
    endpoint_choices::ends,
    fixed::{Search, choose, feasible, placement, settled},
    geometry::{clean, length},
    model::Model,
    port_spacing::{alternatives, conflicts, peers},
    ports::Port,
    room::with_room,
    route_labels::{Slots, branches, from_part, seat},
    runs::accepts,
    shape::Shape,
    topology::Topology,
};
use crate::{
    blocks::assembly::{Placed, PlacedLine},
    geometry::{Point, Rect},
    graph::{Edge, Node},
};

/// From this many lines of one kind to one door, the lines share a trunk (rule 5).
const TRUNK_LINES: usize = 3;
/// The room each try adds to the gaps between cards, along each axis.
const ROOMS: [(f64, f64); 2] = [(0.0, 40.0), (32.0, 40.0)];
/// How much longer a line's route can grow on its way to a stem that holds its words.
const LONGEST_STEM: f64 = 300.0;
/// How many routes that hold a line's words are tried against the whole drawing.
const REROUTES: usize = 6;
/// How far a stem runs out of its wall before it turns, when the words stand past the turn.
const STEM: f64 = 24.0;
/// What words need along their run past their own size.
const LEADS: f64 = 33.0;

/// The lines of every door's trunk, each with whether its part is its source: from
/// three lines of one kind to one door, each way, the lines share a trunk (rule 5).
fn trunk_lines(model: &Model<'_>) -> BTreeMap<usize, bool> {
    let door = |endpoint: usize| {
        let end = &model.endpoints[endpoint];
        end.scope == 0 && !end.node.has_children()
    };
    let mut trunks: BTreeMap<_, Vec<usize>> = BTreeMap::new();
    for (edge, &(from, to)) in model.ends.iter().enumerate() {
        if door(from) != door(to) {
            let part_first = door(to);
            let end = if part_first { to } else { from };
            let line = &model.edges[edge];
            let kind = line.option("archboard.relationship.kind");
            let two_way = line.option(TWO_WAY);
            trunks
                .entry((end, part_first, kind, two_way))
                .or_default()
                .push(edge);
        }
    }
    trunks
        .into_iter()
        .filter(|(_, lines)| lines.len() >= TRUNK_LINES)
        .flat_map(|((_, part_first, ..), lines)| {
            lines.into_iter().map(move |line| (line, part_first))
        })
        .collect()
}

/// The graph with the words of every trunk line taken off, if any line has words to take.
pub(in crate::blocks) fn without_trunk_words(graph: &Node) -> Option<Node> {
    let model = Model::new(graph).ok()?;
    let worded: Vec<&str> = trunk_lines(&model)
        .keys()
        .filter(|&&edge| model.edges[edge].label().is_some())
        .map(|&edge| model.edges[edge].id.as_str())
        .collect();
    (!worded.is_empty()).then(|| without_words(graph, &worded))
}

/// A graph with the words of some lines taken off.
fn without_words(graph: &Node, lines: &[&str]) -> Node {
    let mut quiet = graph.clone();
    for edge in quiet.edges.iter_mut().flatten() {
        if lines.contains(&edge.id.as_str()) {
            *edge = Rc::new(Edge {
                labels: None,
                ..(**edge).clone()
            });
        }
    }
    quiet
}

/// A drawing's shape, with the labels it already wears in place.
fn dressed(
    model: &Model<'_>,
    lines: &Rc<BTreeMap<usize, bool>>,
    drawing: Placed,
) -> Result<Shape, Refused> {
    let mut shape = placement(model, drawing)?;
    shape.trunk = Rc::clone(lines);
    shape.labels = shape
        .routes
        .iter()
        .filter_map(|line| Some((model.edge_index[line.id.as_str()], line.label?)))
        .collect();
    Ok(shape)
}

/// The trunk lines with words, the widest first: the hardest to seat go first.
fn worded(model: &Model<'_>, lines: &BTreeMap<usize, bool>) -> Vec<usize> {
    let width = |edge: usize| {
        let label = model.edges[edge].label();
        label.and_then(|label| label.width).unwrap_or(0.0)
    };
    let mut order: Vec<usize> = lines
        .keys()
        .copied()
        .filter(|&edge| model.edges[edge].label().is_some())
        .collect();
    order.sort_by(|&a, &b| width(b).total_cmp(&width(a)).then(a.cmp(&b)));
    order
}

/// Where a stem from a port meets one stroke of a trunk: straight out of the wall across
/// it, or out to a level and then across to it.
fn meetings(port: Port, stroke: [Point; 2], words: f64) -> Vec<Vec<Point>> {
    let (at, out) = (port.attachment, port.approach);
    let upright = at.x == out.x;
    let along = |p: Point| if upright { p.y } else { p.x };
    let across = |p: Point| if upright { p.x } else { p.y };
    let sign = (along(out) - along(at)).signum();
    let point = |run: f64, side: f64| {
        if upright {
            Point { x: side, y: run }
        } else {
            Point { x: run, y: side }
        }
    };
    let (start, end) = (along(stroke[0]), along(stroke[1]));
    let (low, high) = (start.min(end), start.max(end));
    if low == high {
        let (near, far) = (across(stroke[0]), across(stroke[1]));
        let meets = (low - along(at)) * sign > 0.0
            && near.min(far) <= across(at)
            && across(at) <= near.max(far);
        return meets
            .then(|| vec![point(low, across(at))])
            .into_iter()
            .collect();
    }
    [STEM, words + LEADS, words + LEADS + STEM]
        .into_iter()
        .map(|out| along(at) + sign * out)
        .filter(|&level| low <= level && level <= high)
        .map(|level| vec![point(level, across(at)), point(level, across(stroke[0]))])
        .collect()
}

/// A port and the places along its wall where a stem's words stand clear of a trunk.
fn along_wall(port: Port, card: Rect) -> impl Iterator<Item = Port> {
    let upright = port.attachment.x == port.approach.x;
    let places = upright.then_some([0.25, 0.5, 0.75]).into_iter().flatten();
    std::iter::once(port).chain(places.map(move |share| {
        let x = (card.x + card.width * share).round();
        Port {
            attachment: Point {
                x,
                ..port.attachment
            },
            approach: Point { x, ..port.approach },
        }
    }))
}

/// Every stem by which a line can leave its part and join a trunk it shares, shortest first.
fn stems(model: &Model<'_>, shape: &Shape, edge: usize) -> Vec<Vec<Point>> {
    let part_first = shape.trunk[&edge];
    let label = model.edges[edge].label();
    let end = |line: usize| {
        let (from, to) = model.ends[line];
        if part_first { to } else { from }
    };
    let (from, to) = model.ends[edge];
    let card = shape.endpoints[&if part_first { from } else { to }];
    let ports: Vec<Port> = ends(model, edge, part_first, shape, None, Search::Simple)
        .into_iter()
        .flat_map(|port| along_wall(port, card))
        .collect();
    let peers = shape.routes.iter().filter(|line| {
        let other = model.edge_index[line.id.as_str()];
        end(other) == end(edge) && model.treatments[other] == model.treatments[edge]
    });
    let mut found = Vec::new();
    for peer in peers {
        let trunk = from_part(&peer.points, !part_first);
        for (index, pair) in trunk.windows(2).enumerate() {
            for &port in &ports {
                let upright = port.attachment.x == port.approach.x;
                let words = label.and_then(|l| if upright { l.height } else { l.width });
                for stem in meetings(port, [pair[0], pair[1]], words.unwrap_or(0.0)) {
                    let mut points = trunk[..=index].to_vec();
                    points.extend(stem.iter().rev());
                    points.push(port.attachment);
                    found.push(clean(from_part(&points, !part_first)));
                }
            }
        }
    }
    found.sort_by(|a, b| length(a).total_cmp(&length(b)));
    found.dedup();
    found
}

/// Whether a route can join the others, every other line and label staying as it is.
fn joins(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    edge: usize,
    line: &PlacedLine,
) -> bool {
    shape.routes.iter().all(|old| {
        !conflicts(model, edge, &line.points, old)
            && shared_junction(model, topology, edge, &line.points, old)
    }) && accepts(model, &shape.routes, line)
}

/// Move a line to the first route that holds its words, with everything else where it stands.
fn reroute(
    model: &Model<'_>,
    topology: &Topology,
    shape: &mut Shape,
    edge: usize,
    routes: Vec<Vec<Point>>,
) -> bool {
    let bounds = shape.scopes[&topology.routes[edge].scope].bounds;
    let fitting: Vec<PlacedLine> = {
        let probe = Probe::new(model, topology, edge, shape, bounds);
        let slots = Slots::new(model, shape);
        routes
            .into_iter()
            .filter(|points| probe.refusal(points).is_none())
            .filter_map(|points| {
                let (label, _) = slots.slot(model, edge, &points)?;
                let id = model.edges[edge].id.clone();
                let label = Some(label);
                Some(PlacedLine { id, points, label })
            })
            .filter(|line| joins(model, topology, shape, edge, line))
            .take(REROUTES)
            .collect()
    };
    fitting
        .into_iter()
        .any(|line| holds(model, topology, shape, line))
}

/// Add a line to a shape if every line stays clear with it there.
fn holds(model: &Model<'_>, topology: &Topology, shape: &mut Shape, line: PlacedLine) -> bool {
    let edge = model.edge_index[line.id.as_str()];
    let label = line.label;
    shape.routes.push(line);
    if let Some(label) = label {
        shape.labels.insert(edge, label);
    }
    let stays = clear(model, topology, shape);
    if !stays {
        shape.routes.pop();
        shape.labels.remove(&edge);
    }
    stays
}

/// Whether every line of a drawing keeps to the rules of a route.
fn clear(model: &Model<'_>, topology: &Topology, shape: &Shape) -> bool {
    shape.routes.iter().all(|line| {
        feasible(
            model,
            topology,
            model.edge_index[line.id.as_str()],
            shape,
            &line.points,
        )
    })
}

/// Take a line off the shape, with how long its route can grow.
fn lift(model: &Model<'_>, shape: &mut Shape, edge: usize) -> Option<(PlacedLine, f64)> {
    let index = shape
        .routes
        .iter()
        .position(|line| model.edge_index[line.id.as_str()] == edge)?;
    let line = shape.routes.remove(index);
    let limit = length(&line.points) + LONGEST_STEM;
    Some((line, limit))
}

/// Give a waiting line a stem to its trunk that holds its words.
fn rejoin(model: &Model<'_>, topology: &Topology, shape: &mut Shape, edge: usize) -> bool {
    let Some((old, limit)) = lift(model, shape, edge) else {
        return false;
    };
    let mut near = stems(model, shape, edge);
    near.retain(|points| length(points) <= limit);
    let moved = reroute(model, topology, shape, edge, near);
    if !moved {
        shape.routes.push(old);
    }
    moved
}

/// A route, or the ones its ports can take to stand clear of a line on the far wall.
fn spaced(model: &Model<'_>, shape: &Shape, edge: usize, line: &PlacedLine) -> Vec<Vec<Point>> {
    if shape
        .routes
        .iter()
        .any(|old| conflicts(model, edge, &line.points, old))
    {
        let peers = peers(model, &shape.routes, edge);
        let others = alternatives(model, shape, line, &peers);
        others.into_iter().map(|other| other.points).collect()
    } else {
        vec![line.points.clone()]
    }
}

/// Give a line that no stem can word a route of its own.
fn apart(model: &Model<'_>, topology: &Topology, shape: &mut Shape, edge: usize) -> bool {
    let Some((old, _)) = lift(model, shape, edge) else {
        return false;
    };
    let paths = choose(model, topology, edge, shape, None, None, Search::Channels);
    let spaced = paths
        .iter()
        .flat_map(|line| spaced(model, shape, edge, line))
        .collect();
    let moved = reroute(model, topology, shape, edge, spaced);
    if !moved {
        shape.routes.push(old);
    }
    moved
}

/// Seat what lines it can, give stems to the others, and name the lines still waiting.
fn give_back(
    model: &Model<'_>,
    topology: &Topology,
    shape: &mut Shape,
    order: &[usize],
) -> Vec<usize> {
    let mut waiting = seat(model, shape, order);
    waiting.retain(|&edge| !rejoin(model, topology, shape, edge));
    waiting
}

/// The drawing of a graph's trunk lines with their words back on their branches.
/// A line that no gap and no route of its own can word stays without them: the
/// model keeps its words, and the panel of the selected line shows them.
pub(in crate::blocks) fn dress(graph: &Node, drawing: Placed) -> Result<Placed, Refused> {
    let model = Model::new(graph)?;
    let topology = Topology::new(&model);
    let lines = Rc::new(trunk_lines(&model));
    let routed = drawing.routed.ok_or("A trunk's drawing keeps its routes")?;
    let mut shape = dressed(&model, &lines, (*routed).clone())?;
    let mut waiting = give_back(&model, &topology, &mut shape, &worded(&model, &lines));
    for (x, y) in ROOMS {
        if waiting.is_empty() {
            break;
        }
        let crossed = branches(&model, &shape, &waiting);
        let roomier = dressed(&model, &lines, with_room(&shape, &crossed, x, y))?;
        if clear(&model, &topology, &roomier) {
            shape = roomier;
        }
        waiting = give_back(&model, &topology, &mut shape, &waiting);
    }
    waiting.retain(|&edge| !apart(&model, &topology, &mut shape, edge));
    let wordless: Vec<&str> = waiting
        .iter()
        .map(|&edge| model.edges[edge].id.as_str())
        .collect();
    let kept = without_words(graph, &wordless);
    let model = Model::new(&kept)?;
    settled(&model, &Topology::new(&model), &mut shape)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::planned::dense_drawing;
    use serde_json::json;

    fn card(id: &str) -> serde_json::Value {
        json!({"id":id,"width":180,"height":84})
    }

    fn line(id: &str) -> serde_json::Value {
        json!({"id":id,"sources":[id],"targets":["door"],
            "layoutOptions":{"archboard.relationship.kind":"call"},
            "labels":[{"text":"reads","width":90,"height":20}]})
    }

    fn reading(lines: &[serde_json::Value], parts: &[&str]) -> Node {
        let parts: Vec<_> = parts.iter().map(|id| card(id)).collect();
        serde_json::from_value(json!({"id":"root",
            "layoutOptions":{"archboard.blocks.nesting":"blocks"},
            "children":[{"id":"open","width":400,"height":36,
                "layoutOptions":{"archboard.header.size":"36"},"children":parts},
                card("door")],
            "edges":lines}))
        .unwrap()
    }

    #[test]
    fn a_two_way_line_does_not_count_towards_a_doors_trunk() {
        let mut lines = [line("a"), line("b"), line("c")];
        lines[2]["layoutOptions"]["archboard.relationship.two-way"] = json!("true");
        assert!(without_trunk_words(&reading(&lines, &["a", "b", "c"])).is_none());
    }

    #[test]
    fn lines_to_a_door_share_a_trunk_and_wear_their_words_beside_their_parts() {
        let ids = ["a", "b", "c", "d"];
        let graph = reading(&ids.map(line), &ids);
        let quiet = without_trunk_words(&graph).expect("a door's lines with words");
        let routed = dense_drawing(&quiet).expect("a drawing without their words");
        let drawing = dress(&graph, routed).expect("their words on their branches");
        // A line's last stretch: where it ends, and whether it runs in upright.
        let last_stretch = |line: &PlacedLine| {
            let [from, to] =
                [line.points.len() - 2, line.points.len() - 1].map(|at| line.points[at]);
            (to, from.x == to.x)
        };
        let door = drawing.edges[0].points.last().copied();
        assert_eq!(drawing.edges.len(), ids.len());
        for line in &drawing.edges {
            let label = line.label.expect("every line wears its words");
            let middle = Point {
                x: label.x + label.width / 2.0,
                y: label.y + label.height / 2.0,
            };
            let to = |at: Point| (at.x - middle.x).abs() + (at.y - middle.y).abs();
            assert!(to(line.points[0]) < to(door.expect("a route ends")));
        }
        let meets = drawing.edges.iter().filter(|line| {
            drawing
                .edges
                .iter()
                .any(|other| other.id != line.id && last_stretch(other) == last_stretch(line))
        });
        assert!(meets.count() > 1);
    }
}
