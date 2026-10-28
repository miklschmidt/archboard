//! Every source label and incoming stem has a measured cell before packing.

use super::super::ports;
use super::{CLEAR, Model, Paths, Piece, Topology};
use crate::geometry::{Point, Rect, Side};

pub(super) fn cell(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    header: bool,
) -> Option<Piece> {
    let mut shape = if header {
        super::super::cells::header(model, topology, index)
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
    let tails = ports::source_paths(model, index, &shape)?;
    let mut heads = Paths::new();
    for &edge in &model.incoming[index] {
        if let Some(path) = super::super::points::arrival(model, edge, &shape) {
            heads.insert(edge, path);
            continue;
        }
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
