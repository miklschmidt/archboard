//! A relationship lighting up: a copy of its line is drawn on along its route,
//! heavier than the line, then settles to the line's weight and fades into the
//! line under it. The SVG viewer laid animated copies over the picture. Here
//! the sweep holds the copies and a clock, and the walk draws them where the
//! layer stood: above the lines and below the first card.

use std::collections::HashMap;

use archboard_scene::scene::{
    Cap, Geometry, Group, Item, Purpose, Role, Scene, Shape, Stroke, SubjectKind,
};
use kurbo::{BezPath, Rect, Shape as _};

use crate::path::{path_of, stroke_of};
use crate::timing::{Curve, EASE_OUT};

/// How much wider than its line a sweep is drawn, in the picture's units.
const EXTRA_WIDTH: f64 = 1.4;

/// How fast a sweep runs along its line, in the picture's units a millisecond.
const SPEED: f64 = 2.4;

/// The curve a line is drawn on along: off quickly, settling slowly.
const DRAW_EASING: Curve = Curve(0.2, 0.0, 0.0, 1.0);

/// How much of a sweep's time is spent drawing the line on. The rest is the
/// line settling back to its own weight.
const DRAWING_SHARE: f64 = 0.65;

/// The weight of a line that states none, which a sweep settles to.
const OWN_WIDTH: f64 = 1.2;

/// How closely the length of a route is measured.
const ACCURACY: f64 = 0.01;

/// One line's copy, and when it runs.
#[derive(Clone, Debug, PartialEq)]
struct Copy {
    path: BezPath,
    bounds: Rect,
    stroke: Stroke,
    length: f64,
    /// When it begins, in milliseconds.
    start: f64,
    /// How long it takes, in milliseconds.
    duration: f64,
}

/// What one copy looks like at a moment.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Look {
    /// How much of the route is drawn on, from its start, from 0 to 1.
    pub(crate) drawn: f64,
    /// How wide the copy is.
    pub(crate) width: f64,
    /// How solid it is.
    pub(crate) opacity: f64,
}

/// The copies of the lines that light, and the moment they are drawn at.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Sweep {
    now: f64,
    copies: Vec<Copy>,
}

/// The group of an item, when it draws a subject of some kind.
fn drawing(item: &Item, kind: SubjectKind) -> Option<&Group> {
    match item {
        Item::Group(group) if group.subject.as_ref().is_some_and(|one| one.kind == kind) => {
            Some(group)
        }
        _ => None,
    }
}

/// Whether a list of items holds the lines of a picture: the list where the
/// sweep's layer belongs.
pub(crate) fn holds_lines(items: &[Item]) -> bool {
    items
        .iter()
        .any(|item| drawing(item, SubjectKind::Edge).is_some())
}

/// Whether an item is a part, which draws over the sweep's layer.
pub(crate) fn is_part(item: &Item) -> bool {
    drawing(item, SubjectKind::Node).is_some()
}

/// Whether a group only moves what the picture holds: a page's shift and inset.
pub(crate) fn only_moves(role: &Role) -> bool {
    matches!(role, Role::Move | Role::Inset)
}

/// The list of items that holds the lines, found through the groups that only
/// move the picture.
fn home(items: &[Item]) -> Option<&[Item]> {
    if holds_lines(items) {
        return Some(items);
    }
    items.iter().find_map(|item| match item {
        Item::Group(group) if only_moves(&group.role) => home(&group.items),
        _ => None,
    })
}

/// Whether a shape is a route that draws on: a path that is not a halo.
pub(crate) fn is_route(shape: &Shape) -> bool {
    matches!(shape.geometry, Geometry::Path { .. })
        && !matches!(
            shape.purpose,
            Purpose::Halo | Purpose::Ring | Purpose::LitLine
        )
}

/// The moments and measures a sweep takes its times from.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Timing {
    /// The shortest a line is drawn on for, in milliseconds.
    pub(crate) shortest: f64,
    /// The longest a line is drawn on for, in milliseconds.
    pub(crate) longest: f64,
    /// The moment the sweep is asked for, in milliseconds.
    pub(crate) now: f64,
}

impl Copy {
    /// The copy of a route, running after a delay.
    fn of(shape: &Shape, delay: f64, timing: Timing) -> Option<Copy> {
        let Geometry::Path { steps } = &shape.geometry else {
            return None;
        };
        // A copy is drawn on whole, whatever dashes its line has.
        let stroke = Stroke {
            cap: Some(Cap::Round),
            dashes: Vec::new(),
            dash_offset: None,
            ..shape.stroke.clone()?
        };
        let path = path_of(steps);
        let length = path.perimeter(ACCURACY);
        let drawing = timing.longest.min(timing.shortest.max(length / SPEED));
        Some(Copy {
            bounds: path.bounding_box(),
            path,
            stroke,
            length,
            start: timing.now + delay,
            duration: drawing / DRAWING_SHARE,
        })
    }

    /// The weight the copy settles to.
    fn own_width(&self) -> f64 {
        self.stroke.width.unwrap_or(OWN_WIDTH)
    }

    /// When the copy ends, in milliseconds.
    fn end(&self) -> f64 {
        self.start + self.duration
    }

    /// What the copy looks like at a moment, or nothing while it waits or after
    /// it has settled into the line under it.
    fn look(&self, now: f64) -> Option<Look> {
        let heavy = self.own_width() + EXTRA_WIDTH;
        let share = (now - self.start) / self.duration;
        if share <= 0.0 || share >= 1.0 {
            return None;
        }
        if share < DRAWING_SHARE {
            return Some(Look {
                drawn: DRAW_EASING.at(share / DRAWING_SHARE),
                width: heavy,
                opacity: 1.0,
            });
        }
        let settled = EASE_OUT.at((share - DRAWING_SHARE) / (1.0 - DRAWING_SHARE));
        Some(Look {
            drawn: 1.0,
            width: heavy + (self.own_width() - heavy) * settled,
            opacity: 1.0 - settled,
        })
    }
}

impl Sweep {
    /// The sweep of the lines among the relationships a picture lights, each
    /// after its delay in milliseconds, or nothing when none of them has a
    /// line to draw on.
    pub(crate) fn of(
        scene: &Scene,
        delays: &HashMap<String, f64>,
        timing: Timing,
    ) -> Option<Sweep> {
        let copies: Vec<Copy> = home(&scene.body)?
            .iter()
            .filter_map(|item| drawing(item, SubjectKind::Edge))
            .filter_map(|group| Some((group, *delays.get(&group.subject.as_ref()?.id)?)))
            .flat_map(|(group, delay)| {
                group.items.iter().filter_map(move |item| match item {
                    Item::Shape(shape) if is_route(shape) => Copy::of(shape, delay, timing),
                    _ => None,
                })
            })
            .collect();
        (!copies.is_empty()).then_some(Sweep {
            now: timing.now,
            copies,
        })
    }

    /// Bring the sweep to a moment, in milliseconds.
    pub(crate) fn advance(&mut self, now: f64) {
        self.now = now;
    }

    /// Whether the last copy has settled by a moment.
    pub(crate) fn over(&self, now: f64) -> bool {
        self.copies.iter().all(|copy| now >= copy.end())
    }

    /// The copies that show now, each with its route, the box its ink is
    /// measured by, its stroke as a canvas takes it and the paint it names.
    pub(crate) fn showing(&self) -> impl Iterator<Item = Showing<'_>> {
        self.copies.iter().filter_map(|copy| {
            let look = copy.look(self.now).filter(|look| look.drawn > 0.0)?;
            let mut stroke = stroke_of(&copy.stroke, 1.0);
            stroke.width = look.width;
            if look.drawn < 1.0 {
                stroke = stroke.with_dashes(0.0, [look.drawn * copy.length, 2.0 * copy.length]);
            }
            Some(Showing {
                path: &copy.path,
                bounds: copy.bounds,
                stroke,
                paint: &copy.stroke,
                opacity: look.opacity,
            })
        })
    }
}

/// One copy, ready to draw.
#[derive(Debug)]
pub(crate) struct Showing<'a> {
    pub(crate) path: &'a BezPath,
    pub(crate) bounds: Rect,
    pub(crate) stroke: kurbo::Stroke,
    /// The scene's stroke, which names the paint and how solid it is.
    pub(crate) paint: &'a Stroke,
    /// How solid the copy is at this moment.
    pub(crate) opacity: f64,
}

#[cfg(test)]
mod tests {
    use super::{Sweep, Timing};
    use archboard_scene::geometry::Point;
    use archboard_scene::scene::{
        Atlas, Colour, Group, Item, PathStep, Purpose, Role, Scene, Shape, Stroke, Subject,
        SubjectKind, Token,
    };
    use std::collections::HashMap;

    fn route(purpose: Purpose) -> Item {
        let steps = vec![
            PathStep::Move {
                to: Point { x: 0.0, y: 0.0 },
            },
            PathStep::Line {
                to: Point { x: 240.0, y: 0.0 },
            },
        ];
        Item::Shape(
            Shape::path(purpose, steps)
                .unfilled()
                .stroked(Stroke::new(Token::Border, 1.2)),
        )
    }

    fn edge(id: &str) -> Item {
        Item::Group(
            Group::new(
                Role::Line(None),
                vec![route(Purpose::Halo), route(Purpose::Line)],
            )
            .drawing(Subject {
                kind: SubjectKind::Edge,
                id: id.to_owned(),
                standing: None,
            }),
        )
    }

    fn scene(body: Vec<Item>) -> Scene {
        Scene {
            width: 1.0,
            height: 1.0,
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

    fn timing() -> Timing {
        Timing {
            shortest: 100.0,
            longest: 200.0,
            now: 1000.0,
        }
    }

    /// The sweep of the line "a" among two, after a delay of 50 ms.
    fn sweep() -> Sweep {
        let delays = HashMap::from([("a".to_owned(), 50.0)]);
        Sweep::of(&scene(vec![edge("a"), edge("b")]), &delays, timing()).expect("a line to sweep")
    }

    #[test]
    fn a_line_waits_then_draws_on_by_its_route_alone() {
        let mut sweep = sweep();
        sweep.advance(1000.0);
        assert_eq!(sweep.showing().count(), 0);
        // 240 units at 2.4 a millisecond is 100 ms of drawing, a 154 ms sweep.
        sweep.advance(1090.0);
        let drawing: Vec<_> = sweep.showing().collect();
        // Not the halo, and not the relationship that is not lit.
        assert_eq!(drawing.len(), 1);
        assert_eq!(drawing[0].stroke.width, 1.2 + 1.4);
        assert!(!drawing[0].stroke.dash_pattern.is_empty());
    }

    #[test]
    fn a_line_settles_to_its_weight_fades_and_ends() {
        let mut sweep = sweep();
        sweep.advance(1170.0);
        let settling: Vec<_> = sweep.showing().collect();
        assert!(settling[0].stroke.dash_pattern.is_empty());
        assert!(settling[0].stroke.width < 1.2 + 1.4 && settling[0].opacity < 1.0);
        assert!(!sweep.over(1200.0));
        assert!(sweep.over(1205.0));
        sweep.advance(1205.0);
        assert_eq!(sweep.showing().count(), 0);
    }

    #[test]
    fn nothing_lit_has_no_sweep() {
        let delays = HashMap::from([("c".to_owned(), 0.0)]);
        assert!(Sweep::of(&scene(vec![edge("a")]), &delays, timing()).is_none());
    }
}
