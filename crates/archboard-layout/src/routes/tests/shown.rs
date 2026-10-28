//! A drawing with some subjects left out: its crossings are settled again on
//! what is left, from the routes as the crossing pass settled them
//! (`shown_drawing`).

use std::collections::{BTreeMap, HashSet};

use archboard_scene::drawing::{DrawingNode, MeasuredNode, Painted, PaintedDrawing};

use super::{
    Arrowhead, Dash, Drawing, DrawingBridge, LineLook, NodeFacts, Rect, across, bridged, curves,
    down, drawing, points,
};
use crate::shown_drawing;

/// A drawing as the core draws it, its crossings settled.
fn painted(drawing: Drawing) -> Painted {
    let bridged = bridged(&drawing);
    PaintedDrawing {
        drawing,
        bridged,
        frozen: false,
    }
}

/// Every route solid with a filled head.
fn solid(drawing: &Drawing) -> BTreeMap<String, LineLook> {
    let look = LineLook {
        dash: Dash::Solid,
        arrowhead: Arrowhead::Filled,
    };
    drawing
        .edges
        .iter()
        .map(|edge| (edge.edge.id.clone(), look))
        .collect()
}

/// Leave the subjects named out.
fn without(whole: &Painted, ids: &[&str]) -> Painted {
    let unshown: HashSet<String> = ids.iter().map(|&id| id.to_owned()).collect();
    shown_drawing(whole, &unshown, &solid(&whole.drawing))
}

#[test]
fn a_line_is_not_hopped_or_cut_where_it_crosses_a_line_that_is_not_drawn() {
    let whole = painted(drawing(&[across(50.0), down(50.0)]));
    assert_eq!(whole.bridged.bridges.len(), 1);
    for (unshown, kept) in [("0", "1"), ("1", "0")] {
        let shown = without(&whole, &[unshown]);
        assert_eq!(shown.bridged.bridges, Vec::<DrawingBridge>::new());
        let ids: Vec<&str> = shown
            .bridged
            .edges
            .iter()
            .map(|edge| edge.edge.id.as_str())
            .collect();
        assert_eq!(ids, [kept]);
        let settled = whole.drawing.edges.iter().find(|edge| edge.edge.id == kept);
        assert_eq!(shown.bridged.edges[0].curve, settled.unwrap().curve);
    }
}

#[test]
fn lines_keep_their_lanes_where_a_card_that_is_not_drawn_held_them_apart() {
    // Two routes whose rows fold a crossing into their corners, and a card
    // between the lanes they would exchange onto.
    let mut folded = drawing(&[
        points(&[(0.0, 50.0), (60.0, 50.0), (60.0, 100.0), (100.0, 100.0)]),
        points(&[(100.0, 50.0), (40.0, 50.0), (40.0, 0.0), (0.0, 0.0)]),
    ]);
    let node = NodeFacts {
        id: "gone".to_owned(),
        order: 1000.0,
        name: "Gone".to_owned(),
        responsibility: None,
    };
    folded.cards.push(DrawingNode {
        measured: MeasuredNode {
            node,
            width: 10.0,
            height: 10.0,
            header_height: 10.0,
            runs: Vec::new(),
            headers: None,
            pointed: None,
        },
        bounds: Rect {
            x: 45.0,
            y: 20.0,
            width: 10.0,
            height: 10.0,
        },
        depth: 0.0,
    });
    let whole = painted(folded);
    let shown = without(&whole, &["gone"]);
    assert_eq!(curves(&shown.bridged.edges), curves(&whole.bridged.edges));
}
