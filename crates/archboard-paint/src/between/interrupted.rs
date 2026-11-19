//! A new flight starts with the geometry and cuts of the frame it interrupts.

use archboard_scene::geometry::{Curve, Segment};
use archboard_scene::paint::design::rail_gap;
use archboard_scene::scene::{
    Colour, Definition, Geometry, Group, Item, Mask, MaskId, Motion, PulseLook, Purpose, Role,
    Token, TrafficMark,
};

use super::testing::{PHASES, card, drawing, line, plate, rect, scene};
use super::{Between, Entrance, Handover, Scene};
use crate::testing::{stroke, traced};

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
        shapes: vec![traced(
            Purpose::Cutout,
            route,
            stroke(Token::Border, rail_gap()),
        )],
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
        body: Entrance::new(&from, &PHASES, None).at(0.2),
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

/// The pulses of a line that runs from one point to another.
fn pulses(id: &str, from: (f64, f64), to: (f64, f64)) -> Item {
    let mark = TrafficMark {
        look: PulseLook {
            head: Colour::White,
            hot: Colour::White,
            line_width: 1.2,
        },
        route: Curve {
            from: super::testing::at(from.0, from.1),
            segments: vec![Segment::Line {
                to: super::testing::at(to.0, to.1),
            }],
        },
        motion: Motion::Steady {
            speed: 50.0,
            spacing: 100.0,
            phase: 0.0,
        },
    };
    Item::Group(Group::new(
        Role::Traffic(id.into()),
        vec![Item::Traffic(mark)],
    ))
}

#[test]
fn the_furniture_of_an_interrupted_entrance_keeps_its_visibility() {
    let frame = rect(10.0, 10.0, 100.0, 50.0);
    let Item::Group(shadow) = super::testing::shadow() else {
        unreachable!("a shadow is a group");
    };
    let next = scene(
        vec![
            Item::Group(Group {
                members: vec!["a".into()],
                ..shadow
            }),
            line("e", &[(110.0, 35.0), (200.0, 35.0)]),
            pulses("e", (110.0, 35.0), (200.0, 35.0)),
            card("a", frame, &["Title"]),
        ],
        &[("a", frame)],
    );
    for progress in [0.2, 0.75] {
        let seen = Scene {
            body: Entrance::new(&next, &PHASES, None).at(progress),
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

#[test]
fn an_edit_of_an_interrupted_entrance_moves_the_same_way_every_time() {
    let frame = rect(10.0, 10.0, 100.0, 50.0);
    let cards = || vec![card("a", frame, &["Title"])];
    let first = scene(cards(), &[("a", frame)]);
    let mut lined = cards();
    for at in 0..6 {
        let y = 40.0 + f64::from(at) * 2.0;
        let id = format!("e{at}");
        lined.push(line(&id, &[(110.0, y), (200.0, y)]));
        lined.push(pulses(&id, (110.0, y), (200.0, y)));
    }
    let second = scene(lined, &[("a", frame)]);
    let edited = scene(cards(), &[("a", frame)]);
    let run = || {
        let entering = Scene {
            body: Entrance::new(&first, &PHASES, None).at(0.4),
            ..first.clone()
        };
        let handover = Handover {
            last: &entering,
            shown: 0.6,
        };
        let interrupted = Entrance::new(&second, &PHASES, Some(handover));
        let seen = Scene {
            body: interrupted.at(interrupted.length() * 0.9),
            ..second.clone()
        };
        let edit = Between::new(&seen, &edited, (0.0, 0.0), &PHASES);
        let frames: Vec<_> = [0.0, 0.1, 0.2, 0.3]
            .map(|progress| edit.at(progress))
            .into();
        serde_json::to_vec(&frames).expect("items as JSON")
    };
    assert!(run() == run(), "the same edit draws the same bytes");
}
