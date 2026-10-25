//! A native frontend reads a corpus board's scene as typed values (ADR 0057,
//! docs/design/typed-scene.md): where each card stands, what each line is
//! stroked with and which words each card says, with no SVG, path data or CSS
//! to parse. The board is the dogfood vault's "Codex session", as the renderer
//! hands it to the core (`tests/fixtures/codex-session.paint.json`).

use archboard_scene::drawing::DiagramFont;
use archboard_scene::geometry::Rect;
use archboard_scene::measure::Measure;
use archboard_scene::paint::paint;
use archboard_scene::request::PaintRequest;
use archboard_scene::scene::{
    Definition, Geometry, Group, Item, MarkerId, Paint, Purpose, Role, Scene, Shape, SubjectKind,
};
use serde_json::Value;

/// The paint request of "Codex session".
const REQUEST: &str = include_str!("fixtures/codex-session.paint.json");

/// A host that measures every character as half its font size wide.
struct HalfWidth;

impl Measure for HalfWidth {
    fn width(&self, text: &str, _font: DiagramFont, size: f64) -> f64 {
        #[expect(
            clippy::cast_precision_loss,
            reason = "a line of text holds far fewer characters than f64 counts exactly"
        )]
        let characters = text.chars().count() as f64;
        (characters * size * 50.0).round() / 100.0
    }
}

/// The board painted, and its request as plain data to read what it asked for.
fn painted() -> (Scene, Value) {
    let request: PaintRequest = serde_json::from_str(REQUEST).expect("the fixture is a request");
    let asked: Value = serde_json::from_str(REQUEST).expect("the fixture is JSON");
    (paint(&request, &HalfWidth), asked)
}

/// Every group of some items, depth first.
fn groups(items: &[Item]) -> Vec<&Group> {
    let mut found = Vec::new();
    for item in items {
        match item {
            Item::Group(group) => {
                found.push(group);
                found.extend(groups(&group.items));
            }
            Item::Viewport(viewport) => found.extend(groups(&viewport.items)),
            _ => {}
        }
    }
    found
}

/// The group that draws a subject in some role.
fn drawing<'s>(
    scene: &'s Scene,
    kind: SubjectKind,
    id: &str,
    role: fn(&Role) -> bool,
) -> &'s Group {
    let mut found = groups(&scene.body).into_iter().filter(|group| {
        role(&group.role)
            && group
                .subject
                .as_ref()
                .is_some_and(|subject| subject.kind == kind && subject.id == id)
    });
    let group = found
        .next()
        .unwrap_or_else(|| panic!("no group draws {id}"));
    assert!(found.next().is_none(), "one group draws {id}");
    group
}

/// Every shape of some items, depth first.
fn shapes(items: &[Item]) -> Vec<&Shape> {
    items
        .iter()
        .flat_map(|item| match item {
            Item::Shape(shape) => vec![shape],
            Item::Group(group) => shapes(&group.items),
            _ => Vec::new(),
        })
        .collect()
}

/// Every word some items say, depth first.
fn words(items: &[Item]) -> Vec<&str> {
    items
        .iter()
        .flat_map(|item| match item {
            Item::Text(text) => vec![text.words.as_str()],
            Item::Group(group) => words(&group.items),
            Item::Viewport(viewport) => words(&viewport.items),
            _ => Vec::new(),
        })
        .collect()
}

/// Every definition of a scene: its head's, and those its items carry.
fn definitions(scene: &Scene) -> Vec<&Definition> {
    fn inline(items: &[Item]) -> Vec<&Definition> {
        items
            .iter()
            .flat_map(|item| match item {
                Item::Definitions { definitions } => definitions.iter().collect(),
                Item::Group(group) => inline(&group.items),
                _ => Vec::new(),
            })
            .collect()
    }
    scene
        .definitions
        .iter()
        .chain(inline(&scene.body))
        .collect()
}

/// A rect of the request.
fn rect_of(value: &Value) -> Rect {
    let number = |key: &str| value[key].as_f64().expect("a box holds numbers");
    Rect {
        x: number("x"),
        y: number("y"),
        width: number("width"),
        height: number("height"),
    }
}

/// Whether two boxes are the same to the hundredth a picture is drawn to.
fn same_box(a: Rect, b: Rect) -> bool {
    [
        (a.x, b.x),
        (a.y, b.y),
        (a.width, b.width),
        (a.height, b.height),
    ]
    .iter()
    .all(|(one, other)| (one - other).abs() < 0.01)
}

/// What the request lays out under some key of its drawing: never nothing.
fn laid_out<'a>(asked: &'a Value, key: &str) -> &'a [Value] {
    let nothing: &[Value] = &[];
    let laid = asked["picture"]["drawing"][key]
        .as_array()
        .map_or(nothing, Vec::as_slice);
    assert_ne!(laid, nothing, "the board lays out {key}");
    laid
}

/// The one shape of a purpose a group draws.
fn the(group: &Group, purpose: Purpose) -> &Shape {
    shapes(&group.items)
        .into_iter()
        .find(|shape| shape.purpose == purpose)
        .unwrap_or_else(|| panic!("a {:?} group draws a {purpose:?}", group.role))
}

/// Whether a scene defines an arrowhead.
fn defines(scene: &Scene, head: &MarkerId) -> bool {
    definitions(scene)
        .into_iter()
        .any(|definition| matches!(definition, Definition::Marker(marker) if &marker.id == head))
}

#[test]
fn each_card_is_a_typed_plate_at_its_box_saying_its_words() {
    let (scene, asked) = painted();
    for card in laid_out(&asked, "cards") {
        let measured = &card["measured"];
        let id = measured["node"]["id"]
            .as_str()
            .expect("a card names its node");
        let group = drawing(&scene, SubjectKind::Node, id, |role| {
            matches!(role, Role::Card(_))
        });
        let Geometry::Rect { rect, .. } = the(group, Purpose::Plate).geometry else {
            panic!("a plate is a box")
        };
        assert!(
            same_box(rect, rect_of(&card["box"])),
            "{id} stands at its box"
        );
        let said = words(&group.items);
        for run in measured["runs"].as_array().into_iter().flatten() {
            let run = run["text"].as_str().expect("a run has text");
            assert!(said.contains(&run), "{id} says {run:?}");
        }
    }
}

#[test]
fn each_line_is_a_path_stroked_with_a_colour_and_its_head_is_defined() {
    let (scene, asked) = painted();
    for edge in laid_out(&asked, "edges") {
        let id = edge["edge"]["id"].as_str().expect("a line has an id");
        let group = drawing(&scene, SubjectKind::Edge, id, |role| {
            matches!(role, Role::Line(Some(_)))
        });
        let line = the(group, Purpose::Line);
        assert!(
            matches!(line.geometry, Geometry::Path { .. })
                && line
                    .stroke
                    .as_ref()
                    .is_some_and(|stroke| matches!(stroke.paint, Paint::Colour { .. })),
            "{id} is a path stroked with a colour"
        );
        let head = line
            .marker
            .as_ref()
            .expect("each line of this board has a head");
        assert!(defines(&scene, head), "{id}'s head is defined");
    }
}
