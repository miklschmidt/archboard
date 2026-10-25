//! Which line rises where two lines cross, where a hop may stand, and how the
//! crossing pass keeps every route's rounding, on fixed route geometry, so a
//! test holds the crossing pass apart from any placement engine. Which of two
//! lines rises by its look is in `layering`, crossings close along one line
//! in `clusters`, and a drawing with some subjects left out in `shown`.

mod clusters;
mod ink;
mod layering;
mod shown;

use std::collections::BTreeMap;

use archboard_scene::drawing::{
    ArchitectureDrawing, Bridged, Chip, DrawingBridge, DrawingEdge, EdgeFacts, Emphasis,
    MeasuredLabel, NodeFacts, PlacedLabel, ReadingDirection,
};
use archboard_scene::geometry::{Curve, Point, Rect, Segment, curve_bounds, curve_through};
use archboard_scene::request::{Arrowhead, Dash};

use super::clearance::lacks_clearance;
use super::{LineLook, bridge_crossings};

type Drawing = ArchitectureDrawing<NodeFacts, EdgeFacts>;

fn point(x: f64, y: f64) -> Point {
    Point { x, y }
}

fn points(pairs: &[(f64, f64)]) -> Vec<Point> {
    pairs.iter().map(|&(x, y)| point(x, y)).collect()
}

/// A route's relationship, a normal call unless a test says otherwise.
fn facts(index: usize) -> EdgeFacts {
    EdgeFacts {
        id: index.to_string(),
        from: format!("source{index}"),
        to: format!("target{index}"),
        kind: "call".to_owned(),
        emphasis: Emphasis::Normal,
        traffic: None,
    }
}

/// Rounded routes as they reach the crossing pass, each a normal call.
fn drawing(routes: &[Vec<Point>]) -> Drawing {
    drawn(routes, &[])
}

/// Rounded routes as they reach the crossing pass, the routes named by index
/// of the kind and emphasis given, every other a normal call.
fn drawn(routes: &[Vec<Point>], looks: &[(usize, &str, Emphasis)]) -> Drawing {
    let edges = routes
        .iter()
        .enumerate()
        .map(|(index, route)| DrawingEdge {
            edge: looks.iter().find(|look| look.0 == index).map_or_else(
                || facts(index),
                |&(_, kind, emphasis)| EdgeFacts {
                    kind: kind.to_owned(),
                    emphasis,
                    ..facts(index)
                },
            ),
            curve: curve_through(route, false),
            path: String::new(),
            label: None,
        })
        .collect();
    ArchitectureDrawing {
        direction: ReadingDirection::Down,
        width: 120.0,
        height: 100.0,
        cards: Vec::new(),
        containers: Vec::new(),
        edges,
        regions: None,
    }
}

/// How each route's line is drawn: an event's dashed with an open head, as
/// the default policy draws it, every other solid with a filled head.
fn lines_of(drawing: &Drawing) -> BTreeMap<String, LineLook> {
    drawing
        .edges
        .iter()
        .filter(|edge| edge.edge.kind == "event")
        .map(|edge| {
            let look = LineLook {
                dash: Dash::Dashed,
                arrowhead: Arrowhead::Open,
            };
            (edge.edge.id.clone(), look)
        })
        .collect()
}

/// The crossings settled, each line drawn as its kind is.
fn bridged(drawing: &Drawing) -> Bridged<EdgeFacts> {
    bridge_crossings(drawing, &lines_of(drawing))
}

fn across(y: f64) -> Vec<Point> {
    across_from(y, 0.0, 100.0)
}

fn down(x: f64) -> Vec<Point> {
    down_from(x, 0.0, 100.0)
}

/// A straight route across at one height, from one place to another.
fn across_from(y: f64, from: f64, to: f64) -> Vec<Point> {
    points(&[(from, y), (to, y)])
}

/// A straight route down at one place, from one height to another.
fn down_from(x: f64, from: f64, to: f64) -> Vec<Point> {
    points(&[(x, from), (x, to)])
}

/// Whether a bridge is a hop, not a cut.
fn hops(bridge: &DrawingBridge) -> bool {
    bridge.curve.segments.len() > 1
}

fn curves(edges: &[DrawingEdge<EdgeFacts>]) -> Vec<&Curve> {
    edges.iter().map(|edge| &edge.curve).collect()
}

/// The one bridge, a hop, by the route that carries it and those it clears.
fn lone_hop(result: &Bridged<EdgeFacts>) -> (&str, Vec<&str>) {
    assert_eq!(result.bridges.len(), 1);
    let bridge = &result.bridges[0];
    assert!(hops(bridge));
    (
        bridge.edge_id.as_str(),
        bridge.under.iter().map(String::as_str).collect(),
    )
}

/// How far a hop reaches from where it leaves its line, each way across it:
/// a hop over a line across bulges up (negative) or down (positive), one over
/// a line down left (negative) or right (positive).
fn bulge_of(bridge: &DrawingBridge) -> (f64, f64) {
    let Curve { from, segments } = &bridge.curve;
    let level = segments.last().unwrap().to().y == from.y;
    let offsets = segments.iter().map(|segment| {
        let to = segment.to();
        if level { to.y - from.y } else { to.x - from.x }
    });
    offsets.fold((0.0, 0.0), |(least, most), offset: f64| {
        (least.min(offset), most.max(offset))
    })
}

#[test]
fn a_straight_line_hops_a_line_that_turns_just_past_the_crossing() {
    // The other route turns seven units below the crossing, or four, turning back.
    for turning in [
        points(&[(50.0, 0.0), (50.0, 65.0), (100.0, 65.0)]),
        points(&[(50.0, 0.0), (50.0, 62.0), (0.0, 62.0)]),
    ] {
        let before = drawing(&[across(50.0), turning]);
        let result = bridged(&before);
        assert_eq!(lone_hop(&result), ("0", vec!["1"]));
        assert_eq!(result.edges[1].curve, before.edges[1].curve);
    }
}

#[test]
fn where_neither_line_has_a_bends_room_the_one_with_more_room_rises() {
    let result = bridged(&drawing(&[
        points(&[(50.0, 0.0), (50.0, 76.0), (0.0, 76.0)]),
        points(&[(0.0, 50.0), (73.0, 50.0), (73.0, 100.0)]),
    ]));
    assert_eq!(lone_hop(&result), ("0", vec!["1"]));
}

#[test]
fn a_line_that_turns_just_before_a_crossing_does_not_hop_it() {
    let result = bridged(&drawing(&[
        points(&[(0.0, 50.0), (200.0, 50.0)]),
        points(&[(40.0, 27.0), (90.0, 27.0), (90.0, 120.0)]),
    ]));
    assert_eq!(lone_hop(&result), ("0", vec!["1"]));
}

#[test]
fn a_line_hops_a_trunk_beside_a_join_and_is_cut_clear_of_the_join_at_it() {
    for (x, joined) in [(160.0, true), (164.8, false), (168.0, false)] {
        let result = bridged(&drawing(&[
            points(&[(0.0, 100.0), (200.0, 100.0)]),
            points(&[(152.0, 0.0), (152.0, 100.0), (200.0, 100.0)]),
            points(&[(x, 0.0), (x, 200.0)]),
        ]));
        let cut = result
            .bridges
            .iter()
            .find(|bridge| bridge.under.iter().any(|id| id == "2"));
        let is_cut = cut.is_some_and(|cut| cut.edge_id == "0" && cut.join == Some(true));
        assert_eq!(is_cut, joined, "x={x}");
        let hop = result.bridges.iter().find(|bridge| bridge.edge_id == "2");
        assert_eq!(hop.is_some_and(hops), !joined, "x={x}");
    }
}

#[test]
fn a_crossing_with_room_on_both_lines_hops_centred_bulging_the_one_way() {
    let result = bridged(&drawing(&[down(50.0), across(50.0)]));
    assert_eq!(lone_hop(&result), ("1", vec!["0"]));
    // The later line rises over the earlier one, its crest on the crossing, up.
    let curve = &result.bridges[0].curve;
    assert_eq!(curve.segments[0].to(), point(50.0, 43.0));
    assert!(curve.segments[0].to().y < curve.from.y);
}

#[test]
fn every_route_of_a_trunk_hops_with_it() {
    let before = drawing(&[
        points(&[(100.0, 0.0), (100.0, 100.0)]),
        points(&[(0.0, 50.0), (200.0, 50.0)]),
        // The same line one unit lower, run the other way.
        points(&[(200.0, 51.0), (0.0, 51.0)]),
    ]);
    let result = bridged(&before);
    assert_eq!(lone_hop(&result), ("1", vec!["0"]));
    let crest = curve_bounds(&result.bridges[0].curve).y;
    for (index, line) in [(1, 50.0), (2, 51.0)] {
        let curve = &result.edges[index].curve;
        assert_eq!(curve_bounds(curve).y, crest + line - 50.0, "route {index}");
        assert_eq!(curve.end().y, line, "route {index}");
    }
    ink::hides_hop(&before, &result, "2", crest + 1.0);
}

#[test]
fn where_the_other_line_turns_just_past_a_crossing_the_hop_bulges_away_from_the_turn() {
    for (routes, left) in [
        // The other route turns four units past the crossing, to the right.
        (
            [
                points(&[(0.0, -60.0), (0.0, 100.0)]),
                points(&[(-120.0, 0.0), (12.0, 0.0), (12.0, 80.0)]),
            ],
            true,
        ),
        // ... or eight units past it, above.
        (
            [
                points(&[(0.0, 50.0), (100.0, 50.0)]),
                points(&[(50.0, 100.0), (50.0, 34.0), (100.0, 34.0)]),
            ],
            false,
        ),
    ] {
        let result = bridged(&drawing(&routes));
        assert_eq!(lone_hop(&result), ("0", vec!["1"]));
        let (least, most) = bulge_of(&result.bridges[0]);
        assert_eq!(if left { most } else { least.abs() }, 0.0);
    }
}

/// Whether the pass leaves every route as it was and draws no bridge.
fn untouched(routes: &[Vec<Point>]) -> bool {
    let before = drawing(routes);
    let result = bridged(&before);
    result.bridges.is_empty() && curves(&result.edges) == curves(&before.edges)
}

#[test]
fn corners_that_turn_beside_or_against_another_line_cross_it_plainly() {
    // A rounded corner turning beside a straight line, under where a hop's
    // shoulder would be; routes that run together through a turn and part;
    // two opposing rounded corners.
    assert!(untouched(&[
        points(&[(-20.0, -64.0), (0.0, -64.0), (0.0, 18.0), (-8.0, 18.0)]),
        points(&[(-100.0, 0.0), (6.0, 0.0), (6.0, 100.0)]),
    ]));
    assert!(untouched(&[
        points(&[(0.0, 0.0), (0.0, 100.0), (100.0, 100.0)]),
        points(&[(0.0, 30.0), (0.0, 100.0), (60.0, 100.0), (60.0, 160.0)]),
    ]));
    assert!(untouched(&[
        points(&[(12.0, 0.0), (12.0, 100.0), (-50.0, 100.0)]),
        points(&[(0.0, 0.0), (0.0, 100.0), (80.0, 100.0)]),
    ]));
}

#[test]
fn a_line_crosses_a_trunk_once_wherever_it_is_painted_among_its_routes() {
    let between = bridged(&drawing(&[down(50.0), across(50.0), down(50.0)]));
    assert_eq!(between.bridges.len(), 1);
    assert_eq!(between.bridges[0].edge_id, "1");
    let mut under = between.bridges[0].under.clone();
    under.sort();
    assert_eq!(under, ["0", "2"]);
    // A trunk painted over the line rises as one, the route beneath its
    // drawer hopping the same way.
    let over = bridged(&drawing(&[across(50.0), down(50.0), down(50.0)]));
    assert_eq!(lone_hop(&over), ("1", vec!["0"]));
    assert_eq!(over.edges[2].curve, over.edges[1].curve);
}

/// Whether each route still leaves and reaches its own card.
fn ends_kept(edges: &[DrawingEdge<EdgeFacts>], routes: &[Vec<Point>]) -> bool {
    edges.iter().zip(routes).all(|(edge, route)| {
        (edge.curve.from, edge.curve.end()) == (route[0], route[route.len() - 1])
    })
}

/// Whether the last pieces of two routes, a row each, no longer overlap.
fn rows_apart(edges: &[DrawingEdge<EdgeFacts>]) -> bool {
    let rows: Vec<(f64, f64)> = curves(edges)
        .into_iter()
        .map(|curve| {
            let [.., one, other] = curve.segments.as_slice() else {
                unreachable!("a route of two pieces or more")
            };
            let (from, to) = (one.to().x, other.to().x);
            (from.min(to), from.max(to))
        })
        .collect();
    rows[0].0 >= rows[1].1 || rows[1].0 >= rows[0].1
}

#[test]
fn routes_that_cross_where_they_turn_onto_one_row_hop_on_straight_runs() {
    let routes = [
        points(&[(-100.0, 0.0), (0.0, 0.0), (0.0, 150.0), (100.0, 150.0)]),
        points(&[(120.0, 100.0), (30.0, 100.0), (30.0, 150.0), (-80.0, 150.0)]),
    ];
    let label = Rect {
        x: -30.0,
        y: 30.0,
        width: 60.0,
        height: 20.0,
    };
    let mut before = drawing(&routes);
    before.width = 240.0;
    before.height = 160.0;
    before.edges[0].label = Some(PlacedLabel {
        bounds: label,
        measured: MeasuredLabel {
            width: 60.0,
            height: 20.0,
            runs: Vec::new(),
            chips: vec![Chip {
                y: 0.0,
                height: 20.0,
            }],
        },
    });
    let result = bridged(&before);
    let bridge = result.bridges.iter().find(|bridge| hops(bridge)).unwrap();
    let mut ids = [vec![bridge.edge_id.clone()], bridge.under.clone()].concat();
    ids.sort();
    assert_eq!(ids, ["0", "1"]);
    assert!(ends_kept(&result.edges, &routes));
    assert!(rows_apart(&result.edges));
    // The label rides its moved lane.
    let moved = result.edges[0].label.as_ref().unwrap().bounds;
    assert_eq!(moved.y, label.y);
    assert_eq!(moved.x + moved.width / 2.0, 30.0);
}

#[test]
fn a_fans_line_that_turns_back_across_its_siblings_lane_drops_a_lane_before_it() {
    let routes = [
        points(&[(0.0, 0.0), (100.0, 0.0), (100.0, 200.0), (200.0, 200.0)]),
        points(&[(0.0, 0.0), (116.0, 0.0), (116.0, 100.0), (-60.0, 100.0)]),
    ];
    let mut before = drawing(&routes);
    before.width = 300.0;
    before.height = 260.0;
    for edge in &mut before.edges {
        edge.edge.from = "hub".to_owned();
    }
    let result = bridged(&before);
    assert_eq!(result.bridges, Vec::<DrawingBridge>::new());
    assert!(ends_kept(&result.edges, &routes));
}

/// How far across and down each bend of a curve reaches.
fn bends_of(curve: &Curve) -> Vec<(f64, f64)> {
    let starts = std::iter::once(curve.from).chain(curve.segments.iter().map(Segment::to));
    starts
        .zip(&curve.segments)
        .filter_map(|(from, segment)| match segment {
            Segment::Cubic { to, .. } => Some(((to.x - from.x).abs(), (to.y - from.y).abs())),
            Segment::Line { .. } => None,
        })
        .collect()
}

/// A route with just the room its two turns and its head need.
fn fitting() -> Vec<Point> {
    points(&[(0.0, 0.0), (0.0, 8.0), (16.0, 8.0), (16.0, 28.0)])
}

#[test]
fn an_ordinary_bend_rounds_eight_across_on_legs_just_long_enough() {
    assert_eq!(
        bends_of(&curve_through(&fitting(), false)),
        [(8.0, 8.0), (8.0, 8.0)]
    );
}

#[test]
fn a_completed_route_needs_room_for_every_fixed_turn_and_its_head() {
    assert!(!lacks_clearance(&curve_through(&fitting(), false), None));
    // A route too short for its turns still rounds them at eight; only the
    // finished route is refused, so label settlement tries another first.
    for short in [
        points(&[(0.0, 1.0), (0.0, 8.0), (16.0, 8.0), (16.0, 28.0)]),
        points(&[(0.0, 0.0), (0.0, 8.0), (15.0, 8.0), (15.0, 28.0)]),
        points(&[(0.0, 0.0), (0.0, 8.0), (16.0, 8.0), (16.0, 27.0)]),
    ] {
        assert!(lacks_clearance(&curve_through(&short, false), None));
    }
    let labelled = curve_through(&points(&[(0.0, 0.0), (0.0, 40.0), (60.0, 40.0)]), false);
    let label = |x| Rect {
        x,
        y: 35.0,
        width: 20.0,
        height: 10.0,
    };
    assert!(!lacks_clearance(&labelled, Some(label(8.0))));
    assert!(lacks_clearance(&labelled, Some(label(7.0))));
}

#[test]
fn coordinate_jitter_makes_no_rounded_turn() {
    let jittered = points(&[
        (1.0, 0.0),
        (1.0, 25.0),
        (1.0 + 1e-13, 25.0),
        (1.0 + 1e-13, 50.0),
    ]);
    let curve = curve_through(&jittered, false);
    assert!(matches!(curve.segments.as_slice(), [Segment::Line { .. }]));
    assert!(!lacks_clearance(&curve, None));
}
