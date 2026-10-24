//! Where routes join a shared lane: a dot at every point where two routes
//! start or stop running together, where the ink actually parts, and one bar
//! along the lane for joins a few units apart. The marks are found from the
//! finished routes and change nothing about where anything is placed.

use std::collections::HashMap;

use crate::attrs;
use crate::drawing::Edge;
use crate::geometry::{Curve, Point, Segment, coord, vertices_of};
use crate::js;
use crate::markup::{Markup, concat, group, tag};
use crate::paint::standing::MEMBERS_ATTRIBUTE;
use crate::scene::Role;

/// How far a junction mark reaches past the line it sits on.
const JUNCTION_REACH: f64 = 1.6;
/// How far a route must go on from a point to count as leaving it that way.
const ONWARD: f64 = 0.5;
/// How much clear space two marks along one lane need to read as two.
const APART: f64 = 2.0;

/// One straight stretch of a route, along one axis.
#[derive(Clone, Copy, Debug)]
struct Stretch {
    route: usize,
    across: bool,
    at: f64,
    from: f64,
    to: f64,
    from_bend: f64,
    to_bend: f64,
    width: f64,
}

/// A place two routes join or part, and the heavier of the lines there; a bar
/// when it runs on to `until`.
#[derive(Clone, Debug)]
struct Junction {
    point: Point,
    until: Option<Point>,
    route: usize,
    width: f64,
    routes: Vec<usize>,
}

/// One route, as the joins are found from it.
pub struct JoinRoute {
    corners: Vec<Point>,
    bends: Vec<f64>,
    width: f64,
}

fn stretches_of(route: &JoinRoute, index: usize) -> Vec<Stretch> {
    let bend = |at: usize| route.bends.get(at).copied().unwrap_or(0.0);
    route
        .corners
        .windows(2)
        .enumerate()
        .filter_map(|(at, pair)| stretch_between(pair[0], pair[1], [bend(at), bend(at + 1)], index, route.width))
        .collect()
}

fn stretch_between(a: Point, b: Point, bends: [f64; 2], route: usize, width: f64) -> Option<Stretch> {
    let across = (a.y - b.y).abs() < ONWARD;
    if across == ((a.x - b.x).abs() < ONWARD) {
        return None;
    }
    let (start, end) = if across { (a.x, b.x) } else { (a.y, b.y) };
    let forward = start <= end;
    Some(Stretch {
        route,
        across,
        at: if across { a.y } else { a.x },
        from: js::js_min(start, end),
        to: js::js_max(start, end),
        from_bend: if forward { bends[0] } else { bends[1] },
        to_bend: if forward { bends[1] } else { bends[0] },
        width,
    })
}

fn on_stretch(stretch: &Stretch, point: Point, near: f64) -> bool {
    let off = if stretch.across { point.y } else { point.x };
    let along = if stretch.across { point.x } else { point.y };
    (off - stretch.at).abs() <= near && along >= stretch.from - near && along <= stretch.to + near
}

fn stretch_ways(stretch: &Stretch, point: Point, near: f64) -> Vec<&'static str> {
    if !on_stretch(stretch, point, near) {
        return Vec::new();
    }
    let along = if stretch.across { point.x } else { point.y };
    let (back, forth) = if stretch.across { ("left", "right") } else { ("up", "down") };
    let mut ways = Vec::new();
    if along - stretch.from > near {
        ways.push(back);
    }
    if stretch.to - along > near {
        ways.push(forth);
    }
    ways
}

fn ways_out(stretches: &[Stretch], point: Point, near: f64) -> Vec<&'static str> {
    let mut ways: Vec<&'static str> = Vec::new();
    for way in stretches.iter().flat_map(|stretch| stretch_ways(stretch, point, near)) {
        if !ways.contains(&way) {
            ways.push(way);
        }
    }
    ways
}

fn part_at(one: &[Stretch], other: &[Stretch], point: Point, near: f64) -> bool {
    let a = ways_out(one, point, near);
    let b = ways_out(other, point, near);
    a.len() != b.len() || a.iter().any(|way| !b.contains(way))
}

/// Each end of a shared stretch with where the ink parts there.
struct Shared {
    ends: [(Point, Point); 2],
    near: f64,
}

fn shared_ends(one: &Stretch, other: &Stretch) -> Option<Shared> {
    if one.route == other.route || one.across != other.across {
        return None;
    }
    let near = js::js_max((one.width + other.width) / 2.0, ONWARD);
    let from = js::js_max(one.from, other.from);
    let to = js::js_min(one.to, other.to);
    if (one.at - other.at).abs() > near || to - from <= near {
        return None;
    }
    let at = (one.at + other.at) / 2.0;
    let point = |along: f64| if one.across { Point { x: along, y: at } } else { Point { x: at, y: along } };
    let middle = (from + to) / 2.0;
    let inward = |along: f64, at_from: bool| {
        js::js_min(
            (middle - along).abs(),
            js::max([one, other].map(|stretch| {
                let end = if at_from { stretch.from } else { stretch.to };
                if (end - along).abs() <= near {
                    if at_from { stretch.from_bend } else { stretch.to_bend }
                } else {
                    0.0
                }
            })),
        )
    };
    Some(Shared {
        ends: [(point(from), point(from + inward(from, true))), (point(to), point(to - inward(to, false)))],
        near,
    })
}

fn joins_between(one: &Stretch, other: &Stretch, by_route: &[Vec<Stretch>]) -> Vec<Junction> {
    let Some(shared) = shared_ends(one, other) else {
        return Vec::new();
    };
    let heavier = if one.width >= other.width { one } else { other };
    shared
        .ends
        .iter()
        .filter(|(end, _)| part_at(&by_route[one.route], &by_route[other.route], *end, shared.near))
        .map(|(_, parts)| Junction {
            point: *parts,
            until: None,
            route: heavier.route,
            width: heavier.width,
            routes: vec![one.route, other.route],
        })
        .collect()
}

fn unique(routes: impl IntoIterator<Item = usize>) -> Vec<usize> {
    let mut kept = Vec::new();
    for route in routes {
        if !kept.contains(&route) {
            kept.push(route);
        }
    }
    kept
}

/// The joins found so far, one per place, in the order their places were found.
#[derive(Default)]
struct Found {
    order: Vec<Junction>,
    places: HashMap<String, usize>,
}

impl Found {
    fn keep(&mut self, junction: Junction) {
        let key = format!(
            "{},{}",
            js::number(js::round(junction.point.x / 2.0)),
            js::number(js::round(junction.point.y / 2.0))
        );
        match self.places.get(&key) {
            None => {
                self.places.insert(key, self.order.len());
                let routes = unique(junction.routes.clone());
                self.order.push(Junction { routes, ..junction });
            }
            Some(&at) => {
                let held = &self.order[at];
                let routes = unique(held.routes.iter().copied().chain(junction.routes.iter().copied()));
                let kept = if held.width < junction.width { junction } else { held.clone() };
                self.order[at] = Junction { routes, ..kept };
            }
        }
    }
}

fn touching(a: &Junction, b: &Junction) -> bool {
    let dx = (a.point.x - b.point.x).abs();
    let dy = (a.point.y - b.point.y).abs();
    let reach = a.width + b.width + JUNCTION_REACH * 2.0 + APART;
    (dx < ONWARD && dy < reach) || (dy < ONWARD && dx < reach)
}

fn mark_of(cluster: &[Junction]) -> Junction {
    let heaviest = cluster.iter().skip(1).fold(&cluster[0], |best, one| if one.width > best.width { one } else { best });
    if cluster.len() == 1 {
        return heaviest.clone();
    }
    let mut ordered: Vec<&Junction> = cluster.iter().collect();
    ordered.sort_by(|a, b| {
        let dx = a.point.x - b.point.x;
        let difference = if dx != 0.0 && !dx.is_nan() { dx } else { a.point.y - b.point.y };
        difference.partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal)
    });
    Junction {
        point: ordered[0].point,
        until: Some(ordered[ordered.len() - 1].point),
        routes: unique(cluster.iter().flat_map(|one| one.routes.iter().copied())),
        ..heaviest.clone()
    }
}

fn gathered(junctions: Vec<Junction>) -> Vec<Junction> {
    let mut pending = junctions;
    let mut marks = Vec::new();
    while let Some(first) = pending.pop() {
        let mut cluster = vec![first];
        while let Some(index) = pending.iter().position(|one| cluster.iter().any(|held| touching(held, one))) {
            cluster.push(pending.remove(index));
        }
        marks.push(mark_of(&cluster));
    }
    marks
}

fn joins_of(routes: &[JoinRoute]) -> Vec<Junction> {
    let by_route: Vec<Vec<Stretch>> = routes.iter().enumerate().map(|(index, route)| stretches_of(route, index)).collect();
    let stretches: Vec<Stretch> = by_route.iter().flatten().copied().collect();
    let mut found = Found::default();
    for (index, one) in stretches.iter().enumerate() {
        for other in &stretches[index + 1..] {
            for junction in joins_between(one, other, &by_route) {
                found.keep(junction);
            }
        }
    }
    found.order
}

/// How far before each of a route's corners its ink starts to turn.
fn bends_of(curve: &Curve) -> Vec<f64> {
    let mut from = curve.from;
    let mut radii = vec![0.0];
    for segment in &curve.segments {
        if let Segment::Cubic { to, .. } = segment {
            radii.push(js::js_max((to.x - from.x).abs(), (to.y - from.y).abs()));
        }
        from = segment.to();
    }
    radii.push(0.0);
    radii
}

/// How far a junction mark reaches from its point on a line of some width.
pub fn mark_radius(width: f64) -> f64 {
    width + JUNCTION_REACH
}

/// The marks for every join, in the ink and weight of the heavier line there.
pub fn junction_marks(routes: &[&Edge], lines: &[(String, f64)]) -> Markup {
    let join_routes: Vec<JoinRoute> = routes
        .iter()
        .enumerate()
        .map(|(index, route)| JoinRoute {
            corners: vertices_of(&route.curve),
            bends: bends_of(&route.curve),
            width: lines[index].1,
        })
        .collect();
    let junctions = gathered(joins_of(&join_routes));
    if junctions.is_empty() {
        return Markup::new();
    }
    let marks = junctions
        .iter()
        .map(|junction| {
            let ink = lines[junction.route].0.as_str();
            let radius = mark_radius(junction.width);
            let members =
                junction.routes.iter().map(|at| routes[*at].edge.id.as_str()).collect::<Vec<_>>().join(" ");
            match junction.until {
                None => tag(
                    "circle",
                    attrs! {
                        "cx": coord(junction.point.x),
                        "cy": coord(junction.point.y),
                        "r": coord(radius),
                        "fill": ink,
                        MEMBERS_ATTRIBUTE: members,
                    },
                ),
                Some(until) => tag(
                    "path",
                    attrs! {
                        "d": format!(
                            "M{},{} L{},{}",
                            coord(junction.point.x),
                            coord(junction.point.y),
                            coord(until.x),
                            coord(until.y)
                        ),
                        "fill": "none",
                        "stroke": ink,
                        "stroke-width": coord(radius * 2.0),
                        "stroke-linecap": "round",
                        MEMBERS_ATTRIBUTE: members,
                    },
                ),
            }
        })
        .collect();
    group(Role::Junctions, None, attrs! { "class": "ab-junctions", "pointer-events": "none" }, concat(marks))
}
