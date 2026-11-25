//! Crossings along one line close enough for their hops to touch: who rises
//! over them, and under how many arcs.

use super::super::{BRIDGE_CLEARANCE, BRIDGE_RADIUS, bridge_crossings};
use super::{
    Arrowhead, BTreeMap, Dash, DrawingBridge, Emphasis, LineLook, across, across_from, bridged,
    curve_bounds, down, down_from, drawing, drawn, hops, lines_of, points,
};

/// The hops among a crossing pass's bridges.
fn hops_of(bridges: &[DrawingBridge]) -> Vec<&DrawingBridge> {
    bridges.iter().filter(|bridge| hops(bridge)).collect()
}

// Command interface and Skill evaluation: two lines sixteen apart crossing one
// line each hopped it cleanly, and became one long brace on the line they cross.
#[test]
fn lines_crossing_a_line_sixteen_apart_each_hop_it_where_every_hop_fits() {
    // Whether the crossed line is painted first or between the two. Every
    // line runs straight well past its approaches, so each has a hop's room.
    let crossed = || down_from(50.0, -50.0, 150.0);
    let crosser = |y| across_from(y, -50.0, 150.0);
    for (routes, line) in [
        ([crossed(), crosser(50.0), crosser(66.0)], "0"),
        ([crosser(50.0), crossed(), crosser(66.0)], "1"),
    ] {
        let result = bridged(&drawing(&routes));
        assert_eq!(result.bridges.len(), 2);
        for bridge in &result.bridges {
            assert!(hops(bridge));
            assert_eq!(bridge.under, [line]);
        }
    }
}

// Kinds layer: where a ribbon of strands crossed a line, every strand hopped the
// line on its own, and a crossing of two ribbons drew a hop at every pair.
#[test]
fn the_strands_of_one_cable_crossing_a_line_are_hopped_as_one_ribbon() {
    let crossed = || down_from(50.0, -50.0, 150.0);
    let crosser = |y| across_from(y, -50.0, 150.0);
    let mut cable = drawing(&[crossed(), crosser(50.0), crosser(66.0)]);
    let (from, to) = (
        cable.edges[1].edge.from.clone(),
        cable.edges[1].edge.to.clone(),
    );
    cable.edges[2].edge.from = from;
    cable.edges[2].edge.to = to;
    let riders = BTreeMap::from([("2".to_owned(), "1".to_owned())]);
    let result = bridge_crossings(&cable, &lines_of(&cable), &riders);
    assert_eq!(result.bridges.len(), 1);
    let bridge = &result.bridges[0];
    assert_eq!(bridge.edge_id, "0");
    assert!(hops(bridge));
    let mut under = bridge.under.clone();
    under.sort();
    assert_eq!(under, ["1", "2"]);
}

#[test]
fn independent_routes_between_the_same_parts_each_hop_the_line_they_cross() {
    let mut reading = drawing(&[
        down_from(50.0, -50.0, 150.0),
        across_from(50.0, -50.0, 150.0),
        across_from(66.0, -50.0, 150.0),
    ]);
    reading.edges[2].edge.from = reading.edges[1].edge.from.clone();
    reading.edges[2].edge.to = reading.edges[1].edge.to.clone();
    let result = bridged(&reading);
    assert_eq!(result.bridges.len(), 2);
    for bridge in &result.bridges {
        assert!(hops(bridge));
        assert_eq!(bridge.under, ["0"]);
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
        // Ends ten above the crossing: no full hop rises over it.
        down_from(60.0, 100.0, 40.0),
    ]));
    let hop = result.bridges.iter().find(|bridge| hops(bridge)).unwrap();
    assert_eq!(
        (hop.edge_id.as_str(), hop.under.as_slice()),
        ("0", ["1".to_owned()].as_slice())
    );
    // Every crossing has an arc, and no gap is cut in either line.
    assert_eq!(hops_of(&result.bridges).len(), 2);
    assert_eq!(result.bridges.len(), 2);
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
        assert!(!spans || bridge.under.contains(&"2".to_owned()));
    }
}

// Browser application (blocks): a line hopped one line and was hopped by
// another sixteen apart, the two arcs one knot. A line hopped along its
// cluster rises at the rest of it only where the line crossing it has no room
// for a hop, since every crossing has an arc (TASK-570).
#[test]
fn a_line_hopped_along_its_cluster_rises_there_only_where_the_other_has_no_room() {
    let result = bridged(&drawing(&[
        // Turns fourteen below its second crossing: it can hop that one alone,
        // but has no room for a crest over both.
        points(&[(100.0, 0.0), (100.0, 138.0), (200.0, 138.0)]),
        across_from(100.0, 0.0, 200.0),
        // Turns six before the crossing: it cannot rise.
        points(&[(86.0, 200.0), (86.0, 116.0), (200.0, 116.0)]),
    ]));
    let hops: Vec<(&str, &[String])> = hops_of(&result.bridges)
        .into_iter()
        .map(|bridge| (bridge.edge_id.as_str(), bridge.under.as_slice()))
        .collect();
    assert_eq!(
        hops,
        [
            ("1", ["0".to_owned()].as_slice()),
            ("0", ["2".to_owned()].as_slice())
        ]
    );
    assert_eq!(result.bridges.len(), 2);
}

// Archboard server: a solid line was cut at each dashed line close across it
// with no arc over the gap, and read as broken (TASK-408). It then crossed
// them plainly, with no arc to say which line passes over (TASK-570).
#[test]
fn a_solid_line_rises_over_dashed_lines_close_together_under_one_crest() {
    let result = bridged(&drawn(
        &[down_from(50.0, 0.0, 150.0), across(50.0), across(66.0)],
        &[
            (1, "event", Emphasis::Normal),
            (2, "event", Emphasis::Normal),
        ],
    ));
    assert_eq!(result.bridges.len(), 1);
    let crest = &result.bridges[0];
    assert!(hops(crest));
    assert_eq!(
        (crest.edge_id.as_str(), crest.under.as_slice()),
        ("0", ["1".to_owned(), "2".to_owned()].as_slice())
    );
}

// Agent workbench (blocks): a line hopped one line sixteen past where a
// weightier line it could not rise over was cut through it. The weightier
// line hops it instead, and beside that one it hops the line too near its own
// bend to rise, since every crossing has an arc (TASK-570).
#[test]
fn a_weightier_line_hops_a_line_that_cannot_rise_over_it_and_it_hops_the_one_beside() {
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
    assert_eq!(
        hops,
        [
            ("1", ["0".to_owned()].as_slice()),
            ("0", ["2".to_owned()].as_slice())
        ]
    );
}

// Archboard server (blocks): a line hopped a line eight points from where a
// weightier line hopped it, the two arcs one knot. Where a crossing has no
// other arc, the line across rises a hop's radius clear of the first.
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
    let hops = hops_of(&result.bridges);
    let ids: Vec<&str> = hops.iter().map(|bridge| bridge.edge_id.as_str()).collect();
    assert_eq!(ids, ["1", "0"]);
    let [first, second] = [hops[0], hops[1]].map(|hop| curve_bounds(&hop.curve));
    assert!(second.x - (first.x + first.width) >= BRIDGE_RADIUS);
}

// Archboard (root): a line rose over two lines under one crest, and
// over a third twenty points short of them with a hop of its own, three points
// from the crest. A crest over several crossings runs on past them, so the
// third crossing is one cluster with them and its arc stands clear of theirs.
#[test]
fn a_crossing_a_crest_would_touch_is_one_cluster_with_the_crests_crossings() {
    let result = bridged(&drawn(
        &[
            // Turns down seventeen short of its first crossing: too near its bend to rise.
            points(&[(300.0, 50.0), (100.0, 50.0), (100.0, 150.0)]),
            down(117.0),
            down(137.5),
            down(153.5),
        ],
        &[
            (1, "event", Emphasis::Normal),
            (3, "event", Emphasis::Normal),
        ],
    ));
    let hops = hops_of(&result.bridges);
    // Every crossing has an arc.
    let mut arcs: Vec<&str> = hops
        .iter()
        .flat_map(|hop| {
            if hop.edge_id == "0" {
                hop.under.iter().map(String::as_str).collect()
            } else {
                vec![hop.edge_id.as_str()]
            }
        })
        .collect();
    arcs.sort_unstable();
    assert_eq!(arcs, ["1", "2", "3"]);
    // No two arcs crowd each other: arcs along one axis keep the clear space of
    // hops side by side, and arcs across each other a hop's radius each.
    for (index, one) in hops.iter().enumerate() {
        for other in &hops[index + 1..] {
            let [a, b] = [one, other].map(|hop| curve_bounds(&hop.curve));
            let apart = (b.x - (a.x + a.width))
                .max(a.x - (b.x + b.width))
                .max(b.y - (a.y + a.height))
                .max(a.y - (b.y + b.height));
            let crosswise = (a.width > a.height) != (b.width > b.height);
            let clear = if crosswise {
                BRIDGE_RADIUS
            } else {
                BRIDGE_CLEARANCE
            };
            assert!(
                apart >= 2.0 * clear,
                "{} and {}: {apart}",
                one.edge_id,
                other.edge_id
            );
        }
    }
}

// Owner's crop of the root reading: where a ribbon of strands hopped another cable, every strand
// arched one way but the outermost, which arched out the other way, so the set read as a tube.
#[test]
fn every_strand_of_a_cable_hopping_a_crossing_bulges_the_same_way() {
    // A ribbon of four strands down, eight apart, crossing a ribbon of four strands across.
    let mut routes: Vec<_> = (0..4)
        .map(|at| across_from(50.0 + 8.0 * f64::from(at), -100.0, 200.0))
        .collect();
    routes.extend((0..4).map(|at| down_from(40.0 + 8.0 * f64::from(at), -100.0, 200.0)));
    let mut cables = drawing(&routes);
    let mut riders = BTreeMap::new();
    for at in [1, 2, 3, 5, 6, 7] {
        let leader = if at < 4 { 0 } else { 4 };
        cables.edges[at].edge.from = cables.edges[leader].edge.from.clone();
        cables.edges[at].edge.to = cables.edges[leader].edge.to.clone();
        riders.insert(at.to_string(), leader.to_string());
    }
    let result = bridge_crossings(&cables, &lines_of(&cables), &riders);
    let sides: Vec<bool> = hops_of(&result.bridges)
        .into_iter()
        .map(|bridge| super::bulge_of(bridge).1 > 0.0)
        .collect();
    assert_eq!(sides.len(), 4);
    assert!(sides.iter().all(|&side| side == sides[0]), "{sides:?}");
}

#[test]
fn an_aligned_cable_keeps_its_hops_over_a_crossing() {
    let mut cable = drawn(
        &[
            down_from(50.0, -100.0, 200.0),
            across_from(50.0, -100.0, 200.0),
            across_from(66.0, -100.0, 200.0),
        ],
        &[(1, "call", Emphasis::Hero), (2, "call", Emphasis::Hero)],
    );
    cable.edges[2].edge.from = cable.edges[1].edge.from.clone();
    cable.edges[2].edge.to = cable.edges[1].edge.to.clone();
    let riders = BTreeMap::from([("2".to_owned(), "1".to_owned())]);
    let result = bridge_crossings(&cable, &lines_of(&cable), &riders);

    let mut risers: Vec<_> = hops_of(&result.bridges)
        .into_iter()
        .map(|hop| hop.edge_id.as_str())
        .collect();
    risers.sort_unstable();
    assert_eq!(risers, ["1", "2"]);
}

#[test]
fn turning_a_cables_hops_keeps_them_clear_of_a_join_between_its_strands() {
    let mut cable = drawn(
        &[
            down_from(50.0, -100.0, 200.0),
            across_from(50.0, -100.0, 200.0),
            across_from(58.0, -100.0, 200.0),
            across_from(54.0, 45.0, 200.0),
            across_from(54.0, 48.0, 200.0),
        ],
        &[(1, "call", Emphasis::Hero), (2, "call", Emphasis::Hero)],
    );
    cable.edges[2].edge.from = cable.edges[1].edge.from.clone();
    cable.edges[2].edge.to = cable.edges[1].edge.to.clone();
    let riders = BTreeMap::from([("2".to_owned(), "1".to_owned())]);
    let result = bridge_crossings(&cable, &lines_of(&cable), &riders);
    let lower = hops_of(&result.bridges)
        .into_iter()
        .find(|hop| hop.edge_id == "2")
        .expect("the lower strand still hops the crossing");
    assert_eq!(
        super::bulge_of(lower).0,
        0.0,
        "the hop bulges away from the join"
    );
}

#[test]
fn a_lifted_crest_matches_the_standing_hop_of_its_cable() {
    let mut cables = drawn(
        &[
            down_from(50.0, -100.0, 200.0),
            down_from(42.0, -100.0, 200.0),
            across_from(50.0, -100.0, 200.0),
            across_from(66.0, 10.0, 200.0),
            across_from(53.0, 64.0, 200.0),
            across_from(53.0, 67.0, 200.0),
        ],
        &[
            (0, "call", Emphasis::Hero),
            (1, "call", Emphasis::Hero),
            (3, "call", Emphasis::Hero),
        ],
    );
    for (strand, leader) in [(1, 0), (3, 2)] {
        cables.edges[strand].edge.from = cables.edges[leader].edge.from.clone();
        cables.edges[strand].edge.to = cables.edges[leader].edge.to.clone();
    }
    let riders = BTreeMap::from([
        ("1".to_owned(), "0".to_owned()),
        ("3".to_owned(), "2".to_owned()),
    ]);
    let result = bridge_crossings(&cables, &lines_of(&cables), &riders);

    let mut crests: Vec<_> = hops_of(&result.bridges)
        .into_iter()
        .map(|crest| {
            let mut under: Vec<_> = crest.under.iter().map(String::as_str).collect();
            under.sort_unstable();
            (crest.edge_id.as_str(), under, super::bulge_of(crest).0)
        })
        .collect();
    crests.sort_unstable_by_key(|&(id, _, _)| id);
    assert_eq!(
        crests,
        [("2", vec!["0", "1"], 0.0), ("3", vec!["0", "1"], 0.0)]
    );
}

#[test]
fn a_cable_hops_one_way_across_a_lines_end_approach() {
    let mut cable = drawing(&[down(50.0), down(58.0), across_from(50.0, 86.0, -100.0)]);
    cable.edges[1].edge.from = cable.edges[0].edge.from.clone();
    cable.edges[1].edge.to = cable.edges[0].edge.to.clone();
    let riders = BTreeMap::from([("1".to_owned(), "0".to_owned())]);
    let result = bridge_crossings(&cable, &lines_of(&cable), &riders);

    let hops = hops_of(&result.bridges);
    assert_eq!(hops.len(), 2);
    assert!(hops.iter().all(|hop| hop.under == ["2"]));
    let bulges_left = |hop| super::bulge_of(hop).0 < 0.0;
    assert_eq!(bulges_left(hops[0]), bulges_left(hops[1]));
    assert_eq!(result.edges[2].curve, cable.edges[2].curve);
}

#[test]
fn a_cable_hop_does_not_turn_into_the_crossed_lines_arrowhead() {
    let mut cable = drawing(&[down(50.0), down(58.0), across_from(50.0, -100.0, 73.0)]);
    cable.edges[1].edge.from = cable.edges[0].edge.from.clone();
    cable.edges[1].edge.to = cable.edges[0].edge.to.clone();
    let riders = BTreeMap::from([("1".to_owned(), "0".to_owned())]);
    let lines = BTreeMap::from([(
        "2".to_owned(),
        LineLook {
            arrowhead: Arrowhead::Equals,
            dash: Dash::Solid,
        },
    )]);
    let result = bridge_crossings(&cable, &lines, &riders);

    let hop = hops_of(&result.bridges)
        .into_iter()
        .find(|hop| hop.edge_id == "0")
        .expect("the first strand still hops the crossing");
    let bounds = curve_bounds(&hop.curve);
    // The compute mark has a bar 16.8 units back from its tip at x=73.
    assert!(bounds.x + bounds.width < 56.2);
}

/// Attach `strands` as riders of `leader` in both endpoints and the rider map.
fn link_cable(
    cables: &mut super::Drawing,
    riders: &mut BTreeMap<String, String>,
    leader: usize,
    strands: &[usize],
) {
    let from = cables.edges[leader].edge.from.clone();
    let to = cables.edges[leader].edge.to.clone();
    for &strand in strands {
        cables.edges[strand].edge.from = from.clone();
        cables.edges[strand].edge.to = to.clone();
        riders.insert(strand.to_string(), leader.to_string());
    }
}

// PR #154 after-image: a 4-strand horizontal cable crossing a 7-strand vertical cable with
// interleaved paint order split 3-over / 1-under, and align_cables flipped the bottom strand up
// straight through the vertical hops over the 3rd strand.
#[test]
fn a_cable_crossing_another_cable_never_splits_over_and_under_in_interleaved_paint_order() {
    let routes: Vec<_> = (0..3)
        .map(|at| down_from(40.0 + 8.0 * f64::from(at), -100.0, 200.0))
        .chain((0..4).map(|at| across_from(50.0 + 8.0 * f64::from(at), -100.0, 200.0)))
        .chain((3..7).map(|at| down_from(40.0 + 8.0 * f64::from(at), -100.0, 200.0)))
        .collect();
    let mut cables = drawing(&routes);
    let mut riders = BTreeMap::new();
    link_cable(&mut cables, &mut riders, 0, &[1, 2, 7, 8, 9, 10]);
    link_cable(&mut cables, &mut riders, 3, &[4, 5, 6]);
    let result = bridge_crossings(&cables, &lines_of(&cables), &riders);
    let all_hops = hops_of(&result.bridges);
    let horiz = |id: &str| matches!(id, "3" | "4" | "5" | "6");
    let horiz_count = all_hops.iter().filter(|h| horiz(&h.edge_id)).count();
    let vert_count = all_hops.len() - horiz_count;
    assert!(
        (horiz_count == 4 && vert_count == 0) || (vert_count == 7 && horiz_count == 0),
        "horizontal={horiz_count}, vertical={vert_count}"
    );
    let bulges: Vec<bool> = all_hops
        .iter()
        .map(|hop| {
            let (least, most) = super::bulge_of(hop);
            most > least.abs()
        })
        .collect();
    assert!(bulges.iter().all(|&side| side == bulges[0]), "{bulges:?}");
    assert_no_crosswise_overlap(&all_hops);
}

/// Assert that no two crosswise hops overlap.
fn assert_no_crosswise_overlap(all_hops: &[&DrawingBridge]) {
    for (index, one) in all_hops.iter().enumerate() {
        let a = curve_bounds(&one.curve);
        for other in &all_hops[index + 1..] {
            let b = curve_bounds(&other.curve);
            if (a.width > a.height) == (b.width > b.height) {
                continue;
            }
            let gap = (b.x - (a.x + a.width))
                .max(a.x - (b.x + b.width))
                .max(b.y - (a.y + a.height))
                .max(a.y - (b.y + b.height));
            assert!(
                gap >= 0.0,
                "crosswise overlap between {} and {}: {gap}",
                one.edge_id,
                other.edge_id
            );
        }
    }
}

// Browser reading: a 3-strand horizontal cable crossing a 3-strand vertical cable and a 2-strand
// vertical cable within one cluster split its middle strand under the right vertical cable, then
// flipped its bottom strand through the vertical hops.
#[test]
fn a_cable_crossing_two_cables_in_one_cluster_has_no_crosswise_arc_overlap() {
    let mut routes = Vec::new();
    // Left 3-strand vertical cable: 0, 1, 2
    for at in 0..3 {
        routes.push(down_from(40.0 + 8.0 * f64::from(at), -100.0, 200.0));
    }
    // Right 2-strand vertical cable: first strand (3) before horizontal, second (7) after.
    routes.push(down_from(82.0, -100.0, 200.0));
    // Horizontal 3-strand cable: 4, 5, 6
    for at in 0..3 {
        routes.push(across_from(50.0 + 8.0 * f64::from(at), -100.0, 200.0));
    }
    routes.push(down_from(74.0, -100.0, 200.0));

    let mut cables = drawing(&routes);
    let mut riders = BTreeMap::new();
    for (strand, leader) in [(1, 0), (2, 0), (7, 3), (5, 4), (6, 4)] {
        cables.edges[strand].edge.from = cables.edges[leader].edge.from.clone();
        cables.edges[strand].edge.to = cables.edges[leader].edge.to.clone();
        riders.insert(strand.to_string(), leader.to_string());
    }
    let result = bridge_crossings(&cables, &lines_of(&cables), &riders);
    assert_no_crosswise_overlap(&hops_of(&result.bridges));
}

// Even when a middle strand cannot rise (e.g. dashed in a mixed-dash cable over a solid line
// that cannot rise over the whole ribbon), align_cables must never flip an outer strand into a
// crosswise hop over that middle strand.
#[test]
fn align_cables_never_flips_a_strand_into_a_crosswise_hop_over_a_sibling() {
    let mut cables = drawn(
        &[
            // Solid vertical line turning right above the cable, so it cannot rise over all 3.
            points(&[(50.0, 42.0), (50.0, 120.0), (150.0, 120.0)]),
            // Horizontal 3-strand cable: solid (1), dashed event (2), solid (3).
            across_from(50.0, -100.0, 200.0),
            across_from(58.0, -100.0, 200.0),
            across_from(66.0, -100.0, 200.0),
        ],
        &[(2, "event", Emphasis::Normal)],
    );
    for strand in [2, 3] {
        cables.edges[strand].edge.from = cables.edges[1].edge.from.clone();
        cables.edges[strand].edge.to = cables.edges[1].edge.to.clone();
    }
    let riders = BTreeMap::from([
        ("2".to_owned(), "1".to_owned()),
        ("3".to_owned(), "1".to_owned()),
    ]);
    let result = bridge_crossings(&cables, &lines_of(&cables), &riders);
    assert_no_crosswise_overlap(&hops_of(&result.bridges));
}
