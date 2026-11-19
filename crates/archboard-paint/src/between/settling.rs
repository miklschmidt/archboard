//! Landing waits for the light that follows the last line.

use super::testing::{card, line, rect, scene};
use super::{Between, PHASES};
use archboard_scene::scene::{Group, Item, Role, Scene};

fn picture() -> Scene {
    let pulses = Group::new(Role::Traffic("e".to_owned()), Vec::new());
    scene(
        vec![
            line("e", &[(0.0, 0.0), (400.0, 300.0)]),
            card("end", rect(350.0, 270.0, 100.0, 60.0), &[]),
            Item::Group(pulses),
        ],
        &[],
    )
}

#[test]
fn an_entrance_finishes_the_rim_and_pulse_fade_after_the_last_line() {
    let scene = picture();
    let entrance = Between::enter(&scene, &PHASES, None).0;
    let after_line = PHASES.entry.draw_end + PHASES.entry.pulse_span / 2.0;
    assert!(entrance.length() > after_line);
    let body = entrance.at(after_line);
    assert!(
        body.0.iter().any(|item| matches!(item, Item::Shape(_))),
        "the rim still runs"
    );
    let pulse = body
        .0
        .iter()
        .find_map(|item| match item {
            Item::Group(group) if matches!(group.role, Role::Traffic(_)) => group.opacity,
            _ => None,
        })
        .expect("the pulses fade in");
    assert!(pulse > 0.0 && pulse < 1.0);
    assert_eq!(entrance.at(entrance.length()).0, scene.body);
}

#[test]
fn a_carry_finishes_the_rim_after_the_last_line() {
    let scene = picture();
    let between = Between::carry(
        &super::testing::scene(Vec::new(), &[]),
        &scene,
        (0.0, 0.0),
        &PHASES,
    );
    let groups = super::found::found(&scene);
    let times = super::carry::drawn_lines(
        (&[], &groups),
        &super::found::pair(&[], &groups),
        &super::unfold::Doors::default(),
        &scene,
        PHASES.transition,
    );
    let after_line = times[0].1.1 + 0.1;
    assert!(between.length() > after_line);
    assert!(
        between
            .at(after_line)
            .0
            .iter()
            .any(|item| matches!(item, Item::Shape(_)))
    );
    assert_eq!(between.at(between.length()).0, scene.body);
}
