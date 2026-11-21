//! Contracts at the handoff between an opening, an entrance, and an edit.

use archboard_geometry::Rect;
use archboard_scene::scene::{Group, Item, Scene, Transform};

use super::ease::carried;
use super::open::{under_way, worn_edge};
use super::testing::{PHASES, card, drawing, line, rect, region, scene};
use super::{Between, Focus, Handover};

fn tray(width: f64) -> Scene {
    scene(
        vec![
            region("r", rect(40.0, 20.0, width, 140.0)),
            region("r", rect(40.0, 10.0, 60.0, 10.0)),
        ],
        &[],
    )
}

fn handover(last: &Scene, next: &Scene) -> Between {
    Between::enter(next, &PHASES, Some(Handover { last, gone: 0.0 })).0
}

fn assert_box(actual: Rect, expected: Rect) {
    for (a, b) in [
        (actual.x, expected.x),
        (actual.y, expected.y),
        (actual.width, expected.width),
        (actual.height, expected.height),
    ] {
        assert!((a - b).abs() < 1e-6, "{actual:?} against {expected:?}");
    }
}

#[test]
fn a_second_entrance_keeps_the_exact_clip_without_adding_padding() {
    let old = tray(300.0);
    let next = tray(100.0);
    let first = handover(&old, &next);
    let seen = Scene {
        body: first.at(0.15).0,
        ..next
    };
    let before = under_way(drawing(&seen.body, "r")[0]).unwrap();
    let second = handover(&seen, &old);
    let body = second.at(0.0);
    assert_box(under_way(drawing(&body.0, "r")[0]).unwrap(), before);
}

#[test]
fn an_entrance_takes_the_opacity_and_edge_of_an_unfinished_opening() {
    let old = tray(300.0);
    let first = Between::enter(&old, &PHASES, None).0;
    let seen = Scene {
        body: first.at(0.04).0,
        ..old
    };
    let before = drawing(&seen.body, "r")[0];
    let next = tray(100.0);
    let second = handover(&seen, &next);
    let body = second.at(0.0);
    let after = drawing(&body.0, "r")[0];
    assert_eq!(after.opacity, before.opacity);
    let (edge, solid) = worn_edge(after).expect("the edge survives the handoff");
    let (stood, shown) = worn_edge(before).unwrap();
    assert_box(edge, stood);
    assert!((solid - shown).abs() < 1e-6);
    assert_eq!(
        worn_edge(drawing(&body.0, "r")[1]),
        None,
        "the header wears no second edge"
    );
}

#[test]
fn an_edit_of_a_scaled_tray_keeps_the_edge_in_the_same_units() {
    let old = tray(300.0);
    let opening = Between::enter(&old, &PHASES, None).0;
    let seen = Scene {
        body: opening.at(0.1).0,
        ..old.clone()
    };
    let next = tray(100.0);
    let mut first = handover(&seen, &next);
    first.rebase(Transform {
        x: 15.0,
        y: 7.0,
        scale: Some(2.0),
    });
    let seen = Scene {
        body: first.at(0.1).0,
        ..next
    };
    let group = drawing(&seen.body, "r")[0];
    let scale = group.transform.unwrap().scale.unwrap();
    let before = worn_edge(group).unwrap();
    let edit = Between::carry(&seen, &old, (0.0, 0.0), &PHASES);
    let body = edit.at(0.0);
    let group = drawing(&body.0, "r")[0];
    let after = worn_edge(group).unwrap();
    assert_box(after.0, before.0);
    assert!((after.1 - before.1).abs() < 1e-6);
    assert!((group.transform.unwrap().scale.unwrap() - scale).abs() < 1e-6);
}

#[test]
fn a_second_edit_keeps_the_transformed_clip_of_the_first() {
    let old = tray(300.0);
    let opening = Between::enter(&old, &PHASES, None).0;
    let seen = Scene {
        body: opening.at(0.1).0,
        ..old.clone()
    };
    let next = tray(100.0);
    let first = Between::carry(&seen, &next, (0.0, 0.0), &PHASES);
    let at = Transform::translate(35.0, 25.0);
    let mut wrapper = Group::new(archboard_scene::scene::Role::Move, first.at(0.2).0);
    wrapper.transform = Some(at);
    let before = carried(under_way(drawing(&wrapper.items, "r")[0]).unwrap(), at);
    let seen = Scene {
        body: vec![Item::Group(wrapper)],
        ..next
    };
    let second = Between::carry(&seen, &old, (0.0, 0.0), &PHASES);
    let body = second.at(0.0);
    assert_box(under_way(drawing(&body.0, "r")[0]).unwrap(), before);
    assert_eq!(second.at(second.length()).0, old.body);
}

#[test]
fn a_new_line_in_an_edit_waits_for_its_new_source_card() {
    let old = scene(vec![], &[]);
    let next = scene(
        vec![
            card("a", rect(20.0, 20.0, 20.0, 20.0), &[]),
            card("b", rect(20.0, 80.0, 20.0, 20.0), &[]),
            line("e", &[(30.0, 40.0), (30.0, 80.0)]),
        ],
        &[],
    );
    let edit = Between::carry(&old, &next, (0.0, 0.0), &PHASES);
    let body = (0..150)
        .map(|step| edit.at(f64::from(step) / 100.0))
        .find(|body| drawing(&body.0, "e")[0].opacity != Some(0.0))
        .expect("the line appears");
    assert_eq!(drawing(&body.0, "a")[0].opacity.unwrap_or(1.0), 1.0);
}

#[test]
fn a_dashed_line_waits_for_the_card_at_its_far_end() {
    let mut route = line("e", &[(200.0, 90.0), (20.0, 20.0)]);
    let Item::Group(group) = &mut route else {
        panic!("a line")
    };
    let Item::Shape(shape) = &mut group.items[1] else {
        panic!("a route")
    };
    shape.stroke.as_mut().unwrap().dashes = vec![4.0, 4.0];
    let picture = scene(
        vec![
            card("near", rect(180.0, 90.0, 40.0, 20.0), &[]),
            card("far", rect(0.0, 0.0, 40.0, 20.0), &[]),
            route,
        ],
        &[],
    );
    let entrance = Between::enter(&picture, &PHASES, None).0;
    let body = (1..100)
        .map(|step| entrance.at(f64::from(step) / 100.0))
        .find(|body| {
            let line = drawing(&body.0, "e")[0];
            let Item::Shape(shape) = &line.items[1] else {
                panic!("a route")
            };
            line.opacity != Some(0.0) && shape.stroke.as_ref().unwrap().opacity.unwrap_or(1.0) > 0.0
        })
        .expect("the dashed line appears");
    assert_eq!(drawing(&body.0, "far")[0].opacity.unwrap_or(1.0), 1.0);
}

/// A carry from a tray still opening, which resizes the tray as it goes on.
fn carry_of_an_opening() -> Between {
    let old = tray(300.0);
    let opening = Between::enter(&old, &PHASES, None).0;
    let seen = Scene {
        body: opening.at(0.1).0,
        ..old
    };
    Between::carry(&seen, &tray(100.0), (0.0, 0.0), &PHASES)
}

#[test]
fn a_carry_is_never_rebased() {
    let mut rebased = carry_of_an_opening();
    rebased.rebase(Transform {
        x: 15.0,
        y: 7.0,
        scale: Some(2.0),
    });
    let carry = carry_of_an_opening();
    for progress in [0.0, 0.2, 0.5, 0.9] {
        assert_eq!(rebased.at(progress), carry.at(progress));
    }
}

#[test]
fn a_carry_holds_no_last_picture_and_is_about_no_entrance() {
    let carry = carry_of_an_opening();
    for progress in [0.0, 0.2, 0.5, 0.9] {
        assert_eq!(carry.holder_at(progress), None);
        assert!(!matches!(carry.focus(progress), Some(Focus::Entrance(_))));
    }
}

#[test]
fn an_entrance_opens_no_door_and_stands_in_its_place() {
    let next = tray(100.0);
    let entrance = Between::enter(&next, &PHASES, None).0;
    assert_eq!(entrance.definitions(), None);
    for progress in [0.0, 0.2, 0.5, 0.9] {
        assert_eq!(entrance.focus(progress), Some(Focus::Entrance(progress)));
        let answers = (entrance.at(progress).1, entrance.seen_at(progress, &next).1);
        assert_eq!(
            answers,
            (Vec::new(), (0.0, 0.0)),
            "no mask moves, nothing stands back"
        );
    }
}
