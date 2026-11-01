//! A new flight starts with the geometry and cuts of the frame it interrupts.

use archboard_scene::paint::design::RAIL_GAP;
use archboard_scene::scene::{Definition, Geometry, Item, Mask, MaskId, Purpose, Shape, Stroke, Token};

use super::testing::{PHASES, card, drawing, line, plate, rect, scene};
use super::{Between, Entrance, Scene};

fn double_line(y: f64) -> Scene {
    let route = vec![
        archboard_scene::scene::PathStep::Move {
            to: super::testing::at(0.0, y),
        },
        archboard_scene::scene::PathStep::Line {
            to: super::testing::at(100.0, y),
        },
    ];
    let mask = Mask {
        id: MaskId { line: "e".into() },
        bounds: rect(-18.0, y - 18.0, 136.0, 36.0),
        shapes: vec![
            Shape::path(Purpose::Cutout, route)
                .unfilled()
                .stroked(Stroke::new(Token::Border, RAIL_GAP)),
        ],
    };
    let mut edge = line("e", &[(0.0, y), (100.0, y)]);
    let Item::Group(group) = &mut edge else {
        unreachable!("a line is a group");
    };
    group.mask = Some(mask.id.clone());
    scene(
        vec![
            Item::Definitions {
                definitions: vec![Definition::Mask(mask)],
            },
            edge,
        ],
        &[],
    )
}

fn core(mask: &Mask) -> Geometry {
    mask.shapes
        .iter()
        .find(|shape| shape.purpose == Purpose::Cutout)
        .expect("the double line has a core")
        .geometry
        .clone()
}

#[test]
fn a_double_line_keeps_its_in_between_core_when_another_picture_arrives() {
    let (from, next, last) = (double_line(0.0), double_line(100.0), double_line(200.0));
    let first = Between::new(&from, &next, (0.0, 0.0), &PHASES);
    let expected = core(&first.masks_at(0.3)[0]);
    let (seen, _) = first.seen_at(0.3, &next);
    let second = Between::new(&seen, &last, (0.0, 0.0), &PHASES);
    assert_eq!(core(&second.masks_at(0.0)[0]), expected);
}

/// A card's visible box includes the growth of its entrance.
fn drawn_box(group: &archboard_scene::scene::Group) -> archboard_scene::geometry::Rect {
    let frame = plate(group);
    let transform = group
        .transform
        .unwrap_or(archboard_scene::scene::Transform::translate(0.0, 0.0));
    let scale = transform.scale.unwrap_or(1.0);
    rect(
        frame.x * scale + transform.x,
        frame.y * scale + transform.y,
        frame.width * scale,
        frame.height * scale,
    )
}

#[test]
fn an_interrupted_entrance_keeps_the_box_the_reader_saw() {
    let frame = rect(10.0, 10.0, 100.0, 50.0);
    let from = scene(vec![card("a", frame, &["Title"])], &[("a", frame)]);
    let seen = Scene {
        body: Entrance::new(&from, &PHASES).at(0.2),
        ..from
    };
    let expected = drawn_box(drawing(&seen.body, "a")[0]);
    for there in [frame, rect(200.0, 200.0, 100.0, 50.0)] {
        let next = scene(vec![card("a", there, &["Title"])], &[("a", there)]);
        let between = Between::new(&seen, &next, (0.0, 0.0), &PHASES);
        let carried = between.at(0.0);
        assert_eq!(drawn_box(drawing(&carried, "a")[0]), expected);
        assert_eq!(drawn_box(drawing(&between.at(0.99), "a")[0]), there);
    }
}
