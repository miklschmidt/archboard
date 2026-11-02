//! A container that both pictures draw, on its way from one box to the other.
//!
//! A container the last picture also drew does not open again. It is one tray that
//! changes its size, so a flow stays where it is as its grammar changes. Its corners
//! and walls keep their shape, because each point keeps its distance from the nearer
//! edge of the box.
//!
//! A move that cuts the opening of a container short takes it on the same way, from
//! the box it had reached, with the edge that led it riding along and cooling. A
//! cross-fade from what had opened to the next picture's frame would show two walls.

use std::collections::HashMap;

use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{Geometry, Group, Item, PathStep, Shape, Transform, Viewport};

use super::ease::{carried, ease_out, lerp, mix_rect, phase, then};
use super::found::{Found, Pairing};
use super::open::{OPENS, Way, edge, under_way, ways, worn_edge};

/// The visible state of a tray, in the last picture's units.
#[derive(Clone, Copy, Debug)]
pub(super) struct Tray {
    whole: Rect,
    shown: f64,
    scale: f64,
    edge: Option<(Rect, f64)>,
}

impl Tray {
    pub(super) fn of(found: &Found<'_>, whole: Rect) -> Tray {
        let outer = found.outer.unwrap_or(Transform::translate(0.0, 0.0));
        Tray {
            whole,
            shown: found.group.opacity.unwrap_or(1.0),
            scale: then(outer, found.group.transform).scale.unwrap_or(1.0),
            edge: worn_edge(found.group).map(|(rect, solid)| (carried(rect, outer), solid)),
        }
    }
}

/// One group of a container the last picture also drew, changing its size.
#[derive(Clone, Debug)]
pub(super) struct Resizing {
    group: Group,
    /// Where the last picture drew it, in that picture's units.
    stood: Tray,
    /// How the last picture's units map onto this picture's.
    carry: Transform,
    to: Rect,
    end: f64,
    /// The well of the container, where an edge lands.
    well: Rect,
    /// Whether the last picture stood inside it, and so leaves inside it.
    pub(super) holds_last: bool,
}

impl Resizing {
    /// A group of a container that stood in a box of the last picture, where as much
    /// of it showed as `shown` says.
    pub(super) fn new(found: &Found<'_>, mut stood: Tray, way: Way, shown: f64) -> Resizing {
        stood.shown *= shown;
        if found.ordinal != 0 {
            stood.edge = None;
        }
        Resizing {
            holds_last: false,
            group: found.group.clone(),
            stood,
            carry: Transform::translate(0.0, 0.0),
            to: way.whole,
            well: way.well,
            end: way.end(),
        }
    }

    /// Say whether the last picture stood inside it.
    pub(super) fn holding(mut self, holds_last: bool) -> Resizing {
        self.holds_last = holds_last;
        self
    }

    /// Where the container finishes changing its size.
    pub(super) fn end(&self) -> f64 {
        self.end
    }

    /// Say how the last picture's units map onto this picture's.
    pub(super) fn rebase(&mut self, carry: Transform) {
        self.carry = carry;
    }

    /// The box the container stands in at a moment of the move.
    pub(super) fn held(&self, progress: f64) -> Rect {
        let moved = OPENS.at(phase(progress, 0.0, self.end));
        mix_rect(carried(self.stood.whole, self.carry), self.to, moved)
    }

    /// The container at a moment of the move: drawn at its size in the last picture's
    /// scale, then settling into this picture's.
    pub(super) fn at(&self, progress: f64) -> Group {
        let here = phase(progress, 0.0, self.end);
        let mut group = self.group.clone();
        if here >= 1.0 {
            return group;
        }
        let moved = OPENS.at(here);
        let held = self.held(progress);
        let scale = lerp(
            self.stood.scale * self.carry.scale.unwrap_or(1.0),
            1.0,
            moved,
        );
        let inner = Rect {
            width: held.width / scale,
            height: held.height / scale,
            ..self.to
        };
        let anchors = Anchors {
            drawn: self.to,
            held: inner,
        };
        let base = group.opacity.unwrap_or(1.0);
        group.opacity = Some(lerp(self.stood.shown, base, ease_out(here)));
        group.items = vec![Item::Viewport(Viewport {
            frame: inner,
            view: inner,
            items: anchors.items(&group.items),
        })];
        let placed = Transform {
            x: held.x - self.to.x * scale,
            y: held.y - self.to.y * scale,
            scale: Some(scale),
        };
        if let Some((stood, solid)) = self.stood.edge {
            let at = mix_rect(carried(stood, self.carry), self.well, moved);
            let local = Rect {
                x: (at.x - placed.x) / scale,
                y: (at.y - placed.y) / scale,
                width: at.width / scale,
                height: at.height / scale,
            };
            group.items.push(edge(local, solid * (1.0 - here).powi(2)));
        }
        group.transform = Some(then(placed, group.transform));
        group
    }
}

/// The containers a move finds cut short on their way open, by their places in the
/// next picture. Each goes on from where it stood and finishes by `end`.
pub(super) fn resumed(
    old: &[Found<'_>],
    new: &[Found<'_>],
    pairing: &Pairing,
    middle: Point,
    end: f64,
) -> HashMap<usize, Resizing> {
    let cut_short: Vec<(Found<'_>, usize)> = pairing
        .shared
        .iter()
        .filter(|&&(a, b)| old[a].is_region() && new[b].is_region())
        .filter(|&&(a, _)| under_way(old[a].group).is_some())
        .map(|&(a, b)| (old[a], b))
        .collect();
    let going_on: Vec<Found<'_>> = cut_short.iter().map(|&(_, b)| new[b]).collect();
    let ways = ways(&going_on, middle, (0.0, end));
    cut_short
        .into_iter()
        .filter_map(|(last, b)| {
            let stood = under_way(last.group)?;
            let outer = last.outer.unwrap_or(Transform::translate(0.0, 0.0));
            let tray = Tray::of(&last, carried(stood, outer));
            Some((b, Resizing::new(&new[b], tray, *ways.get(new[b].id)?, 1.0)))
        })
        .collect()
}

/// Keeps each point its distance from the nearer edge of a box as the box changes
/// size. Both boxes start at one corner, so what stands near it stays where it is.
#[derive(Clone, Copy, Debug)]
struct Anchors {
    drawn: Rect,
    held: Rect,
}

impl Anchors {
    /// Where a place along one axis goes, given where the axis starts and how long
    /// it was and is.
    fn along(value: f64, start: f64, drawn: f64, held: f64) -> f64 {
        let end = start + drawn;
        if (value - start).abs() <= (value - end).abs() {
            value
        } else {
            value + held - drawn
        }
    }

    fn x(&self, x: f64) -> f64 {
        Anchors::along(x, self.drawn.x, self.drawn.width, self.held.width)
    }

    fn y(&self, y: f64) -> f64 {
        Anchors::along(y, self.drawn.y, self.drawn.height, self.held.height)
    }

    fn point(&self, point: Point) -> Point {
        Point {
            x: self.x(point.x),
            y: self.y(point.y),
        }
    }

    fn items(&self, items: &[Item]) -> Vec<Item> {
        items
            .iter()
            .map(|item| match item {
                Item::Shape(shape) => Item::Shape(self.shape(shape)),
                Item::Group(group) => Item::Group(self.group(group)),
                other => other.clone(),
            })
            .collect()
    }

    /// A group: one placed by its own move keeps to the nearer edge as a whole.
    fn group(&self, group: &Group) -> Group {
        let mut group = group.clone();
        match &mut group.transform {
            Some(at) => (at.x, at.y) = (self.x(at.x), self.y(at.y)),
            None => group.items = self.items(&group.items),
        }
        group
    }

    fn shape(&self, shape: &Shape) -> Shape {
        let mut shape = shape.clone();
        match &mut shape.geometry {
            Geometry::Rect { rect, .. } => {
                let (x, y) = (self.x(rect.x), self.y(rect.y));
                *rect = Rect {
                    x,
                    y,
                    width: (self.x(rect.x + rect.width) - x).max(0.0),
                    height: (self.y(rect.y + rect.height) - y).max(0.0),
                };
            }
            Geometry::Circle { centre, .. } => *centre = centre.map(|at| self.point(at)),
            Geometry::Line { from, to } => (*from, *to) = (self.point(*from), self.point(*to)),
            Geometry::Path { steps } => *steps = self.steps(steps),
        }
        shape
    }

    /// A path's steps, each stated from the origin so that it can keep to its edge.
    fn steps(&self, steps: &[PathStep]) -> Vec<PathStep> {
        let mut at = Point { x: 0.0, y: 0.0 };
        steps.iter().map(|step| self.step(step, &mut at)).collect()
    }

    fn step(&self, step: &PathStep, at: &mut Point) -> PathStep {
        let Point { x: here, y: down } = *at;
        let mut go = |to: Point| {
            *at = to;
            self.point(to)
        };
        match *step {
            PathStep::Move { to } => PathStep::Move { to: go(to) },
            PathStep::Line { to } => PathStep::Line { to: go(to) },
            PathStep::Across { x } => PathStep::Across {
                x: go(Point { x, y: down }).x,
            },
            PathStep::Down { y } => PathStep::Down {
                y: go(Point { x: here, y }).y,
            },
            PathStep::Quad { control, to } => PathStep::Quad {
                control: self.point(control),
                to: go(to),
            },
            PathStep::Cubic { first, second, to } => PathStep::Cubic {
                first: self.point(first),
                second: self.point(second),
                to: go(to),
            },
            PathStep::Arc {
                radius,
                clockwise,
                to,
            } => PathStep::Arc {
                radius,
                clockwise,
                to: go(to),
            },
            PathStep::AcrossBy { dx } => PathStep::Across {
                x: go(Point {
                    x: here + dx,
                    y: down,
                })
                .x,
            },
            PathStep::DownBy { dy } => PathStep::Down {
                y: go(Point {
                    x: here,
                    y: down + dy,
                })
                .y,
            },
            PathStep::ArcBy {
                radius,
                clockwise,
                by,
            } => PathStep::Arc {
                radius,
                clockwise,
                to: go(Point {
                    x: here + by.x,
                    y: down + by.y,
                }),
            },
            PathStep::Close => PathStep::Close,
        }
    }
}

#[cfg(test)]
mod tests {
    use archboard_scene::geometry::{Point, Rect};
    use archboard_scene::scene::{Geometry, Group, Item, Transform};

    use super::super::found::found;
    use super::super::open::ways;
    use super::super::testing::{rect, region, scene};
    use super::{Resizing, Tray};

    const MIDDLE: Point = Point { x: 200.0, y: 100.0 };

    /// A tray in a box 100 by 100 and a band along its top, and the band as it was
    /// when the tray stood in a box of the last picture.
    fn band_from(stood: Rect) -> Resizing {
        let tray = rect(0.0, 0.0, 100.0, 100.0);
        let band = rect(0.0, 0.0, 100.0, 8.0);
        let board = scene(vec![region("r", tray), region("r", band)], &[]);
        let groups = found(&board);
        let way = ways(&groups, MIDDLE, (0.0, 1.0))["r"];
        Resizing::new(&groups[1], Tray::of(&groups[0], stood), way, 0.0)
    }

    /// The box that shows a group, and the box of the first shape in it.
    fn boxes(group: &Group) -> (Rect, Rect) {
        let Item::Viewport(viewport) = &group.items[0] else {
            panic!("a box shows it")
        };
        let Item::Shape(shape) = &viewport.items[0] else {
            panic!("a shape")
        };
        let Geometry::Rect { rect, .. } = shape.geometry else {
            panic!("a box")
        };
        (viewport.frame, rect)
    }

    #[test]
    fn a_band_along_one_edge_keeps_its_height_as_the_box_changes_size() {
        let group = band_from(rect(0.0, 0.0, 306.0, 66.0)).at(0.0);
        let (held, drawn) = boxes(&group);
        assert!((held.width - 306.0).abs() < 1e-6);
        assert_eq!(drawn.height, 8.0, "it stays a band");
        assert!((drawn.width - 300.0).abs() < 1e-6, "it spans the box");
    }

    #[test]
    fn a_container_starts_where_the_last_camera_showed_it() {
        let mut band = band_from(rect(10.0, 20.0, 106.0, 106.0));
        band.rebase(Transform {
            x: 5.0,
            y: 7.0,
            scale: Some(2.0),
        });
        let group = band.at(0.0);
        let (held, _) = boxes(&group);
        let placed = group.transform.expect("it is moved");
        assert_eq!(placed.scale, Some(2.0));
        assert_eq!(held.x * 2.0 + placed.x, 10.0 * 2.0 + 5.0);
        assert_eq!(held.y * 2.0 + placed.y, 20.0 * 2.0 + 7.0);
        assert_eq!(held.width * 2.0, 106.0 * 2.0);
    }

    #[test]
    fn a_carried_edge_stays_on_its_box_under_a_different_camera() {
        let stood = rect(10.0, 20.0, 106.0, 106.0);
        let mut band = band_from(stood);
        band.stood.edge = Some((stood, 0.7));
        let carry = Transform {
            x: 5.0,
            y: 7.0,
            scale: Some(2.0),
        };
        band.rebase(carry);
        for progress in [0.0, 0.1, 0.4] {
            let group = band.at(progress);
            let (edge, _) = super::super::open::worn_edge(&group).unwrap();
            let moved = super::OPENS.at(progress);
            let expected = super::mix_rect(super::carried(stood, carry), band.well, moved);
            for (a, b) in [
                (edge.x, expected.x),
                (edge.y, expected.y),
                (edge.width, expected.width),
                (edge.height, expected.height),
            ] {
                assert!((a - b).abs() < 1e-6, "{edge:?} against {expected:?}");
            }
        }
    }
}
