//! Bottom-up measured scopes. A parent places each frozen child as one box.

use std::collections::BTreeMap;

use crate::blocks::assembly::{Placed, PlacedArea, PlacedCard, Title};
use crate::constants::{CONTAINER_INSET, HEADER_SLAB_INSET, REGION_INSET};
use crate::geometry::{Point, Rect};

use super::model::{Child, Model};
use super::topology::Topology;

pub(super) const CLEAR: f64 = 32.0;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Axis {
    Down,
    Right,
}

#[derive(Clone)]
pub(super) struct ScopePlacement {
    pub bounds: Rect,
    pub axis: Axis,
}

#[derive(Clone)]
pub(super) struct Shape {
    pub drawing: Placed,
    pub endpoints: BTreeMap<usize, Rect>,
    pub cells: BTreeMap<usize, Rect>,
    pub scopes: BTreeMap<usize, ScopePlacement>,
    pub labels: BTreeMap<usize, Rect>,
    pub stems: BTreeMap<usize, Vec<Point>>,
    pub axis: Axis,
    pub occupied: f64,
    pub empty: f64,
    pub fallbacks: usize,
    pub(super) score: f64,
}

impl Shape {
    pub(super) fn empty() -> Self {
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
            cells: BTreeMap::new(),
            scopes: BTreeMap::new(),
            labels: BTreeMap::new(),
            stems: BTreeMap::new(),
            axis: Axis::Down,
            occupied: 0.0,
            empty: 0.0,
            fallbacks: 0,
            score: 0.0,
        }
    }

    pub(super) fn shift(&mut self, by: Point) {
        for at in self
            .endpoints
            .values_mut()
            .chain(self.cells.values_mut())
            .chain(self.scopes.values_mut().map(|scope| &mut scope.bounds))
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
            .chain(self.stems.values_mut().flatten())
        {
            point.x += by.x;
            point.y += by.y;
        }
    }

    pub(super) fn absorb(&mut self, child: Self) {
        self.fallbacks += child.fallbacks;
        self.occupied += child.occupied;
        self.empty += child.empty;
        self.drawing.cards.extend(child.drawing.cards);
        self.drawing.frames.extend(child.drawing.frames);
        self.drawing.regions.extend(child.drawing.regions);
        self.drawing.edges.extend(child.drawing.edges);
        self.drawing.titles.extend(child.drawing.titles);
        self.endpoints.extend(child.endpoints);
        self.cells.extend(child.cells);
        self.scopes.extend(child.scopes);
        self.labels.extend(child.labels);
        self.stems.extend(child.stems);
    }
}

/// Deterministic work counters stay inside the private solve.
#[derive(Default)]
pub(super) struct Counts {
    candidates: usize,
    repairs: usize,
    peak_lanes: usize,
    windows: usize,
}

impl Counts {
    pub(super) fn within_limits(&self, scopes: usize, edges: usize) -> bool {
        self.windows <= 4
            && self.candidates <= 12 * scopes
            && self.repairs <= 2 * scopes
            && self.peak_lanes <= edges.max(1)
    }
}

struct Planner<'a> {
    model: &'a Model<'a>,
    topology: &'a Topology,
    counts: Counts,
}
struct Packing<'a> {
    across: f64,
    axis: Axis,
    gaps: Point,
    order: Vec<usize>,
    ranks: &'a [usize],
    separate_ranks: bool,
}

struct Capacity {
    repairs: usize,
    gaps: Point,
}

/// Each child is measured once in two directions. No parent candidate rebuilds it.
pub(super) fn plan(model: &Model<'_>, topology: &Topology) -> (Option<Shape>, Counts) {
    let mut planner = Planner {
        model,
        topology,
        counts: Counts::default(),
    };
    let chosen = best(planner.scope(0));
    (chosen, planner.counts)
}

fn best(shapes: Vec<Shape>) -> Option<Shape> {
    shapes
        .into_iter()
        .enumerate()
        .min_by(|(a, one), (b, other)| one.score.total_cmp(&other.score).then(a.cmp(b)))
        .map(|(_, shape)| shape)
}

impl Planner<'_> {
    fn scope(&mut self, index: usize) -> Vec<Shape> {
        let model = self.model;
        let topology = self.topology;
        let children: Vec<Vec<_>> = model.scopes[index]
            .children
            .iter()
            .map(|child| match *child {
                Child::Endpoint(endpoint) => [false, true]
                    .map(|left| super::cells::card(model, topology, endpoint, left))
                    .into(),
                Child::Scope(index) => self.scope(index),
            })
            .collect();
        if children.iter().any(Vec::is_empty) {
            return Vec::new();
        }
        let order = super::order::hints(model, topology, index);
        let mut capacity = Capacity {
            repairs: 0,
            gaps: Point {
                x: 2.0 * CLEAR,
                y: 2.0 * CLEAR,
            },
        };
        [Axis::Down, Axis::Right]
            .into_iter()
            .filter_map(|axis| best(self.candidates(index, &children, axis, &order, &mut capacity)))
            .collect()
    }

    fn candidates(
        &mut self,
        index: usize,
        children: &[Vec<Shape>],
        axis: Axis,
        order: &super::order::Order,
        capacity: &mut Capacity,
    ) -> Vec<Shape> {
        let mut feasible = Vec::new();
        for alternative in 0..2 {
            let children: Vec<_> = children
                .iter()
                .map(|shapes| &shapes[alternative.min(shapes.len() - 1)])
                .collect();
            for (shelf, across) in widths(&children, axis).into_iter().enumerate() {
                self.counts.candidates += 1;
                let packing = Packing {
                    across,
                    axis,
                    gaps: capacity.gaps,
                    order: if alternative == 0 {
                        order.children.clone()
                    } else {
                        order.exchanged(shelf)
                    },
                    ranks: &order.ranks,
                    separate_ranks: alternative == 0 || order.uniform,
                };
                if let Some(shape) = self.candidate(index, &children, packing, capacity) {
                    feasible.push(shape);
                }
            }
        }
        feasible
    }

    fn candidate(
        &mut self,
        index: usize,
        children: &[&Shape],
        mut packing: Packing<'_>,
        capacity: &mut Capacity,
    ) -> Option<Shape> {
        let mut shape;
        loop {
            shape = pack(self.model, self.topology, index, children, &packing);
            let room = super::lanes::room(self.model, self.topology, index, &shape);
            self.counts.peak_lanes = self.counts.peak_lanes.max(room.peak);
            if room.gap.x <= packing.gaps.x && room.gap.y <= packing.gaps.y {
                break;
            }
            if capacity.repairs == 2 {
                return None;
            }
            capacity.repairs += 1;
            self.counts.repairs += 1;
            packing.gaps.x = packing.gaps.x.max(room.gap.x);
            packing.gaps.y = packing.gaps.y.max(room.gap.y);
            capacity.gaps = packing.gaps;
        }
        shape.stems = super::ports::reserve(self.model, &shape);
        if !super::channel::emit(
            self.model,
            self.topology,
            index,
            &mut shape,
            &mut self.counts.windows,
        ) {
            return None;
        }
        let frozen = super::runs::freeze(self.model, &shape.drawing)?;
        shape.score = super::score::cost(self.model, self.topology, &shape, &frozen);
        Some(shape)
    }
}

fn widths(children: &[&Shape], axis: Axis) -> [f64; 2] {
    let widest = children
        .iter()
        .map(|child| cross_size(child, axis))
        .fold(0.0, f64::max);
    let area: f64 = children
        .iter()
        .map(|c| (c.drawing.width + CLEAR) * (c.drawing.height + CLEAR))
        .sum();
    [widest, widest.max((area * 1.4).sqrt())]
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
    topology: &Topology,
    index: usize,
    children: &[&Shape],
    packing: &Packing<'_>,
) -> Shape {
    let axis = packing.axis;
    let one = &model.scopes[index];
    let inset = if model.edges.is_empty() {
        inset(one)
    } else {
        inset(one).max(2.0 * CLEAR)
    };
    let header = one.header.map(|id| model.endpoints[id].bounds);
    let header_labels = super::cells::header_labels(model, topology, index);
    let label_width = header_labels
        .values()
        .map(|at| {
            at.x + at.width
                + inset
                + CLEAR
                + header_labels.len().saturating_sub(1) as f64 * crate::track::chains::LANE
        })
        .fold(0.0, f64::max);
    let label_bottom = header_labels
        .values()
        .map(|at| at.y + at.height)
        .fold(0.0, f64::max);
    let label_area: f64 = header_labels.values().map(|at| at.width * at.height).sum();
    let top = header.map_or_else(
        || {
            one.caption
                .map_or(inset, |(_, h)| h + HEADER_SLAB_INSET + inset)
        },
        |at| at.y + at.height + inset,
    );
    let top = top.max(label_bottom + inset);
    let mut shape = Shape::empty();
    shape.labels = header_labels;
    shape.axis = axis;
    let (mut cross, mut along, mut row, mut width, mut height) =
        (0.0, 0.0, 0.0_f64, 0.0_f64, 0.0_f64);
    let centering = center_single(one, children);
    let mut used = 0.0;
    let mut rank = None;
    let (cross_gap, along_gap) = match axis {
        Axis::Down => (packing.gaps.x, packing.gaps.y),
        Axis::Right => (packing.gaps.y, packing.gaps.x),
    };
    for &index in &packing.order {
        let child = children[index];
        let next_rank = packing.ranks[index];
        if cross > 0.0
            && ((packing.separate_ranks && rank != Some(next_rank))
                || cross + cross_size(child, axis) > packing.across)
        {
            cross = 0.0;
            along += row + along_gap;
            row = 0.0;
        }
        rank = Some(next_rank);
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
        let mut child = child.clone();
        child.shift(offset);
        used += child.drawing.width * child.drawing.height;
        row = row.max(along_size(&child, axis));
        cross += cross_size(&child, axis) + cross_gap;
        width = width.max(offset.x + child.drawing.width + inset);
        height = height.max(offset.y + child.drawing.height + inset);
        shape.absorb(child);
    }
    shape.drawing.width = width
        .max(label_width)
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
    shape.scopes.insert(index, ScopePlacement { bounds, axis });
    add_frame(model, index, &mut shape, bounds);
    let protected = header.map_or(0.0, |at| at.width * at.height)
        + one.caption.map_or(0.0, |(w, h)| w * h)
        + label_area;
    shape.occupied += protected;
    shape.empty += (bounds.width * bounds.height - used - protected).max(0.0);
    shape
}

fn center_single(one: &super::model::Scope<'_>, children: &[&Shape]) -> f64 {
    if children.len() == 1 && one.group.is_some() {
        one.caption.map_or(0.0, |(width, _)| {
            (width - children[0].drawing.width).max(0.0) / 2.0
        })
    } else {
        0.0
    }
}

pub(super) fn add_frame(model: &Model<'_>, index: usize, shape: &mut Shape, bounds: Rect) {
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
        let right = shape
            .labels
            .iter()
            .filter(|(edge, _)| model.ends[**edge].0 == header)
            .map(|(_, at)| at.x + at.width + CLEAR)
            .fold(endpoint.bounds.x + endpoint.bounds.width, f64::max);
        let bottom = shape
            .labels
            .iter()
            .filter(|(edge, _)| model.ends[**edge].0 == header)
            .map(|(_, at)| at.y + at.height)
            .fold(endpoint.bounds.y + endpoint.bounds.height, f64::max);
        shape.cells.insert(
            header,
            Rect {
                x: endpoint.bounds.x,
                y: endpoint.bounds.y,
                width: right - endpoint.bounds.x,
                height: bottom - endpoint.bounds.y,
            },
        );
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
