//! A new flight starts with the geometry and cuts of the frame it interrupts.

use archboard_scene::geometry::{Curve, Segment};
use archboard_scene::paint::design::RAIL_GAP;
use archboard_scene::scene::{
    Colour, Definition, Geometry, Group, Item, Mask, MaskId, Motion, PulseLook, Purpose, Role,
    Shape, Stroke, Token, TrafficMark,
};

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
fn drawn_box(group: &Group) -> archboard_scene::geometry::Rect {
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

#[test]
fn the_furniture_of_an_interrupted_entrance_keeps_its_visibility() {
    let frame = rect(10.0, 10.0, 100.0, 50.0);
    let Item::Group(shadow) = super::testing::shadow() else {
        unreachable!("a shadow is a group");
    };
    let mark = TrafficMark {
        look: PulseLook {
            head: Colour::White,
            hot: Colour::White,
            line_width: 1.2,
        },
        route: Curve {
            from: super::testing::at(110.0, 35.0),
            segments: vec![Segment::Line {
                to: super::testing::at(200.0, 35.0),
            }],
        },
        motion: Motion::Steady {
            speed: 50.0,
            spacing: 100.0,
            phase: 0.0,
        },
    };
    let next = scene(
        vec![
            Item::Group(shadow.standing_with(vec!["a".into()])),
            line("e", &[(110.0, 35.0), (200.0, 35.0)]),
            Item::Group(Group::new(
                Role::Traffic("e".into()),
                vec![Item::Traffic(mark)],
            )),
            card("a", frame, &["Title"]),
        ],
        &[("a", frame)],
    );
    for progress in [0.2, 0.75] {
        let seen = Scene {
            body: Entrance::new(&next, &PHASES).at(progress),
            ..next.clone()
        };
        let carried = Between::new(&seen, &next, (0.0, 0.0), &PHASES).at(0.0);
        let visibility = |body: &[Item]| {
            body.iter()
                .filter_map(|item| match item {
                    Item::Group(group)
                        if matches!(group.role, Role::Shadow(_) | Role::Traffic(_)) =>
                    {
                        Some(group.opacity.unwrap_or(1.0))
                    }
                    _ => None,
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(visibility(&carried), visibility(&seen.body));
    }
}
