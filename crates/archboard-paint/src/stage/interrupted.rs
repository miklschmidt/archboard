//! A new reading starts from what the CPU painter shows at each phase.

use super::{Arrival, Departure, Stage, Surface};
use crate::cpu::CpuCanvas;
use crate::passage::{Heading, Side};
use crate::testing::{filled, painting, showing, stage, stroke, subject_group, traced};
use archboard_geometry::{Point, Rect};
use archboard_scene::scene::{Item, PathStep, Purpose, Role, Subject, SubjectKind, Token};

fn card(id: &str, x: f64) -> Item {
    Item::Group(subject_group(
        Role::Frame(None),
        vec![Item::Shape(filled(
            Purpose::Plate,
            Rect {
                x,
                y: 30.0,
                width: 20.0,
                height: 20.0,
            },
            Token::DiagramText,
        ))],
        Subject {
            id: id.to_owned(),
            kind: SubjectKind::Node,
            standing: None,
        },
    ))
}

fn picture() -> Vec<Item> {
    let line = traced(
        Purpose::Line,
        vec![
            PathStep::Move {
                to: Point { x: 10.0, y: 40.0 },
            },
            PathStep::Line {
                to: Point { x: 150.0, y: 40.0 },
            },
        ],
        stroke(Token::DiagramText, 2.0),
    );
    vec![
        card("old", 150.0),
        Item::Group(subject_group(
            Role::Line(None),
            vec![Item::Shape(line)],
            Subject {
                id: "line".to_owned(),
                kind: SubjectKind::Edge,
                standing: None,
            },
        )),
    ]
}

/// The canvas, in pixels.
const SIZE: (f64, f64) = (200.0, 100.0);

fn raster(stage: &mut Stage, now: f64) -> Vec<u8> {
    let mut canvas = CpuCanvas::new(200, 100);
    stage.draw(Surface::Direct(&mut canvas), now);
    canvas.pixels().to_vec()
}

/// An entrance with no heading over 100 ms, from a moment.
fn entered(at: f64) -> Arrival {
    Arrival::Entered {
        heading: None,
        ms: 100.0,
        moved: (0.0, 0.0),
        at,
    }
}

/// A carry over 100 ms with nothing shared moved.
const CARRIED: Arrival = Arrival::Carried {
    shift: (0.0, 0.0),
    ms: 100.0,
};

#[test]
fn replacing_an_entrance_keeps_the_visible_frame_including_late_sparks() {
    for now in [10.0, 40.0, 100.0, 150.0] {
        let mut stage = stage(SIZE);
        stage.arrive(painting(picture()), entered(0.0));
        raster(&mut stage, 0.0);
        let before = raster(&mut stage, now);
        stage.arrive(painting(vec![card("old", 80.0)]), entered(now));
        assert_eq!(raster(&mut stage, now), before, "progress {}", now / 100.0);
    }
}

#[test]
fn an_edit_of_an_arriving_picture_keeps_both_planes_on_the_passage() {
    let mut stage = showing(SIZE, vec![card("left", 80.0)]);
    let beside = Arrival::Entered {
        heading: Some(Heading::Across {
            side: Some(Side::Right),
        }),
        ms: 100.0,
        moved: (0.0, 0.0),
        at: 0.0,
    };
    stage.arrive(painting(vec![card("right", 80.0)]), beside);
    raster(&mut stage, 0.0);
    let before = raster(&mut stage, 40.0);
    stage.arrive(painting(vec![card("right", 80.0)]), CARRIED);
    assert_eq!(raster(&mut stage, 40.0), before);
    let landed = raster(&mut stage, 100.0);
    let mut alone = showing(SIZE, vec![card("right", 80.0)]);
    assert_eq!(
        landed,
        raster(&mut alone, 100.0),
        "nothing of the last is left"
    );
}

#[test]
fn a_departure_still_answers_while_sparks_run_after_the_cards_land() {
    let mut stage = stage(SIZE);
    stage.arrive(painting(picture()), entered(0.0));
    raster(&mut stage, 0.0);
    let visible = raster(&mut stage, 110.0);
    stage.depart(Departure::Leaving {
        heading: Heading::Across { side: None },
        ms: 20.0,
        at: 110.0,
    });
    let gone = raster(&mut stage, 130.0);
    let mut empty = showing(SIZE, Vec::new());
    assert_ne!(visible, gone);
    assert_eq!(gone, raster(&mut empty, 130.0));
}

#[test]
fn an_edit_during_an_entrance_keeps_the_visible_frame_including_late_sparks() {
    for now in [10.0, 40.0, 100.0, 150.0] {
        let mut stage = stage(SIZE);
        stage.arrive(painting(picture()), entered(0.0));
        raster(&mut stage, 0.0);
        let before = raster(&mut stage, now);
        stage.arrive(painting(picture()), CARRIED);
        let after = raster(&mut stage, now);
        assert!(before == after, "progress {}", now / 100.0);
        let before = raster(&mut stage, now + 5.0);
        stage.arrive(painting(picture()), CARRIED);
        assert!(
            before == raster(&mut stage, now + 5.0),
            "second edit at {}",
            now / 100.0
        );
    }
}
