//! Retained drawings must paint the same picture as a fresh walk.

use std::collections::{HashMap, HashSet};

use archboard_scene::geometry::Point;
use archboard_scene::paint::design::CARD_TITLE_FONT;
use archboard_scene::scene::{Colour, Group, Item, Role, Slot, SubjectKind, Text, Transform};
use kurbo::{Affine, BezPath};

use super::{Op, Record, places, plate, route, stage_of, subject};
use crate::canvas::{Canvas, Ink, PartKey};
use crate::presentation::{Camera, Marks};
use crate::stage::Stage;

/// A canvas that keeps each part as what was drawn of it, and draws it again
/// under the transform it is asked for.
#[derive(Default)]
struct Keeping {
    record: Record,
    parts: HashMap<PartKey, Vec<Op>>,
    waiting: Vec<Vec<Op>>,
}

impl Canvas for Keeping {
    fn set_transform(&mut self, transform: Affine) {
        self.record.set_transform(transform);
    }
    fn fill(&mut self, path: &BezPath, ink: &Ink, even_odd: bool) {
        self.record.fill(path, ink, even_odd);
    }
    fn stroke(&mut self, path: &BezPath, stroke: &kurbo::Stroke, ink: &Ink) {
        self.record.stroke(path, stroke, ink);
    }
    fn push(&mut self, _: Option<(&BezPath, bool)>, _: f32) {}
    fn push_cut(&mut self) {}
    fn push_keep(&mut self) {}
    fn pop(&mut self) {}
    fn again(&mut self, key: PartKey, transform: Affine) -> bool {
        let Some(part) = self.parts.get(&key) else {
            return false;
        };
        self.record.ops.extend(part.iter().map(|op| Op {
            at: (transform * Affine::translate(op.at)).translation(),
            ..*op
        }));
        true
    }
    fn keep(&mut self) -> bool {
        self.waiting.push(std::mem::take(&mut self.record.ops));
        true
    }
    fn kept(&mut self, key: PartKey, transform: Affine) {
        let waiting = self.waiting.pop().unwrap_or_default();
        let part = std::mem::replace(&mut self.record.ops, waiting);
        self.parts.insert(key, part);
        self.again(key, transform);
    }
}

/// A card and its words, under one move.
fn card_with_words() -> Vec<Item> {
    let words = |x| {
        let at = Point { x, y: 5.0 };
        let text = Text::set(at, CARD_TITLE_FONT, 12.0, Colour::Black, "Same words");
        Item::Text(text)
    };
    let card = Group::new(Role::NearView, vec![plate(1.0), words(10.0), words(200.0)]);
    vec![Item::Group(Group::new(Role::Move, vec![Item::Group(card)]))]
}

#[test]
fn what_a_canvas_kept_lands_under_a_moved_camera_where_it_lands_drawn_afresh() {
    let camera = Camera {
        x: 30.0,
        y: 7.0,
        scale: 2.0,
    };
    let mut stage = stage_of(card_with_words());
    let mut keeping = Keeping::default();
    stage.draw(&mut keeping, 0.0);
    let kept = keeping.parts.len();
    assert!(kept > 0);
    stage.set_camera(camera, 0.0, 1.0);
    keeping.record.ops.clear();
    stage.draw(&mut keeping, 1.0);
    assert_eq!(keeping.parts.len(), kept);
    let mut fresh = stage_of(card_with_words());
    fresh.set_camera(camera, 0.0, 0.0);
    assert_eq!(places(&keeping.record.ops), places(&fresh_ops(&mut fresh)));
}

/// What a stage draws on a canvas that keeps nothing.
fn fresh_ops(stage: &mut Stage) -> Vec<Op> {
    let mut record = Record::default();
    stage.draw(&mut record, 0.0);
    record.ops
}

#[test]
fn a_canvas_draws_a_new_look_afresh() {
    let lit = Group::new(Role::Line(None), route(0.0)).drawing(subject(SubjectKind::Edge, "e"));
    let mut stage = stage_of(vec![Item::Group(lit)]);
    let mut keeping = Keeping::default();
    stage.draw(&mut keeping, 0.0);
    stage.draw(&mut keeping, 1.0);
    keeping.record.ops.clear();
    stage.draw(&mut keeping, 2.0);
    let plain = keeping.record.ops.len();
    stage.set_marks(Marks {
        selected: HashSet::from(["e".to_owned()]),
        ..Marks::default()
    });
    keeping.record.ops.clear();
    stage.draw(&mut keeping, 3.0);
    assert!(keeping.record.ops.len() > plain);
}

#[test]
fn a_planned_frame_and_its_inset_keep_different_parts() {
    let body = vec![
        Item::Group(Group::new(Role::Slot(Slot::PlannedFrame), vec![plate(1.0)])),
        Item::Group(
            Group::new(Role::Inset, vec![plate(2.0), plate(3.0)])
                .moved(Transform::translate(20.0, 10.0)),
        ),
    ];
    let mut stage = stage_of(body);
    let expected = places(&fresh_ops(&mut stage));
    let mut keeping = Keeping::default();
    for now in 1..=3 {
        keeping.record.ops.clear();
        stage.draw(&mut keeping, f64::from(now));
        assert_eq!(places(&keeping.record.ops), expected);
    }
}
