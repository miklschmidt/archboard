//! Contract empty coordinate bands without changing the topology of any route.

use crate::{
    blocks::assembly::Placed,
    geometry::{Point, Rect},
};

use super::shape::{CLEAR, Shape};

/// Occupied intervals on one axis, with the routing clearance kept at each end.
#[derive(Default)]
struct Axis {
    occupied: Vec<(f64, f64)>,
}

impl Axis {
    fn protect(&mut self, start: f64, size: f64) {
        self.occupied.push((start - CLEAR, start + size + CLEAR));
    }

    fn gaps(mut self) -> Gaps {
        self.occupied
            .sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
        let mut high = f64::NEG_INFINITY;
        let mut gaps = Vec::new();
        for (low, end) in self.occupied {
            if high.is_finite() && low - high >= 1.0 {
                // Keep each box's original subpixel alignment when SVG rounds its
                // position and size separately. A fractional shift can put the
                // rounded attachment just inside its rounded header edge.
                gaps.push((high, high + (low - high).floor()));
            }
            high = high.max(end);
        }
        Gaps(gaps)
    }
}

/// Empty intervals that can disappear. Every protected interval only translates.
struct Gaps(Vec<(f64, f64)>);

impl Gaps {
    fn at(&self, value: f64) -> f64 {
        value
            - self
                .0
                .iter()
                .map(|&(start, end)| (value.min(end) - start).max(0.0))
                .sum::<f64>()
    }
}

#[derive(Default)]
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

struct Contraction {
    x: Gaps,
    y: Gaps,
}

impl Contraction {
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

    fn drawing(&self, shape: &Shape) -> Placed {
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

/// Remove bands that hold no card, header, caption, label, bend or boundary.
/// Long straight runs can contract, but every turn and attachment keeps its room.
/// The caller must place the labels again and apply the complete geometry guard.
pub(super) fn drawing(shape: &Shape) -> Option<Placed> {
    let mut space = Space::default();
    let boxes = shape
        .endpoints
        .values()
        .copied()
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
    let contraction = Contraction {
        x: space.x.gaps(),
        y: space.y.gaps(),
    };
    (!contraction.x.0.is_empty() || !contraction.y.0.is_empty()).then(|| contraction.drawing(shape))
}
