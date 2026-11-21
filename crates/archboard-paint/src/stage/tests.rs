//! What a stage does over time, read from the frames it draws.

use super::{Arrival, Departure, Motion, Pace, Stage};
use crate::between::PHASES;
use crate::flight::DiveWay;
use crate::palette::Theme;
use crate::passage::{Heading, Side};
use crate::presentation::{Camera, Light, Presentation, Shine};
use crate::testing::{
    Op, Record, boxed, camera, far_line, frame, painting, showing, stage, subject_group,
};
use archboard_geometry::Rect;
use archboard_scene::scene::{Group, Item, Purpose, Role, Subject, SubjectKind};

/// The canvas of these tests, in pixels.
const SIZE: (f64, f64) = (100.0, 100.0);

/// A plate whose left edge stands at a distance, which tells it apart in a frame.
fn plate(x: f64) -> Item {
    let rect = Rect {
        x,
        y: 10.0,
        width: 40.0,
        height: 40.0,
    };
    Item::Shape(boxed(Purpose::Plate, rect, None))
}

/// A group of a role that draws a subject: one plate.
fn part(role: Role, kind: SubjectKind, id: &str, x: f64) -> Item {
    let subject = Subject {
        kind,
        id: id.to_owned(),
        standing: None,
    };
    Item::Group(subject_group(role, vec![plate(x)], subject))
}

/// A picture of one container.
fn tray() -> Vec<Item> {
    vec![part(Role::Frame(None), SubjectKind::Region, "r", 10.0)]
}

/// A picture of one part, told apart by where its plate stands.
fn one(x: f64) -> Vec<Item> {
    vec![part(Role::Shape, SubjectKind::Node, &format!("n{x}"), x)]
}

/// The plate a frame drew at a distance, if it drew one.
fn plate_at(record: &Record, x: f64) -> Option<Op> {
    record.ops.iter().copied().find(|op| op.x == x)
}

/// How much of the plate at a distance shows in the frame of a moment, or 0
/// when the frame leaves it out.
fn shows(stage: &mut Stage, x: f64, now: f64) -> f64 {
    plate_at(&frame(stage, now).0, x).map_or(0.0, |op| op.shows)
}

/// Where the camera puts the picture in the frame of a moment, read from the
/// first plate.
fn camera_x(stage: &mut Stage, now: f64) -> f64 {
    frame(stage, now).0.ops[1].at.x
}

/// The page lighting the picture.
fn lit(light: Light) -> Presentation {
    Presentation {
        light: Some(light),
        ..Presentation::default()
    }
}

/// An entrance with no heading, from a moment, over a time.
fn entered(ms: f64, at: f64) -> Arrival {
    Arrival::Entered {
        heading: None,
        ms,
        moved: (0.0, 0.0),
        at,
    }
}

/// A picture with a near view and a far view, its near plate at 1 and its far
/// plate at 2.
fn views() -> Vec<Item> {
    let near = Item::Group(Group::new(Role::NearView, vec![plate(1.0)]));
    let far = Item::Group(Group::new(Role::FarView, vec![plate(2.0)]));
    let subject = Subject {
        kind: SubjectKind::Node,
        id: "v".to_owned(),
        standing: None,
    };
    vec![Item::Group(subject_group(
        Role::Shape,
        vec![near, far],
        subject,
    ))]
}

/// How far into the far view a frame of `views` stands, from 0 to 1.
fn far_at(stage: &mut Stage, now: f64) -> f64 {
    let (record, _) = frame(stage, now);
    let near = plate_at(&record, 1.0).map_or(0.0, |op| op.shows);
    let far = plate_at(&record, 2.0).map_or(0.0, |op| op.shows);
    far / (near + far)
}

#[test]
fn a_tray_that_stays_on_stays_in_focus() {
    let mut stage = showing(SIZE, tray());
    stage.arrive(painting(tray()), entered(100.0, 0.0));
    assert_eq!(frame(&mut stage, 10.0).0.lens, None);
}

#[test]
fn a_glide_moves_over_its_time_and_a_cut_moves_at_once() {
    let mut stage = showing(SIZE, tray());
    let to = Camera {
        x: 100.0,
        y: 0.0,
        scale: 1.0,
    };
    stage.present(camera(to, 100.0, 0.0));
    let (record, motion) = frame(&mut stage, 50.0);
    let x = record.ops[1].at.x;
    assert!(x > 0.0 && x < 100.0);
    assert_eq!(motion, Motion::Moving);
    let (record, motion) = frame(&mut stage, 100.0);
    assert_eq!(record.ops[1].at.x, 100.0);
    assert_eq!(motion, Motion::Still);
    stage.present(camera(Camera { x: 0.0, ..to }, 0.0, 100.0));
    assert_eq!(camera_x(&mut stage, 100.0), 0.0);
}

#[test]
fn a_restated_glide_starts_over_from_where_the_camera_stands() {
    let to = Camera {
        x: 100.0,
        y: 0.0,
        scale: 1.0,
    };
    let (mut restated, mut once) = (showing(SIZE, tray()), showing(SIZE, tray()));
    for stage in [&mut restated, &mut once] {
        stage.present(camera(to, 100.0, 0.0));
        frame(stage, 50.0);
    }
    restated.present(camera(to, 100.0, 50.0));
    assert!(camera_x(&mut restated, 75.0) < camera_x(&mut once, 75.0));
}

#[test]
fn a_zoom_that_crosses_the_far_line_swaps_the_views_on_its_way() {
    let mut stage = showing(SIZE, views());
    stage.present(far_line(0.8, 100.0));
    let near = Camera {
        x: 0.0,
        y: 0.0,
        scale: 1.0,
    };
    stage.present(camera(near, 0.0, 0.0));
    assert_eq!(far_at(&mut stage, 0.0), 0.0);
    let away = Camera { scale: 0.4, ..near };
    stage.present(camera(away, 300.0, 0.0));
    frame(&mut stage, 150.0);
    let far = far_at(&mut stage, 200.0);
    assert!(far > 0.0 && far < 1.0);
    assert_eq!(far_at(&mut stage, 350.0), 1.0);
}

#[test]
fn a_camera_that_rests_on_the_far_line_stays_in_its_view() {
    let mut stage = showing(SIZE, views());
    stage.present(far_line(0.8, 0.0));
    let on_the_line = Camera {
        x: 0.0,
        y: 0.0,
        scale: 0.795,
    };
    stage.present(camera(on_the_line, 0.0, 0.0));
    assert_eq!(far_at(&mut stage, 0.0), 0.0);
    let away = Camera {
        scale: 0.7,
        ..on_the_line
    };
    stage.present(camera(away, 0.0, 1.0));
    assert_eq!(far_at(&mut stage, 1.0), 1.0);
    stage.present(camera(on_the_line, 0.0, 2.0));
    assert_eq!(far_at(&mut stage, 2.0), 1.0);
}

#[test]
fn a_zoom_swaps_a_visible_entrance_over_time() {
    let mut stage = stage(SIZE);
    stage.present(far_line(0.8, 100.0));
    stage.arrive(painting(views()), entered(900.0, 0.0));
    frame(&mut stage, 0.0);
    let away = Camera {
        scale: 0.4,
        ..Camera::default()
    };
    stage.present(camera(away, 0.0, 200.0));
    frame(&mut stage, 200.0);
    let far = far_at(&mut stage, 250.0);
    assert!(far > 0.0 && far < 1.0, "{far}");
}

/// A picture of a subject "a", a subject "b" and a label, at 1, 2 and 3.
fn lit_picture() -> Vec<Item> {
    vec![
        part(Role::Shape, SubjectKind::Node, "a", 1.0),
        part(Role::Shape, SubjectKind::Node, "b", 2.0),
        part(Role::Label, SubjectKind::Edge, "e", 3.0),
    ]
}

/// A light over a time, from a moment, on subjects by id: `(id, opacity, delay)`.
fn light(rest: f64, subjects: &[(&str, f64, f64)], duration: f64, at: f64) -> Light {
    Light {
        rest,
        labels: rest * 2.0,
        subjects: subjects
            .iter()
            .map(|&(id, opacity, delay)| (id.to_owned(), Shine { opacity, delay }))
            .collect(),
        duration,
        at,
    }
}

/// Whether two opacities are the same, as a canvas layer holds them.
fn near(one: f64, other: f64) -> bool {
    (one - other).abs() < 1e-6
}

/// A stage that shows `lit_picture`, its first frame drawn: what the page
/// lights after that fades.
fn lit_stage() -> Stage {
    let mut stage = showing(SIZE, lit_picture());
    frame(&mut stage, 0.0);
    stage
}

#[test]
fn what_leaves_the_light_fades_to_the_rest_and_is_forgotten() {
    let mut stage = lit_stage();
    stage.present(lit(light(0.14, &[("a", 1.0, 0.0)], 100.0, 0.0)));
    assert_eq!(shows(&mut stage, 1.0, 100.0), 1.0);
    assert!(near(shows(&mut stage, 2.0, 100.0), 0.14));
    stage.present(lit(light(1.0, &[], 100.0, 100.0)));
    let fading = shows(&mut stage, 2.0, 150.0);
    assert!(fading > 0.14 && fading < 1.0);
    let (record, motion) = frame(&mut stage, 200.0);
    assert!(record.ops[1..].iter().all(|op| op.shows == 1.0));
    assert_eq!(motion, Motion::Still);
}

/// A step's light over 900 milliseconds from a moment, with everything out of
/// it receding to `rest`.
fn veil(rest: f64, at: f64) -> Presentation {
    lit(light(rest, &[], 900.0, at))
}

#[test]
fn a_picture_leaves_in_its_own_light_and_the_next_stands_in_its_own_at_once() {
    let mut stage = showing(SIZE, one(1.0));
    stage.present(veil(0.14, 0.0));
    frame(&mut stage, 900.0);
    stage.arrive(painting(one(2.0)), entered(100.0, 900.0));
    stage.present(veil(0.3, 900.0));
    let left = shows(&mut stage, 1.0, 901.0);
    assert!(left > 0.13 && left < 0.15, "{left}");
    assert!(near(shows(&mut stage, 2.0, 1000.0), 0.3));
}

#[test]
fn a_picture_that_takes_the_stage_over_has_no_last_light_to_fade_from() {
    let mut stage = showing(SIZE, one(1.0));
    stage.present(veil(0.14, 0.0));
    frame(&mut stage, 900.0);
    stage.arrive(painting(one(1.0)), Arrival::Cut);
    stage.present(veil(1.0, 900.0));
    assert_eq!(shows(&mut stage, 1.0, 901.0), 1.0);
}

#[test]
fn the_light_stated_before_or_after_an_arrival_stands_alike() {
    let restored = lit(light(0.14, &[("a", 1.0, 100.0)], 300.0, 0.0));
    let mut light_first = stage(SIZE);
    light_first.present(restored.clone());
    light_first.arrive(painting(lit_picture()), Arrival::Cut);
    let mut light_after = stage(SIZE);
    light_after.arrive(painting(lit_picture()), Arrival::Cut);
    light_after.present(restored);
    let shown = |record: &Record| record.ops.iter().map(|op| op.shows).collect::<Vec<_>>();
    for now in [0.0, 100.0] {
        let (first, _) = frame(&mut light_first, now);
        let (after, _) = frame(&mut light_after, now);
        assert_eq!(shown(&first), shown(&after));
        assert!(
            near(shown(&first)[2], 0.14),
            "it stands in its light at once"
        );
    }
}

#[test]
fn a_further_hop_lights_later() {
    let mut stage = lit_stage();
    stage.present(lit(light(0.14, &[("a", 0.6, 100.0)], 100.0, 0.0)));
    assert_eq!(shows(&mut stage, 1.0, 50.0), 1.0);
    assert!(near(shows(&mut stage, 1.0, 200.0), 0.6));
}

#[test]
fn a_light_cut_skips_the_delays_of_further_hops() {
    let mut stage = lit_stage();
    stage.present(lit(light(0.14, &[("a", 0.6, 100.0)], 0.0, 10.0)));
    let (record, motion) = frame(&mut stage, 10.0);
    let shown: Vec<f64> = record.ops[1..].iter().map(|op| op.shows).collect();
    assert!(near(shown[0], 0.6) && near(shown[1], 0.14) && near(shown[2], 0.28));
    assert_eq!(motion, Motion::Still);
}

/// Something the page says that changes the picture.
type Change = Box<dyn Fn(&mut Stage)>;

#[test]
fn a_frame_stamped_before_a_timed_picture_change_draws_the_moment_of_the_change() {
    let into = Arrival::Into {
        frame: Rect {
            x: 0.0,
            y: 0.0,
            width: 10.0,
            height: 10.0,
        },
        way: DiveWay::In,
        card: "card".to_owned(),
        ms: 100.0,
        at: 75.0,
    };
    let leaving = Departure::Leaving {
        heading: Heading::Across { side: None },
        ms: 100.0,
        at: 75.0,
    };
    let changes: [Change; 3] = [
        Box::new(move |stage| stage.depart(leaving)),
        Box::new(|stage| stage.arrive(painting(tray()), entered(100.0, 75.0))),
        Box::new(move |stage| stage.arrive(painting(Vec::new()), into.clone())),
    ];
    let to = Camera {
        x: 100.0,
        ..Camera::default()
    };
    for (index, change) in changes.iter().enumerate() {
        let [mut stale, mut prompt] = [(); 2].map(|()| {
            let mut stage = showing(SIZE, tray());
            stage.present(camera(to, 100.0, 0.0));
            frame(&mut stage, 50.0);
            change(&mut stage);
            stage
        });
        for (late, on_time) in [(50.0, 75.0), (120.0, 120.0)] {
            let (drawn, _) = frame(&mut stale, late);
            assert_eq!(
                drawn.ops,
                frame(&mut prompt, on_time).0.ops,
                "change {index}"
            );
        }
    }
}

#[test]
fn a_cut_takes_away_the_ghost_of_an_interrupted_entrance() {
    let mut stage = showing(SIZE, one(1.0));
    stage.arrive(painting(one(2.0)), entered(100.0, 0.0));
    assert!(shows(&mut stage, 1.0, 0.0) > 0.0);
    stage.arrive(painting(one(3.0)), Arrival::Cut);
    assert_eq!(shows(&mut stage, 1.0, 0.0), 0.0);
}

#[test]
fn a_picture_at_rest_has_no_lens() {
    let mut stage = showing(SIZE, Vec::new());
    assert_eq!(frame(&mut stage, 0.0).0.lens, None);
}

#[test]
fn an_entrance_comes_into_focus_and_ends_with_no_lens() {
    let mut stage = showing(SIZE, Vec::new());
    stage.arrive(painting(Vec::new()), entered(100.0, 0.0));
    frame(&mut stage, 0.0);
    let soft = frame(&mut stage, 10.0)
        .0
        .lens
        .expect("an entrance is seen through a lens");
    assert!(soft.blur > 0.0);
    assert_eq!(frame(&mut stage, 100.0).0.lens, None);
}

#[test]
fn a_flight_into_a_card_keeps_the_card_in_focus_and_lets_the_picture_fall_away() {
    let mut stage = showing(SIZE, Vec::new());
    let card = Rect {
        x: 10.0,
        y: 20.0,
        width: 30.0,
        height: 40.0,
    };
    let into = Arrival::Into {
        frame: card,
        way: DiveWay::In,
        card: "card".to_owned(),
        ms: 100.0,
        at: 0.0,
    };
    stage.arrive(painting(Vec::new()), into);
    let lens = frame(&mut stage, 50.0)
        .0
        .lens
        .expect("a flight is seen through a lens");
    assert!(lens.blur > 0.0 && lens.sink > 0.0);
    let focus = lens.focus.expect("the card is in focus");
    assert_eq!(focus.place.x, card.x);
    assert_eq!(focus.place.width, card.width);
    assert_eq!(frame(&mut stage, 100.0).0.lens, None);
}

/// Where a heading to a picture beside this one takes a stage.
const BESIDE: Heading = Heading::Across {
    side: Some(Side::Right),
};

/// The page sending the picture to the one beside it, from a moment, over 100 ms.
fn leaving(at: f64) -> Departure {
    Departure::Leaving {
        heading: BESIDE,
        ms: 100.0,
        at,
    }
}

/// A stage whose picture the reader sent beside it at 0, where its plate stood
/// at 50, and the frame of 50 once the next arrived then.
fn passage_at_the_next() -> (Stage, Op, Record) {
    let mut stage = showing(SIZE, one(1.0));
    stage.depart(leaving(0.0));
    let stepped = plate_at(&frame(&mut stage, 50.0).0, 1.0).expect("the picture leaves");
    stage.arrive(painting(one(2.0)), entered(100.0, 50.0));
    let (record, _) = frame(&mut stage, 50.0);
    (stage, stepped, record)
}

#[test]
fn a_passage_runs_on_from_the_click_as_one_plane() {
    let (_, stepped, record) = passage_at_the_next();
    assert!(stepped.at.x < 0.0, "a passage starts at the click");
    let left = plate_at(&record, 1.0).expect("the passage goes on");
    assert!((left.at.x - stepped.at.x).abs() < 1e-9);
    let arriving = plate_at(&record, 2.0).expect("the next comes with it");
    assert_eq!(
        arriving.shows, 1.0,
        "a picture on a passage has no entrance"
    );
}

#[test]
fn a_passage_ends_with_no_lens() {
    let (mut stage, ..) = passage_at_the_next();
    let lens = frame(&mut stage, 100.0)
        .0
        .lens
        .expect("a moving frame has a lens");
    assert!(lens.smear > 0.0);
    let (record, _) = frame(&mut stage, 150.0);
    assert!(plate_at(&record, 1.0).is_none());
    assert_eq!(record.lens, None);
}

#[test]
fn a_change_of_mind_takes_the_last_picture_on_along_the_way_it_came() {
    let mut stage = showing(SIZE, one(1.0));
    let beside = Arrival::Entered {
        heading: Some(BESIDE),
        ms: 100.0,
        moved: (0.0, 0.0),
        at: 0.0,
    };
    stage.arrive(painting(one(2.0)), beside);
    frame(&mut stage, 0.0);
    let arriving = plate_at(&frame(&mut stage, 30.0).0, 2.0).expect("it arrives");
    stage.depart(leaving(30.0));
    let waiting = plate_at(&frame(&mut stage, 30.0).0, 2.0).expect("it still arrives");
    assert_eq!(
        waiting.at, arriving.at,
        "the click waits for the picture to arrive"
    );
    stage.arrive(painting(one(3.0)), entered(100.0, 30.0));
    let (record, _) = frame(&mut stage, 40.0);
    let gone_on = plate_at(&record, 2.0).expect("it goes on along the way it came");
    assert_ne!(gone_on.at, arriving.at);
    assert!(
        plate_at(&record, 1.0).is_some(),
        "the picture before it goes on its way"
    );
}

#[test]
fn a_cut_runs_no_passage() {
    let mut stage = showing(SIZE, one(1.0));
    let beside = Arrival::Entered {
        heading: Some(BESIDE),
        ms: 0.0,
        moved: (0.0, 0.0),
        at: 0.0,
    };
    stage.arrive(painting(one(2.0)), beside);
    let (record, _) = frame(&mut stage, 0.0);
    assert!(plate_at(&record, 1.0).is_none());
    assert_eq!(record.lens, None);
}

#[test]
fn an_in_between_draws_with_balanced_layers() {
    let cards = |moved, other| {
        vec![
            part(Role::Shape, SubjectKind::Node, "a", moved),
            part(Role::Shape, SubjectKind::Node, other, 60.0),
        ]
    };
    let mut stage = stage((400.0, 300.0));
    stage.arrive(painting(cards(10.0, "b")), Arrival::Cut);
    let carried = Arrival::Carried {
        shift: (0.0, 0.0),
        ms: 100.0,
    };
    stage.arrive(painting(cards(40.0, "c")), carried);
    frame(&mut stage, 0.0);
    // One card fades out early in a move, and the other fades in late.
    for now in [20.0, 70.0] {
        let (between, motion) = frame(&mut stage, now);
        assert_eq!(motion, Motion::Moving);
        assert!(between.ops.len() > 2 && between.layers > 0, "at {now}");
        assert!(between.balanced());
    }
}

#[test]
fn a_stall_costs_no_more_than_a_longest_step() {
    let paced = Pace {
        phases: Some(PHASES),
        longest_step: Some(50.0),
    };
    let mut stalled = Stage::new(Theme::Light, SIZE, paced);
    let mut steady = stage(SIZE);
    let to = Camera {
        x: 1000.0,
        ..Camera::default()
    };
    for stage in [&mut stalled, &mut steady] {
        stage.arrive(painting(tray()), Arrival::Cut);
        stage.present(camera(to, 1000.0, 1000.0));
    }
    let moments = [
        (1000.0, 1000.0),
        (1016.0, 1016.0),
        (1416.0, 1066.0),
        (1432.0, 1082.0),
        (1420.0, 1082.0),
    ];
    for (host, stage_time) in moments {
        assert_eq!(
            camera_x(&mut stalled, host),
            camera_x(&mut steady, stage_time)
        );
    }
}
