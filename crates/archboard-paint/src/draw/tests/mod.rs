//! What a frame draws, recorded: the order of the shapes, where each stands and
//! how heavy or solid it is. No GPU and no DOM.

use std::collections::{HashMap, HashSet};

use archboard_geometry::{Curve, Point, Rect, Segment};
use archboard_scene::drawing::Toggle;
use archboard_scene::request::{Arrowhead, Dash, LineAppearance};
use archboard_scene::scene::{
    Cap, Colour, Definition, Geometry, Group, Item, LineFacts, Mask, MaskId, Painting, PathStep,
    PulseLook, Purpose, Role, Shape, Stroke, Subject, SubjectKind, Token, TrafficMark,
};
use kurbo::Vec2;

use crate::between::PHASES;
use crate::flight::DiveWay;
use crate::palette::Theme;
use crate::presentation::{Camera, Hovered, Light, LineSweep, Marks, Presentation, Recede, Shine};
use crate::stage::{Arrival, Motion, Pace, Stage};
use crate::testing::{Op, boxed, far_line, filled, painting, shape, stroke, subject_group, traced};

mod kept;

fn subject(kind: SubjectKind, id: &str) -> Subject {
    Subject {
        kind,
        id: id.to_owned(),
        standing: None,
    }
}

/// A box with its left edge at some distance, painted black.
fn plate(x: f64) -> Item {
    let rect = Rect {
        x,
        y: 20.0,
        width: 100.0 - x,
        height: 40.0,
    };
    Item::Shape(filled(Purpose::Plate, rect, Token::Border))
}

/// A route along a line, with its halo before it.
fn route(x: f64) -> Vec<Item> {
    let steps = vec![
        PathStep::Move {
            to: Point { x, y: 0.0 },
        },
        PathStep::Line {
            to: Point {
                x: x + 240.0,
                y: 0.0,
            },
        },
    ];
    let line = |purpose| Item::Shape(traced(purpose, steps.clone(), stroke(Token::Border, 1.2)));
    vec![line(Purpose::Halo), line(Purpose::Line)]
}

/// What a stage draws at a moment, the ground left out, and whether anything
/// moves after it.
fn frame(stage: &mut Stage, now: f64) -> (Vec<Op>, bool) {
    let (mut record, motion) = crate::testing::frame(stage, now);
    (record.ops.split_off(1), motion != Motion::Still)
}

/// A stage that shows a picture and keeps no pace.
fn stage_of(body: Vec<Item>) -> Stage {
    let mut stage = Stage::new(Theme::Light, (400.0, 400.0), Pace::default());
    stage.arrive(painting(body), Arrival::Cut);
    stage
}

#[test]
fn a_head_held_down_moves_shows_its_shade_and_draws_last() {
    let shade = Item::Group(Group::new(Role::HeadShade, vec![plate(2.0)]));
    let head = Item::Group(Group::new(
        Role::FlowHead("f".to_owned()),
        vec![plate(1.0), shade],
    ));
    let mut stage = stage_of(vec![head, plate(3.0)]);
    let (rest, _) = frame(&mut stage, 0.0);
    let xs: Vec<f64> = rest.iter().map(|op| op.x).collect();
    assert_eq!(xs, [1.0, 3.0]);
    assert!(rest.iter().all(|op| op.at.y == 0.0));

    stage.present(Presentation {
        heads: Some(HashMap::from([("f".to_owned(), 30.0)])),
        ..Presentation::default()
    });
    let (held, _) = frame(&mut stage, 1.0);
    let seen: Vec<(f64, f64)> = held.iter().map(|op| (op.x, op.at.y)).collect();
    assert_eq!(seen, [(3.0, 0.0), (1.0, 30.0), (2.0, 30.0)]);
}

/// A door with a control: a seat, the hidden light of the control, a glyph.
fn door() -> Item {
    let light = Shape {
        fill: Some(Token::Border.into()),
        fill_opacity: Some(0.0),
        ..boxed(
            Purpose::Plate,
            Rect {
                x: 2.0,
                y: 0.0,
                width: 9.0,
                height: 9.0,
            },
            Some(2.0),
        )
    };
    let control = Item::Group(Group::new(
        Role::Toggle(Toggle::Expand),
        vec![plate(1.0), Item::Break, Item::Shape(light), plate(3.0)],
    ));
    Item::Group(subject_group(
        Role::Shape,
        vec![control],
        subject(SubjectKind::Node, "a"),
    ))
}

/// The page saying which subject's control the pointer rests on.
fn hovered(subject: Option<&str>) -> Presentation {
    Presentation {
        hovered: Some(Hovered {
            toggle: subject.map(str::to_owned),
        }),
        ..Presentation::default()
    }
}

/// The page saying which subjects the code check warns about.
fn warned(subjects: &[&str]) -> Presentation {
    Presentation {
        warnings: Some(subjects.iter().map(|&id| id.to_owned()).collect()),
        ..Presentation::default()
    }
}

/// The page saying what is marked.
fn marked(marks: Marks) -> Presentation {
    Presentation {
        marks: Some(marks),
        ..Presentation::default()
    }
}

/// The page saying which lines it draws on, from a moment.
fn swept(delays: &[(&str, f64)], at: f64) -> Presentation {
    Presentation {
        sweep: Some(LineSweep {
            delays: delays
                .iter()
                .map(|&(id, delay)| (id.to_owned(), delay))
                .collect(),
            shortest_ms: 100.0,
            longest_ms: 200.0,
            at,
        }),
        ..Presentation::default()
    }
}

/// The page saying whether traffic runs.
fn traffic_shown(shown: bool) -> Presentation {
    Presentation {
        traffic_shown: Some(shown),
        ..Presentation::default()
    }
}

/// How solid the second shape of the door's control is.
fn light_of(stage: &mut Stage, now: f64) -> f64 {
    frame(stage, now).0[1].size
}

#[test]
fn the_light_under_a_control_shows_while_the_pointer_rests_on_it() {
    let mut stage = stage_of(vec![door()]);
    assert_eq!(light_of(&mut stage, 0.0), 0.0);
    stage.present(hovered(Some("a")));
    assert!((light_of(&mut stage, 1.0) - 0.2).abs() < 1e-6);
    stage.present(hovered(None));
    assert_eq!(light_of(&mut stage, 2.0), 0.0);
}

#[test]
fn the_light_stays_hidden_on_the_control_of_another_subject() {
    let mut stage = stage_of(vec![door()]);
    stage.present(hovered(Some("b")));
    assert_eq!(light_of(&mut stage, 0.0), 0.0);
}

#[test]
fn a_warned_part_wears_its_mark_in_its_top_right_corner_until_it_is_cleared() {
    let part = Item::Group(subject_group(
        Role::Shape,
        vec![plate(0.0)],
        subject(SubjectKind::Node, "a"),
    ));
    let mut stage = stage_of(vec![part]);
    let (bare, _) = frame(&mut stage, 0.0);
    assert_eq!(bare.len(), 1);
    stage.present(warned(&["a"]));
    let (marked, _) = frame(&mut stage, 1.0);
    assert!(marked.len() > 1);
    // The box is a hundred wide and starts at 20 down: three in from the corner.
    assert!(marked[1..].iter().all(|op| op.at == Vec2::new(97.0, 23.0)));
    stage.present(warned(&[]));
    assert_eq!(frame(&mut stage, 2.0).0.len(), 1);
}

#[test]
fn what_is_out_of_the_light_recedes_and_traffic_recedes_furthest() {
    let recede = Recede {
        rest: 0.2,
        labels: 0.3,
        subjects: HashMap::new(),
    };
    assert_eq!(super::rest_of(&recede, &Role::Shape), 0.2);
    assert_eq!(super::rest_of(&recede, &Role::Label), 0.3);
    let traffic = super::rest_of(&recede, &Role::Traffic("e".to_owned()));
    assert!((traffic - 0.04).abs() < 1e-9);
}

/// A mark where some lines join: a dot, as `junction_marks` draws it.
fn dot(x: f64, members: &[&str]) -> Item {
    let circle = Geometry::Circle {
        centre: Some(Point { x, y: 0.0 }),
        radius: 3.0,
    };
    Item::Shape(Shape {
        members: members.iter().map(|&id| id.to_owned()).collect(),
        fill: Some(Token::Border.into()),
        ..shape(Purpose::Line, circle)
    })
}

/// A mark where lines join a few units apart: a bar, as `junction_marks` draws it.
fn bar(x: f64, members: &[&str]) -> Item {
    let at = |x| Point { x, y: 0.0 };
    let steps = vec![
        PathStep::Move { to: at(x) },
        PathStep::Line { to: at(x + 6.0) },
    ];
    Item::Shape(Shape {
        members: members.iter().map(|&id| id.to_owned()).collect(),
        ..traced(Purpose::Line, steps, stroke(Token::Border, 6.0))
    })
}

#[test]
fn a_join_recedes_with_its_lines_and_shows_as_much_as_the_brightest_of_them() {
    let marks = vec![
        dot(1.0, &["out", "lit"]),
        dot(2.0, &["out", "reached", "far"]),
        dot(3.0, &["out", "gone"]),
        bar(4.0, &["out", "lit"]),
        bar(5.0, &["out", "gone"]),
    ];
    let mut stage = stage_of(vec![Item::Group(Group::new(Role::Junctions, marks))]);
    let shine = |opacity| Shine {
        opacity,
        delay: 0.0,
    };
    let light = Light {
        rest: 0.14,
        labels: 0.28,
        subjects: HashMap::from([
            ("lit".to_owned(), shine(1.0)),
            ("reached".to_owned(), shine(0.6)),
            ("far".to_owned(), shine(0.46)),
        ]),
        duration: 0.0,
        at: 0.0,
    };
    stage.present(Presentation {
        light: Some(light),
        ..Presentation::default()
    });
    let (drawn, _) = frame(&mut stage, 1.0);
    let solid: Vec<f64> = drawn.iter().map(|op| op.solid).collect();
    let wanted = [1.0, 0.6, 0.14, 1.0, 0.14];
    assert_eq!(solid.len(), wanted.len());
    for (one, other) in solid.iter().zip(wanted) {
        assert!((one - other).abs() < 1e-6, "{solid:?} against {wanted:?}");
    }
}

/// A relationship "e" and a part "n", drawn after it.
fn line_and_part() -> Stage {
    let edge = Item::Group(subject_group(
        Role::Line(None),
        route(7.0),
        subject(SubjectKind::Edge, "e"),
    ));
    let part = Item::Group(subject_group(
        Role::Shape,
        vec![plate(5.0)],
        subject(SubjectKind::Node, "n"),
    ));
    let mut stage = stage_of(vec![edge, part]);
    stage.present(swept(&[("e", 0.0)], 10.0));
    stage
}

#[test]
fn a_sweep_draws_above_the_lines_and_below_the_first_card() {
    let mut stage = line_and_part();
    let (sweeping, more) = frame(&mut stage, 60.0);
    let kinds: Vec<(bool, f64)> = sweeping.iter().map(|op| (op.stroked, op.x)).collect();
    assert_eq!(kinds, [(true, 7.0), (true, 7.0), (false, 5.0)]);
    assert!(sweeping[1].size > sweeping[0].size);
    assert!(more);
}

#[test]
fn a_sweep_ends_and_the_stage_stops_asking_for_frames() {
    let mut stage = line_and_part();
    let (ended, more) = frame(&mut stage, 500.0);
    assert_eq!(ended.len(), 2);
    assert!(!more);
}

#[test]
fn a_cleared_sweep_stops_asking_for_frames() {
    let edge = Item::Group(subject_group(
        Role::Line(None),
        route(7.0),
        subject(SubjectKind::Edge, "e"),
    ));
    let mut stage = stage_of(vec![edge]);
    stage.present(swept(&[("e", 0.0)], 0.0));
    assert!(frame(&mut stage, 10.0).1);
    stage.present(swept(&[], 20.0));
    assert!(!frame(&mut stage, 20.0).1);
}

fn traffic_picture() -> Vec<Item> {
    let at = |x| Point { x, y: 0.0 };
    let mark = TrafficMark {
        look: PulseLook {
            head: Colour::White,
            hot: Colour::White,
            line_width: 1.2,
        },
        route: Curve {
            from: at(0.0),
            segments: vec![Segment::Line { to: at(200.0) }],
        },
        motion: archboard_scene::scene::Motion::Steady {
            speed: 50.0,
            spacing: 100.0,
            phase: 0.0,
        },
    };
    vec![Item::Group(Group::new(
        Role::Traffic("l".to_owned()),
        vec![Item::Traffic(mark)],
    ))]
}

/// How many layers a frame at a moment starts, which is how many pulses it
/// draws, and what moves after it.
fn pulses(stage: &mut Stage, now: f64) -> (usize, Motion) {
    let (record, motion) = crate::testing::frame(stage, now);
    (record.layers, motion)
}

#[test]
fn traffic_asks_for_frames_while_it_is_shown() {
    let mut stage = stage_of(traffic_picture());
    let (drawn, motion) = pulses(&mut stage, 0.0);
    assert!(drawn > 0 && motion == Motion::TrafficAlone);
    stage.present(traffic_shown(false));
    assert_eq!(pulses(&mut stage, 1000.0).1, Motion::Still);
}

#[test]
fn traffic_is_alone_until_anything_else_moves() {
    let mut stage = stage_of(traffic_picture());
    assert_eq!(pulses(&mut stage, 0.0).1, Motion::TrafficAlone);
    stage.present(far_line(2.0, 100.0));
    assert_eq!(pulses(&mut stage, 1.0).1, Motion::Moving);
    assert_eq!(pulses(&mut stage, 50.0).1, Motion::Moving);
    assert_eq!(pulses(&mut stage, 101.0).1, Motion::TrafficAlone);
}

#[test]
fn a_new_picture_runs_on_the_clock_of_the_last_and_hidden_traffic_draws_nothing() {
    let mut stage = stage_of(traffic_picture());
    let mut fresh = stage_of(traffic_picture());
    for now in [0.0, 1000.0] {
        pulses(&mut stage, now);
        pulses(&mut fresh, now);
    }
    stage.arrive(painting(traffic_picture()), Arrival::Cut);
    assert_eq!(
        places(&frame(&mut stage, 1300.0).0),
        places(&frame(&mut fresh, 1300.0).0)
    );
    stage.present(traffic_shown(false));
    assert_eq!(pulses(&mut stage, 1600.0), (0, Motion::Still));
}

#[test]
fn a_picture_with_no_traffic_never_asks_for_frames_on_its_account() {
    let mut stage = stage_of(vec![plate(1.0)]);
    assert!(!frame(&mut stage, 0.0).1);
    assert!(!frame(&mut stage, 1000.0).1);
}

/// How much a frame draws in the middle of a flight out of a card whose picture
/// has one far part, at a far blend.
fn drawn_in_a_card(far: bool) -> usize {
    let mut stage = stage_of(Vec::new());
    stage.present(far_line(if far { f64::INFINITY } else { 0.0 }, 0.0));
    let card = Rect {
        x: 0.0,
        y: 0.0,
        width: 400.0,
        height: 400.0,
    };
    let inside = vec![Item::Group(Group::new(Role::FarView, vec![plate(1.0)]))];
    let into = Arrival::Into {
        frame: card,
        way: DiveWay::Out,
        card: "card".to_owned(),
        ms: 100.0,
        at: 0.0,
    };
    stage.arrive(painting(inside), into);
    frame(&mut stage, 50.0).0.len()
}

#[test]
fn the_picture_inside_a_card_stands_in_the_far_view_of_the_picture_around_it() {
    assert!(drawn_in_a_card(true) > drawn_in_a_card(false));
}

/// Where each thing a list of drawings draws stands.
fn places(ops: &[Op]) -> Vec<(f64, f64, f64)> {
    ops.iter().map(|op| (op.at.x, op.at.y, op.x)).collect()
}

#[test]
fn a_frame_stamped_before_a_change_shows_the_change() {
    let mut stage = stage_of(vec![plate(1.0)]);
    frame(&mut stage, 0.0);
    let camera = Camera {
        x: 100.0,
        y: 0.0,
        scale: 1.0,
    };
    stage.present(crate::testing::camera(camera, 0.0, 1000.0));
    let stale = places(&frame(&mut stage, 990.0).0);
    assert_eq!(stale, places(&frame(&mut stage, 2000.0).0));
}

#[test]
fn a_flight_starts_with_the_first_frame_drawn_of_it() {
    let pace = Pace {
        phases: Some(PHASES),
        longest_step: None,
    };
    let mut stage = Stage::new(Theme::Light, (400.0, 400.0), pace);
    stage.arrive(painting(vec![plate(1.0)]), Arrival::Cut);
    let carried = Arrival::Carried {
        shift: (0.0, 0.0),
        ms: 100.0,
    };
    stage.arrive(painting(vec![plate(100.0)]), carried);
    assert!(frame(&mut stage, 1000.0).1);
    assert!(frame(&mut stage, 1050.0).1);
    assert!(!frame(&mut stage, 1100.0).1);
}

/// A line drawn through a mask with one gap at a crossing and one stretch that
/// another line of its trunk draws.
fn masked_line() -> Painting {
    let bounds = Rect {
        x: 0.0,
        y: 0.0,
        width: 400.0,
        height: 400.0,
    };
    let cut = |cap| {
        traced(
            Purpose::Cutout,
            vec![
                PathStep::Move {
                    to: Point { x: 0.0, y: 0.0 },
                },
                PathStep::Line {
                    to: Point { x: 9.0, y: 0.0 },
                },
            ],
            Stroke {
                cap: Some(cap),
                ..stroke(Token::Border, 7.0)
            },
        )
    };
    let mut line = subject_group(
        Role::Line(None),
        route(0.0),
        subject(SubjectKind::Edge, "e"),
    );
    line.mask = Some(MaskId {
        line: "e".to_owned(),
    });
    let mut painting = painting(vec![Item::Group(line)]);
    painting.scene.definitions = vec![Definition::Mask(Mask {
        id: MaskId {
            line: "e".to_owned(),
        },
        bounds,
        shapes: vec![cut(Cap::Round), cut(Cap::Butt)],
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
    let mut stage = Stage::new(Theme::Light, (400.0, 400.0), Pace::default());
    stage.arrive(masked_line(), Arrival::Cut);
    assert_eq!(cuts(&mut stage), 2);
    stage.present(marked(Marks {
        whole: HashSet::from(["e".to_owned()]),
        ..Marks::default()
    }));
    assert_eq!(cuts(&mut stage), 1);
    stage.present(marked(Marks {
        selected: HashSet::from(["e".to_owned()]),
        ..Marks::default()
    }));
    assert_eq!(cuts(&mut stage), 0);
}

/// A line of a picture, with its facts.
fn drawn_line(id: &str, x: f64) -> Item {
    let facts = LineFacts {
        appearance: LineAppearance {
            name: "Call".to_owned(),
            color: None,
            dash: Dash::Solid,
            arrowhead: Arrowhead::Filled,
        },
        kind: "call".to_owned(),
    };
    Item::Group(subject_group(
        Role::Line(Some(Box::new(facts))),
        route(x),
        subject(SubjectKind::Edge, id),
    ))
}

#[test]
fn a_selected_line_goes_without_a_ring_and_stands_on_top() {
    let mut stage = stage_of(vec![drawn_line("first", 0.0), drawn_line("second", 10.0)]);
    stage.present(marked(Marks {
        selected: HashSet::from(["first".to_owned()]),
        ..Marks::default()
    }));
    let (selected, _) = frame(&mut stage, 0.0);
    // The two routes alone, and no ring of either.
    assert_eq!(selected.iter().filter(|op| op.stroked).count(), 2);
    // The chosen line still draws last, so it still takes the pointer.
    assert_eq!(
        selected.iter().rfind(|op| op.stroked).map(|op| op.x),
        Some(0.0)
    );
}

#[test]
fn a_picture_steps_back_for_the_next_by_its_lines_and_labels() {
    use super::awaiting;
    assert!(awaiting(1.0, &Role::Line(None)) < 1.0);
    assert!(awaiting(1.0, &Role::Label) < 1.0);
    assert_eq!(awaiting(1.0, &Role::Shadow(None)), 1.0);
    assert_eq!(awaiting(0.0, &Role::Label), 1.0);
}
