//! A line drawn through its mask: the cuts it makes, lit or picked.

use std::collections::HashSet;

use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{
    Definition, Group, Item, Mask, MaskId, Painting, PathStep, Purpose, Role, Shape, Stroke,
    SubjectKind, Token,
};

use super::{frame, route, subject};
use crate::palette::Theme;
use crate::presentation::Marks;
use crate::stage::Stage;
use crate::testing::painting;

/// A line drawn through a mask with one gap at a crossing and one stretch that
/// another line of its trunk draws.
fn masked_line() -> Painting {
    let bounds = Rect {
        x: 0.0,
        y: 0.0,
        width: 400.0,
        height: 400.0,
    };
    let cut = |purpose| {
        Shape::path(
            purpose,
            vec![
                PathStep::Move {
                    to: Point { x: 0.0, y: 0.0 },
                },
                PathStep::Line {
                    to: Point { x: 9.0, y: 0.0 },
                },
            ],
        )
        .stroked(Stroke::new(Token::Border, 7.0))
    };
    let mut line =
        Group::new(Role::Line(None), route(0.0)).drawing(subject(SubjectKind::Edge, "e"));
    line.mask = Some(MaskId {
        line: "e".to_owned(),
    });
    let mut painting = painting(vec![Item::Group(line)]);
    painting.scene.definitions = vec![Definition::Mask(Mask {
        id: MaskId {
            line: "e".to_owned(),
        },
        bounds,
        shapes: vec![cut(Purpose::Line), cut(Purpose::Cutout)],
    })];
    painting
}

/// How many cuts a frame makes.
fn cuts(stage: &mut Stage) -> usize {
    let (ops, _) = frame(stage, 0.0);
    ops.iter().filter(|op| op.stroked && op.size == 7.0).count()
}

#[test]
fn a_lit_line_keeps_its_gaps_and_a_picked_line_has_no_mask() {
    let mut stage = Stage::new(Theme::Light, (400.0, 400.0));
    stage.show(masked_line());
    assert_eq!(cuts(&mut stage), 2);
    stage.set_marks(Marks {
        whole: HashSet::from(["e".to_owned()]),
        ..Marks::default()
    });
    assert_eq!(cuts(&mut stage), 1);
    stage.set_marks(Marks {
        selected: HashSet::from(["e".to_owned()]),
        ..Marks::default()
    });
    assert_eq!(cuts(&mut stage), 0);
}
