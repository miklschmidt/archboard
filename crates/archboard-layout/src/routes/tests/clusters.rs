//! Crossings along one line close enough for their hops to touch: who rises
//! over them, and under how many arcs.

use super::{
    DrawingBridge, Emphasis, across, across_from, bridged, down, down_from, drawing, drawn, hops,
    points,
};

/// The hops among a crossing pass's bridges.
fn hops_of(bridges: &[DrawingBridge]) -> Vec<&DrawingBridge> {
    bridges.iter().filter(|bridge| hops(bridge)).collect()
}

// Command interface and Skill evaluation: two lines sixteen apart crossing one
// line each hopped it cleanly, and became one long brace on the line they cross.
#[test]
fn lines_crossing_a_line_sixteen_apart_each_hop_it_where_every_hop_fits() {
    // Whether the crossed line is painted first or between the two.
    for (routes, line) in [
        (
            [down_from(50.0, 0.0, 150.0), across(50.0), across(66.0)],
            "0",
        ),
        (
            [across(50.0), down_from(50.0, 0.0, 150.0), across(66.0)],
            "1",
        ),
    ] {
        let result = bridged(&drawing(&routes));
        assert_eq!(result.bridges.len(), 2);
        for bridge in &result.bridges {
            assert!(hops(bridge));
            assert_eq!(bridge.under, [line]);
        }
    }
}

// Code review: a hop on one of two close lines stood first, and left the
// other line cut where one crest over both fits.
#[test]
fn where_lines_too_close_to_hop_one_each_cross_a_line_it_rises_over_them_under_one_crest() {
    let turning = points(&[(50.0, 0.0), (50.0, 90.0), (100.0, 90.0)]);
    for (routes, line, others) in [
        (
            [turning.clone(), across(50.0), across(62.0)],
            "0",
            ["1", "2"],
        ),
        ([across(50.0), turning, across(62.0)], "1", ["0", "2"]),
    ] {
        let result = bridged(&drawing(&routes));
        assert_eq!(result.bridges.len(), 1);
        let bridge = &result.bridges[0];
        assert_eq!(bridge.edge_id, line);
        assert!(hops(bridge));
        let mut under = bridge.under.clone();
        under.sort();
        assert_eq!(under, others);
    }
}

// Where a cluster holds a crossing no hop can pass over, its line still rises
// over the crossings it can, one at a time.
#[test]
fn a_line_rises_over_one_crossing_of_a_cluster_whose_crest_cannot_stand() {
    let result = bridged(&drawing(&[
        across(50.0),
        // Turns eight below the crossing: it cannot rise, but a hop passes over it.
        points(&[(40.0, 0.0), (40.0, 64.0), (0.0, 64.0)]),
        // Ends ten above the crossing: nothing rises over it.
        down_from(60.0, 100.0, 40.0),
    ]));
    let hop = result.bridges.iter().find(|bridge| hops(bridge)).unwrap();
    assert_eq!(
        (hop.edge_id.as_str(), hop.under.as_slice()),
        ("0", ["1".to_owned()].as_slice())
    );
    // The crossing nothing rises over is crossed plainly, with no gap cut in either line.
    assert_eq!(hops_of(&result.bridges).len(), result.bridges.len());
}

// Code review: a crest over two lines spanned a line ending between them,
// whose cut beneath then erased its arrowhead under ink no longer there.
#[test]
fn a_crest_never_spans_a_crossing_it_does_not_hop() {
    let result = bridged(&drawing(&[
        down(40.0),
        down(60.0),
        down_from(50.0, 100.0, 47.0),
        across(50.0),
    ]));
    for bridge in hops_of(&result.bridges) {
        let (from, to) = (bridge.curve.from, bridge.curve.end());
        let spans =
            from.x.min(to.x) < 50.0 && from.x.max(to.x) > 50.0 && from.y == 50.0 && to.y == 50.0;
        assert!(!spans);
    }
}

// Browser application (blocks): a line hopped one line and was hopped by
// another sixteen apart, the two arcs one knot.
#[test]
fn a_line_is_above_or_beneath_along_all_of_one_cluster_never_both() {
    let result = bridged(&drawing(&[
        // Turns fourteen below its second crossing: it can hop that one alone,
        // but has no room for a crest over both.
        points(&[(100.0, 0.0), (100.0, 138.0), (200.0, 138.0)]),
        across_from(100.0, 0.0, 200.0),
        // Turns six before the crossing: it cannot rise.
        points(&[(86.0, 200.0), (86.0, 116.0), (200.0, 116.0)]),
    ]));
    let hops = hops_of(&result.bridges);
    let over = hops
        .iter()
        .filter(|bridge| bridge.under.iter().any(|id| id == "0"));
    assert_eq!(over.count(), 1);
    assert!(!hops.iter().any(|bridge| bridge.edge_id == "0"));
}

// Agent workbench (blocks): a solid line rose over two dashed lines sixteen
// apart under one long brace, where no hop reads cleaner (the user,
// 2026-09-27). Archboard server: the solid line was then cut at each dashed
// line with no arc over the gap, and read as broken (TASK-408).
#[test]
fn dashed_lines_close_together_across_a_solid_line_are_not_hopped_and_the_lines_cross_plainly() {
    let result = bridged(&drawn(
        &[down_from(50.0, 0.0, 150.0), across(50.0), across(66.0)],
        &[
            (1, "event", Emphasis::Normal),
            (2, "event", Emphasis::Normal),
        ],
    ));
    // No crest stands and no line is cut: every hop and every cut is a bridge.
    assert_eq!(result.bridges, Vec::<DrawingBridge>::new());
}

// Agent workbench (blocks): a line hopped one line sixteen past where a
// weightier line it could not rise over was cut through it. The weightier
// line hops it instead, and the line is cut where no hop has room beside that one.
#[test]
fn a_weightier_line_hops_a_line_that_cannot_rise_over_it_and_no_hop_stands_beside_that_one() {
    let result = bridged(&drawn(
        &[
            // Starts twenty above the weightier line, too near to rise over it.
            down_from(50.0, 30.0, 150.0),
            across(50.0),
            // Turns four before the crossing: it cannot rise.
            points(&[(38.0, 120.0), (38.0, 66.0), (150.0, 66.0)]),
        ],
        &[(1, "call", Emphasis::Hero)],
    ));
    let hops: Vec<(&str, &[String])> = hops_of(&result.bridges)
        .into_iter()
        .map(|bridge| (bridge.edge_id.as_str(), bridge.under.as_slice()))
        .collect();
    assert_eq!(hops, [("1", ["0".to_owned()].as_slice())]);
}

// Archboard server (blocks): a line hopped a line eight points from where a
// weightier line hopped it, the two arcs one knot.
#[test]
fn hops_on_crossing_lines_keep_a_hops_radius_between_them() {
    let result = bridged(&drawn(
        &[
            across_from(50.0, 0.0, 150.0),
            down(50.0),
            // Turns six below the crossing: it cannot rise, but a hop passes over it.
            points(&[(72.0, 0.0), (72.0, 64.0), (150.0, 64.0)]),
        ],
        &[(1, "call", Emphasis::Hero)],
    ));
    let hops: Vec<&str> = hops_of(&result.bridges)
        .into_iter()
        .map(|bridge| bridge.edge_id.as_str())
        .collect();
    assert_eq!(hops, ["1"]);
}
