//! Every source label and incoming stem has a measured cell before packing.

use super::super::{geometry::clean, ports};
use super::{CLEAR, Model, Paths, Piece, Shape, Topology};
use crate::geometry::{Point, Rect, Side};

pub(super) fn cell(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    header: bool,
) -> Option<Piece> {
    let mut shape = if header {
        header_cell(model, topology, index)
    } else {
        super::super::cells::card(model, topology, index, false)
    };
    let old_area = shape.drawing.width * shape.drawing.height;
    let card = shape.endpoints[&index];
    let kinds: std::collections::BTreeSet<_> = model.outgoing[index]
        .iter()
        .map(|&edge| model.treatments[edge].as_str())
        .collect();
    if !model.outgoing[index].is_empty() {
        let right = card.x + card.width + CLEAR + kinds.len().saturating_sub(1) as f64 * 16.0;
        shape.drawing.width = shape.drawing.width.max(right);
    }
    let tails = departures(model, index, &shape)?;
    let mut heads = Paths::new();
    for &edge in &model.incoming[index] {
        let port = ports::port(
            model,
            edge,
            false,
            Side::Bottom,
            &shape,
            ports::center(card),
        )?;
        heads.insert(
            edge,
            vec![
                Point {
                    x: port.attachment.x,
                    y: shape.drawing.height,
                },
                port.attachment,
            ],
        );
    }
    shape.cells.insert(
        index,
        Rect {
            x: 0.0,
            y: 0.0,
            width: shape.drawing.width,
            height: shape.drawing.height,
        },
    );
    shape.empty += shape.drawing.width * shape.drawing.height - old_area;
    Some(Piece {
        shape,
        tails,
        heads,
        tail_wall: Side::Bottom,
        head_wall: Side::Bottom,
        header,
    })
}

fn departures(model: &Model<'_>, index: usize, shape: &Shape) -> Option<Paths> {
    let card = shape.endpoints[&index];
    let mut tails = Paths::new();
    let stems = ports::reserve(model, shape);
    for &edge in &model.outgoing[index] {
        let mut path = if let Some(stem) = stems.get(&edge) {
            stem.clone()
        } else {
            let port = ports::port(model, edge, true, Side::Right, shape, ports::center(card))?;
            let x = card.x
                + card.width
                + (ports::source_gap(model, index) - CLEAR - port.offset).max(CLEAR);
            vec![
                port.attachment,
                Point {
                    x,
                    y: port.attachment.y,
                },
            ]
        };
        path.push(Point {
            x: path.last().expect("a departure").x,
            y: shape.drawing.height,
        });
        tails.insert(edge, clean(path));
    }
    Some(tails)
}

fn header_cell(model: &Model<'_>, topology: &Topology, index: usize) -> Shape {
    let mut shape = Shape::empty();
    let at = model.endpoints[index].bounds;
    shape.labels =
        super::super::cells::header_labels(model, topology, model.endpoints[index].scope);
    let count = shape.labels.len();
    let right = shape
        .labels
        .values()
        .map(|r| r.x + r.width + CLEAR + count as f64 * 16.0)
        .fold(at.x + at.width, f64::max);
    let bottom = shape
        .labels
        .values()
        .map(|r| r.y + r.height)
        .fold(at.y + at.height, f64::max);
    shape.drawing.width = right;
    shape.drawing.height = bottom;
    shape.occupied = at.width * at.height
        + shape
            .labels
            .values()
            .map(|r| r.width * r.height)
            .sum::<f64>();
    shape.empty = right * bottom - shape.occupied;
    shape.endpoints.insert(index, at);
    shape.cells.insert(
        index,
        Rect {
            x: 0.0,
            y: 0.0,
            width: right,
            height: bottom,
        },
    );
    shape
}
