//! Bottom-up measured scopes. A parent places each frozen child as one box.

use std::collections::BTreeMap;

use crate::blocks::assembly::{Placed, PlacedArea, PlacedCard, Title};
use crate::constants::{CONTAINER_INSET, HEADER_SLAB_INSET, REGION_INSET, fit_in};
use crate::geometry::{Point, Rect};

use super::geometry::length;
use super::model::{Child, Model};
use super::topology::Topology;

pub(super) const CLEAR: f64 = 32.0;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Axis {
    Down,
    Right,
}

#[derive(Clone)]
pub(super) struct Shape {
    pub drawing: Placed,
    pub endpoints: BTreeMap<usize, Rect>,
    pub scopes: BTreeMap<usize, Rect>,
    pub labels: BTreeMap<usize, Rect>,
    pub axis: Axis,
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
            labels: BTreeMap::new(),
            axis: Axis::Down,
            occupied: 0.0,
            empty: 0.0,
        }
    }

    pub(super) fn cost(&self) -> f64 {
        let routes = self.drawing.edges.len().max(1) as f64;
        let typical = self.endpoints.values().map(|at| at.width).sum::<f64>()
            / self.endpoints.len().max(1) as f64;
        let distance: f64 = self
            .drawing
            .edges
            .iter()
            .map(|edge| length(&edge.points))
            .sum();
        let bends: usize = self
            .drawing
            .edges
            .iter()
            .map(|edge| edge.points.len().saturating_sub(2))
            .sum();
        30.0 * self.empty / self.occupied.max(1.0)
            + 25.0 * distance / (routes * typical).max(1.0)
            + 14.0 * (1.0 / fit_in(self.drawing.width, self.drawing.height).max(0.001) - 1.0)
            + 2.0 * bends as f64 / routes
    }

    fn shift(&mut self, by: Point) {
        for at in self
            .endpoints
            .values_mut()
            .chain(self.scopes.values_mut())
            .chain(self.labels.values_mut())
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
        self.labels.extend(child.labels);
    }
}

fn card(model: &Model<'_>, topology: &Topology, index: usize, left: bool) -> Shape {
    let endpoint = &model.endpoints[index];
    let scope = &model.scopes[endpoint.scope];
    let mut shape = Shape::empty();
    let label = topology
        .labels
        .iter()
        .find(|label| model.ends[label.edge].0 == index);
    let mut at = endpoint.bounds;
    let width = label.map_or(0.0, |label| label.size.width + 3.0 * CLEAR);
    let height = label.map_or(at.height, |label| at.height.max(label.size.height));
    at.y = (height - at.height) / 2.0;
    if left {
        at.x += width;
    }
    if let Some(label) = label {
        shape.labels.insert(
            label.edge,
            Rect {
                x: if left { CLEAR } else { at.width + 2.0 * CLEAR },
                y: (height - label.size.height) / 2.0,
                ..label.size
            },
        );
        shape.occupied += label.size.width * label.size.height;
    }
    shape.drawing.width = at.width + width;
    shape.drawing.height = height;
    shape.occupied += at.width * at.height;
    shape.drawing.cards.push(PlacedCard {
        id: endpoint.node.id.clone(),
        bx: at,
        depth: scope.depth + usize::from(scope.header.is_some()),
        header: None,
    });
    shape.endpoints.insert(index, at);
    shape
}

/// Keep at most two measured child shapes. Parent candidates never recompute a child.
pub(super) fn plan(model: &Model<'_>, topology: &Topology) -> Option<Shape> {
    scope(model, topology, 0)
        .into_iter()
        .min_by(|a, b| a.cost().total_cmp(&b.cost()))
}

fn scope(model: &Model<'_>, topology: &Topology, index: usize) -> Vec<Shape> {
    let children: Vec<Vec<_>> = model.scopes[index]
        .children
        .iter()
        .map(|child| match *child {
            Child::Endpoint(endpoint) => [false, true]
                .map(|left| card(model, topology, endpoint, left))
                .into(),
            Child::Scope(index) => scope(model, topology, index),
        })
        .collect();
    if children.iter().any(Vec::is_empty) {
        return Vec::new();
    }
    [Axis::Down, Axis::Right]
        .into_iter()
        .filter_map(|axis| {
            candidates(model, topology, index, &children, axis)
                .into_iter()
                .min_by(|a, b| a.cost().total_cmp(&b.cost()))
        })
        .collect()
}

fn candidates(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    children: &[Vec<Shape>],
    axis: Axis,
) -> Vec<Shape> {
    let mut feasible = Vec::new();
    for alternative in 0..2 {
        let children: Vec<_> = children
            .iter()
            .map(|shapes| &shapes[alternative.min(shapes.len() - 1)])
            .collect();
        let widest = children
            .iter()
            .map(|child| cross_size(child, axis))
            .fold(0.0, f64::max);
        let area: f64 = children
            .iter()
            .map(|c| (c.drawing.width + CLEAR) * (c.drawing.height + CLEAR))
            .sum();
        let widths = [
            widest,
            widest.max((area * 1.4).sqrt()),
            children.iter().map(|c| cross_size(c, axis) + CLEAR).sum(),
        ];
        let connected = topology.routes.iter().any(|route| route.scope == index);
        for (shelf, across) in widths
            .into_iter()
            .enumerate()
            .filter(|(shelf, _)| !connected || *shelf != 1)
        {
            let mut shape = pack(
                model,
                index,
                &children,
                across,
                axis,
                connected && shelf == 0,
            );
            if super::channel::emit(model, topology, index, &mut shape) {
                feasible.push(shape);
            }
        }
    }
    feasible
}

fn cross_size(shape: &Shape, axis: Axis) -> f64 {
    if axis == Axis::Down {
        shape.drawing.width
    } else {
        shape.drawing.height
    }
}

fn along_size(shape: &Shape, axis: Axis) -> f64 {
    if axis == Axis::Down {
        shape.drawing.height
    } else {
        shape.drawing.width
    }
}

fn pack(
    model: &Model<'_>,
    index: usize,
    children: &[&Shape],
    across: f64,
    axis: Axis,
    single: bool,
) -> Shape {
    let one = &model.scopes[index];
    let inset = inset(one);
    let header = one.header.map(|id| model.endpoints[id].bounds);
    let top = header.map_or_else(
        || {
            one.caption
                .map_or(inset, |(_, h)| h + HEADER_SLAB_INSET + inset)
        },
        |at| at.y + at.height + inset,
    );
    let mut shape = Shape::empty();
    shape.axis = axis;
    let (mut cross, mut along, mut row, mut width, mut height) =
        (0.0, 0.0, 0.0_f64, 0.0_f64, 0.0_f64);
    let centering = if children.len() == 1 && one.group.is_some() {
        one.caption.map_or(0.0, |(width, _)| {
            (width - children[0].drawing.width).max(0.0) / 2.0
        })
    } else {
        0.0
    };
    let mut used = 0.0;
    for child in children {
        if cross > 0.0 && (single || cross + cross_size(child, axis) > across) {
            cross = 0.0;
            along += row + 2.0 * CLEAR;
            row = 0.0;
        }
        let mut offset = if axis == Axis::Down {
            Point {
                x: inset + cross,
                y: top + along,
            }
        } else {
            Point {
                x: inset + along,
                y: top + cross,
            }
        };
        offset.x += centering;
        let mut child = (*child).clone();
        child.shift(offset);
        used += child.drawing.width * child.drawing.height;
        row = row.max(along_size(&child, axis));
        cross += cross_size(&child, axis) + 2.0 * CLEAR;
        width = width.max(offset.x + child.drawing.width + inset);
        height = height.max(offset.y + child.drawing.height + inset);
        shape.absorb(child);
    }
    shape.drawing.width = width
        .max(header.map_or(0.0, |at| at.x + at.width + inset))
        .max(one.caption.map_or(0.0, |(w, _)| w + 2.0 * inset))
        .max(2.0 * inset);
    shape.drawing.height = height.max(top + inset);
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

fn inset(one: &super::model::Scope<'_>) -> f64 {
    if one.header.is_some() {
        CONTAINER_INSET
    } else if one.group.is_some() {
        REGION_INSET
    } else {
        CLEAR
    }
}
