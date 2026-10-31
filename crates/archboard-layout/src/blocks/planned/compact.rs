//! Contract empty coordinate bands without changing the topology of any route.

use crate::{
    blocks::assembly::Placed,
    constants::CONTAINER_INSET,
    geometry::{Point, Rect},
};

use super::shape::Shape;

/// Occupied intervals on one axis, with the routing clearance kept at each end.
struct Axis {
    clear: f64,
    occupied: Vec<(f64, f64)>,
}

impl Axis {
    fn protect(&mut self, start: f64, size: f64) {
        self.occupied
            .push((start - self.clear, start + size + self.clear));
    }

    fn gaps(mut self) -> Gaps {
        self.occupied
            .sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
        let mut high = f64::NEG_INFINITY;
        let mut gaps = Vec::new();
        let mut removed = 0.0;
        for (low, end) in self.occupied {
            if high.is_finite() && low - high >= 1.0 {
                // Keep each box's original subpixel alignment when SVG rounds its
                // position and size separately. A fractional shift can put the
                // rounded attachment just inside its rounded header edge.
                let end = high + (low - high).floor();
                gaps.push(Gap {
                    start: high,
                    end,
                    before: removed,
                });
                removed += end - high;
            }
            high = high.max(end);
        }
        Gaps(gaps)
    }
}

/// One removable interval, with the total width of all preceding gaps.
struct Gap {
    start: f64,
    end: f64,
    before: f64,
}

/// Empty intervals that can disappear. Every protected interval only translates.
struct Gaps(Vec<Gap>);

impl Gaps {
    /// Locate the last preceding gap instead of scanning every gap per coordinate.
    fn at(&self, value: f64) -> f64 {
        let index = self.0.partition_point(|gap| gap.start < value);
        let Some(index) = index.checked_sub(1) else {
            // Preserve the signed zero of an empty floating-point sum.
            return value - if self.0.is_empty() { -0.0 } else { 0.0 };
        };
        let gap = &self.0[index];
        value - (gap.before + (value.min(gap.end) - gap.start).max(0.0))
    }
}

/// Bands added to an axis: each coordinate past a cut moves on by its room.
pub(super) struct Room(pub Vec<(f64, f64)>);

impl Move for Room {
    fn at(&self, value: f64) -> f64 {
        value
            + self
                .0
                .iter()
                .filter(|(cut, _)| *cut < value)
                .map(|(_, room)| room)
                .sum::<f64>()
    }
}

impl Move for Gaps {
    fn at(&self, value: f64) -> f64 {
        Gaps::at(self, value)
    }
}

/// How one axis moves: bands taken out, or bands put in.
pub(super) trait Move {
    fn at(&self, value: f64) -> f64;
}

struct Space {
    x: Axis,
    y: Axis,
}

impl Space {
    fn protect(&mut self, rect: Rect) {
        self.x.protect(rect.x, rect.width);
        self.y.protect(rect.y, rect.height);
    }

    fn point(&mut self, point: Point) {
        self.x.protect(point.x, 0.0);
        self.y.protect(point.y, 0.0);
    }

    /// A frame keeps its whole inset: a line can run in it, but no contraction takes it.
    fn inset(&mut self, frame: Rect) {
        self.x.protect(frame.x, CONTAINER_INSET);
        self.x
            .protect(frame.x + frame.width - CONTAINER_INSET, CONTAINER_INSET);
        self.y
            .protect(frame.y + frame.height - CONTAINER_INSET, CONTAINER_INSET);
    }

    fn boundary(&mut self, rect: Rect) {
        self.point(Point {
            x: rect.x,
            y: rect.y,
        });
        self.point(Point {
            x: rect.x + rect.width,
            y: rect.y + rect.height,
        });
    }
}

/// How a drawing moves on both axes. Coordinates keep their order, so no route changes its topology.
pub(super) struct Bands<M> {
    pub x: M,
    pub y: M,
}

impl<M: Move> Bands<M> {
    fn point(&self, point: &mut Point) {
        point.x = self.x.at(point.x);
        point.y = self.y.at(point.y);
    }

    fn translate(&self, rect: &mut Rect) {
        rect.x = self.x.at(rect.x);
        rect.y = self.y.at(rect.y);
    }

    fn frame(&self, rect: &mut Rect) {
        let right = self.x.at(rect.x + rect.width);
        let bottom = self.y.at(rect.y + rect.height);
        self.translate(rect);
        rect.width = right - rect.x;
        rect.height = bottom - rect.y;
    }

    pub(super) fn drawing(&self, shape: &Shape) -> Placed {
        let mut drawing = (*shape.drawing).clone();
        drawing.edges.clone_from(&shape.routes);
        drawing.width = self.x.at(drawing.width);
        drawing.height = self.y.at(drawing.height);
        let fixed = drawing
            .cards
            .iter_mut()
            .map(|card| &mut card.bx)
            .chain(drawing.regions.iter_mut().map(|region| &mut region.caption))
            .chain(drawing.titles.iter_mut().map(|title| &mut title.bx))
            .chain(
                drawing
                    .edges
                    .iter_mut()
                    .filter_map(|line| line.label.as_mut()),
            );
        for rect in fixed {
            self.translate(rect);
        }
        let frames = drawing
            .frames
            .iter_mut()
            .map(|frame| &mut frame.bx)
            .chain(drawing.regions.iter_mut().map(|region| &mut region.bx))
            .chain(drawing.titles.iter_mut().map(|title| &mut title.band));
        for rect in frames {
            self.frame(rect);
        }
        for point in drawing.edges.iter_mut().flat_map(|line| &mut line.points) {
            self.point(point);
        }
        drawing
    }
}

/// Add room to the empty bands between cards and words that a branch crosses, along each
/// axis. Coordinates keep their order, so no route changes.
pub(super) fn with_room(shape: &Shape, branches: &[Rect], x: f64, y: f64) -> Placed {
    let axis = || Axis {
        clear: 0.0,
        occupied: Vec::new(),
    };
    let mut space = Space {
        x: axis(),
        y: axis(),
    };
    let cards = shape
        .endpoints
        .keys()
        .map(|&endpoint| shape.solid(endpoint));
    let words = shape.routes.iter().filter_map(|line| line.label);
    for rect in cards
        .chain(shape.drawing.titles.iter().map(|title| title.bx))
        .chain(words)
    {
        space.protect(rect);
    }
    let bands = |gaps: Gaps, room: f64, crosses: &dyn Fn(f64, &Rect) -> bool| {
        Room(
            gaps.0
                .iter()
                .map(|gap| f64::midpoint(gap.start, gap.end))
                .filter(|&cut| branches.iter().any(|branch| crosses(cut, branch)))
                .map(|cut| (cut, room))
                .collect(),
        )
    };
    Bands {
        x: bands(space.x.gaps(), x, &|cut, branch| {
            branch.x <= cut && cut <= branch.x + branch.width
        }),
        y: bands(space.y.gaps(), y, &|cut, branch| {
            branch.y <= cut && cut <= branch.y + branch.height
        }),
    }
    .drawing(shape)
}

/// Remove bands that hold no card, header, caption, label, bend or boundary.
/// Long straight runs can contract, but every turn and attachment keeps its room.
/// The caller must place the labels again and apply the complete geometry guard.
pub(super) fn drawing(shape: &Shape, clear: f64) -> Option<Placed> {
    let axis = || Axis {
        clear,
        occupied: Vec::new(),
    };
    let mut space = Space {
        x: axis(),
        y: axis(),
    };
    let boxes = shape
        .endpoints
        .keys()
        .map(|&endpoint| shape.solid(endpoint))
        .chain(shape.drawing.regions.iter().map(|region| region.caption))
        .chain(shape.drawing.titles.iter().map(|title| title.bx))
        .chain(shape.routes.iter().filter_map(|line| line.label));
    for rect in boxes {
        space.protect(rect);
    }
    for &point in shape.routes.iter().flat_map(|line| &line.points) {
        space.point(point);
    }
    for scope in shape.scopes.values() {
        space.boundary(scope.bounds);
    }
    for frame in &shape.drawing.frames {
        space.inset(frame.bx);
    }
    for title in &shape.drawing.titles {
        let foot = title.band.y + title.band.height;
        space.y.protect(foot, CONTAINER_INSET - 2.0 * clear);
    }
    let contraction = Bands {
        x: space.x.gaps(),
        y: space.y.gaps(),
    };
    (!contraction.x.0.is_empty() || !contraction.y.0.is_empty()).then(|| contraction.drawing(shape))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contraction_keeps_occupied_sizes_and_subpixel_alignment_at_gap_boundaries() {
        let mut axis = Axis {
            clear: 32.0,
            occupied: Vec::new(),
        };
        for start in [0.25, 100.5, 210.75] {
            axis.protect(start, 20.0);
        }
        let gaps = axis.gaps();
        for (before, after) in [
            (0.25, 0.25),
            (52.25, 52.25),
            (60.0, 52.25),
            (68.25, 52.25),
            (68.5, 52.5),
            (100.5, 84.5),
            (152.5, 136.5),
            (170.0, 136.5),
            (178.5, 136.5),
            (210.75, 168.75),
            (230.75, 188.75),
        ] {
            assert_eq!(gaps.at(before), after);
        }
        for start in [0.25, 100.5, 210.75] {
            assert_eq!(gaps.at(start + 20.0) - gaps.at(start), 20.0);
        }
    }
}
