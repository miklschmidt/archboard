use super::*;
use crate::{
    blocks::assembly::{PlacedCard, PlacedLine},
    geometry::{Point, Rect},
};

const CARD: Point = Point { x: 200.0, y: 100.0 };

fn card(id: &str, x: f64, y: f64) -> PlacedCard {
    PlacedCard {
        id: id.into(),
        bx: Rect {
            x,
            y,
            width: CARD.x,
            height: CARD.y,
        },
        depth: 1,
        header: None,
    }
}

/// A run that climbs the gap of the first row and leaves it above and below.
fn lane(id: &str, x: f64) -> PlacedLine {
    let (start, end) = (Point { x, y: 0.0 }, Point { x, y: 150.0 });
    PlacedLine {
        id: id.into(),
        points: vec![start, end],
        label: None,
    }
}

#[test]
fn a_busy_row_leaves_the_gap_of_a_quiet_row_alone() {
    let left = 100.0;
    let right = left + CARD.x + 200.0;
    let cards = vec![
        card("a", left, 20.0),
        card("b", right, 20.0),
        card("c", left, 300.0),
        card("d", right, 300.0),
    ];
    let lanes = (0..3).map(|lane_at| {
        let at = f64::from(lane_at);
        lane(&format!("lane{lane_at}"), left + CARD.x + 60.0 + at * 40.0)
    });
    let shape = Shape::new(Placed {
        width: 1000.0,
        height: 600.0,
        cards,
        frames: Vec::new(),
        regions: Vec::new(),
        edges: lanes.collect(),
        titles: Vec::new(),
        routed: None,
    });
    let drawn = drawing(&shape, 8.0).expect("a gap to close");
    let gap = |one: usize, two: usize| {
        let (first, second) = (drawn.cards[one].bx, drawn.cards[two].bx);
        second.x - first.x - first.width
    };
    assert_eq!(gap(2, 3), CARD_GAP);
    assert!(gap(0, 1) >= 3.0 * 2.0 * 8.0);
}

// Canonical architecture: a line that joined another just above the card
// they enter came out of contraction with too little room for the junction,
// so the guard refused every tight drawing and the loose one stood.
#[test]
fn a_line_joining_another_before_their_card_keeps_a_junctions_room() {
    let line = |id: &str, points: &[(f64, f64)]| PlacedLine {
        id: id.into(),
        points: points.iter().map(|&(x, y)| Point { x, y }).collect(),
        label: None,
    };
    let shape = Shape::new(Placed {
        width: 1000.0,
        height: 1000.0,
        cards: vec![card("source", 300.0, 20.0), card("target", 300.0, 500.0)],
        frames: Vec::new(),
        regions: Vec::new(),
        edges: vec![
            line("straight", &[(400.0, 120.0), (400.0, 500.0)]),
            line("joining", &[(200.0, 300.0), (400.0, 300.0), (400.0, 500.0)]),
        ],
        titles: Vec::new(),
        routed: None,
    });
    let drawn = drawing(&shape, 8.0).expect("room to take out");
    let join = drawn.edges[1].points[1].y;
    assert!(drawn.cards[1].bx.y - join >= JOIN_ROOM);
    assert!(drawn.cards[1].bx.y < 500.0);
}

#[test]
fn branches_that_join_from_opposite_sides_keep_a_junctions_room() {
    let line = |id: &str, from: f64| PlacedLine {
        id: id.into(),
        points: vec![
            Point { x: from, y: 100.0 },
            Point { x: from, y: 300.0 },
            Point { x: 400.0, y: 300.0 },
            Point { x: 400.0, y: 500.0 },
        ],
        label: None,
    };
    let shape = Shape::new(Placed {
        width: 1000.0,
        height: 1000.0,
        cards: vec![
            card("left", 0.0, 0.0),
            card("right", 600.0, 0.0),
            card("target", 300.0, 500.0),
        ],
        frames: Vec::new(),
        regions: Vec::new(),
        edges: vec![line("left", 100.0), line("right", 700.0)],
        titles: Vec::new(),
        routed: None,
    });
    let drawn = drawing(&shape, 8.0).expect("room to take out");
    assert!(super::super::junctions::readable(
        &drawn.edges[0].points,
        &drawn.edges[1].points,
        true,
    ));
    assert!(drawn.cards[2].bx.y < 500.0);
}

#[test]
fn coincident_whole_routes_need_no_junction_room() {
    let line = |id: &str| PlacedLine {
        id: id.into(),
        points: vec![
            Point { x: 100.0, y: 100.0 },
            Point { x: 100.0, y: 300.0 },
            Point { x: 400.0, y: 300.0 },
            Point { x: 400.0, y: 500.0 },
        ],
        label: None,
    };
    let shape = Shape::new(Placed {
        width: 1000.0,
        height: 1000.0,
        cards: vec![card("source", 0.0, 0.0), card("target", 300.0, 500.0)],
        frames: Vec::new(),
        regions: Vec::new(),
        edges: vec![line("one"), line("two")],
        titles: Vec::new(),
        routed: None,
    });
    let drawn = drawing(&shape, 8.0).expect("room to take out");
    let points = &drawn.edges[0].points;
    assert!(points[3].y - points[2].y < JOIN_ROOM);
}

#[test]
fn one_incoming_run_keeps_room_for_each_target_join() {
    let cards = vec![
        card("source", 0.0, 0.0),
        card("a", 300.0, 0.0),
        card("a_source", 300.0, 500.0),
        card("b", 600.0, 500.0),
        card("b_source", 600.0, 0.0),
    ];
    let graph: crate::graph::Node = serde_json::from_value(serde_json::json!({
        "id": "root",
        "children": cards.iter().map(|card| serde_json::json!({
            "id": card.id, "width": card.bx.width, "height": card.bx.height
        })).collect::<Vec<_>>(),
        "edges": [
            {"id": "sa", "sources": ["source"], "targets": ["a"]},
            {"id": "sb", "sources": ["source"], "targets": ["b"]},
            {"id": "aa", "sources": ["a_source"], "targets": ["a"]},
            {"id": "bb", "sources": ["b_source"], "targets": ["b"]}
        ]
    }))
    .unwrap();
    let model = super::super::model::Model::new(&graph).unwrap();
    let topology = super::super::topology::Topology::new(&model);
    let line = |id: &str, points: &[(f64, f64)]| PlacedLine {
        id: id.into(),
        points: points.iter().map(|&(x, y)| Point { x, y }).collect(),
        label: None,
    };
    let shape = super::super::fixed::placement(
        &model,
        Placed {
            width: 1000.0,
            height: 1000.0,
            cards,
            frames: Vec::new(),
            regions: Vec::new(),
            edges: vec![
                line(
                    "sa",
                    &[
                        (200.0, 50.0),
                        (250.0, 50.0),
                        (250.0, 300.0),
                        (400.0, 300.0),
                        (400.0, 100.0),
                    ],
                ),
                line(
                    "sb",
                    &[
                        (200.0, 50.0),
                        (250.0, 50.0),
                        (250.0, 300.0),
                        (700.0, 300.0),
                        (700.0, 500.0),
                    ],
                ),
                line("aa", &[(400.0, 500.0), (400.0, 100.0)]),
                line("bb", &[(700.0, 100.0), (700.0, 500.0)]),
            ],
            titles: Vec::new(),
            routed: None,
        },
    )
    .unwrap();
    assert!(
        shape
            .routes
            .iter()
            .all(|line| super::super::fixed::feasible(
                &model,
                &topology,
                model.edge_index[line.id.as_str()],
                &shape,
                &line.points
            ))
    );
    assert!(super::super::runs::freeze(&model, &shape.routes).is_some());
    let drawn = drawing(&shape, 8.0).expect("room to take out");
    for (branch, straight) in [(0, 2), (1, 3)] {
        assert!(super::super::junctions::readable(
            &drawn.edges[branch].points,
            &drawn.edges[straight].points,
            true
        ));
    }
}

#[test]
fn alignment_cannot_chain_small_gaps_into_a_large_cost() {
    let mut cards = Vec::new();
    for row in 0..3 {
        let y = f64::from(row) * 300.0;
        let mut left = card(&format!("left{row}"), 0.0, y);
        left.bx.width += f64::from(row) * 35.0;
        cards.extend([left, card(&format!("right{row}"), 600.0, y)]);
    }
    let shape = Shape::new(Placed {
        width: 1000.0,
        height: 1000.0,
        cards,
        frames: Vec::new(),
        regions: Vec::new(),
        edges: Vec::new(),
        titles: Vec::new(),
        routed: None,
    });
    let drawn = drawing(&shape, 8.0).expect("room between the cards");
    for row in drawn.cards.as_chunks::<2>().0 {
        let gap = row[1].bx.x - row[0].bx.x - row[0].bx.width;
        assert!(gap <= CARD_GAP + STAY_ALIGNED);
    }
}
