//! A line's effect played once, and the lines that stay as they are.

use archboard_scene::request::{Arrowhead, Dash, LineAppearance, LineEffect};
use archboard_scene::scene::{Group, Item, LineFacts, Role, SubjectKind};

use super::{frame, route, stage_of, subject, traffic_picture};
use crate::stage::Stage;

/// A line of a relationship that does something, with its facts.
fn effect_line(id: &str, effect: LineEffect) -> Item {
    let facts = LineFacts {
        appearance: LineAppearance {
            name: "Sync".to_owned(),
            color: None,
            dash: Dash::Solid,
            arrowhead: Arrowhead::Wedge,
            effect: Some(effect),
        },
        kind: "sync".to_owned(),
    };
    Item::Group(
        Group::new(Role::Line(Some(Box::new(facts))), route(0.0))
            .drawing(subject(SubjectKind::Edge, id)),
    )
}

/// How many strokes a stage draws at a moment, and whether it asks for more.
fn strokes_at(stage: &mut Stage, now: f64) -> (usize, bool) {
    let (ops, more) = frame(stage, now);
    (ops.iter().filter(|op| op.stroked).count(), more)
}

#[test]
fn a_mutation_plays_once_when_asked_and_then_stands_still() {
    let mut stage = stage_of(vec![effect_line("e", LineEffect::Mutation)]);
    let (still, more) = strokes_at(&mut stage, 0.0);
    assert!(!more);
    stage.play(vec!["e".to_owned()], 0.0);
    let (playing, more) = strokes_at(&mut stage, 300.0);
    // The spark's layers are drawn on the line while it runs.
    assert!(playing > still, "{playing} > {still}");
    assert!(more);
    let (done, more) = strokes_at(&mut stage, 1200.0);
    assert_eq!(done, still);
    assert!(!more);
}

#[test]
fn a_declared_line_and_a_line_with_traffic_stay_as_they_are() {
    let mut declared = stage_of(vec![effect_line("e", LineEffect::Declared)]);
    let (still, _) = strokes_at(&mut declared, 0.0);
    declared.play(vec!["e".to_owned()], 0.0);
    assert_eq!(strokes_at(&mut declared, 300.0), (still, false));

    let mut items = traffic_picture();
    if let Some(Item::Group(traffic)) = items.first_mut() {
        traffic.role = Role::Traffic("e".to_owned());
    }
    items.push(effect_line("e", LineEffect::Mutation));
    let mut busy = stage_of(items);
    let (before, _) = strokes_at(&mut busy, 0.0);
    busy.play(vec!["e".to_owned()], 0.0);
    assert_eq!(strokes_at(&mut busy, 300.0).0, before);
}
