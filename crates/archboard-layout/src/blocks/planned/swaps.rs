//! Two lines that meet one wall of a card side by side, and cross just beside it, trade their
//! places on that wall, so that each meets the wall on the side it comes from.

use super::{
    fixed::feasible, junctions::crossings, model::Model, shape::Shape, topology::Topology,
};
use crate::{blocks::assembly::PlacedLine, geometry::Point};

/// Trade places on a wall for each pair of lines that cross beside it, in one pass over the
/// pairs, where a trade removes a crossing and the drawing passes every guard a new route passes.
pub(super) fn untangle(model: &Model<'_>, topology: &Topology, shape: &mut Shape) {
    for one in 0..shape.routes.len() {
        for other in one + 1..shape.routes.len() {
            if let Some(next) = traded(model, topology, shape, one, other) {
                *shape = next;
            }
        }
    }
}

/// The drawing with two lines traded on a wall they share, if that removes a crossing and
/// passes the guards.
fn traded(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    one: usize,
    other: usize,
) -> Option<Shape> {
    let edges = [one, other].map(|line| model.edge_index[shape.routes[line].id.as_str()]);
    if edges.iter().any(|edge| shape.trunk.contains_key(edge)) {
        return None;
    }
    let end = |edge: usize, source: bool| {
        let (from, to) = model.ends[edge];
        if source { from } else { to }
    };
    [(true, true), (true, false), (false, true), (false, false)]
        .into_iter()
        .filter(|&(a, b)| end(edges[0], a) == end(edges[1], b))
        .find_map(|(a, b)| {
            let [first, second] = trade(
                &from_end(&shape.routes[one].points, a),
                &from_end(&shape.routes[other].points, b),
            )?;
            let mut next = shape.without_labels();
            next.routes[one].points = from_end(&first, a);
            next.routes[other].points = from_end(&second, b);
            next.routes[one].label = None;
            next.routes[other].label = None;
            (crossed(&next, one, other) < crossed(shape, one, other)
                && guarded(model, topology, &mut next, [one, other]))
            .then_some(next)
        })
}

/// A line's points read from one end: from its source, or from its target back.
fn from_end(points: &[Point], source: bool) -> Vec<Point> {
    let mut points = points.to_vec();
    if !source {
        points.reverse();
    }
    points
}

/// Two lines that leave one wall side by side, each read from that wall, with their places on
/// it traded: each keeps the length of its first stretch and turns where it turned before.
fn trade(one: &[Point], other: &[Point]) -> Option<[Vec<Point>; 2]> {
    let ([a0, a1, a2, ..], [b0, b1, b2, ..]) = (one, other) else {
        return None;
    };
    // An upright first stretch leaves a top or bottom wall, and the wall runs across x.
    let upright = a0.x == a1.x;
    let across = |p: &Point| if upright { p.x } else { p.y };
    let out = |p: &Point| if upright { p.y } else { p.x };
    let turns = |p: &Point, q: &Point| if upright { p.y == q.y } else { p.x == q.x };
    let leaves = (out(a1) - out(a0)).signum();
    if upright != (b0.x == b1.x)
        || out(a0) != out(b0)
        || across(a0) == across(b0)
        || leaves != (out(b1) - out(b0)).signum()
        || !turns(a1, a2)
        || !turns(b1, b2)
        || crossings(&one[..3], &other[..3]) == 0
    {
        return None;
    }
    // Each second stretch still runs the way it ran, from the other line's place.
    let keeps = |turn: f64, from: f64, to: f64| {
        turn != to && (turn - from).signum() == (turn - to).signum()
    };
    if !keeps(across(a2), across(a0), across(b0)) || !keeps(across(b2), across(b0), across(a0)) {
        return None;
    }
    let moved = |line: &[Point], to: f64| {
        let mut points = line.to_vec();
        for point in &mut points[..2] {
            if upright {
                point.x = to;
            } else {
                point.y = to;
            }
        }
        points
    };
    Some([moved(one, across(b0)), moved(other, across(a0))])
}

/// How many crossings two lines of a drawing make, with each other and with every other line.
fn crossed(shape: &Shape, one: usize, other: usize) -> usize {
    let routes = &shape.routes;
    let with = |line: usize| {
        (routes.iter().enumerate())
            .filter(|&(at, _)| at != one && at != other)
            .map(|(_, route)| crossings(&routes[line].points, &route.points))
            .sum::<usize>()
    };
    with(one) + with(other) + crossings(&routes[one].points, &routes[other].points)
}

/// Whether a drawing passes the guards its finished routes pass, and its traded lines the
/// junction guard a new route passes, with its words placed. The traded lines go first, since
/// they are what a trade changes.
fn guarded(model: &Model<'_>, topology: &Topology, shape: &mut Shape, traded: [usize; 2]) -> bool {
    let routes = &shape.routes;
    let edge = |line: &PlacedLine| model.edge_index[line.id.as_str()];
    let holds = |line: &PlacedLine| feasible(model, topology, edge(line), shape, &line.points);
    let joins = |at: usize| {
        let line = &routes[at];
        (routes.iter().enumerate())
            .filter(|&(other, _)| other != at)
            .all(|(_, old)| {
                super::channel::shared_junction(model, topology, edge(line), &line.points, old)
            })
    };
    traded.iter().all(|&at| joins(at) && holds(&routes[at]))
        && super::port_spacing::clear(model, routes)
        && (routes.iter().enumerate())
            .filter(|(at, _)| !traded.contains(at))
            .all(|(_, line)| holds(line))
        && super::runs::freeze(model, routes).is_some()
        && super::route_labels::arrange(model, shape).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::assembly::{Placed, PlacedCard};
    use crate::geometry::Rect;
    use crate::graph::Node;
    use serde_json::json;

    #[test]
    fn lines_that_cross_beside_the_wall_they_share_trade_places_on_it() {
        let graph: Node = serde_json::from_value(json!({"id":"root","children":[
            {"id":"a","width":160,"height":80},{"id":"b","width":160,"height":80},
            {"id":"c","width":200,"height":100}],
            "edges":[{"id":"ac","sources":["a"],"targets":["c"]},
                {"id":"bc","sources":["b"],"targets":["c"]}]}))
        .unwrap();
        let card = |id: &str, x: f64, y: f64, width: f64, height: f64| PlacedCard {
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
        let line = |id: &str, points: &[(f64, f64)]| PlacedLine {
            id: id.into(),
            label: None,
            points: points.iter().map(|&(x, y)| Point { x, y }).collect(),
        };
        // The line from the left card meets the wall above the line from the right card, so
        // the second crosses the first just before the wall.
        let drawing = Placed {
            width: 1000.0,
            height: 600.0,
            cards: vec![
                card("a", 100.0, 100.0, 160.0, 80.0),
                card("b", 340.0, 100.0, 160.0, 80.0),
                card("c", 600.0, 300.0, 200.0, 100.0),
            ],
            frames: vec![],
            regions: vec![],
            titles: vec![],
            routed: None,
            edges: vec![
                line("ac", &[(200.0, 180.0), (200.0, 330.0), (600.0, 330.0)]),
                line("bc", &[(420.0, 180.0), (420.0, 370.0), (600.0, 370.0)]),
            ],
        };
        let model = Model::new(&graph).unwrap();
        let topology = Topology::new(&model);
        let mut shape = super::super::fixed::placement(&model, drawing).unwrap();
        untangle(&model, &topology, &mut shape);
        let [ac, bc] = [0, 1].map(|at| &shape.routes[at].points);
        assert_eq!(crossings(ac, bc), 0);
        assert_eq!(ac.last(), Some(&Point { x: 600.0, y: 370.0 }));
        assert_eq!(bc.last(), Some(&Point { x: 600.0, y: 330.0 }));
    }
}
