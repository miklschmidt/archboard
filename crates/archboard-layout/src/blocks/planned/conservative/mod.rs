//! A reserved channel construction for local planning exhaustion.
//! Every child exports complete boundary paths before its parent is measured.

mod cells;
mod channels;

use super::{
    geometry::clean,
    model::{Child, Model},
    shape::{Axis, CLEAR, ScopePlacement, Shape},
    topology::Topology,
};
use crate::blocks::assembly::PlacedLine;
use crate::geometry::{Point, Rect, Side};
use std::collections::{BTreeMap, BTreeSet};

type Paths = BTreeMap<usize, Vec<Point>>;

#[derive(Clone)]
struct Piece {
    shape: Shape,
    tails: Paths,
    heads: Paths,
    tail_wall: Side,
    head_wall: Side,
    header: bool,
}

impl Piece {
    fn shift(&mut self, by: Point) {
        self.shape.shift(by);
        for point in self
            .tails
            .values_mut()
            .chain(self.heads.values_mut())
            .flatten()
        {
            point.x += by.x;
            point.y += by.y;
        }
    }
    fn ports(&self) -> BTreeSet<usize> {
        self.tails
            .keys()
            .chain(self.heads.keys())
            .copied()
            .collect()
    }
}

/// A target and complete treatment identify one incoming tree at every scope.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Key(usize, String);
fn key(model: &Model<'_>, edge: usize) -> Key {
    Key(model.ends[edge].1, model.treatments[edge].clone())
}

pub(super) fn plan(model: &Model<'_>, topology: &Topology) -> Option<Shape> {
    Some(scope(model, topology, 0)?.shape)
}

fn scope(model: &Model<'_>, topology: &Topology, index: usize) -> Option<Piece> {
    let one = &model.scopes[index];
    let children = children_of(model, topology, index)?;
    let offset = usize::from(one.header.is_some());
    let hints = super::order::hints(model, topology, index);
    let order: Vec<_> = (0..offset)
        .chain(hints.children.into_iter().map(|i| i + offset))
        .collect();
    let top = one
        .caption
        .map_or(if index == 0 { CLEAR } else { 0.0 }, |(_, h)| h + CLEAR);
    let area: f64 = children
        .iter()
        .map(|p| {
            (p.shape.drawing.width
                + channels::skirt(model, p, Side::Left)
                + channels::skirt(model, p, Side::Right))
                * p.shape.drawing.height
        })
        .sum();
    let base = area.sqrt();
    let min_width = one.caption.map_or(0.0, |(w, _)| w + 2.0 * CLEAR);
    [base * 0.8, base * 1.3, base * 2.0]
        .into_iter()
        .enumerate()
        .filter_map(|(choice, width)| {
            let rows = rows(model, &children, &order, width);
            let plan = channels::plan(model, &children, &rows, top, min_width);
            let mut piece = assemble(model, index, children.clone(), plan);
            let score = refine(model, topology, index, &mut piece)?;
            Some((score, choice, piece))
        })
        .min_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)))
        .map(|(_, _, piece)| piece)
}

fn children_of(model: &Model<'_>, topology: &Topology, index: usize) -> Option<Vec<Piece>> {
    let one = &model.scopes[index];
    let mut children = Vec::new();
    if let Some(header) = one.header {
        children.push(cells::cell(model, topology, header, true)?);
    }
    for child in &one.children {
        children.push(match *child {
            Child::Endpoint(id) => cells::cell(model, topology, id, false)?,
            Child::Scope(id) => scope(model, topology, id)?,
        });
    }
    Some(children)
}

fn assemble(
    model: &Model<'_>,
    index: usize,
    children: Vec<Piece>,
    chosen: channels::Plan,
) -> Piece {
    let mut tails = Paths::new();
    let mut heads = Paths::new();
    let mut shape = Shape::empty();
    let mut used = 0.0;
    for (mut child, by) in children.into_iter().zip(chosen.offsets) {
        child.shift(by);
        used += child.shape.drawing.width * child.shape.drawing.height;
        tails.append(&mut child.tails);
        heads.append(&mut child.heads);
        shape.absorb(child.shape);
    }
    let edges: BTreeSet<_> = tails.keys().chain(heads.keys()).copied().collect();
    let mut pending_tails = Paths::new();
    let mut pending_heads = Paths::new();
    for edge in edges {
        let tail = tails.remove(&edge).map(|mut points| {
            points.extend(&chosen.tails[&edge]);
            clean(points)
        });
        let head = heads.remove(&edge).map(|points| {
            clean(
                chosen.heads[&edge]
                    .iter()
                    .rev()
                    .copied()
                    .chain(points)
                    .collect(),
            )
        });
        match (tail, head) {
            (Some(tail), Some(head)) => shape.drawing.edges.push(PlacedLine {
                id: model.edges[edge].id.clone(),
                points: clean(tail.into_iter().chain(head).collect()),
                label: shape.labels.get(&edge).copied(),
            }),
            (Some(tail), None) => {
                pending_tails.insert(edge, tail);
            }
            (None, Some(head)) => {
                pending_heads.insert(edge, head);
            }
            (None, None) => unreachable!("an incident relationship"),
        }
    }
    shape.drawing.width = chosen.width;
    shape.drawing.height = chosen.height;
    shape.empty += (chosen.width * chosen.height - used).max(0.0);
    let bounds = Rect {
        x: 0.0,
        y: 0.0,
        width: chosen.width,
        height: chosen.height,
    };
    shape.scopes.insert(
        index,
        ScopePlacement {
            bounds,
            axis: Axis::Down,
        },
    );
    super::shape::add_frame(model, index, &mut shape, bounds);
    Piece {
        shape,
        tails: pending_tails,
        heads: pending_heads,
        tail_wall: Side::Right,
        head_wall: Side::Left,
        header: false,
    }
}

fn rows(model: &Model<'_>, children: &[Piece], order: &[usize], target: f64) -> Vec<Vec<usize>> {
    let mut rows: Vec<Vec<usize>> = Vec::new();
    let mut width = target;
    for &index in order {
        let child = &children[index];
        let size = child.shape.drawing.width
            + channels::skirt(model, child, Side::Left)
            + channels::skirt(model, child, Side::Right)
            + CLEAR;
        if rows.is_empty() || width + size > target || child.header {
            rows.push(Vec::new());
            width = 0.0;
        }
        rows.last_mut().expect("a shelf").push(index);
        width += size;
        if child.header {
            width = target;
        }
    }
    rows
}

/// All local and boundary paths constrain direct candidates before this scope freezes.
fn refine(model: &Model<'_>, topology: &Topology, scope: usize, piece: &mut Piece) -> Option<f64> {
    let shape = &mut piece.shape;
    let complete = shape.drawing.edges.len();
    for (&edge, points) in piece.tails.iter().chain(&piece.heads) {
        shape.drawing.edges.push(PlacedLine {
            id: model.edges[edge].id.clone(),
            points: points.clone(),
            label: shape.labels.get(&edge).copied(),
        });
    }
    let original = shape.drawing.edges.clone();
    shorten(model, topology, scope, shape, complete)?;
    if super::runs::freeze(model, &shape.drawing).is_none() {
        shape.drawing.edges = original;
    }
    let frozen = super::runs::freeze(model, &shape.drawing)?;
    let cost = super::score::cost(model, topology, shape, &frozen);
    shape.drawing.edges.truncate(complete);
    Some(cost)
}

fn shorten(
    model: &Model<'_>,
    topology: &Topology,
    scope: usize,
    shape: &mut Shape,
    complete: usize,
) -> Option<()> {
    for index in 0..complete {
        let edge = model
            .edges
            .iter()
            .position(|e| e.id == shape.drawing.edges[index].id)?;
        if topology.routes[edge].scope != scope {
            continue;
        }
        let Some(candidate) = super::channel::route_line(
            model,
            topology,
            edge,
            shape,
            shape.scopes[&scope].bounds,
            None,
        ) else {
            continue;
        };
        let id = &model.edges[edge].id;
        if super::channel::path_cost(&candidate.points, shape, id)
            < super::channel::path_cost(&shape.drawing.edges[index].points, shape, id)
        {
            shape.drawing.edges[index] = candidate;
        }
    }
    Some(())
}
