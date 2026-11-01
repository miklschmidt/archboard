//! What a frame draws, recorded: the order of the shapes, where each stands and
//! how heavy or solid it is. No GPU and no DOM.

use std::collections::{BTreeMap, HashMap, HashSet};

use archboard_scene::drawing::Toggle;
use archboard_scene::geometry::{Curve, Point, Rect, Segment};
use archboard_scene::scene::{
    Atlas, Cap, Colour, Definition, Group, Item, Mask, MaskId, Motion, Painting, PathStep,
    PulseLook, Purpose, Role, Scene, Shape, Stroke, Subject, SubjectKind, Token, TrafficMark,
};
use kurbo::{Affine, BezPath, Shape as _, Vec2};

use crate::between::PHASES;
use crate::canvas::{Canvas, Count, Ink};
use crate::flight::DiveWay;
use crate::palette::Theme;
use crate::presentation::{Camera, Marks, Recede};
use crate::stage::Stage;

mod kept;

/// One thing drawn.
#[derive(Clone, Copy, Debug)]
struct Op {
    stroked: bool,
    /// The left edge of what is drawn.
    x: f64,
    /// Where the drawing stands, in canvas pixels.
    at: Vec2,
    /// A stroke's width, or a fill's opacity.
    size: f64,
}

/// A canvas that records what it is asked to draw.
#[derive(Default)]
struct Record {
    at: Affine,
    ops: Vec<Op>,
}

impl Canvas for Record {
    fn set_transform(&mut self, transform: Affine) {
        self.at = transform;
    }
    fn fill(&mut self, path: &BezPath, ink: &Ink, _: bool) {
        let size = match ink {
            Ink::Solid(colour) => f64::from(colour.components[3]),
            Ink::Gradient(..) => 1.0,
        };
        self.ops.push(Op {
            stroked: false,
            x: path.bounding_box().x0,
            at: self.at.translation(),
            size,
        });
    }
    fn stroke(&mut self, path: &BezPath, stroke: &kurbo::Stroke, _: &Ink) {
        self.ops.push(Op {
            stroked: true,
            x: path.bounding_box().x0,
            at: self.at.translation(),
            size: stroke.width,
        });
    }
    fn push(&mut self, _: Option<(&BezPath, bool)>, _: f32) {}
    fn push_cut(&mut self) {}
    fn push_keep(&mut self) {}
    fn pop(&mut self) {}
}

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
    Item::Shape(Shape::rect(Purpose::Plate, rect, None).filled(Token::Border))
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
    let line = |purpose| {
        Item::Shape(
            Shape::path(purpose, steps.clone())
                .unfilled()
                .stroked(Stroke::new(Token::Border, 1.2)),
        )
    };
    vec![line(Purpose::Halo), line(Purpose::Line)]
}

pub(crate) fn painting(body: Vec<Item>) -> Painting {
    Painting {
        scene: Scene {
            width: 400.0,
            height: 400.0,
            title: String::new(),
            description: None,
            reading: None,
            background: Colour::White,
            definitions: Vec::new(),
            body,
            atlas: Atlas::default(),
            placed: Vec::new(),
        },
        icons: BTreeMap::new(),
    }
}

/// What a stage draws at a moment, the ground left out.
fn frame(stage: &mut Stage, now: f64) -> (Vec<Op>, bool) {
    let mut record = Record::default();
    let more = stage.draw(&mut record, now);
    (record.ops.split_off(1), more)
}

fn stage_of(body: Vec<Item>) -> Stage {
    let mut stage = Stage::new(Theme::Light, (400.0, 400.0));
    stage.show(painting(body));
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

    stage.set_heads(HashMap::from([("f".to_owned(), 30.0)]));
    let (held, _) = frame(&mut stage, 1.0);
    let seen: Vec<(f64, f64)> = held.iter().map(|op| (op.x, op.at.y)).collect();
    assert_eq!(seen, [(3.0, 0.0), (1.0, 30.0), (2.0, 30.0)]);
}

/// A door with a control: a seat, the hidden light of the control, a glyph.
fn door() -> Item {
    let light = Shape {
        fill_opacity: Some(0.0),
        ..Shape::rect(
            Purpose::Plate,
            Rect {
                x: 2.0,
                y: 0.0,
                width: 9.0,
                height: 9.0,
            },
            Some(2.0),
        )
        .filled(Token::Border)
    };
    let control = Item::Group(Group::new(
        Role::Toggle(Toggle::Expand),
        vec![plate(1.0), Item::Break, Item::Shape(light), plate(3.0)],
    ));
    Item::Group(Group::new(Role::Shape, vec![control]).drawing(subject(SubjectKind::Node, "a")))
}

/// How solid the second shape of the door's control is.
fn light_of(stage: &mut Stage, now: f64) -> f64 {
    frame(stage, now).0[1].size
}

#[test]
fn the_light_under_a_control_shows_while_the_pointer_rests_on_it() {
    let mut stage = stage_of(vec![door()]);
    assert_eq!(light_of(&mut stage, 0.0), 0.0);
    stage.set_hovered_toggle(Some("a"));
    assert!((light_of(&mut stage, 1.0) - 0.2).abs() < 1e-6);
    stage.set_hovered_toggle(None);
    assert_eq!(light_of(&mut stage, 2.0), 0.0);
}

#[test]
fn the_light_stays_hidden_on_the_control_of_another_subject() {
    let mut stage = stage_of(vec![door()]);
    stage.set_hovered_toggle(Some("b"));
    assert_eq!(light_of(&mut stage, 0.0), 0.0);
}

#[test]
fn a_warned_part_wears_its_mark_in_its_top_right_corner_until_it_is_cleared() {
    let part = Item::Group(
        Group::new(Role::Shape, vec![plate(0.0)]).drawing(subject(SubjectKind::Node, "a")),
    );
    let mut stage = stage_of(vec![part]);
    let (bare, _) = frame(&mut stage, 0.0);
    assert_eq!(bare.len(), 1);
    stage.set_warnings(HashSet::from(["a".to_owned()]));
    let (marked, _) = frame(&mut stage, 1.0);
    assert!(marked.len() > 1);
    // The box is a hundred wide and starts at 20 down: three in from the corner.
    assert!(marked[1..].iter().all(|op| op.at == Vec2::new(97.0, 23.0)));
    stage.set_warnings(HashSet::new());
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

/// A relationship "e" and a part "n", drawn after it.
fn line_and_part() -> Stage {
    let edge = Item::Group(
        Group::new(Role::Line(None), route(7.0)).drawing(subject(SubjectKind::Edge, "e")),
    );
    let part = Item::Group(
        Group::new(Role::Shape, vec![plate(5.0)]).drawing(subject(SubjectKind::Node, "n")),
    );
    let mut stage = stage_of(vec![edge, part]);
    stage.sweep(&HashMap::from([("e".to_owned(), 0.0)]), 100.0, 200.0, 10.0);
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
    let edge = Item::Group(
        Group::new(Role::Line(None), route(7.0)).drawing(subject(SubjectKind::Edge, "e")),
    );
    let mut stage = stage_of(vec![edge]);
    stage.sweep(&HashMap::from([("e".to_owned(), 0.0)]), 100.0, 200.0, 0.0);
    assert!(frame(&mut stage, 10.0).1);
    stage.clear_sweep();
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
        motion: Motion::Steady {
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

/// How many layers a frame at a moment starts, which is how many pulses it draws.
fn pulses(stage: &mut Stage, now: f64) -> (usize, bool) {
    let mut count = Count::default();
    let more = stage.draw(&mut count, now);
    (count.layers, more)
}

#[test]
fn traffic_asks_for_frames_while_it_runs_and_none_while_it_is_held() {
    let mut stage = stage_of(traffic_picture());
    let (drawn, more) = pulses(&mut stage, 0.0);
    assert!(drawn > 0 && more);
    stage.hold_traffic();
    let (held, more) = pulses(&mut stage, 1000.0);
    assert!(held > 0 && !more);
    assert_eq!(stage.picture_time(), 0.0);
    stage.resume_traffic(1000.0, 1000.0);
    assert!(pulses(&mut stage, 1100.0).1);
    stage.release_traffic();
    assert!(pulses(&mut stage, 1200.0).1);
}

#[test]
fn traffic_is_alone_until_anything_else_moves() {
    let mut stage = stage_of(traffic_picture());
    pulses(&mut stage, 0.0);
    assert!(stage.traffic_alone(0.0));
    stage.set_far(true, 100.0, 0.0);
    assert!(!stage.traffic_alone(50.0));
    assert!(stage.traffic_alone(100.0));
}

#[test]
fn a_carried_clock_runs_on_and_hidden_traffic_draws_nothing() {
    let mut stage = stage_of(traffic_picture());
    stage.set_picture_time(7.0);
    pulses(&mut stage, 0.0);
    pulses(&mut stage, 1000.0);
    stage.show(painting(traffic_picture()));
    assert_eq!(stage.picture_time(), 8.0);
    stage.set_traffic_shown(false);
    assert_eq!(pulses(&mut stage, 1300.0), (0, false));
}

#[test]
fn a_picture_with_no_traffic_never_asks_for_frames_on_its_account() {
    let mut stage = stage_of(vec![plate(1.0)]);
    assert!(!frame(&mut stage, 0.0).1);
    assert!(!frame(&mut stage, 1000.0).1);
}

/// How much a frame draws in the middle of a flight out of a card whose board
/// has one far part, at a far blend.
fn drawn_in_a_card(far: bool) -> usize {
    let mut stage = stage_of(Vec::new());
    stage.set_far(far, 0.0, 0.0);
    let card = Rect {
        x: 0.0,
        y: 0.0,
        width: 400.0,
        height: 400.0,
    };
    let inside = vec![Item::Group(Group::new(Role::FarView, vec![plate(1.0)]))];
    let way = (DiveWay::Out, "card".to_owned());
    stage.dive(painting(inside), card, way, 100.0, 0.0);
    frame(&mut stage, 50.0).0.len()
}

#[test]
fn the_board_inside_a_card_stands_in_the_far_view_of_the_board_around_it() {
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
    stage.set_camera(camera, 0.0, 1000.0);
    let stale = places(&frame(&mut stage, 990.0).0);
    assert_eq!(stale, places(&frame(&mut stage, 2000.0).0));
}

#[test]
fn a_flight_starts_with_the_first_frame_drawn_of_it() {
    let mut stage = stage_of(vec![plate(1.0)]);
    stage.set_phases(PHASES);
    stage.carry(painting(vec![plate(100.0)]), (0.0, 0.0), 100.0);
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
        Shape::path(
            Purpose::Cutout,
            vec![
                PathStep::Move {
                    to: Point { x: 0.0, y: 0.0 },
                },
                PathStep::Line {
                    to: Point { x: 9.0, y: 0.0 },
                },
            ],
        )
        .unfilled()
        .stroked(Stroke::new(Token::Border, 7.0).capped(cap))
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
