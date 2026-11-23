//! The head a line ends in: drawn at its own size near, grown far, its tip on
//! the line's end.

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
    .unfilled()
    .stroked(Stroke::new(Token::Border, 2.0));
    line.marker = Some(head.clone());
    vec![
        Item::Definitions {
            definitions: vec![Definition::Marker(Marker {
                id: head,
                view: 10.0,
                reference: Point { x: 8.0, y: 5.0 },
                hold: Point { x: 10.0, y: 5.0 },
                size: 11.0 / 2.0,
                shapes: vec![Shape::path(Purpose::Arrowhead, triangle).filled(Token::Border)],
            })],
        },
        Item::Shape(line),
    ]
}

/// The box of the head a far camera draws, on a page of some pixel ratio, if it knows one.
fn head_seen_far(ratio: Option<f64>) -> kurbo::Rect {
    let mut stage = stage_of(headed_line());
    if let Some(ratio) = ratio {
        stage.set_pixel_ratio(ratio);
    }
    stage.set_camera(
        Camera {
            x: 0.0,
            y: 0.0,
            scale: 0.25,
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

/// The tip of the test's head on a camera at a quarter scale: past the line's
/// end by a fifth of the head.
const FAR_TIP: f64 = (240.0 + 11.0 / 5.0) * 0.25;

#[test]
fn a_head_seen_from_far_grows_by_the_marks_growth_and_keeps_its_tip_on_the_line_end() {
    let own = head_seen_far(None);
    assert!((own.width() - 11.0 * 0.25).abs() < 1e-6, "{own:?}");
    assert!((own.x1 - FAR_TIP).abs() < 1e-6, "{own:?}");
    for ratio in [1.0, 2.0] {
        let held = head_seen_far(Some(ratio));
        let grown = 11.0 * 0.25 * archboard_scene::paint::design::mark_growth(ratio, 0.25);
        assert!((held.width() - grown).abs() < 1e-6, "{ratio}: {held:?}");
        assert!((held.x1 - FAR_TIP).abs() < 1e-6, "{ratio}: {held:?}");
    }
}

#[test]
fn a_head_near_enough_is_drawn_at_its_own_size() {
    let mut stage = stage_of(headed_line());
    stage.set_pixel_ratio(1.0);
    let (ops, _) = frame(&mut stage, 0.0);
    let near = ops
        .iter()
        .rfind(|op| !op.stroked)
        .expect("the head is filled")
        .drawn;
    assert!((near.width() - 11.0).abs() < 1e-6, "{near:?}");
}
