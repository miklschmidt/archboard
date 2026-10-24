//! The search for one connector's route: A* over the grid, each state a
//! vertex and the direction the route arrived in, as [W09] §4 searches. A
//! route pays its length, a penalty for each turn, and a penalty each time it
//! runs straight through a vertex that a route found earlier runs straight
//! through the other way. [W09] leaves crossings with earlier routes to future
//! work; counting them where both run straight is this router's own rule.

use std::cmp::Ordering;
use std::collections::BinaryHeap;

use crate::grid::{Grid, SAME, stub_end};
use crate::{Dir, End, Point, Scene};

const DIRS: [Dir; 4] = [Dir::Up, Dir::Right, Dir::Down, Dir::Left];

/// Which vertices earlier routes run straight through, by axis.
pub struct Taken {
    /// Bit 1: a route runs straight through across; bit 2: down.
    through: Vec<u8>,
}

impl Taken {
    pub fn new(grid: &Grid) -> Taken {
        Taken {
            through: vec![0; grid.len()],
        }
    }

    /// Mark where a route runs straight through.
    pub fn add(&mut self, grid: &Grid, points: &[Point]) {
        let width = grid.xs.len();
        for pair in points.windows(2) {
            let (Some(i0), Some(j0), Some(i1), Some(j1)) = (
                grid.column(pair[0].x),
                grid.row(pair[0].y),
                grid.column(pair[1].x),
                grid.row(pair[1].y),
            ) else {
                continue;
            };
            if j0 == j1 {
                for i in i0.min(i1) + 1..i0.max(i1) {
                    self.through[j0 * width + i] |= 1;
                }
            } else {
                for j in j0.min(j1) + 1..j0.max(j1) {
                    self.through[j * width + i0] |= 2;
                }
            }
        }
    }

    fn crosses(&self, vertex: usize, dir: Dir) -> bool {
        let other = if dir.horizontal() { 2 } else { 1 };
        self.through[vertex] & other != 0
    }
}

/// One item of the search's queue: a state, or the finished route through
/// the goal state that it names.
#[derive(Clone, Copy)]
struct Item {
    estimate: f64,
    seq: u64,
    state: usize,
    done: bool,
}

impl PartialEq for Item {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}
impl Eq for Item {}
impl PartialOrd for Item {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for Item {
    // The heap pops the greatest, so the cheapest estimate, then the earliest
    // pushed, compares greatest.
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .estimate
            .total_cmp(&self.estimate)
            .then(other.seq.cmp(&self.seq))
    }
}

/// Where a route starts searching from, and what it paid to get there.
struct Start {
    vertex: usize,
    /// The directions it may set off in without a turn.
    dirs: Vec<Dir>,
    paid: f64,
}

/// Where a route ends searching, and what it pays from there.
struct Goal {
    vertex: usize,
    /// The direction the route must run into the end without a turn; any,
    /// for a free end.
    into: Option<Dir>,
    paid: f64,
}

fn start_of(grid: &Grid, end: End) -> Option<Start> {
    match end {
        End::Free { at } => Some(Start {
            vertex: grid.vertex(at)?,
            dirs: DIRS.to_vec(),
            paid: 0.0,
        }),
        End::Pin {
            obstacle,
            at,
            leaves,
        } => {
            let stub = stub_end(&grid.buffers[obstacle], at, leaves);
            Some(Start {
                vertex: grid.vertex(stub)?,
                dirs: vec![leaves],
                paid: distance(at, stub),
            })
        }
    }
}

fn goal_of(grid: &Grid, end: End) -> Option<Goal> {
    match end {
        End::Free { at } => Some(Goal {
            vertex: grid.vertex(at)?,
            into: None,
            paid: 0.0,
        }),
        End::Pin {
            obstacle,
            at,
            leaves,
        } => {
            let stub = stub_end(&grid.buffers[obstacle], at, leaves);
            Some(Goal {
                vertex: grid.vertex(stub)?,
                into: Some(leaves.reverse()),
                paid: distance(at, stub),
            })
        }
    }
}

fn distance(a: Point, b: Point) -> f64 {
    (a.x - b.x).abs() + (a.y - b.y).abs()
}

fn dir_index(dir: Dir) -> usize {
    match dir {
        Dir::Up => 0,
        Dir::Right => 1,
        Dir::Down => 2,
        Dir::Left => 3,
    }
}

/// The cheapest route of one connector, its points simplified to its turns,
/// or nothing when no route through free space reaches its head.
pub fn shortest(
    grid: &Grid,
    scene: &Scene,
    tail: End,
    head: End,
    taken: &Taken,
) -> Option<Vec<Point>> {
    let start = start_of(grid, tail)?;
    let goal = goal_of(grid, head)?;
    let params = scene.params;
    let target = grid.point(goal.vertex);
    let states = grid.len() * 4;
    let mut cost = vec![f64::INFINITY; states];
    let mut prev = vec![usize::MAX; states];
    let mut queue = BinaryHeap::new();
    let mut seq = 0u64;
    let mut push = |queue: &mut BinaryHeap<Item>, estimate: f64, state: usize, done: bool| {
        queue.push(Item {
            estimate,
            seq,
            state,
            done,
        });
        seq += 1;
    };
    let heuristic = |vertex: usize| distance(grid.point(vertex), target);
    for &dir in &start.dirs {
        let state = start.vertex * 4 + dir_index(dir);
        cost[state] = start.paid;
        push(
            &mut queue,
            start.paid + heuristic(start.vertex),
            state,
            false,
        );
    }
    let mut finished = vec![false; states];
    while let Some(item) = queue.pop() {
        if item.done {
            return Some(path_of(grid, tail, head, &prev, item.state));
        }
        if finished[item.state] {
            continue;
        }
        finished[item.state] = true;
        let (vertex, arrived) = (item.state / 4, DIRS[item.state % 4]);
        let here = cost[item.state];
        if vertex == goal.vertex {
            let turn = match goal.into {
                None => Some(0.0),
                Some(into) if into == arrived => Some(0.0),
                Some(into) if into == arrived.reverse() => None,
                Some(_) => Some(params.bend),
            };
            if let Some(turn) = turn {
                push(&mut queue, here + turn + goal.paid, item.state, true);
            }
        }
        for dir in DIRS {
            if dir == arrived.reverse() {
                continue;
            }
            let Some(next) = grid.step(vertex, dir) else {
                continue;
            };
            let mut step = distance(grid.point(vertex), grid.point(next));
            if dir != arrived {
                step += params.bend;
            } else if vertex != start.vertex && taken.crosses(vertex, dir) {
                step += params.crossing;
            }
            let state = next * 4 + dir_index(dir);
            if here + step < cost[state] {
                cost[state] = here + step;
                prev[state] = item.state;
                push(&mut queue, here + step + heuristic(next), state, false);
            }
        }
    }
    None
}

/// The route that reached a goal state, from the tail's point to the head's,
/// with every point that does not turn the route left out.
fn path_of(grid: &Grid, tail: End, head: End, prev: &[usize], last: usize) -> Vec<Point> {
    let mut vertices = vec![last / 4];
    let mut state = last;
    while prev[state] != usize::MAX {
        state = prev[state];
        vertices.push(state / 4);
    }
    vertices.reverse();
    let mut points = vec![tail.at()];
    points.extend(vertices.into_iter().map(|vertex| grid.point(vertex)));
    points.push(head.at());
    simplified(points)
}

/// A route's points with repeated points and points inside a straight run
/// left out.
pub fn simplified(points: Vec<Point>) -> Vec<Point> {
    let mut kept: Vec<Point> = Vec::with_capacity(points.len());
    for point in points {
        if let Some(last) = kept.last()
            && (last.x - point.x).abs() < SAME
            && (last.y - point.y).abs() < SAME
        {
            continue;
        }
        if kept.len() >= 2 {
            let (a, b) = (kept[kept.len() - 2], kept[kept.len() - 1]);
            let along_x = (a.y - b.y).abs() < SAME && (b.y - point.y).abs() < SAME;
            let along_y = (a.x - b.x).abs() < SAME && (b.x - point.x).abs() < SAME;
            if along_x || along_y {
                kept.pop();
            }
        }
        kept.push(point);
    }
    kept
}
