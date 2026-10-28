//! Bottom-up measured scopes. A parent places each frozen child as one box.

use std::collections::BTreeMap;

use crate::blocks::assembly::{Placed, PlacedArea, PlacedCard, Title};
use crate::constants::{CONTAINER_INSET, HEADER_SLAB_INSET, REGION_INSET, fit_in};
use crate::geometry::{Point, Rect};

use super::model::{Child, Model};

pub(super) const CLEAR: f64 = 32.0;

#[derive(Clone)]
pub(super) struct Shape {
    pub drawing: Placed,
    pub endpoints: BTreeMap<usize, Rect>,
    pub scopes: BTreeMap<usize, Rect>,
    pub occupied: f64,
    pub empty: f64,
}

impl Shape {
    fn empty() -> Self {
        Self {
            drawing: Placed {
                width: 0.0,
                height: 0.0,
                cards: Vec::new(),
                frames: Vec::new(),
                regions: Vec::new(),
                edges: Vec::new(),
                titles: Vec::new(),
            },
            endpoints: BTreeMap::new(),
            scopes: BTreeMap::new(),
            occupied: 0.0,
            empty: 0.0,
        }
    }

    pub(super) fn cost(&self) -> f64 {
        30.0 * self.empty / self.occupied.max(1.0)
            + 14.0 * (1.0 / fit_in(self.drawing.width, self.drawing.height).max(0.001) - 1.0)
    }

    fn shift(&mut self, by: Point) {
        for at in self
            .endpoints
            .values_mut()
            .chain(self.scopes.values_mut())
            .chain(
                self.drawing
                    .cards
                    .iter_mut()
                    .chain(&mut self.drawing.frames)
                    .map(|card| &mut card.bx),
            )
            .chain(
                self.drawing
                    .regions
                    .iter_mut()
                    .flat_map(|region| [&mut region.bx, &mut region.caption]),
            )
            .chain(
                self.drawing
                    .titles
                    .iter_mut()
                    .flat_map(|title| [&mut title.bx, &mut title.band]),
            )
            .chain(
                self.drawing
                    .edges
                    .iter_mut()
                    .filter_map(|edge| edge.label.as_mut()),
            )
        {
            at.x += by.x;
            at.y += by.y;
        }
        for point in self
            .drawing
            .edges
            .iter_mut()
            .flat_map(|edge| &mut edge.points)
        {
            point.x += by.x;
            point.y += by.y;
        }
    }

    fn absorb(&mut self, child: Self) {
        self.occupied += child.occupied;
        self.empty += child.empty;
        self.drawing.cards.extend(child.drawing.cards);
        self.drawing.frames.extend(child.drawing.frames);
        self.drawing.regions.extend(child.drawing.regions);
        self.drawing.edges.extend(child.drawing.edges);
        self.drawing.titles.extend(child.drawing.titles);
        self.endpoints.extend(child.endpoints);
        self.scopes.extend(child.scopes);
    }
}

fn card(model: &Model<'_>, index: usize) -> Shape {
    let endpoint = &model.endpoints[index];
    let scope = &model.scopes[endpoint.scope];
    let mut shape = Shape::empty();
    let at = endpoint.bounds;
    shape.drawing.width = at.width;
    shape.drawing.height = at.height;
    shape.occupied = at.width * at.height;
    shape.drawing.cards.push(PlacedCard {
        id: endpoint.node.id.clone(),
        bx: at,
        depth: scope.depth + usize::from(scope.header.is_some()),
        header: None,
    });
    shape.endpoints.insert(index, at);
    shape
}

/// Compare a bounded set of complete shelf placements, preserving authored order.
pub(super) fn plan(model: &Model<'_>) -> Shape {
    scope(model, 0)
}

fn scope(model: &Model<'_>, index: usize) -> Shape {
    let one = &model.scopes[index];
    let children: Vec<_> = one
        .children
        .iter()
        .map(|child| match *child {
            Child::Endpoint(endpoint) => card(model, endpoint),
            Child::Scope(index) => scope(model, index),
        })
        .collect();
    let widest = children.iter().map(|c| c.drawing.width).fold(0.0, f64::max);
    let area: f64 = children
        .iter()
        .map(|c| (c.drawing.width + CLEAR) * (c.drawing.height + CLEAR))
        .sum();
    let widths = if model.edges.is_empty() {
        vec![
            widest,
            widest.max((area * 1.4).sqrt()),
            children.iter().map(|c| c.drawing.width + CLEAR).sum(),
        ]
    } else {
        vec![widest]
    };
    widths
        .into_iter()
        .enumerate()
        .map(|(candidate, width)| {
            let shape = pack(model, index, &children, width);
            (shape.cost(), candidate, shape)
        })
        .min_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)))
        .expect("three shelf candidates")
        .2
}

fn pack(model: &Model<'_>, index: usize, children: &[Shape], across: f64) -> Shape {
    let one = &model.scopes[index];
    let inset = if one.header.is_some() {
        CONTAINER_INSET
    } else if one.group.is_some() {
        REGION_INSET
    } else {
        CLEAR
    };
    let header = one.header.map(|id| model.endpoints[id].bounds);
    let top = header.map_or_else(
        || {
            one.caption
                .map_or(inset, |(_, h)| h + HEADER_SLAB_INSET + inset)
        },
        |at| at.y + at.height + inset,
    );
    let mut shape = Shape::empty();
    let (mut x, mut y, mut row_height, mut width) = (inset, top, 0.0_f64, 0.0_f64);
    let mut used = 0.0;
    for child in children {
        if x > inset && x + child.drawing.width > inset + across {
            x = inset;
            y += row_height + CLEAR;
            row_height = 0.0;
        }
        let mut child = child.clone();
        child.shift(Point {
            x: x + if model.edges.is_empty() {
                0.0
            } else {
                (across - child.drawing.width) / 2.0
            },
            y,
        });
        used += child.drawing.width * child.drawing.height;
        row_height = row_height.max(child.drawing.height);
        width = width.max(x + child.drawing.width + inset);
        x += child.drawing.width + CLEAR;
        shape.absorb(child);
    }
    shape.drawing.width = width
        .max(header.map_or(0.0, |at| at.x + at.width + inset))
        .max(one.caption.map_or(0.0, |(w, _)| w + 2.0 * inset))
        .max(2.0 * inset);
    shape.drawing.height = y + row_height + inset;
    let bounds = Rect {
        x: 0.0,
        y: 0.0,
        width: shape.drawing.width,
        height: shape.drawing.height,
    };
    shape.scopes.insert(index, bounds);
    add_frame(model, index, &mut shape, bounds);
    let protected =
        header.map_or(0.0, |at| at.width * at.height) + one.caption.map_or(0.0, |(w, h)| w * h);
    shape.occupied += protected;
    shape.empty += (bounds.width * bounds.height - used - protected).max(0.0);
    shape
}

fn add_frame(model: &Model<'_>, index: usize, shape: &mut Shape, bounds: Rect) {
    let one = &model.scopes[index];
    if let Some(header) = one.header {
        let endpoint = &model.endpoints[header];
        shape.drawing.frames.insert(
            0,
            PlacedCard {
                id: endpoint.node.id.clone(),
                bx: bounds,
                depth: one.depth,
                header: None,
            },
        );
        shape.drawing.titles.insert(
            0,
            Title {
                bx: endpoint.bounds,
                band: endpoint.bounds,
            },
        );
        shape.endpoints.insert(header, endpoint.bounds);
    }
    if let Some(group) = one.group {
        let (width, height) = one.caption.unwrap_or((0.0, 0.0));
        shape.drawing.regions.insert(
            0,
            PlacedArea {
                group: group.to_owned(),
                parent: one.semantic_parent.map(str::to_owned),
                bx: bounds,
                caption: Rect {
                    x: HEADER_SLAB_INSET,
                    y: HEADER_SLAB_INSET,
                    width,
                    height,
                },
                depth: one.depth,
            },
        );
    }
}
