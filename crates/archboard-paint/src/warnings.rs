//! The warning a viewer adds to a subject that the code check warns about. The
//! picture never holds it, because a picture is drawn from the board alone. The
//! viewer adds the picture's own warning triangle in the place the picture puts
//! it on a subject nobody has decided: the top-right corner of a part's body,
//! the leading edge of a relationship's or a message's words, or the middle of
//! the longest straight run of a line that has none.
//!
//! The mark goes into the subject's own group, so that it recedes and ghosts
//! with the subject. A line with no words has no group to hold a mark above the
//! cards, so it gets one at the end of the items it stands in.

use std::collections::{HashMap, HashSet};

use archboard_scene::geometry::{Curve, Point, Rect, Segment, label_anchor_of};
use archboard_scene::paint::viewer_marks;
use archboard_scene::scene::{Geometry, Group, Item, PathStep, Purpose, Role, Scene, SubjectKind};

use crate::sweep::is_route;

/// Where the warnings stand, found in one scene. A group is named by where it
/// is in memory, so a scene must not move while its warnings stand.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Warnings {
    /// The marks of a warning, centred on the origin.
    glyph: Vec<Item>,
    /// The groups that hold marks, and where in them the marks stand.
    held: HashMap<usize, Vec<Point>>,
    /// The lines that have no words, and where their marks stand.
    bare: HashMap<usize, Point>,
}

/// Where a group is, to tell it from the others.
pub(crate) fn address(group: &Group) -> usize {
    std::ptr::from_ref(group).addr()
}

/// Every group that draws one of some subjects, by subject, in the order they
/// are drawn.
fn gather<'s>(
    items: &'s [Item],
    ids: &HashSet<String>,
    found: &mut HashMap<&'s str, Vec<&'s Group>>,
) {
    for item in items {
        match item {
            Item::Group(group) => {
                if let Some(subject) = group.subject.as_ref().filter(|one| ids.contains(&one.id)) {
                    found.entry(subject.id.as_str()).or_default().push(group);
                }
                gather(&group.items, ids, found);
            }
            Item::Viewport(viewport) => gather(&viewport.items, ids, found),
            _ => {}
        }
    }
}

/// Whether a group draws one part of a subject drawn in several.
fn is_part(group: &Group) -> bool {
    matches!(group.role, Role::Header(_) | Role::Label | Role::Lifeline)
}

/// The first box a group draws itself with, past its halo.
fn body_rect(group: &Group) -> Option<&Rect> {
    group.items.iter().find_map(|item| match item {
        Item::Shape(shape) if shape.purpose != Purpose::Halo => match &shape.geometry {
            Geometry::Rect { rect, .. } => Some(rect),
            _ => None,
        },
        _ => None,
    })
}

/// A route read back from the steps of a path that draws one.
fn curve_of(steps: &[PathStep]) -> Option<Curve> {
    let [PathStep::Move { to: from }, rest @ ..] = steps else {
        return None;
    };
    let segments = rest
        .iter()
        .map(|step| match *step {
            PathStep::Line { to } => Some(Segment::Line { to }),
            PathStep::Cubic { first, second, to } => Some(Segment::Cubic { first, second, to }),
            _ => None,
        })
        .collect::<Option<Vec<_>>>()?;
    Some(Curve {
        from: *from,
        segments,
    })
}

/// Where the picture puts the words of a line that has none: its stroke is the
/// last path the group draws itself with, past its halos.
fn words_anchor(line: &Group) -> Option<Point> {
    let steps = line.items.iter().rev().find_map(|item| match item {
        Item::Shape(shape) if is_route(shape) => match &shape.geometry {
            Geometry::Path { steps } => Some(steps),
            _ => None,
        },
        _ => None,
    })?;
    curve_of(steps).map(|curve| label_anchor_of(&curve))
}

impl Warnings {
    /// Where the marks of the warned subjects stand in a scene.
    pub(crate) fn find(scene: &Scene, ids: &HashSet<String>) -> Warnings {
        let mut found = HashMap::new();
        gather(&scene.body, ids, &mut found);
        let marks = viewer_marks();
        let mut warnings = Warnings {
            glyph: marks.warning,
            ..Warnings::default()
        };
        for groups in found.values() {
            let kind = groups.first().and_then(|group| group.subject.as_ref());
            match kind.map(|subject| subject.kind) {
                Some(SubjectKind::Node | SubjectKind::Region) => {
                    warnings.on_part(groups, marks.corner_inset);
                }
                Some(SubjectKind::Edge | SubjectKind::Step) => warnings.on_line(groups),
                _ => {}
            }
        }
        warnings
    }

    /// Mark a part on its body's top-right corner, in a container's header when
    /// it has one, so that the mark stands over what the container holds. A
    /// participant of several exchanges has a card in each, and each is marked.
    fn on_part(&mut self, groups: &[&Group], inset: f64) {
        let header = groups
            .iter()
            .find(|group| matches!(group.role, Role::Header(_)));
        for body in groups.iter().filter(|group| !is_part(group)) {
            let Some(rect) = body_rect(body) else {
                continue;
            };
            let at = Point {
                x: rect.x + rect.width - inset,
                y: rect.y + inset,
            };
            let holder = header.unwrap_or(body);
            self.held.entry(address(holder)).or_default().push(at);
        }
    }

    /// Mark a relationship or a message on the leading edge of its words, or,
    /// for a line with none, on the line.
    fn on_line(&mut self, groups: &[&Group]) {
        let words = groups
            .iter()
            .find(|group| matches!(group.role, Role::Label))
            .and_then(|words| Some((words, body_rect(words)?)));
        if let Some((words, plate)) = words {
            let at = Point {
                x: plate.x,
                y: plate.y + plate.height / 2.0,
            };
            self.held.entry(address(words)).or_default().push(at);
        } else if let Some(line) = groups.iter().find(|group| !is_part(group))
            && let Some(at) = words_anchor(line)
        {
            self.bare.insert(address(line), at);
        }
    }

    /// The marks, centred on the origin.
    pub(crate) fn glyph(&self) -> &[Item] {
        &self.glyph
    }

    /// Where the marks in a group stand.
    pub(crate) fn held_in(&self, group: &Group) -> &[Point] {
        self.held.get(&address(group)).map_or(&[], Vec::as_slice)
    }

    /// Where the mark of a line that has no words stands.
    pub(crate) fn bare_on(&self, group: &Group) -> Option<Point> {
        self.bare.get(&address(group)).copied()
    }

    /// Whether any line has a mark of its own.
    pub(crate) fn has_bare(&self) -> bool {
        !self.bare.is_empty()
    }

    /// Whether no group is marked.
    pub(crate) fn is_empty(&self) -> bool {
        self.held.is_empty() && self.bare.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::Warnings;
    use archboard_scene::geometry::{Point, Rect};
    use archboard_scene::scene::{
        Atlas, Colour, Group, Item, PathStep, Purpose, Role, Scene, Shape, Stroke, Subject,
        SubjectKind, Token,
    };
    use std::collections::HashSet;

    fn subject(kind: SubjectKind, id: &str) -> Subject {
        Subject {
            kind,
            id: id.to_owned(),
            standing: None,
        }
    }

    fn card() -> Group {
        let rect = Rect {
            x: 10.0,
            y: 20.0,
            width: 100.0,
            height: 40.0,
        };
        Group::new(
            Role::Shape,
            vec![Item::Shape(Shape::rect(Purpose::Plate, rect, None))],
        )
        .drawing(subject(SubjectKind::Node, "a"))
    }

    fn line() -> Group {
        let at = |x, y| Point { x, y };
        let steps = vec![
            PathStep::Move { to: at(0.0, 0.0) },
            PathStep::Line { to: at(10.0, 0.0) },
            PathStep::Line { to: at(10.0, 50.0) },
            PathStep::Line { to: at(40.0, 50.0) },
        ];
        Group::new(
            Role::Line(None),
            vec![Item::Shape(
                Shape::path(Purpose::Line, steps)
                    .unfilled()
                    .stroked(Stroke::new(Token::Border, 1.0)),
            )],
        )
        .drawing(subject(SubjectKind::Edge, "e"))
    }

    fn scene(groups: Vec<Group>) -> Scene {
        Scene {
            width: 1.0,
            height: 1.0,
            title: String::new(),
            description: None,
            reading: None,
            background: Colour::White,
            definitions: Vec::new(),
            body: groups.into_iter().map(Item::Group).collect(),
            atlas: Atlas::default(),
            placed: Vec::new(),
        }
    }

    fn warned(ids: &[&str]) -> HashSet<String> {
        ids.iter().map(|id| (*id).to_owned()).collect()
    }

    #[test]
    fn a_part_is_marked_in_its_top_right_corner() {
        let scene = scene(vec![card()]);
        let warnings = Warnings::find(&scene, &warned(&["a"]));
        let Item::Group(group) = &scene.body[0] else {
            unreachable!("the body is a group")
        };
        let [mark] = warnings.held_in(group) else {
            panic!("one mark on the card")
        };
        assert!(mark.x < 110.0 && mark.x > 100.0 && mark.y > 20.0 && mark.y < 30.0);
        assert!(!warnings.has_bare());
        assert_ne!(warnings.glyph(), []);
    }

    #[test]
    fn a_line_with_no_words_is_marked_in_the_middle_of_its_longest_run() {
        let scene = scene(vec![line()]);
        let warnings = Warnings::find(&scene, &warned(&["e"]));
        let Item::Group(group) = &scene.body[0] else {
            unreachable!("the body is a group")
        };
        assert_eq!(warnings.bare_on(group), Some(Point { x: 10.0, y: 25.0 }));
        assert_eq!(warnings.held_in(group), []);
    }

    #[test]
    fn a_subject_that_is_not_warned_is_not_marked() {
        let warnings = Warnings::find(&scene(vec![card(), line()]), &warned(&["z"]));
        assert!(warnings.is_empty());
    }
}
