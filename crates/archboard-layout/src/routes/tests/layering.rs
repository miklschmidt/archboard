//! Which of two crossing lines rises by its look and its room, and what a hop
//! keeps clear of.

use super::{
    Chip, DrawingBridge, Emphasis, MeasuredLabel, PlacedLabel, Rect, across, across_from, bridged,
    bulge_of, down, down_from, drawing, drawn, hops, lone_hop, points,
};

// Archboard server (blocks): a muted line rose over a hero one and broke it.
#[test]
fn the_more_emphasised_line_rises_wherever_it_is_painted() {
    for (hero, muted) in [(0, 1), (1, 0)] {
        let result = bridged(&drawn(
            &[down(50.0), across(50.0)],
            &[
                (hero, "call", Emphasis::Hero),
                (muted, "call", Emphasis::Muted),
            ],
        ));
        let id = hero.to_string();
        assert_eq!(lone_hop(&result).0, id);
    }
}

// Archboard server (blocks): a dotted line rose over a solid one; its arc
// barely showed, and the solid line read as broken.
#[test]
fn a_solid_line_rises_over_a_dashed_one_and_where_no_hop_fits_the_two_cross_plainly() {
    // The dashed line is painted later and would rise between equals.
    let event = [(1, "event", Emphasis::Normal)];
    let over = bridged(&drawn(&[down(50.0), across(50.0)], &event));
    assert_eq!(lone_hop(&over), ("0", vec!["1"]));
    // The solid line turns just past the crossing: neither line has room to
    // rise, and a gap with no arc over it would read as a break (TASK-408).
    let turning = points(&[(50.0, 0.0), (50.0, 58.0), (100.0, 58.0)]);
    let result = bridged(&drawn(&[turning, across(50.0)], &event));
    assert_eq!(result.bridges, Vec::<DrawingBridge>::new());
}

// Every engine: between two lines that both have all the room a hop wants,
// the longer one rose, and hops moved about with every edit far away.
#[test]
fn between_two_lines_with_all_the_room_a_hop_wants_the_later_painted_rises() {
    let result = bridged(&drawing(&[down_from(50.0, 0.0, 300.0), across(100.0)]));
    assert_eq!(result.bridges.len(), 1);
    assert_eq!(
        (
            result.bridges[0].edge_id.as_str(),
            result.bridges[0].under.as_slice()
        ),
        ("1", ["0".to_owned()].as_slice())
    );
}

// Every engine: a hop stood over a line that turned onto its crest's side a
// few points past it, and the two drew one knot.
#[test]
fn a_hop_bulges_up_only_where_the_line_beneath_runs_straight_well_past_its_crest() {
    for (turn, up) in [(28.0, true), (31.0, false)] {
        let beneath = points(&[(50.0, 100.0), (50.0, turn), (100.0, turn)]);
        let result = bridged(&drawing(&[beneath, across(50.0)]));
        assert_eq!(result.bridges.len(), 1, "turn at {turn}");
        assert!(hops(&result.bridges[0]), "turn at {turn}");
        let (least, most) = bulge_of(&result.bridges[0]);
        assert_eq!(if up { most } else { least.abs() }, 0.0, "turn at {turn}");
    }
}

// Archboard server (graphviz): an arc stood five points from a label's edge.
#[test]
fn a_hop_keeps_a_labels_clearance_from_it_bulging_away_where_it_must() {
    let mut labelled = drawing(&[down(50.0), across(50.0)]);
    labelled.edges[0].label = Some(PlacedLabel {
        bounds: Rect {
            x: 62.0,
            y: 40.0,
            width: 30.0,
            height: 8.0,
        },
        measured: MeasuredLabel {
            width: 30.0,
            height: 8.0,
            runs: Vec::new(),
            chips: vec![Chip {
                y: 0.0,
                height: 8.0,
            }],
        },
    });
    let result = bridged(&labelled);
    // The line down hops, to its left, away from the label on its right.
    let hop = result.bridges.iter().find(|bridge| hops(bridge)).unwrap();
    assert_eq!(hop.edge_id, "0");
    assert_eq!(bulge_of(hop).1, 0.0);
}

// Archboard server (graphviz): an arc stood fifteen points from the tip of the
// arrowhead of the line it crossed; and a crossing past the head, but still on
// its approach, was refused a hop and cut (the user, 2026-09-27).
#[test]
fn a_hop_keeps_clear_of_another_lines_arrowhead_and_stands_across_its_approach_past_the_head() {
    let near = bridged(&drawing(&[
        down_from(50.0, 0.0, 200.0),
        across_from(100.0, 150.0, 35.0),
    ]));
    assert_eq!(near.bridges, Vec::<DrawingBridge>::new());
    let past = bridged(&drawing(&[
        down_from(50.0, 0.0, 200.0),
        across_from(100.0, 150.0, 28.0),
    ]));
    assert_eq!(past.bridges.len(), 1);
    assert!(hops(&past.bridges[0]));
}

// A dashed line cut beneath a solid one shows no gap among its own, and read
// as not crossed at all (the user, 2026-09-27): a solid line hops it a few
// points past its own bend, as it hops a solid one.
#[test]
fn a_solid_line_hops_a_dashed_one_with_the_least_room_past_its_feet_as_it_hops_a_solid_one() {
    let turning = points(&[(50.0, 0.0), (50.0, 72.0), (100.0, 72.0)]);
    let routes = [turning, across(50.0)];
    let dashed = bridged(&drawn(&routes, &[(1, "event", Emphasis::Normal)]));
    assert_eq!(lone_hop(&dashed), ("0", vec!["1"]));
    // Between two solid lines, one of them hops.
    assert!(bridged(&drawing(&routes)).bridges.iter().any(hops));
}
