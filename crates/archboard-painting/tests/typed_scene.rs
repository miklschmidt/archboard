//! A native frontend reads a corpus picture's scene as typed values (ADR 0059,
//! TASK-520.10): where each card stands, what each line is
//! stroked with and which words each card says, with no SVG, path data or CSS
//! to parse. The picture is the dogfood vault's "Codex session", as the renderer
//! hands it to the core (`tests/fixtures/codex-session.paint.json`).
//! The fixture keeps icon names without their paths because scene painting
//! reads only which icons are available.

use archboard_geometry::Rect;
use archboard_painting::paint;
use archboard_scene::request::{PaintRequest, Picture, TypeKind};
use archboard_scene::scene::{
    Definition, Geometry, Group, Icon, Item, MarkerId, Paint, Purpose, Role, Scene, Shape,
    SubjectKind,
};
use serde_json::Value;

/// The paint request of "Codex session".
const REQUEST: &str = include_str!("fixtures/codex-session.paint.json");

/// The picture painted, and its request as plain data to read what it asked for.
fn painted() -> (Scene, Value) {
    let request: PaintRequest = serde_json::from_str(REQUEST).expect("the fixture is a request");
    let asked: Value = serde_json::from_str(REQUEST).expect("the fixture is JSON");
    (paint(&request), asked)
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
    assert_ne!(laid, nothing, "the picture lays out {key}");
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
            .expect("each line of this picture has a head");
        assert!(defines(&scene, head), "{id}'s head is defined");
    }
}

/// Every icon some items draw, depth first.
fn icons(items: &[Item]) -> Vec<&Icon> {
    items
        .iter()
        .flat_map(|item| match item {
            Item::Icon(icon) => vec![icon],
            Item::Group(group) => icons(&group.items),
            _ => Vec::new(),
        })
        .collect()
}

#[test]
fn a_part_whose_icon_is_missing_draws_the_fallback_icon() {
    let mut asked: Value = serde_json::from_str(REQUEST).expect("the fixture is JSON");
    let ids: Vec<String> = laid_out(&asked, "cards")
        .iter()
        .take(2)
        .map(|card| {
            card["measured"]["node"]["id"]
                .as_str()
                .expect("an id")
                .to_owned()
        })
        .collect();
    let appearances = &mut asked["picture"]["appearances"];
    appearances[&ids[0]]
        .as_object_mut()
        .expect("an appearance")
        .remove("icon");
    appearances[&ids[1]]["icon"] = Value::from("RiNotAnIconTheHostHas");
    let request: PaintRequest = serde_json::from_value(asked).expect("still a request");
    let scene = paint(&request);
    for id in &ids {
        let card = drawing(&scene, SubjectKind::Node, id, |role| {
            matches!(role, Role::Card(_))
        });
        let drawn: Vec<&str> = icons(&card.items)
            .iter()
            .map(|icon| icon.name.as_str())
            .collect();
        assert!(!drawn.is_empty(), "{id} draws its chip");
        assert!(
            drawn.iter().all(|name| *name == "RiQuestionLine"),
            "{id}: {drawn:?}"
        );
    }
    let Role::Card(look) = &drawing(&scene, SubjectKind::Node, &ids[0], |role| {
        matches!(role, Role::Card(_))
    })
    .role
    else {
        unreachable!("a card's group")
    };
    assert_eq!(look.icon.as_deref(), Some("RiQuestionLine"));
}

#[test]
fn a_container_with_the_policy_kind_flow_omits_its_tab_chip() {
    let mut request: PaintRequest =
        serde_json::from_str(REQUEST).expect("the fixture is a request");
    let Picture::Architecture(picture) = &mut request.picture else {
        panic!("the fixture draws an architecture");
    };
    let drawing_nodes = &mut picture.drawing.drawing;
    let card = drawing_nodes.cards.remove(0);
    let id = card.measured.node.id.clone();
    drawing_nodes.containers.push(card);
    let look = picture
        .appearances
        .get_mut(&id)
        .expect("the part has a look");
    look.container = true;
    look.type_kind = TypeKind::Policy("flow".to_owned());

    let scene = paint(&request);
    let tab = drawing(&scene, SubjectKind::Region, &id, |role| {
        matches!(role, Role::Header(_))
    });
    assert!(
        icons(&tab.items).is_empty(),
        "a flow's tab omits its kind chip"
    );
}
