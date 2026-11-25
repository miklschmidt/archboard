//! The head a line ends in: drawn at its own size in the picture's units at
//! every zoom, its tip on the line's end.

use archboard_scene::drawing::Emphasis;
use archboard_scene::geometry::Point;
use archboard_scene::scene::{
    Definition, Head, HeadInk, Item, Marker, MarkerId, PathStep, Purpose, Shape, Stroke, Token,
};

use super::{frame, stage_of};
use crate::presentation::Camera;

/// A line 240 units long that ends in a filled head 11 units long.
fn headed_line() -> Vec<Item> {
    let head = MarkerId::Shared {
        head: Head::Filled,
        weight: Emphasis::Normal,
        ink: HeadInk::Neutral,
    };
    let triangle = vec![
        PathStep::Move {
            to: Point { x: 0.0, y: 0.0 },
        },
        PathStep::Line {
            to: Point { x: 10.0, y: 5.0 },
        },
        PathStep::Line {
            to: Point { x: 0.0, y: 10.0 },
        },
        PathStep::Close,
    ];
    let mut line = Shape::path(
        Purpose::Line,
        vec![
            PathStep::Move {
                to: Point { x: 0.0, y: 0.0 },
            },
            PathStep::Line {
                to: Point { x: 240.0, y: 0.0 },
            },
        ],
    )
    .stroked(Stroke::new(Token::Border, 2.0));
    line.marker = Some(head.clone());
    vec![
        Item::Definitions {
            definitions: vec![Definition::Marker(Marker {
                id: head,
                view: 10.0,
                reference: Point { x: 8.0, y: 5.0 },
                size: 11.0,
                shapes: vec![Shape::path(Purpose::Arrowhead, triangle).filled(Token::Border)],
            })],
        },
        Item::Shape(line),
    ]
}

/// The box of the head a camera at some scale draws.
fn head_seen_at(scale: f64) -> kurbo::Rect {
    let mut stage = stage_of(headed_line());
    stage.set_camera(
        Camera {
            x: 0.0,
            y: 0.0,
            scale,
        },
        0.0,
        0.0,
    );
    let (ops, _) = frame(&mut stage, 0.0);
    ops.iter()
        .rfind(|op| !op.stroked)
        .expect("the head is filled")
        .drawn
}

#[test]
fn a_head_scales_with_the_picture_and_keeps_its_tip_on_the_line_end() {
    for scale in [0.1, 0.25, 1.0] {
        let head = head_seen_at(scale);
        assert!(
            (head.width() - 11.0 * scale).abs() < 1e-6,
            "{scale}: {head:?}"
        );
        // The tip stands past the line's end by a fifth of the head.
        let tip = (240.0 + 11.0 / 5.0) * scale;
        assert!((head.x1 - tip).abs() < 1e-6, "{scale}: {head:?}");
    }
}
