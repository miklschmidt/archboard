//! Which cell of a frame's grid each part stands in. A short search swaps parts
//! while that shortens their lines.

use crate::{
    geometry::Point,
    graph::{GROUPS, Node},
};

use super::CELL_GAP;

/// What a line against the reading direction costs.
const AGAINST: f64 = 600.0;
/// What a turn costs, as a route's cost weighs it.
const TURN: f64 = 120.0;
/// How much harder a shared group holds two parts together than a shared door.
const GROUP_PULL: f64 = 2.0;
/// How many times the search passes over every part.
const PASSES: usize = 6;

/// A part of the frame.
#[derive(Clone)]
pub(super) struct Item<'a> {
    pub node: &'a Node,
    /// How many relationships join it to something outside the frame.
    pub outward: f64,
    /// What it reaches outside the frame, each way.
    pub doors: Vec<(&'a str, bool)>,
    /// The groups it is in.
    pub groups: Vec<&'a str>,
}

impl<'a> Item<'a> {
    pub(super) fn of(node: &'a Node) -> Item<'a> {
        Item {
            node,
            outward: 0.0,
            doors: Vec::new(),
            groups: node
                .option(GROUPS)
                .map_or_else(Vec::new, |groups| groups.split(' ').collect()),
        }
    }
}

/// One relationship between two parts.
#[derive(Clone, Copy)]
pub(super) struct Join {
    pub from: usize,
    pub to: usize,
    pub label: f64,
}

/// The cell each part stands in, read left to right and top to bottom. The parts
/// fill the first cells, so every row starts at the left edge and only the last
/// row can run short.
pub(super) struct Grid {
    pub columns: usize,
    pub cells: Vec<usize>,
}

/// What two parts that share a door cost for each cell between them.
const APART: f64 = 0.25;

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
        }
    }

    /// How many rows the grid holds.
    pub(super) fn rows(&self) -> usize {
        self.cells.len().div_ceil(self.columns)
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
        joined + walled + self.apart(items, pitch)
    }

    /// How far apart the parts of each door and of each group stand.
    fn apart(&self, items: &[Item<'_>], pitch: Point) -> f64 {
        let mut cost = 0.0;
        for (one, item) in items.iter().enumerate() {
            let (ax, ay) = self.at(self.cells[one]);
            for (other, peer) in items.iter().enumerate().skip(one + 1) {
                let doors = item.doors.iter().filter(|door| peer.doors.contains(door));
                let groups = item
                    .groups
                    .iter()
                    .filter(|group| peer.groups.contains(group));
                let shared = doors.count() as f64 + groups.count() as f64 * GROUP_PULL;
                if shared > 0.0 {
                    let (bx, by) = self.at(self.cells[other]);
                    cost += shared
                        * APART
                        * (ax.abs_diff(bx) as f64 * pitch.x + ay.abs_diff(by) as f64 * pitch.y);
                }
            }
        }
        cost
    }

    /// How many cells stand between one cell and the frame's nearest wall.
    fn wall_distance(&self, cell: usize) -> f64 {
        let (x, y) = self.at(cell);
        [x, self.columns - 1 - x, y, self.rows() - 1 - y]
            .into_iter()
            .min()
            .unwrap_or(0) as f64
    }

    /// One pass over every part and every cell, keeping each swap that lowers the cost.
    fn pass(&mut self, joins: &[Join], items: &[Item<'_>], pitch: Point, best: &mut f64) -> bool {
        let mut moved = false;
        for part in 0..self.cells.len() {
            for cell in 0..self.cells.len() {
                let held = self.cells.iter().position(|&one| one == cell);
                let other = held.unwrap_or(part);
                if other == part {
                    continue;
                }
                self.cells.swap(part, other);
                let cost = self.cost(joins, items, pitch);
                if cost + 1e-9 < *best {
                    *best = cost;
                    moved = true;
                } else {
                    self.cells.swap(part, other);
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
