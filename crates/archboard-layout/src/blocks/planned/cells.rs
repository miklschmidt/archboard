//! Source cards and their measured horizontal label reservations.
use super::{
    model::Model,
    shape::{CLEAR, Shape},
    topology::Topology,
};
use crate::{blocks::assembly::PlacedCard, geometry::Rect};
use std::collections::BTreeMap;

pub(super) fn card(model: &Model<'_>, topology: &Topology, index: usize, left: bool) -> Shape {
    let compact = card_candidate(model, topology, index, left, false);
    if !super::points::pointed(model, index) && super::ports::safe_sources(model, index, &compact) {
        compact
    } else {
        card_candidate(model, topology, index, left, true)
    }
}

fn card_candidate(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    left: bool,
    staggered: bool,
) -> Shape {
    let endpoint = &model.endpoints[index];
    let scope = &model.scopes[endpoint.scope];
    let mut shape = Shape::empty();
    let sides = label_sides(model, topology, index, left);
    let gap = super::ports::source_gap(model, index);
    let bands = sides.each_ref().map(|labels| label_band(labels, gap));
    let (height, card_y, rows) =
        row_positions(endpoint.bounds.height, [bands[0].1, bands[1].1], staggered);
    let at = Rect {
        x: bands[0].0,
        y: card_y,
        ..endpoint.bounds
    };
    for (side, labels) in sides.iter().enumerate() {
        let mut y = rows[side];
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
    super::points::prepare(model, index, &mut shape);
    shape
}

fn label_sides<'a>(
    model: &Model<'_>,
    topology: &'a Topology,
    index: usize,
    left: bool,
) -> [Vec<&'a super::topology::Label>; 2] {
    let mut sides = [Vec::new(), Vec::new()];
    let labels: Vec<_> = topology
        .labels
        .iter()
        .filter(|label| model.ends[label.edge].0 == index)
        .collect();
    let half = labels.len().div_ceil(2).max(2);
    for (slot, label) in labels.into_iter().enumerate() {
        let side = match model.edges[label.edge].option(crate::graph::FROM_POINTS) {
            Some("sw") => 0,
            Some("se") => 1,
            _ => usize::from((slot < half) != left),
        };
        sides[side].push(label);
    }
    let kinds = super::ports::source_kinds(model, index);
    for side in &mut sides {
        side.sort_by_key(|label| {
            kinds
                .iter()
                .position(|kind| *kind == model.treatments[label.edge])
                .expect("a source treatment")
        });
    }
    sides
}

fn row_positions(card: f64, bands: [f64; 2], staggered: bool) -> (f64, f64, [f64; 2]) {
    if staggered {
        let top = card + CLEAR;
        return (top + bands[0].max(bands[1]), 0.0, [top; 2]);
    }
    let height = card.max(bands[0]).max(bands[1]);
    (
        height,
        (height - card) / 2.0,
        bands.map(|band| (height - band) / 2.0),
    )
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
    model.scopes[scope]
        .header
        .map_or_else(BTreeMap::new, |index| header(model, topology, index).labels)
}

pub(super) fn header(model: &Model<'_>, topology: &Topology, index: usize) -> Shape {
    let compact = header_candidate(model, topology, index, false);
    if super::ports::safe_sources(model, index, &compact) {
        compact
    } else {
        header_candidate(model, topology, index, true)
    }
}

fn labels_of_header(
    model: &Model<'_>,
    topology: &Topology,
    header: usize,
    staggered: bool,
) -> BTreeMap<usize, Rect> {
    let at = model.endpoints[header].bounds;
    let kinds = super::ports::source_kinds(model, header);
    let mut labels: Vec<_> = topology
        .labels
        .iter()
        .filter(|label| model.ends[label.edge].0 == header)
        .collect();
    labels.sort_by_key(|label| {
        kinds
            .iter()
            .position(|kind| *kind == model.treatments[label.edge])
            .expect("a source treatment")
    });
    let mut y = if staggered {
        at.y + at.height + CLEAR
    } else {
        at.y
    };
    labels
        .into_iter()
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

fn header_candidate(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    staggered: bool,
) -> Shape {
    let mut shape = Shape::empty();
    let at = model.endpoints[index].bounds;
    shape.labels = labels_of_header(model, topology, index, staggered);
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
