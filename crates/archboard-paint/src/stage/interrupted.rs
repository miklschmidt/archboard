//! A new reading starts from what the CPU painter shows at each phase.

use super::Stage;
use crate::between::{Heading, PHASES};
use crate::cpu::CpuCanvas;
use crate::draw::tests::painting;
use crate::palette::Theme;
use crate::passage::Side;
use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{
    Group, Item, PathStep, Purpose, Role, Shape, Stroke, Subject, SubjectKind, Token,
};

fn card(id: &str, x: f64) -> Item {
    Item::Group(
        Group::new(
            Role::Frame(None),
            vec![Item::Shape(
                Shape::rect(
                    Purpose::Plate,
                    Rect {
                        x,
                        y: 30.0,
                        width: 20.0,
                        height: 20.0,
                    },
                    None,
                )
                .filled(Token::DiagramText),
            )],
        )
        .drawing(Subject {
            id: id.to_owned(),
            kind: SubjectKind::Node,
            standing: None,
        }),
    )
}

fn picture() -> Vec<Item> {
    let line = Shape::path(
        Purpose::Line,
        vec![
            PathStep::Move {
                to: Point { x: 10.0, y: 40.0 },
            },
            PathStep::Line {
                to: Point { x: 150.0, y: 40.0 },
            },
        ],
    )
    .unfilled()
    .stroked(Stroke::new(Token::DiagramText, 2.0));
    vec![
        card("old", 150.0),
        Item::Group(
            Group::new(Role::Line(None), vec![Item::Shape(line)]).drawing(Subject {
                id: "line".to_owned(),
                kind: SubjectKind::Edge,
                standing: None,
            }),
        ),
    ]
}

fn raster(stage: &mut Stage, now: f64) -> Vec<u8> {
    let mut canvas = CpuCanvas::new(200, 100);
    stage.draw(&mut canvas, now);
    canvas.finish().to_vec()
}

#[test]
fn replacing_an_entrance_keeps_the_visible_frame_including_late_sparks() {
    for now in [10.0, 40.0, 100.0, 150.0] {
        let mut stage = Stage::new(Theme::Light, (200.0, 100.0));
        stage.set_phases(PHASES);
        stage.enter(painting(picture()), None, 100.0, (0.0, 0.0), 0.0);
        raster(&mut stage, 0.0);
        let before = raster(&mut stage, now);
        stage.enter(
            painting(vec![card("old", 80.0)]),
            None,
            100.0,
            (0.0, 0.0),
            now,
        );
        assert_eq!(raster(&mut stage, now), before, "progress {}", now / 100.0);
    }
}

#[test]
fn an_edit_of_an_arriving_picture_keeps_both_planes_on_the_passage() {
    let mut stage = Stage::new(Theme::Light, (200.0, 100.0));
    stage.set_phases(PHASES);
    stage.show(painting(vec![card("left", 80.0)]));
    let heading = Heading::Across {
        side: Some(Side::Right),
    };
    stage.enter(
        painting(vec![card("right", 80.0)]),
        Some(heading),
        100.0,
        (0.0, 0.0),
        0.0,
    );
    raster(&mut stage, 0.0);
    let before = raster(&mut stage, 40.0);
    stage.carry(painting(vec![card("right", 80.0)]), (0.0, 0.0), 100.0);
    assert_eq!(raster(&mut stage, 40.0), before);
    raster(&mut stage, 100.0);
    assert!(stage.ghost.is_none());
}

#[test]
fn a_departure_still_answers_while_sparks_run_after_the_cards_land() {
    let mut stage = Stage::new(Theme::Light, (200.0, 100.0));
    stage.set_phases(PHASES);
    stage.enter(painting(picture()), None, 100.0, (0.0, 0.0), 0.0);
    raster(&mut stage, 0.0);
    let visible = raster(&mut stage, 110.0);
    stage.leave(Heading::Across { side: None }, 20.0, 110.0);
    let gone = raster(&mut stage, 130.0);
    let mut empty = Stage::new(Theme::Light, (200.0, 100.0));
    empty.show(painting(Vec::new()));
    assert_ne!(visible, gone);
    assert_eq!(gone, raster(&mut empty, 130.0));
}

#[test]
fn an_edit_during_an_entrance_keeps_the_visible_frame_including_late_sparks() {
    for now in [10.0, 40.0, 100.0, 150.0] {
        let mut stage = Stage::new(Theme::Light, (200.0, 100.0));
        stage.set_phases(PHASES);
        stage.enter(painting(picture()), None, 100.0, (0.0, 0.0), 0.0);
        raster(&mut stage, 0.0);
        let before = raster(&mut stage, now);
        stage.carry(painting(picture()), (0.0, 0.0), 100.0);
        let after = raster(&mut stage, now);
        assert!(before == after, "progress {}", now / 100.0);
        let before = raster(&mut stage, now + 5.0);
        stage.carry(painting(picture()), (0.0, 0.0), 100.0);
        assert!(
            before == raster(&mut stage, now + 5.0),
            "second edit at {}",
            now / 100.0
        );
    }
}
