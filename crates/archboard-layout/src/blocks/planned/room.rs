//! Add room to the empty bands of a routed drawing, without changing the topology of any route.

use crate::{
    blocks::assembly::Placed,
    geometry::{Axis, Point, Rect},
};

use super::shape::Shape;

/// The middle of each empty interval between these spans that a whole unit fits.
fn gaps(mut occupied: Vec<(f64, f64)>) -> Vec<f64> {
    occupied.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
    let mut high = f64::NEG_INFINITY;
    let mut gaps = Vec::new();
    for (low, end) in occupied {
        if high.is_finite() && low - high >= 1.0 {
            gaps.push(f64::midpoint(high, high + (low - high).floor()));
        }
        high = high.max(end);
    }
    gaps
}

/// Bands added to an axis: each coordinate past a cut moves on by the room.
struct Room {
    cuts: Vec<f64>,
    room: f64,
}

impl Room {
    fn at(&self, value: f64) -> f64 {
        value
            + (self.cuts.iter())
                .filter(|cut| **cut < value)
                .map(|_| self.room)
                .sum::<f64>()
    }

    /// Room in each empty band on this axis that a branch crosses.
    fn across(axis: Axis, occupied: &[Rect], branches: &[Rect], room: f64) -> Self {
        let crossed = |cut: &f64| {
            branches.iter().any(|&branch| {
                let (low, high) = axis.span(branch);
                low <= *cut && *cut <= high
            })
        };
        let spans = occupied.iter().map(|&rect| axis.span(rect)).collect();
        let cuts = gaps(spans).into_iter().filter(crossed).collect();
        Room { cuts, room }
    }
}

/// How a drawing moves on both axes. Coordinates keep their order, so no route changes its topology.
struct Bands {
    x: Room,
    y: Room,
}

impl Bands {
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
        let mut drawing = shape.routed();
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
    let cards = shape
        .endpoints
        .keys()
        .map(|&endpoint| shape.solid(endpoint));
    let words = shape.routes.iter().filter_map(|line| line.label);
    let titles = shape.drawing.titles.iter().map(|title| title.bx);
    let occupied: Vec<Rect> = cards.chain(titles).chain(words).collect();
    Bands {
        x: Room::across(Axis::X, &occupied, branches, x),
        y: Room::across(Axis::Y, &occupied, branches, y),
    }
    .drawing(shape)
}
