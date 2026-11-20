//! A sequence laid out here and painted by the core agrees part by part: the
//! layout learns each part's size from the measure, and the painter draws the
//! part from the same private sizes, so every card's words stand inside the
//! card's text run and every message's ink inside the row the layout gave it.

use std::collections::BTreeMap;

use archboard_flows::sequence::{SequenceRequest, picture};
use archboard_geometry::{Point, Rect};
use archboard_scene::paint::paint;
use archboard_scene::request::{
    DocumentRequest, NodeAppearance, PageRequest, Picture, Relief, SequenceClock, SequenceDrawing,
    TypeKind,
};
use archboard_scene::scene::{Geometry, Item, PathStep, Role, SubjectKind};

/// Two participants, one that opens another picture, with a long call, its
/// noted reply, a message to itself and a decision.
const FLOWS: &str = r#"[{"id":"f","name":"Place an order","summary":"What happens when a customer pays","participants":["api","stock"],"steps":[
    {"id":"m1","kind":"sync","from":"api","to":"stock","label":"reserve every line of the order and say what is short"},
    {"id":"m2","kind":"return","from":"stock","to":"api","label":"reserved","note":"lines that are short come back marked, never dropped"},
    {"id":"m3","kind":"self","from":"api","to":"api","label":"total the order"},
    {"kind":"decision","id":"d","question":"is the order paid","alternatives":[
        {"label":"paid","steps":[{"id":"m4","kind":"async","from":"api","to":"stock","label":"ship"}]},
        {"label":"refused at the gateway","steps":[{"id":"m5","kind":"sync","from":"api","to":"stock","label":"release"}]}]}]}]"#;

const NODES: &str = r#"[
    {"id":"api","name":"Checkout API","kind":"service","responsibility":"Takes an order from the shop and sees it paid"},
    {"id":"stock","name":"Inventory service with a long name","kind":"service","responsibility":"Reserves stock for every order line","drills":true}]"#;

/// What a participant looks like: its chip and its name.
fn appearance() -> NodeAppearance {
    NodeAppearance {
        container: false,
        tags: Vec::new(),
        type_color: None,
        icon: Some("RiServerLine".to_owned()),
        type_name: "Service".to_owned(),
        type_kind: TypeKind::Policy("service".to_owned()),
        drill: None,
    }
}

/// The small sequence, laid out.
fn request() -> SequenceRequest {
    SequenceRequest {
        flows: serde_json::from_str(FLOWS).expect("the flows read"),
        nodes: serde_json::from_str(NODES).expect("the nodes read"),
        held: None,
        appearances: BTreeMap::from([
            ("api".to_owned(), appearance()),
            ("stock".to_owned(), appearance()),
        ]),
        clock: SequenceClock {
            traffic_speed: 80.0,
            cycle_cap_ms: 12_000.0,
        },
        page: PageRequest {
            standing: None,
            plain: true,
            unsettled: Vec::new(),
            unbuilt: false,
            relief: Relief::default(),
            frame: None,
        },
        document: DocumentRequest {
            name: "Place an order".to_owned(),
            description: None,
            far_view_swap_ms: 300.0,
            theme: None,
            theme_colors: None,
        },
        icons: BTreeMap::new(),
    }
}

/// Where a group's points land: a scale, then a move.
#[derive(Clone, Copy)]
struct Placed {
    scale: f64,
    x: f64,
    y: f64,
}

impl Placed {
    fn at(self, point: Point) -> Point {
        Point {
            x: point.x * self.scale + self.x,
            y: point.y * self.scale + self.y,
        }
    }
}

/// Who drew some ink: the subject, the role that drew it, and the subject's id.
type Owner = (SubjectKind, Role, String);

/// What one subject draws near: the box each run of words takes, from its
/// baseline's left end to its advance, and the points its routes pass.
#[derive(Debug, Default)]
struct Ink {
    words: Vec<(String, f64, f64, f64)>,
    points: Vec<Point>,
}

/// Each subject's near ink, by the subject, the role that drew it and its id.
fn ink(items: &[Item], placed: Placed, owner: Option<&Owner>, out: &mut Vec<(Owner, Ink)>) {
    for item in items {
        match item {
            Item::Group(group) if group.role == Role::FarView => {}
            Item::Group(group) => {
                let placed = group.transform.map_or(placed, |moved| Placed {
                    scale: moved.scale.unwrap_or(1.0) * placed.scale,
                    x: moved.x * placed.scale + placed.x,
                    y: moved.y * placed.scale + placed.y,
                });
                let own = group
                    .subject
                    .as_ref()
                    .map(|subject| (subject.kind, group.role.clone(), subject.id.clone()));
                ink(&group.items, placed, own.as_ref().or(owner), out);
            }
            Item::Text(text) => {
                if let Some(owner) = owner {
                    let at = placed.at(text.at);
                    let ink = entry(out, owner);
                    ink.words.push((
                        text.words.clone(),
                        at.x,
                        at.x + text.width * placed.scale,
                        at.y,
                    ));
                }
            }
            Item::Shape(shape) => {
                if let (Some(owner), Geometry::Path { steps }) = (owner, &shape.geometry) {
                    let points = route_points(steps);
                    entry(out, owner)
                        .points
                        .extend(points.into_iter().map(|point| placed.at(point)));
                }
            }
            _ => {}
        }
    }
}

/// The ink a subject has gathered so far.
fn entry<'a>(out: &'a mut Vec<(Owner, Ink)>, owner: &Owner) -> &'a mut Ink {
    if let Some(index) = out.iter().position(|(key, _)| key == owner) {
        return &mut out[index].1;
    }
    out.push((owner.clone(), Ink::default()));
    &mut out.last_mut().expect("just pushed").1
}

/// The points a route passes, in the picture's units.
fn route_points(steps: &[PathStep]) -> Vec<Point> {
    let mut at = Point { x: 0.0, y: 0.0 };
    let mut points = Vec::new();
    for step in steps {
        at = match step {
            PathStep::Move { to }
            | PathStep::Line { to }
            | PathStep::Quad { to, .. }
            | PathStep::Cubic { to, .. }
            | PathStep::Arc { to, .. } => *to,
            PathStep::Across { x } => Point { x: *x, y: at.y },
            PathStep::Down { y } => Point { x: at.x, y: *y },
            PathStep::AcrossBy { dx } => Point {
                x: at.x + dx,
                y: at.y,
            },
            PathStep::DownBy { dy } => Point {
                x: at.x,
                y: at.y + dy,
            },
            PathStep::ArcBy { by, .. } => Point {
                x: at.x + by.x,
                y: at.y + by.y,
            },
            PathStep::Close => at,
        };
        points.push(at);
    }
    points
}

/// Whether a point stands in a box, to a hundredth.
fn inside(rect: Rect, x: f64, y: f64) -> bool {
    let slack = 0.01;
    rect.x - slack <= x
        && x <= rect.x + rect.width + slack
        && rect.y - slack <= y
        && y <= rect.y + rect.height + slack
}

/// The drawing the painter was asked to paint.
fn laid(request: &archboard_scene::request::PaintRequest) -> &SequenceDrawing {
    let Picture::Sequence(sequence) = &request.picture else {
        panic!("a sequence is painted as a sequence");
    };
    &sequence.laid
}

/// The small sequence laid out and painted: what the painter was asked, and
/// each subject's near ink.
fn painted() -> (SequenceDrawing, Vec<(Owner, Ink)>) {
    let request = picture(request());
    let scene = paint(&request);
    let mut drawn = Vec::new();
    let origin = Placed {
        scale: 1.0,
        x: 0.0,
        y: 0.0,
    };
    ink(&scene.body, origin, None, &mut drawn);
    (laid(&request).clone(), drawn)
}

/// The ink one subject drew in the roles asked.
fn ink_of<'a>(
    drawn: &'a [(Owner, Ink)],
    kind: SubjectKind,
    role: fn(&Role) -> bool,
    id: &'a str,
) -> impl Iterator<Item = &'a Ink> {
    drawn
        .iter()
        .filter(move |((subject, drew, owner), _)| *subject == kind && role(drew) && owner == id)
        .map(|(_, ink)| ink)
}

#[test]
fn every_card_s_words_stand_in_its_text_run() {
    let (laid, drawn) = painted();
    for column in &laid.flows[0].columns {
        let card = column.card.bounds;
        // A card's words run from past its padding and chip to its padding.
        let run = (card.x + 13.0 + 24.0 + 10.0, card.x + card.width - 13.0);
        let words: Vec<_> = ink_of(
            &drawn,
            SubjectKind::Node,
            |role| matches!(role, Role::Card(_)),
            &column.card.node.id,
        )
        .flat_map(|ink| ink.words.iter())
        .filter(|(_, left, right, baseline)| {
            !(run.0 - 0.01 <= *left && *right <= run.1 + 0.01 && inside(card, *left, *baseline))
        })
        .collect();
        assert!(
            words.is_empty(),
            "words leave {}'s text run: {words:?}",
            column.card.node.id
        );
    }
}

#[test]
fn every_message_s_ink_stands_in_its_row() {
    let (laid, drawn) = painted();
    for step in &laid.flows[0].steps {
        let row = step.bounds;
        let inks: Vec<&Ink> = ink_of(
            &drawn,
            SubjectKind::Step,
            |role| matches!(role, Role::Label | Role::Line(_)),
            &step.step.id,
        )
        .collect();
        let words = inks.iter().flat_map(|ink| ink.words.iter());
        let points = inks.iter().flat_map(|ink| ink.points.iter());
        assert!(
            inks.iter().any(|ink| !ink.words.is_empty())
                && inks.iter().any(|ink| !ink.points.is_empty()),
            "{} draws its ink",
            step.step.id
        );
        let outside_words: Vec<_> = words
            .filter(|(_, left, right, y)| !(inside(row, *left, *y) && inside(row, *right, *y)))
            .collect();
        let outside_points: Vec<_> = points
            .filter(|point| !inside(row, point.x, point.y))
            .collect();
        assert!(
            outside_words.is_empty() && outside_points.is_empty(),
            "{}'s ink leaves its row {row:?}: {outside_words:?} {outside_points:?}",
            step.step.id
        );
    }
}
