//! Add room to the empty bands of a routed drawing, without changing the topology of any route.

use crate::{
    blocks::assembly::Placed,
    geometry::{Point, Rect},
};

use super::shape::Shape;

/// Occupied intervals on one axis.
#[derive(Default)]
struct Axis(Vec<(f64, f64)>);

impl Axis {
    fn protect(&mut self, start: f64, size: f64) {
        self.0.push((start, start + size));
    }

    /// The middle of each empty interval that a whole unit fits.
    fn gaps(mut self) -> Vec<f64> {
        self.0
            .sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
        let mut high = f64::NEG_INFINITY;
        let mut gaps = Vec::new();
        for (low, end) in self.0 {
            if high.is_finite() && low - high >= 1.0 {
                gaps.push(f64::midpoint(high, high + (low - high).floor()));
            }
            high = high.max(end);
        }
        gaps
    }
}

/// Bands added to an axis: each coordinate past a cut moves on by its room.
struct Room(Vec<(f64, f64)>);

impl Room {
    fn at(&self, value: f64) -> f64 {
        value
            + self
                .0
                .iter()
                .filter(|(cut, _)| *cut < value)
                .map(|(_, room)| room)
                .sum::<f64>()
    }

    fn across(
        gaps: Vec<f64>,
        room: f64,
        crosses: impl Fn(f64, &Rect) -> bool,
        branches: &[Rect],
    ) -> Self {
        Room(
            gaps.into_iter()
                .filter(|&cut| branches.iter().any(|branch| crosses(cut, branch)))
                .map(|cut| (cut, room))
                .collect(),
        )
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
    let (mut across, mut down) = (Axis::default(), Axis::default());
    let cards = shape
        .endpoints
        .keys()
        .map(|&endpoint| shape.solid(endpoint));
    let words = shape.routes.iter().filter_map(|line| line.label);
    for rect in cards
        .chain(shape.drawing.titles.iter().map(|title| title.bx))
        .chain(words)
    {
        across.protect(rect.x, rect.width);
        down.protect(rect.y, rect.height);
    }
    Bands {
        x: Room::across(
            across.gaps(),
            x,
            |cut, branch| branch.x <= cut && cut <= branch.x + branch.width,
            branches,
        ),
        y: Room::across(
            down.gaps(),
            y,
            |cut, branch| branch.y <= cut && cut <= branch.y + branch.height,
            branches,
        ),
    }
    .drawing(shape)
}
