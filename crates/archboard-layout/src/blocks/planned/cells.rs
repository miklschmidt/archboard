//! Source cards and their measured horizontal label reservations.
use super::{
    model::Model,
    shape::{CLEAR, Shape},
    topology::Topology,
};
use crate::{blocks::assembly::PlacedCard, geometry::Rect};
use std::collections::BTreeMap;

pub(super) fn card(model: &Model<'_>, topology: &Topology, index: usize, left: bool) -> Shape {
    let endpoint = &model.endpoints[index];
    let scope = &model.scopes[endpoint.scope];
    let mut shape = Shape::empty();
    let mut sides: [Vec<&super::topology::Label>; 2] = [Vec::new(), Vec::new()];
    let labels: Vec<_> = topology
        .labels
        .iter()
        .filter(|label| model.ends[label.edge].0 == index)
        .collect();
    let half = labels.len().div_ceil(2).max(2);
    for (slot, label) in labels.into_iter().enumerate() {
        let side = usize::from((slot < half) != left);
        sides[side].push(label);
    }
    let gap = super::ports::source_gap(model, index);
    let bands = sides.each_ref().map(|labels| label_band(labels, gap));
    let height = endpoint.bounds.height.max(bands[0].1).max(bands[1].1);
    let at = Rect {
        x: bands[0].0,
        y: (height - endpoint.bounds.height) / 2.0,
        ..endpoint.bounds
    };
    for (side, labels) in sides.iter().enumerate() {
        let mut y = (height - bands[side].1) / 2.0;
        for label in labels {
            let x = if side == 0 {
                at.x - gap - label.size.width
            } else {
                at.x + at.width + gap
            };
            shape.labels.insert(label.edge, Rect { x, y, ..label.size });
            shape.occupied += label.size.width * label.size.height;
            y += label.size.height + CLEAR;
        }
    }
    shape.drawing.width = at.width + bands[0].0 + bands[1].0;
    shape.drawing.height = height;
    shape.cells.insert(
        index,
        Rect {
            x: 0.0,
            y: 0.0,
            width: shape.drawing.width,
            height,
        },
    );
    shape.occupied += at.width * at.height;
    shape.empty = shape.drawing.width * height - shape.occupied;
    shape.drawing.cards.push(PlacedCard {
        id: endpoint.node.id.clone(),
        bx: at,
        depth: scope.depth + usize::from(scope.header.is_some()),
        header: None,
    });
    shape.endpoints.insert(index, at);
    shape
}

fn label_band(labels: &[&super::topology::Label], gap: f64) -> (f64, f64) {
    if labels.is_empty() {
        return (0.0, 0.0);
    }
    (
        labels
            .iter()
            .map(|label| label.size.width)
            .fold(0.0, f64::max)
            + gap
            + CLEAR
            + labels.len().saturating_sub(1) as f64 * crate::track::chains::LANE,
        labels.iter().map(|label| label.size.height).sum::<f64>()
            + labels.len().saturating_sub(1) as f64 * CLEAR,
    )
}

pub(super) fn header_labels(
    model: &Model<'_>,
    topology: &Topology,
    scope: usize,
) -> BTreeMap<usize, Rect> {
    let Some(header) = model.scopes[scope].header else {
        return BTreeMap::new();
    };
    let at = model.endpoints[header].bounds;
    let mut y = at.y;
    topology
        .labels
        .iter()
        .filter(|label| model.ends[label.edge].0 == header)
        .map(|label| {
            let bounds = Rect {
                x: at.x + at.width + super::ports::source_gap(model, header),
                y,
                ..label.size
            };
            y += label.size.height + CLEAR;
            (label.edge, bounds)
        })
        .collect()
}
