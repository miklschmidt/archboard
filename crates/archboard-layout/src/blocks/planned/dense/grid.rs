//! Which cell of a frame's grid each part stands in. A short search swaps parts
//! while that shortens their lines.

use crate::{geometry::Point, graph::Node};

use super::CELL_GAP;

/// What a line against the reading direction costs.
const AGAINST: f64 = 160.0;
/// What a turn costs, as a route's cost weighs it.
const TURN: f64 = 120.0;
/// How many times the search passes over every part.
const PASSES: usize = 6;

/// A part of the frame.
#[derive(Clone, Copy)]
pub(super) struct Item<'a> {
    pub node: &'a Node,
    /// How many relationships join it to something outside the frame.
    pub outward: f64,
}

impl<'a> Item<'a> {
    pub(super) fn of(node: &'a Node) -> Item<'a> {
        Item { node, outward: 0.0 }
    }
}

/// One relationship between two parts.
#[derive(Clone, Copy)]
pub(super) struct Join {
    pub from: usize,
    pub to: usize,
    pub label: f64,
}

/// The cell each part stands in, read left to right and top to bottom.
pub(super) struct Grid {
    pub columns: usize,
    pub cells: Vec<usize>,
    count: usize,
}

/// What one line costs, by how far it reaches across the grid.
fn reach(dx: f64, dy: f64, pitch: Point, label: f64) -> f64 {
    let mut cost = dx.abs() * pitch.x + dy.abs() * pitch.y;
    if dx != 0.0 && dy != 0.0 {
        cost += TURN;
    }
    if dy < 0.0 || (dy == 0.0 && dx < 0.0) {
        cost += AGAINST;
    }
    if dy == 0.0 {
        cost += label;
    }
    if (dx == 0.0 && dy.abs() > 1.0) || (dy == 0.0 && dx.abs() > 1.0) {
        cost += 2.0 * TURN;
    }
    cost
}

impl Grid {
    /// The parts in reading order.
    pub(super) fn new(columns: usize, parts: usize) -> Grid {
        Grid {
            columns,
            cells: (0..parts).collect(),
            count: parts.div_ceil(columns) * columns,
        }
    }

    /// How many rows the grid holds.
    pub(super) fn rows(&self) -> usize {
        self.count / self.columns
    }

    /// A cell's column and row.
    pub(super) fn at(&self, cell: usize) -> (usize, usize) {
        (cell % self.columns, cell / self.columns)
    }

    fn cost(&self, joins: &[Join], items: &[Item<'_>], pitch: Point) -> f64 {
        let joined: f64 = joins
            .iter()
            .map(|join| {
                let (ax, ay) = self.at(self.cells[join.from]);
                let (bx, by) = self.at(self.cells[join.to]);
                reach(
                    bx as f64 - ax as f64,
                    by as f64 - ay as f64,
                    pitch,
                    join.label,
                )
            })
            .sum();
        let walled: f64 = items
            .iter()
            .zip(&self.cells)
            .map(|(item, &cell)| item.outward * self.wall_distance(cell) * pitch.y)
            .sum();
        joined + walled
    }

    /// How many cells stand between one cell and the frame's nearest wall.
    fn wall_distance(&self, cell: usize) -> f64 {
        let (x, y) = self.at(cell);
        [x, self.columns - 1 - x, y, self.rows() - 1 - y]
            .into_iter()
            .min()
            .unwrap_or(0) as f64
    }

    /// Put a part in a cell, swapping with what stands there.
    fn swap(&mut self, part: usize, cell: usize) -> (usize, Option<usize>) {
        let old = self.cells[part];
        let other = self.cells.iter().position(|&held| held == cell);
        self.cells[part] = cell;
        if let Some(other) = other {
            self.cells[other] = old;
        }
        (old, other)
    }

    /// Take a swap back.
    fn unswap(&mut self, part: usize, cell: usize, undo: (usize, Option<usize>)) {
        self.cells[part] = undo.0;
        if let Some(other) = undo.1 {
            self.cells[other] = cell;
        }
    }

    /// One pass over every part and every cell, keeping what lowers the cost.
    fn pass(&mut self, joins: &[Join], items: &[Item<'_>], pitch: Point, best: &mut f64) -> bool {
        let mut moved = false;
        for part in 0..self.cells.len() {
            for cell in 0..self.count {
                if cell == self.cells[part] {
                    continue;
                }
                let undo = self.swap(part, cell);
                let cost = self.cost(joins, items, pitch);
                if cost + 1e-9 < *best {
                    *best = cost;
                    moved = true;
                } else {
                    self.unswap(part, cell, undo);
                }
            }
        }
        moved
    }

    /// Swap parts while that shortens their lines.
    pub(super) fn settle(&mut self, joins: &[Join], items: &[Item<'_>]) {
        let width = items.iter().map(|item| item.node.w()).fold(0.0, f64::max);
        let height = items.iter().map(|item| item.node.h()).fold(0.0, f64::max);
        let pitch = Point {
            x: width + CELL_GAP,
            y: height + CELL_GAP,
        };
        let mut best = self.cost(joins, items, pitch);
        for _ in 0..PASSES {
            if !self.pass(joins, items, pitch, &mut best) {
                break;
            }
        }
    }
}
