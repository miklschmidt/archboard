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
    let drawn = drawing(&shape, 8.0, &[]).expect("a gap to close");
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
    let drawn = drawing(&shape, 8.0, &[]).expect("room to take out");
    let join = drawn.edges[1].points[1].y;
    assert!(drawn.cards[1].bx.y - join >= JOIN_ROOM);
    assert!(drawn.cards[1].bx.y < 500.0);
}

// Architecture drawing: lines that left one card on one stretch parted just below it,
// right beside the back arrowhead of the two-way line among them, here `straight`.
#[test]
fn a_line_leaving_another_after_their_card_keeps_a_junctions_room() {
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
            line("parting", &[(400.0, 120.0), (400.0, 300.0), (600.0, 300.0)]),
        ],
        titles: Vec::new(),
        routed: None,
    });
    let drawn = drawing(&shape, 8.0, &["straight"]).expect("room to take out");
    let source = drawn.cards[0].bx;
    let part = drawn.edges[1].points[1].y;
    assert!(part - (source.y + source.height) >= JOIN_ROOM);
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
    let drawn = drawing(&shape, 8.0, &[]).expect("room to take out");
    assert!(super::super::junctions::readable(
        &drawn.edges[0].points,
        &drawn.edges[1].points,
        false,
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
    let drawn = drawing(&shape, 8.0, &[]).expect("room to take out");
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
    let drawn = drawing(&shape, 8.0, &[]).expect("room to take out");
    for (branch, straight) in [(0, 2), (1, 3)] {
        assert!(super::super::junctions::readable(
            &drawn.edges[branch].points,
            &drawn.edges[straight].points,
            false,
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
    let drawn = drawing(&shape, 8.0, &[]).expect("room between the cards");
    for row in drawn.cards.as_chunks::<2>().0 {
        let gap = row[1].bx.x - row[0].bx.x - row[0].bx.width;
        assert!(gap <= CARD_GAP + STAY_ALIGNED);
    }
}

// A reading with a few open frames (TASK-658): a card that moved up took its corner along and kept
// its height, and the line leaving its bottom wall took the same shift, but the two sums rounded
// apart. The line then started a hair inside its own card, so the guard refused every tight
// drawing and the picture kept its empty trays.
#[test]
fn a_sparse_frame_closes_and_its_lines_stay_on_their_cards_walls() {
    // The size of a card with a two-line summary, as words are measured.
    let tall = 112.602;
    let card = |id: &str, y: f64| PlacedCard {
        id: id.into(),
        bx: Rect {
            x: 100.0,
            y,
            width: 340.0,
            height: tall,
        },
        depth: 1,
        header: None,
    };
    let (upper, lower) = (923.408, 1923.408);
    let frame = PlacedCard {
        id: "frame".into(),
        bx: Rect {
            x: 40.0,
            y: 40.0,
            width: 460.0,
            height: 2100.0,
        },
        depth: 0,
        header: None,
    };
    let shape = Shape::new(Placed {
        width: 600.0,
        height: 2200.0,
        cards: vec![card("upper", upper), card("lower", lower)],
        frames: vec![frame],
        regions: Vec::new(),
        edges: vec![PlacedLine {
            id: "down".into(),
            points: vec![
                Point {
                    x: 270.0,
                    y: upper + tall,
                },
                Point { x: 270.0, y: lower },
            ],
            label: None,
        }],
        titles: Vec::new(),
        routed: None,
    });
    let drawn = drawing(&shape, 8.0, &[]).expect("empty tray to take out");
    let (from, to) = (drawn.cards[0].bx, drawn.cards[1].bx);
    let line = &drawn.edges[0].points;
    assert_eq!(line[0].y, from.y + from.height);
    assert_eq!(line[1].y, to.y);
    let frame = drawn.frames[0].bx;
    assert!(from.y - frame.y < 100.0, "the tray above the cards closes");
    assert!(
        to.y - (from.y + from.height) < 100.0,
        "the band between the cards closes"
    );
    assert!(
        frame.y + frame.height - (to.y + to.height) < 100.0,
        "the tray below closes"
    );
}

#[test]
fn a_run_only_lands_on_an_unambiguous_endpoint_wall() {
    for axis in [Axis::X, Axis::Y] {
        check_endpoint_walls(axis);
    }
}

fn check_endpoint_walls(axis: Axis) {
    let mut upper = card("upper", 100.0, 923.408);
    upper.bx.height = 112.602;
    let wall = upper.bx.y + upper.bx.height;
    let frame = card("frame", 200.0, wall);
    let mut far_frame = card("far-frame", 400.0, upper.bx.y);
    far_frame.bx.height = upper.bx.height;
    let down = |id: &str, x, y| PlacedLine {
        id: id.into(),
        points: vec![Point { x, y }, Point { x, y: y + 100.0 }],
        label: None,
    };
    let mut into_frame = down("frame-end", 450.0, wall);
    into_frame.points.reverse();
    let mut drawing = Placed {
        width: 600.0,
        height: 2200.0,
        cards: vec![upper],
        frames: vec![frame, far_frame],
        regions: Vec::new(),
        edges: vec![
            down("card", 190.0, wall),
            down("coincident", 250.0, wall),
            down("near", 175.0, wall + 1e-9),
            PlacedLine {
                id: "passing".into(),
                points: vec![
                    Point {
                        x: 120.0,
                        y: 1100.0,
                    },
                    Point { x: 120.0, y: wall },
                    Point { x: 180.0, y: wall },
                    Point {
                        x: 180.0,
                        y: 1100.0,
                    },
                ],
                label: None,
            },
            into_frame,
        ],
        titles: Vec::new(),
        routed: None,
    };
    let card_end = drawing.edges[0].points[0];
    drawing.edges[0].points.insert(0, card_end);
    let frame_end = drawing.edges[4].points[1];
    drawing.edges[4].points.push(frame_end);
    if matches!(axis, Axis::X) {
        transpose(&mut drawing);
    }
    let sheet = Sheet::of(&drawing, axis, &[]);
    let shift = -900.0;
    let shifts = vec![shift; sheet.movers];
    sheet.apply_boxes(&mut drawing, axis, &shifts);
    sheet.apply_lines(&mut drawing, axis, &shifts);
    let upper = drawing.cards[0].bx;
    let far_frame = drawing.frames[1].bx;
    let passing = &drawing.edges[3].points;
    assert_eq!(
        [
            axis.of(drawing.edges[0].points[0]),
            axis.of(drawing.edges[1].points[0]),
            axis.of(drawing.edges[2].points[0]),
            axis.of(passing[1]),
            axis.of(passing[2]),
            axis.of(drawing.edges[4].points[2]),
        ],
        [
            axis.span(upper).1,
            wall + shift,
            (wall + 1e-9) + shift,
            wall + shift,
            wall + shift,
            axis.span(far_frame).1,
        ]
    );
    assert!(
        drawing
            .edges
            .iter()
            .flat_map(|line| line.points.windows(2))
            .all(|pair| pair[0].x == pair[1].x || pair[0].y == pair[1].y)
    );
}

fn transpose(drawing: &mut Placed) {
    std::mem::swap(&mut drawing.width, &mut drawing.height);
    for card in drawing.cards.iter_mut().chain(&mut drawing.frames) {
        std::mem::swap(&mut card.bx.x, &mut card.bx.y);
        std::mem::swap(&mut card.bx.width, &mut card.bx.height);
    }
    for point in drawing.edges.iter_mut().flat_map(|line| &mut line.points) {
        std::mem::swap(&mut point.x, &mut point.y);
    }
}
