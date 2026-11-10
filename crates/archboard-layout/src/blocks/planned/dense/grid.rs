//! Which cell of a frame's grid each part stands in. A short search swaps parts
//! while that shortens their lines, which is where the wider search (`super::anneal`) starts.

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

/// The cell each part stands in, read left to right and top to bottom. A grid starts with
/// the parts in its first cells, so that only the last row runs short. A search can leave any
/// cell empty.
#[derive(Clone, Debug)]
pub(super) struct Grid {
    pub columns: usize,
    pub rows: usize,
    pub cells: Vec<usize>,
}

/// What two parts that share a door cost for each cell between them.
const APART: f64 = 0.25;

/// Two parts that share doors or groups, in reading order, and how hard they pull together.
#[derive(Clone, Copy)]
struct Pull {
    one: usize,
    other: usize,
    shared: f64,
}

/// Every pair of parts that pulls together. A search weighs them at every swap, and they
/// stay the same through it.
fn pulls(items: &[Item<'_>]) -> Vec<Pull> {
    let mut pulls = Vec::new();
    for (one, item) in items.iter().enumerate() {
        for (other, peer) in items.iter().enumerate().skip(one + 1) {
            let doors = item.doors.iter().filter(|door| peer.doors.contains(door));
            let groups = item
                .groups
                .iter()
                .filter(|group| peer.groups.contains(group));
            let shared = doors.count() as f64 + groups.count() as f64 * GROUP_PULL;
            if shared > 0.0 {
                pulls.push(Pull { one, other, shared });
            }
        }
    }
    pulls
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
            rows: parts.div_ceil(columns),
            cells: (0..parts).collect(),
        }
    }

    /// How many rows the grid holds.
    pub(super) fn rows(&self) -> usize {
        self.rows
    }

    /// Drop every row and column that no part stands in.
    pub(super) fn compact(&mut self) {
        let used = |of: &dyn Fn(usize) -> usize, count: usize| {
            let mut next = 0;
            let kept: Vec<Option<usize>> = (0..count)
                .map(|at| {
                    let used = self.cells.iter().any(|&cell| of(cell) == at);
                    used.then(|| {
                        next += 1;
                        next - 1
                    })
                })
                .collect();
            (kept, next)
        };
        let columns = self.columns;
        let (column, width) = used(&|cell| cell % columns, columns);
        let (row, height) = used(&|cell| cell / columns, self.rows);
        for cell in &mut self.cells {
            let (x, y) = (*cell % columns, *cell / columns);
            *cell = row[y].unwrap_or(0) * width + column[x].unwrap_or(0);
        }
        self.columns = width.max(1);
        self.rows = height.max(1);
    }

    /// A cell's column and row.
    pub(super) fn at(&self, cell: usize) -> (usize, usize) {
        (cell % self.columns, cell / self.columns)
    }

    /// What one line costs where its parts stand.
    fn join(&self, join: &Join, pitch: Point) -> f64 {
        let (ax, ay) = self.at(self.cells[join.from]);
        let (bx, by) = self.at(self.cells[join.to]);
        reach(
            bx as f64 - ax as f64,
            by as f64 - ay as f64,
            pitch,
            join.label,
        )
    }

    /// What a part that reaches outside the frame costs, by how far it stands from a wall.
    fn wall(&self, item: &Item<'_>, part: usize, pitch: Point) -> f64 {
        item.outward * self.wall_distance(self.cells[part]) * pitch.y
    }

    /// What two parts that pull together cost, by how far apart they stand.
    fn pull(&self, &Pull { one, other, shared }: &Pull, pitch: Point) -> f64 {
        let (ax, ay) = self.at(self.cells[one]);
        let (bx, by) = self.at(self.cells[other]);
        shared * APART * (ax.abs_diff(bx) as f64 * pitch.x + ay.abs_diff(by) as f64 * pitch.y)
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
    fn pass(&mut self, costs: &mut Costs<'_, '_>, best: &mut f64) -> bool {
        let mut moved = false;
        let mut holder: Vec<Option<usize>> = vec![None; self.columns * self.rows];
        for (part, &cell) in self.cells.iter().enumerate() {
            holder[cell] = Some(part);
        }
        for part in 0..self.cells.len() {
            for cell in 0..self.cells.len() {
                let other = holder[cell].unwrap_or(part);
                if other == part {
                    continue;
                }
                self.cells.swap(part, other);
                costs.swapped(self, part, other);
                let cost = costs.total();
                if cost + 1e-9 < *best {
                    *best = cost;
                    moved = true;
                    holder[self.cells[part]] = Some(part);
                    holder[self.cells[other]] = Some(other);
                } else {
                    self.cells.swap(part, other);
                    costs.swapped(self, part, other);
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
        let mut costs = Costs::new(self, joins, items, pulls(items), pitch);
        let mut best = costs.total();
        for _ in 0..PASSES {
            if !self.pass(&mut costs, &mut best) {
                break;
            }
        }
    }
}

/// What each line, wall and pull of a grid costs, kept as the short search swaps parts: a swap
/// weighs again only what its two parts change.
struct Costs<'g, 'a> {
    joins: &'g [Join],
    items: &'g [Item<'a>],
    pulls: Vec<Pull>,
    pitch: Point,
    /// What each line, each part's wall and each pull costs.
    each: [Vec<f64>; 3],
    /// The lines and the pulls of each part.
    lines: Vec<Vec<usize>>,
    pulled: Vec<Vec<usize>>,
}

impl<'g, 'a> Costs<'g, 'a> {
    fn new(
        grid: &Grid,
        joins: &'g [Join],
        items: &'g [Item<'a>],
        pulls: Vec<Pull>,
        pitch: Point,
    ) -> Self {
        let mut lines = vec![Vec::new(); items.len()];
        for (at, join) in joins.iter().enumerate() {
            lines[join.from].push(at);
            lines[join.to].push(at);
        }
        let mut pulled = vec![Vec::new(); items.len()];
        for (at, pull) in pulls.iter().enumerate() {
            pulled[pull.one].push(at);
            pulled[pull.other].push(at);
        }
        let each = [
            joins.iter().map(|join| grid.join(join, pitch)).collect(),
            (items.iter().enumerate())
                .map(|(part, item)| grid.wall(item, part, pitch))
                .collect(),
            pulls.iter().map(|pull| grid.pull(pull, pitch)).collect(),
        ];
        Costs {
            joins,
            items,
            pulls,
            pitch,
            each,
            lines,
            pulled,
        }
    }

    /// Weigh again what two parts that traded cells change.
    fn swapped(&mut self, grid: &Grid, part: usize, other: usize) {
        let [joins, walls, pulls] = &mut self.each;
        for moved in [part, other] {
            for &at in &self.lines[moved] {
                joins[at] = grid.join(&self.joins[at], self.pitch);
            }
            walls[moved] = grid.wall(&self.items[moved], moved, self.pitch);
            for &at in &self.pulled[moved] {
                pulls[at] = grid.pull(&self.pulls[at], self.pitch);
            }
        }
    }

    /// What the grid costs: its lines, how far from a wall each part that reaches outside
    /// stands, and how far apart the parts of each door and of each group stand.
    fn total(&self) -> f64 {
        let [joins, walls, pulls] = &self.each;
        let mut apart = 0.0;
        for pull in pulls {
            apart += pull;
        }
        joins.iter().sum::<f64>() + walls.iter().sum::<f64>() + apart
    }
}
