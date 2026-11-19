//! Small scenes for the tests of a move.

use archboard_scene::drawing::{DiagramFont, Emphasis, FontFamily};
use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{
    Atlas, AtlasBox, Boxes, Colour, Group, Head, HeadInk, Item, MarkerId, Pointer, Purpose, Role,
    Scene, Shape, Subject, SubjectKind, Text, Token,
};

use super::phases::Phases;
use crate::testing::{boxed, stroke, subject_group, traced};

/// The values `@archboard/timing` holds.
pub(super) const PHASES: Phases = super::phases::fixtures::PHASES;

pub(super) fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect {
        x,
        y,
        width,
        height,
    }
}

pub(super) fn at(x: f64, y: f64) -> Point {
    Point { x, y }
}

/// A run of words at a place.
pub(super) fn words(place: f64, words: &str) -> Item {
    Item::Text(Text::set(
        at(place, place),
        DiagramFont {
            family: FontFamily::Sans,
            weight: 400,
        },
        12.0,
        Colour::Black,
        words,
    ))
}

fn subject(kind: SubjectKind, id: &str) -> Subject {
    Subject {
        kind,
        id: id.to_owned(),
        standing: None,
    }
}

/// A card: its plate and its words.
pub(super) fn card(id: &str, frame: Rect, content: &[&str]) -> Item {
    let mut items = vec![Item::Shape(boxed(Purpose::Plate, frame, Some(8.0)))];
    for (row, line) in content.iter().enumerate() {
        items.push(words(frame.x + 10.0 + 4.0 * row as f64, line));
    }
    Item::Group(subject_group(
        Role::Frame(None),
        items,
        subject(SubjectKind::Node, id),
    ))
}

/// The same card as a container's frame.
pub(super) fn region(id: &str, frame: Rect) -> Item {
    let items = vec![Item::Shape(boxed(Purpose::Plate, frame, None))];
    Item::Group(subject_group(
        Role::Frame(None),
        items,
        subject(SubjectKind::Region, id),
    ))
}

fn route(points: &[(f64, f64)]) -> Vec<archboard_scene::scene::PathStep> {
    use archboard_scene::scene::PathStep;
    let mut steps = vec![PathStep::Move {
        to: at(points[0].0, points[0].1),
    }];
    steps.extend(
        points[1..]
            .iter()
            .map(|&(x, y)| PathStep::Line { to: at(x, y) }),
    );
    steps
}

/// A line along some points, with a halo, a port and an arrowhead.
pub(super) fn line(id: &str, points: &[(f64, f64)]) -> Item {
    let halo = traced(
        Purpose::Halo,
        route(points),
        stroke(Token::DiagramSelection, 8.0),
    );
    let ink = Shape {
        marker: Some(MarkerId::Shared {
            head: Head::Filled,
            weight: Emphasis::Normal,
            ink: HeadInk::Neutral,
        }),
        ..traced(Purpose::Line, route(points), stroke(Token::Border, 2.0))
    };
    let port = Group::new(
        Role::Port,
        vec![Item::Shape(boxed(
            Purpose::Port,
            rect(0.0, 0.0, 4.0, 4.0),
            None,
        ))],
    );
    let items = vec![Item::Shape(halo), Item::Shape(ink), Item::Group(port)];
    Item::Group(subject_group(
        Role::Line(None),
        items,
        subject(SubjectKind::Edge, id),
    ))
}

/// The words of a connection, on a plate.
pub(super) fn label(id: &str, frame: Rect, text: &str) -> Item {
    let items = vec![
        Item::Shape(boxed(Purpose::Plate, frame, Some(4.0))),
        words(frame.x + 4.0, text),
    ];
    Item::Group(subject_group(
        Role::Label,
        items,
        subject(SubjectKind::Edge, id),
    ))
}

/// What a move parks until it lands.
pub(super) fn shadow() -> Item {
    let items = vec![Item::Shape(boxed(
        Purpose::Box,
        rect(0.0, 0.0, 9.0, 9.0),
        None,
    ))];
    Item::Group(Group {
        pointer: Some(Pointer::None),
        ..Group::new(Role::Shadow(None), items)
    })
}

/// A scene of some body, whose atlas places the nodes it is given.
pub(super) fn scene(body: Vec<Item>, nodes: &[(&str, Rect)]) -> Scene {
    Scene {
        width: 400.0,
        height: 300.0,
        title: String::new(),
        description: None,
        reading: None,
        background: Colour::White,
        definitions: Vec::new(),
        body,
        atlas: Atlas {
            nodes: Boxes(
                nodes
                    .iter()
                    .map(|&(id, own)| {
                        let place = AtlasBox {
                            x: own.x,
                            y: own.y,
                            width: own.width,
                            height: own.height,
                        };
                        (id.to_owned(), place)
                    })
                    .collect(),
            ),
            ..Atlas::default()
        },
        placed: Vec::new(),
    }
}

/// The groups that draw a subject, in drawing order, wherever they stand.
pub(super) fn drawing<'a>(items: &'a [Item], id: &str) -> Vec<&'a Group> {
    let mut found = Vec::new();
    for item in items {
        if let Item::Group(group) = item {
            if group
                .subject
                .as_ref()
                .is_some_and(|subject| subject.id == id)
            {
                found.push(group);
            }
            found.extend(drawing(&group.items, id));
        }
    }
    found
}

/// The first box a group draws directly.
pub(super) fn plate(group: &Group) -> Rect {
    group
        .items
        .iter()
        .find_map(|item| match item {
            Item::Shape(Shape {
                geometry: archboard_scene::scene::Geometry::Rect { rect, .. },
                ..
            }) => Some(*rect),
            _ => None,
        })
        .expect("a card draws a plate")
}

/// The steps of the last route a group draws directly.
pub(super) fn route_of(group: &Group) -> Vec<archboard_scene::scene::PathStep> {
    group
        .items
        .iter()
        .rev()
        .find_map(|item| match item {
            Item::Shape(Shape {
                geometry: archboard_scene::scene::Geometry::Path { steps },
                purpose: Purpose::Line,
                ..
            }) => Some(steps.clone()),
            _ => None,
        })
        .expect("a line draws a route")
}
