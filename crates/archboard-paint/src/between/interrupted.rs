//! A new flight starts with the geometry and cuts of the frame it interrupts.

use archboard_scene::paint::design::RAIL_GAP;
use archboard_scene::scene::{Definition, Geometry, Item, Mask, MaskId, Purpose, Shape, Stroke, Token};

use super::testing::{PHASES, line, rect, scene};
use super::{Between, Scene};

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
