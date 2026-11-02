//! What the stage's values do over time, with no canvas.

use super::Stage;
use crate::between::{Heading, PHASES};
use crate::cpu::CpuCanvas;
use crate::draw::tests::painting;
use crate::flight::DiveWay;
use crate::palette::Theme;
use crate::passage::{Plane, Side};
use crate::presentation::{Camera, Light, Shine};
use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Group, Item, Purpose, Role, Shape, Subject, SubjectKind};
use std::collections::HashMap;

fn stage() -> Stage {
    Stage::new(Theme::Light, (100.0, 100.0))
}

/// A picture of one container.
fn tray() -> Vec<Item> {
    let body = Rect {
        x: 10.0,
        y: 10.0,
        width: 40.0,
        height: 40.0,
    };
    let plate = Shape::rect(Purpose::Plate, body, None);
    vec![Item::Group(
        Group::new(Role::Frame(None), vec![Item::Shape(plate)]).drawing(Subject {
            kind: SubjectKind::Region,
            id: "r".to_owned(),
            standing: None,
        }),
    )]
}

#[test]
fn a_tray_that_stays_on_stays_in_focus() {
    let mut stage = stage();
    stage.set_phases(PHASES);
    stage.show(painting(tray()));
    stage.enter(painting(tray()), None, 100.0, (0.0, 0.0), 0.0);
    stage.advance(10.0);
    assert_eq!(stage.lens_at(10.0), None);
}

#[test]
fn a_glide_moves_over_its_time_and_a_cut_moves_at_once() {
    let mut stage = stage();
    let camera = Camera {
        x: 100.0,
        y: 0.0,
        scale: 1.0,
    };
    stage.set_camera(camera, 100.0, 0.0);
    stage.advance(50.0);
    assert!(stage.presentation.camera.x > 0.0 && stage.presentation.camera.x < 100.0);
    assert!(stage.changing(50.0));
    stage.advance(100.0);
    assert_eq!(stage.presentation.camera.x, 100.0);
    assert!(!stage.changing(100.0));
    stage.set_camera(Camera { x: 0.0, ..camera }, 0.0, 100.0);
    stage.advance(100.0);
    assert_eq!(stage.presentation.camera.x, 0.0);
}

#[test]
fn a_zoom_that_crosses_the_far_line_swaps_the_views_on_its_way() {
    let mut stage = stage();
    stage.drawn = true;
    stage.set_far_line(0.8, 100.0);
    let camera = Camera {
        x: 0.0,
        y: 0.0,
        scale: 1.0,
    };
    stage.set_camera(camera, 0.0, 0.0);
    stage.advance(0.0);
    assert_eq!(stage.presentation.far, 0.0);
    stage.set_camera(
        Camera {
            scale: 0.4,
            ..camera
        },
        300.0,
        0.0,
    );
    stage.advance(150.0);
    assert!(stage.presentation.camera.scale < 0.8);
    stage.advance(200.0);
    assert!(stage.presentation.far > 0.0 && stage.presentation.far < 1.0);
    stage.advance(350.0);
    assert_eq!(stage.presentation.far, 1.0);
}

#[test]
fn a_camera_that_rests_on_the_far_line_stays_in_its_view() {
    let mut stage = stage();
    stage.drawn = true;
    stage.set_far_line(0.8, 0.0);
    let on_the_line = Camera {
        x: 0.0,
        y: 0.0,
        scale: 0.795,
    };
    stage.set_camera(on_the_line, 0.0, 0.0);
    stage.advance(0.0);
    assert_eq!(stage.presentation.far, 0.0);
    stage.set_camera(
        Camera {
            scale: 0.7,
            ..on_the_line
        },
        0.0,
        1.0,
    );
    stage.advance(1.0);
    assert_eq!(stage.presentation.far, 1.0);
    stage.set_camera(on_the_line, 0.0, 2.0);
    stage.advance(2.0);
    assert_eq!(stage.presentation.far, 1.0);
}

#[test]
fn a_zoom_swaps_a_visible_entrance_over_time() {
    let mut stage = stage();
    stage.set_phases(PHASES);
    stage.set_far_line(0.8, 100.0);
    stage.enter(painting(Vec::new()), None, 900.0, (0.0, 0.0), 0.0);
    stage.draw(&mut CpuCanvas::new(1, 1), 0.0);
    stage.set_camera(
        Camera {
            scale: 0.4,
            ..Camera::default()
        },
        0.0,
        200.0,
    );
    stage.advance(200.0);
    stage.advance(250.0);
    assert!(stage.presentation.far > 0.0 && stage.presentation.far < 1.0);
}

#[test]
fn what_leaves_the_light_fades_to_the_rest_and_is_forgotten() {
    let mut stage = stage();
    let lit = Light {
        rest: 0.14,
        labels: 0.28,
        subjects: HashMap::from([(
            "a".to_owned(),
            Shine {
                opacity: 1.0,
                delay: 0.0,
            },
        )]),
        duration: 100.0,
    };
    stage.set_light(&lit, 0.0);
    stage.advance(100.0);
    assert_eq!(stage.presentation.recede.subjects["a"], 1.0);
    assert!((stage.presentation.recede.rest - 0.14).abs() < 1e-6);
    let out = Light {
        rest: 1.0,
        labels: 1.0,
        subjects: HashMap::new(),
        duration: 100.0,
    };
    stage.set_light(&out, 100.0);
    stage.advance(150.0);
    assert!(stage.presentation.recede.subjects.contains_key("a"));
    stage.advance(200.0);
    assert!(stage.presentation.recede.subjects.is_empty());
    assert!((stage.presentation.recede.rest - 1.0).abs() < 1e-6);
}

/// A step's light, with everything out of it receding to `rest`.
fn veil(rest: f64) -> Light {
    Light {
        rest,
        labels: rest,
        subjects: HashMap::new(),
        duration: 900.0,
    }
}

#[test]
fn a_picture_leaves_in_its_own_light_and_the_next_stands_in_its_own_at_once() {
    let mut stage = stage();
    stage.set_phases(PHASES);
    stage.show(painting(Vec::new()));
    stage.set_light(&veil(0.14), 0.0);
    stage.advance(900.0);
    stage.enter(painting(Vec::new()), None, 100.0, (0.0, 0.0), 900.0);
    stage.set_light(&veil(0.3), 900.0);
    stage.advance(901.0);
    let left = stage.ghost.as_ref().map(|ghost| ghost.look.recede.rest);
    assert!(left.is_some_and(|rest| (rest - 0.14).abs() < 1e-6));
    assert!((stage.presentation.recede.rest - 0.3).abs() < 1e-6);
}

#[test]
fn a_picture_that_takes_the_stage_over_has_no_last_light_to_fade_from() {
    let mut stage = stage();
    stage.show(painting(Vec::new()));
    stage.set_light(&veil(0.14), 0.0);
    stage.advance(900.0);
    stage.show(painting(Vec::new()));
    stage.set_light(&veil(1.0), 900.0);
    stage.advance(901.0);
    assert!((stage.presentation.recede.rest - 1.0).abs() < 1e-6);
}

#[test]
fn a_further_hop_lights_later() {
    let mut stage = stage();
    let far_hop = Light {
        rest: 0.14,
        labels: 0.28,
        subjects: HashMap::from([(
            "far".to_owned(),
            Shine {
                opacity: 0.6,
                delay: 100.0,
            },
        )]),
        duration: 100.0,
    };
    stage.set_light(&far_hop, 0.0);
    stage.advance(50.0);
    assert_eq!(stage.presentation.recede.subjects["far"], 1.0);
    stage.advance(200.0);
    assert!((stage.presentation.recede.subjects["far"] - 0.6).abs() < 1e-6);
}

#[test]
fn a_light_cut_skips_the_delays_of_further_hops() {
    let mut stage = stage();
    let light = Light {
        rest: 0.14,
        labels: 0.28,
        subjects: HashMap::from([(
            "far".to_owned(),
            Shine {
                opacity: 0.6,
                delay: 100.0,
            },
        )]),
        duration: 0.0,
    };
    stage.set_light(&light, 10.0);
    stage.advance(10.0);
    assert_eq!(stage.presentation.recede.rest, light.rest);
    assert_eq!(stage.presentation.recede.labels, light.labels);
    assert_eq!(stage.presentation.recede.subjects["far"], 0.6);
    assert!(!stage.changing(10.0));
}

#[test]
fn a_timed_picture_change_keeps_a_stale_frame_from_rewinding_the_camera() {
    let changes: [fn(&mut Stage); 3] = [
        |stage| stage.leave(Heading::Across { side: None }, 100.0, 75.0),
        |stage| stage.enter(painting(Vec::new()), None, 100.0, (0.0, 0.0), 75.0),
        |stage| {
            stage.dive(
                painting(Vec::new()),
                Rect {
                    x: 0.0,
                    y: 0.0,
                    width: 10.0,
                    height: 10.0,
                },
                (DiveWay::In, "card".to_owned()),
                100.0,
                75.0,
            );
        },
    ];
    for change in changes {
        let mut stage = stage();
        stage.set_phases(PHASES);
        stage.show(painting(Vec::new()));
        stage.set_camera(
            Camera {
                x: 100.0,
                ..Camera::default()
            },
            100.0,
            0.0,
        );
        stage.advance(50.0);
        let before = stage.presentation.camera.x;
        change(&mut stage);
        stage.draw(&mut CpuCanvas::new(1, 1), 50.0);
        assert!(stage.presentation.camera.x > before);
    }
}

#[test]
fn a_cut_takes_away_the_ghost_of_an_interrupted_entrance() {
    let mut stage = stage();
    stage.set_phases(PHASES);
    stage.show(painting(Vec::new()));
    stage.enter(painting(Vec::new()), None, 100.0, (0.0, 0.0), 0.0);
    stage.advance(0.0);
    assert!(stage.ghost.is_some());
    stage.show(painting(Vec::new()));
    assert!(stage.ghost.is_none());
}

#[test]
fn a_picture_at_rest_has_no_lens() {
    let mut stage = stage();
    stage.set_phases(PHASES);
    stage.show(painting(Vec::new()));
    stage.advance(0.0);
    assert_eq!(stage.lens_at(0.0), None);
}

#[test]
fn an_entrance_comes_into_focus_and_ends_with_no_lens() {
    let mut stage = stage();
    stage.set_phases(PHASES);
    stage.show(painting(Vec::new()));
    stage.enter(painting(Vec::new()), None, 100.0, (0.0, 0.0), 0.0);
    stage.advance(0.0);
    let (soft, _) = stage
        .lens_at(10.0)
        .expect("an entrance is seen through a lens");
    assert!(soft.blur > 0.0);
    stage.advance(100.0);
    assert_eq!(stage.lens_at(100.0), None);
}

#[test]
fn a_flight_into_a_card_keeps_the_card_in_focus_and_lets_the_board_fall_away() {
    let mut stage = stage();
    stage.set_phases(PHASES);
    stage.show(painting(Vec::new()));
    let frame = Rect {
        x: 10.0,
        y: 20.0,
        width: 30.0,
        height: 40.0,
    };
    stage.dive(
        painting(Vec::new()),
        frame,
        (DiveWay::In, "card".to_owned()),
        100.0,
        0.0,
    );
    stage.advance(50.0);
    let camera = stage.presentation.camera;
    let (lens, _) = stage
        .lens_at(50.0)
        .expect("a flight is seen through a lens");
    assert!(lens.blur > 0.0 && lens.sink > 0.0);
    let focus = lens.focus.expect("the card is in focus");
    assert_eq!(focus.place.x, frame.x * camera.scale + camera.x);
    assert_eq!(focus.place.width, frame.width * camera.scale);
    stage.advance(100.0);
    assert_eq!(stage.lens_at(100.0), None);
}

/// Where a heading to a board beside this one takes a stage.
const BESIDE: Heading = Heading::Across {
    side: Some(Side::Right),
};

#[test]
fn a_passage_runs_on_from_the_click_as_one_plane_and_ends_with_no_lens() {
    let mut stage = stage();
    stage.set_phases(PHASES);
    stage.show(painting(Vec::new()));
    stage.leave(BESIDE, 100.0, 0.0);
    let stepped = stage
        .leaving
        .as_ref()
        .and_then(|leaving| leaving.passage(50.0))
        .expect("a passage starts at the click");
    stage.enter(painting(Vec::new()), None, 100.0, (0.0, 0.0), 50.0);
    stage.advance(50.0);
    assert!(
        stage.flight.is_none(),
        "a board on a passage has no entrance"
    );
    let (_, place) = stage
        .ghost
        .as_ref()
        .and_then(|ghost| ghost.passage(50.0))
        .expect("the passage goes on");
    assert!(stepped.1 > 0.0 && (place - stepped.1).abs() < 1e-9);
    let (lens, _) = stage.lens_at(100.0).expect("a moving frame has a lens");
    assert!(lens.smear > 0.0);
    stage.draw(&mut CpuCanvas::new(1, 1), 150.0);
    assert!(stage.ghost.is_none());
    assert_eq!(stage.lens_at(150.0), None);
}

#[test]
fn a_change_of_mind_takes_the_last_board_on_along_the_way_it_came() {
    let mut stage = stage();
    stage.set_phases(PHASES);
    stage.show(painting(Vec::new()));
    stage.enter(painting(Vec::new()), Some(BESIDE), 100.0, (0.0, 0.0), 0.0);
    stage.advance(0.0);
    stage.leave(BESIDE, 100.0, 30.0);
    let stepped = stage
        .leaving
        .as_ref()
        .and_then(|leaving| leaving.passage(30.0))
        .map_or(1.0, |(_, place)| place);
    assert!(stepped < 1e-6, "the click waits for the board to arrive");
    stage.enter(painting(Vec::new()), None, 100.0, (0.0, 0.0), 30.0);
    let ghost = stage.ghost.as_ref().expect("a ghost");
    assert_ne!(
        ghost.held_at(30.0),
        Plane::STILL,
        "it goes on along the way it came"
    );
    assert_eq!(stage.behind.len(), 1, "the board before it goes on its way");
}

#[test]
fn a_cut_runs_no_passage() {
    let mut stage = stage();
    stage.set_phases(PHASES);
    stage.show(painting(Vec::new()));
    stage.enter(painting(Vec::new()), Some(BESIDE), 0.0, (0.0, 0.0), 0.0);
    stage.draw(&mut CpuCanvas::new(1, 1), 0.0);
    assert!(stage.ghost.is_none());
    assert_eq!(stage.lens_at(0.0), None);
}
