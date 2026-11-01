//! What the pointer is over. The SVG DOM answered this for free. The painter
//! answers it from the scene, under the rules of SVG's `pointer-events`: a
//! shape takes the pointer where it is painted, and an invisible stroke counts,
//! because a line's wide halo is what makes it easy to hit.

use archboard_scene::scene::{
    Group, Item, Paint, Pointer, Role, Scene, Shape, Stroke, Transform, Viewport,
};
use kurbo::{Affine, BezPath, ParamCurve as _, PathEl, Point, Rect, Shape as _};

use crate::path::{outline_of, placed};

/// How finely a curve stands in for itself under the pointer.
const FLATNESS: f64 = 0.25;

/// A marked group: one that a page can name by counting them in document
/// order, as `[data-semantic-id],[data-toggle]` does.
fn is_marked(group: &Group) -> bool {
    group.subject.is_some() || matches!(group.role, Role::Toggle(_))
}

/// One shape that can take the pointer.
#[derive(Clone, Debug)]
struct Target {
    /// The nearest marked group around it, by its number.
    marked: Option<u32>,
    /// The picture's units to the shape's own.
    inverse: Affine,
    /// Where it can be, in the picture's units.
    bounds: Rect,
    path: BezPath,
    /// Whether its inside takes the pointer.
    filled: bool,
    /// How far from its line it takes the pointer, in its own units.
    reach: Option<f64>,
}

impl Target {
    /// Whether a point of the picture lands on the shape.
    fn holds(&self, point: Point) -> bool {
        if !self.bounds.contains(point) {
            return false;
        }
        let local = self.inverse * point;
        (self.filled && self.path.winding(local) != 0)
            || self
                .reach
                .is_some_and(|reach| near_line(&self.path, local, reach))
    }
}

/// Whether a point lies within a distance of a path.
fn near_line(path: &BezPath, point: Point, reach: f64) -> bool {
    let mut near = false;
    let (mut start, mut at) = (Point::ZERO, Point::ZERO);
    kurbo::flatten(path.iter(), FLATNESS, |element| {
        let line = match element {
            PathEl::MoveTo(to) => {
                start = to;
                at = to;
                return;
            }
            PathEl::LineTo(to) => kurbo::Line::new(at, to),
            PathEl::ClosePath => kurbo::Line::new(at, start),
            PathEl::QuadTo(..) | PathEl::CurveTo(..) => return,
        };
        at = line.end();
        let along = (point - line.p0).dot(line.p1 - line.p0)
            / (line.p1 - line.p0).hypot2().max(f64::MIN_POSITIVE);
        near |= (line.eval(along.clamp(0.0, 1.0)) - point).hypot() <= reach;
    });
    near
}

/// Everything in one view of a picture that can take the pointer, last painted last.
#[derive(Clone, Debug, Default)]
pub(crate) struct Targets(Vec<Target>);

/// What a walk over a scene hands down.
#[derive(Clone, Copy, Debug)]
struct Around {
    transform: Affine,
    pointer: Option<Pointer>,
    marked: Option<u32>,
}

/// The walk that finds the targets of one view.
struct Finder {
    far: bool,
    next_mark: u32,
    found: Vec<Target>,
}

impl Finder {
    /// Read some items.
    fn items(&mut self, items: &[Item], around: Around) {
        for item in items {
            match item {
                Item::Group(group) => self.group(group, around),
                Item::Shape(shape) => self.shape(shape, around),
                Item::Viewport(viewport) => self.viewport(viewport, around),
                _ => {}
            }
        }
    }

    /// Where a group sits in this view.
    fn place_of(&self, group: &Group) -> Option<Transform> {
        match &group.role {
            Role::Chip { far } if self.far => Some(*far),
            _ => group.transform,
        }
    }

    /// Read a group. Its numbers count even in a view that cannot take the pointer.
    fn group(&mut self, group: &Group, around: Around) {
        let marked = is_marked(group).then(|| {
            self.next_mark += 1;
            self.next_mark - 1
        });
        let held = Around {
            transform: self.place_of(group).map_or(around.transform, |place| {
                around.transform * placed(place.x, place.y, place.scale)
            }),
            pointer: group.pointer.or(around.pointer),
            marked: marked.or(around.marked),
        };
        let hidden = matches!(
            (&group.role, self.far),
            (Role::FarView, false) | (Role::NearView, true) | (Role::HeadShade, _)
        );
        let before = self.found.len();
        self.items(&group.items, held);
        if hidden {
            self.found.truncate(before);
        }
    }

    /// Read a shape.
    fn shape(&mut self, shape: &Shape, around: Around) {
        let pointer = shape.pointer.or(around.pointer);
        if pointer == Some(Pointer::None) {
            return;
        }
        let all = pointer == Some(Pointer::All);
        let filled = all || shape.fill.as_ref().is_none_or(|fill| *fill != Paint::None);
        let stroke = shape
            .stroke
            .as_ref()
            .filter(|stroke| all || painted(stroke));
        if !filled && stroke.is_none() {
            return;
        }
        let (path, own) = outline_of(&shape.geometry);
        let reach = stroke.map(|stroke| stroke.width.unwrap_or(1.0) / 2.0);
        let room = reach.unwrap_or(0.0);
        self.found.push(Target {
            marked: around.marked,
            inverse: around.transform.inverse(),
            bounds: around
                .transform
                .transform_rect_bbox(own.inflate(room, room)),
            path,
            filled,
            reach,
        });
    }

    /// Read what a nested picture shows.
    fn viewport(&mut self, viewport: &Viewport, around: Around) {
        let (frame, view) = (&viewport.frame, &viewport.view);
        let scale = (frame.width / view.width).min(frame.height / view.height);
        let x = frame.x + (frame.width - view.width * scale) / 2.0 - view.x * scale;
        let y = frame.y + (frame.height - view.height * scale) / 2.0 - view.y * scale;
        let held = Around {
            transform: around.transform * placed(x, y, Some(scale)),
            ..around
        };
        self.items(&viewport.items, held);
    }
}

/// Whether a stroke has paint.
fn painted(stroke: &Stroke) -> bool {
    stroke.paint != Paint::None
}

impl Targets {
    /// The targets of a scene, in the near or the far view.
    pub(crate) fn of(scene: &Scene, far: bool) -> Targets {
        let mut finder = Finder {
            far,
            next_mark: 0,
            found: Vec::new(),
        };
        let around = Around {
            transform: Affine::IDENTITY,
            pointer: None,
            marked: None,
        };
        finder.items(&scene.body, around);
        Targets(finder.found)
    }

    /// What lands under a point, the topmost first: each by the number of its
    /// nearest marked group, or -1 for a shape that stands in none.
    pub(crate) fn under(&self, point: Point) -> Vec<i32> {
        self.0
            .iter()
            .rev()
            .filter(|target| target.holds(point))
            .map(|target| target.marked.map_or(-1, u32::cast_signed))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::Targets;
    use archboard_scene::geometry::{Point, Rect};
    use archboard_scene::scene::{
        Atlas, Colour, Group, Item, PathStep, Pointer, Purpose, Role, Scene, Shape, Stroke,
        Subject, SubjectKind, Token,
    };

    fn subject(id: &str, kind: SubjectKind) -> Subject {
        Subject {
            kind,
            id: id.to_owned(),
            standing: None,
        }
    }

    fn card(id: &str, x: f64) -> Item {
        let rect = Rect {
            x,
            y: 0.0,
            width: 10.0,
            height: 10.0,
        };
        Item::Group(
            Group::new(
                Role::Label,
                vec![Item::Shape(
                    Shape::rect(Purpose::Plate, rect, None).filled(Token::SlabFace),
                )],
            )
            .drawing(subject(id, SubjectKind::Node)),
        )
    }

    fn scene(body: Vec<Item>) -> Scene {
        Scene {
            width: 100.0,
            height: 100.0,
            title: String::new(),
            description: None,
            reading: None,
            background: Colour::White,
            definitions: Vec::new(),
            body,
            atlas: Atlas::default(),
            placed: Vec::new(),
        }
    }

    fn at(x: f64, y: f64) -> kurbo::Point {
        kurbo::Point::new(x, y)
    }

    #[test]
    fn the_topmost_shape_answers_first_and_groups_are_numbered_in_order() {
        let targets = Targets::of(&scene(vec![card("a", 0.0), card("b", 5.0)]), false);
        assert_eq!(targets.under(at(7.0, 5.0)), vec![1, 0]);
        assert_eq!(targets.under(at(2.0, 5.0)), vec![0]);
        assert_eq!(targets.under(at(50.0, 50.0)), Vec::<i32>::new());
    }

    #[test]
    fn an_unseen_stroke_takes_the_pointer_and_no_paint_does_not() {
        let line = |paint| {
            Item::Group(
                Group::new(
                    Role::Line(None),
                    vec![Item::Shape(
                        Shape::path(
                            Purpose::Halo,
                            vec![
                                PathStep::Move {
                                    to: Point { x: 0.0, y: 0.0 },
                                },
                                PathStep::Line {
                                    to: Point { x: 50.0, y: 0.0 },
                                },
                            ],
                        )
                        .unfilled()
                        .stroked(Stroke::new(paint, 6.0)),
                    )],
                )
                .drawing(subject("line", SubjectKind::Edge)),
            )
        };
        let reached = Targets::of(
            &scene(vec![line(archboard_scene::scene::Paint::from(
                Token::Border,
            ))]),
            false,
        );
        assert_eq!(reached.under(at(25.0, 2.9)), vec![0]);
        assert_eq!(reached.under(at(25.0, 3.1)), Vec::<i32>::new());
        let unpainted = Targets::of(
            &scene(vec![line(archboard_scene::scene::Paint::None)]),
            false,
        );
        assert_eq!(unpainted.under(at(25.0, 0.0)), Vec::<i32>::new());
    }

    #[test]
    fn a_group_out_of_view_counts_but_takes_no_pointer() {
        let far = Item::Group(Group::new(Role::FarView, vec![card("a", 0.0)]));
        let near = Targets::of(&scene(vec![far.clone(), card("b", 0.0)]), false);
        assert_eq!(near.under(at(5.0, 5.0)), vec![1]);
        let seen = Targets::of(&scene(vec![far, card("b", 0.0)]), true);
        assert_eq!(seen.under(at(5.0, 5.0)), vec![1, 0]);
    }

    #[test]
    fn a_shape_that_refuses_the_pointer_is_passed_through() {
        let rect = Rect {
            x: 0.0,
            y: 0.0,
            width: 10.0,
            height: 10.0,
        };
        let refused = Item::Group(
            Group::new(
                Role::Label,
                vec![Item::Shape(
                    Shape::rect(Purpose::Plate, rect, None)
                        .filled(Token::SlabFace)
                        .pointer(Pointer::None),
                )],
            )
            .drawing(subject("top", SubjectKind::Node)),
        );
        let targets = Targets::of(&scene(vec![card("under", 0.0), refused]), false);
        assert_eq!(targets.under(at(5.0, 5.0)), vec![0]);
    }
}
