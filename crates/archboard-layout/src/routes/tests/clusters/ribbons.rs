//! Cable crossings where the strands need to rise as one ribbon.

use std::collections::BTreeMap;

use archboard_scene::drawing::{DrawingBridge, Emphasis};
use archboard_scene::geometry::curve_bounds;

use super::hops_of;
use crate::routes::bridge_crossings;
use crate::routes::tests::{
    Drawing, across_from, bulge_of, down_from, drawing, drawn, lines_of, points,
};

/// Attach `strands` as riders of `leader` in both endpoints and the rider map.
fn link_cable(
    cables: &mut Drawing,
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

// Interleaved paint order split the horizontal cable three over and one under.
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
    assert_crossings_covered(
        &all_hops,
        &["3", "4", "5", "6"],
        &["0", "1", "2", "7", "8", "9", "10"],
    );
    let bulges: Vec<bool> = all_hops
        .iter()
        .map(|hop| {
            let (least, most) = bulge_of(hop);
            most > least.abs()
        })
        .collect();
    assert!(bulges.iter().all(|&side| side == bulges[0]), "{bulges:?}");
    assert_no_crosswise_overlap(&all_hops);
}

/// Each drawn intersection is covered by exactly one hop.
fn assert_crossings_covered(hops: &[&DrawingBridge], across: &[&str], down: &[&str]) {
    for &row in across {
        for &column in down {
            let over = |line: &str, under: &str| {
                hops.iter()
                    .filter(|hop| hop.edge_id == line && hop.under.iter().any(|id| id == under))
                    .count()
            };
            assert_eq!(over(row, column) + over(column, row), 1, "{row} × {column}");
        }
    }
}

/// Assert that no two crosswise hops overlap.
fn assert_no_crosswise_overlap(all_hops: &[&DrawingBridge]) {
    let across = |hop: &DrawingBridge| hop.curve.from.y == hop.curve.end().y;
    for (index, one) in all_hops.iter().enumerate() {
        let a = curve_bounds(&one.curve);
        for other in &all_hops[index + 1..] {
            if across(one) == across(other) {
                continue;
            }
            let b = curve_bounds(&other.curve);
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
    link_cable(&mut cables, &mut riders, 0, &[1, 2]);
    link_cable(&mut cables, &mut riders, 3, &[7]);
    link_cable(&mut cables, &mut riders, 4, &[5, 6]);
    let result = bridge_crossings(&cables, &lines_of(&cables), &riders);
    let hops = hops_of(&result.bridges);
    assert_crossings_covered(&hops, &["4", "5", "6"], &["0", "1", "2", "3", "7"]);
    assert_no_crosswise_overlap(&hops);
}

// Even when a middle strand cannot rise (e.g. dashed in a mixed-dash cable over a solid line
// that cannot rise over the whole ribbon), align_cables must never flip an outer strand into a
// crosswise hop over that middle strand.
#[test]
fn align_cables_never_flips_a_strand_into_a_crosswise_hop_over_a_sibling() {
    let mut cables = drawn(
        &[
            // The solid line starts too close to the cable to rise over all three strands.
            points(&[(50.0, 42.0), (50.0, 120.0), (150.0, 120.0)]),
            // Horizontal 3-strand cable: solid (1), dashed event (2), solid (3).
            across_from(50.0, -100.0, 200.0),
            across_from(58.0, -100.0, 200.0),
            across_from(66.0, -100.0, 200.0),
        ],
        &[(2, "event", Emphasis::Normal)],
    );
    let mut riders = BTreeMap::new();
    link_cable(&mut cables, &mut riders, 1, &[2, 3]);
    let result = bridge_crossings(&cables, &lines_of(&cables), &riders);
    let hops = hops_of(&result.bridges);
    assert_crossings_covered(&hops, &["1", "2", "3"], &["0"]);
    assert_no_crosswise_overlap(&hops);
}

#[test]
fn a_solid_cable_rises_over_a_cable_with_a_hero_strand_and_a_dashed_strand() {
    let mut cables = drawn(
        &[
            across_from(50.0, -100.0, 200.0),
            across_from(58.0, -100.0, 200.0),
            down_from(40.0, -100.0, 200.0),
            down_from(48.0, -100.0, 200.0),
        ],
        &[(0, "call", Emphasis::Hero), (1, "event", Emphasis::Muted)],
    );
    let mut riders = BTreeMap::new();
    link_cable(&mut cables, &mut riders, 0, &[1]);
    link_cable(&mut cables, &mut riders, 2, &[3]);
    let result = bridge_crossings(&cables, &lines_of(&cables), &riders);
    let hops = hops_of(&result.bridges);
    assert_eq!(hops.len(), 2, "{hops:?}");
    assert!(
        hops.iter()
            .all(|hop| hop.edge_id == "2" || hop.edge_id == "3"),
        "{hops:?}"
    );
    assert_crossings_covered(&hops, &["0", "1"], &["2", "3"]);
}
