//! A* over grid vertices and arrival directions. Parallel lane reuse is the
//! first cost. Distance, bends and perpendicular crossings break ties.
//! Fixed pins reserve an exit before earlier paths can occupy it.

use std::collections::{BTreeMap, VecDeque};

use crate::grid::{Grid, SAME, close, stub_end};
use crate::{Connector, Dir, End, Point, Scene};

/// Every direction, each at the index of its discriminant.
const DIRS: [Dir; 4] = [Dir::Up, Dir::Right, Dir::Down, Dir::Left];

pub(crate) use crate::reservations::Taken;

/// Encode the exact total order of two floating-point costs as one integer.
fn priority(estimate: (f64, f64)) -> u128 {
    let ordered = |value: f64| {
        let bits = value.to_bits();
        if bits >> 63 == 0 {
            bits ^ (1 << 63)
        } else {
            !bits
        }
    };
    (u128::from(ordered(estimate.0)) << 64) | u128::from(ordered(estimate.1))
}

struct Item {
    priority: u128,
    state: usize,
    done: bool,
}

/// A monotone queue groups estimates by the highest bit that differs from
/// the last estimate. Equal estimates remain FIFO, as in the former heap.
/// Floating-point roundoff can lower an estimate. Those entries use an
/// ordered queue below the last bucket, without rebuilding the other buckets.
struct Queue {
    buckets: Vec<VecDeque<Item>>,
    last: u128,
    occupied: u128,
    earlier: BTreeMap<u128, VecDeque<Item>>,
}

impl Default for Queue {
    fn default() -> Self {
        Self {
            buckets: (0..129).map(|_| VecDeque::new()).collect(),
            last: 0,
            occupied: 0,
            earlier: BTreeMap::new(),
        }
    }
}

impl Queue {
    fn insert(&mut self, item: Item) {
        let bucket = (128 - (item.priority ^ self.last).leading_zeros()) as usize;
        if bucket > 0 {
            self.occupied |= 1 << (bucket - 1);
        }
        self.buckets[bucket].push_back(item);
    }

    fn push(&mut self, estimate: (f64, f64), state: usize, done: bool) {
        let priority = priority(estimate);
        if priority < self.last {
            self.earlier.entry(priority).or_default().push_back(Item {
                priority,
                state,
                done,
            });
            return;
        }
        self.insert(Item {
            priority,
            state,
            done,
        });
    }

    fn pop(&mut self) -> Option<Item> {
        if let Some(mut first) = self.earlier.first_entry() {
            let item = first.get_mut().pop_front();
            if first.get().is_empty() {
                first.remove_entry();
            }
            return item;
        }
        if self.buckets[0].is_empty() {
            if self.occupied == 0 {
                return None;
            }
            let bucket = self.occupied.trailing_zeros() as usize + 1;
            self.last = self.buckets[bucket]
                .iter()
                .map(|item| item.priority)
                .min()?;
            self.occupied &= !(1 << (bucket - 1));
            while let Some(item) = self.buckets[bucket].pop_front() {
                self.insert(item);
            }
        }
        self.buckets[0].pop_front()
    }
}

/// Search storage shared by the paths of one scene.
/// A new grid changes indices, so reset every state the preceding search touched.
#[derive(Default)]
pub(crate) struct Memory {
    cost: Vec<(f64, f64)>,
    prev: Vec<usize>,
    finished: Vec<bool>,
    touched: Vec<usize>,
}

const UNREACHED: (f64, f64) = (f64::INFINITY, f64::INFINITY);

impl Memory {
    fn prepare(&mut self, states: usize) {
        for state in self.touched.drain(..) {
            self.cost[state] = UNREACHED;
            self.prev[state] = usize::MAX;
            self.finished[state] = false;
        }
        if states > self.cost.len() {
            self.cost.resize(states, UNREACHED);
            self.prev.resize(states, usize::MAX);
            self.finished.resize(states, false);
        }
    }

    fn reach(&mut self, state: usize, cost: (f64, f64)) {
        if self.cost[state] == UNREACHED {
            self.touched.push(state);
        }
        self.cost[state] = cost;
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

/// Where a route starts searching from an end: a free end's own vertex in any
/// direction, or a pin's stub end, leaving its obstacle the pin's way and paying
/// for the stub.
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

/// Where a route ends searching at an end: a free end's own vertex, or a pin's
/// stub end, which the route must enter facing the obstacle and pay the stub to.
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

/// The distance between two points along the grid's axes.
fn distance(a: Point, b: Point) -> f64 {
    (a.x - b.x).abs() + (a.y - b.y).abs()
}

impl Goal {
    /// What turning into the goal costs a route that arrived in a direction,
    /// or nothing when the route would have to turn back to enter it.
    fn turn(&self, arrived: Dir, bend: f64) -> Option<f64> {
        match self.into {
            None => Some(0.0),
            Some(into) if into == arrived => Some(0.0),
            Some(into) if into == arrived.reverse() => None,
            Some(_) => Some(bend),
        }
    }
}

/// One connector's search: the cheapest cost found to each state and the state
/// it came from, and the queue of states still to settle, ties broken by the
/// order they were pushed in.
struct Search<'s> {
    grid: &'s Grid,
    scene: &'s Scene,
    taken: &'s Taken,
    reserved: Vec<u8>,
    start: Start,
    target: Point,
    memory: &'s mut Memory,
    queue: Queue,
}

impl Search<'_> {
    /// Queue a state at an estimate, behind every state queued before it at the same estimate.
    fn push(&mut self, estimate: (f64, f64), state: usize, done: bool) {
        self.queue.push(estimate, state, done);
    }

    /// The length still to go from a vertex, as the crow flies on the grid.
    fn heuristic(&self, vertex: usize) -> f64 {
        distance(self.grid.point(vertex), self.target)
    }

    /// Queue every direction the route may set off in from its start.
    fn set_off(&mut self) {
        let (vertex, paid) = (self.start.vertex, self.start.paid);
        for index in 0..self.start.dirs.len() {
            let state = vertex * 4 + self.start.dirs[index] as usize;
            self.memory.reach(state, (0.0, paid));
            self.push((0.0, paid + self.heuristic(vertex)), state, false);
        }
    }

    /// What one step from a vertex in a direction costs a route that arrived
    /// in another: its length, a turn, or a crossing of an earlier route.
    fn step_cost(&self, vertex: usize, length: f64, dir: Dir, arrived: Dir) -> f64 {
        if dir != arrived {
            return length + self.scene.params.bend;
        }
        if vertex != self.start.vertex && self.taken.crosses(vertex, dir) {
            return length + self.scene.params.crossing;
        }
        length
    }

    /// Queue every state one step on from a settled one that it reaches more
    /// cheaply than any route before.
    fn step_on(&mut self, state: usize, here: (f64, f64)) {
        let (vertex, arrived) = (state / 4, DIRS[state % 4]);
        let at = self.grid.point(vertex);
        for dir in DIRS {
            let next = self
                .grid
                .step(vertex, dir)
                .filter(|_| dir != arrived.reverse());
            let Some(next) = next else {
                continue;
            };
            let point = self.grid.point(next);
            let length = distance(at, point);
            let bit = if dir.horizontal() { 1 } else { 2 };
            let reused = if self.reserved[vertex.min(next)] & bit != 0 {
                length
            } else {
                0.0
            };
            let reached = (
                here.0 + reused,
                here.1 + self.step_cost(vertex, length, dir, arrived),
            );
            let onward = next * 4 + dir as usize;
            if reached < self.memory.cost[onward] {
                self.memory.reach(onward, reached);
                self.memory.prev[onward] = state;
                self.push(
                    (reached.0, reached.1 + distance(point, self.target)),
                    onward,
                    false,
                );
            }
        }
    }
}

/// The cheapest route of one connector, its points simplified to its turns,
/// or nothing when no route through free space reaches its head.
pub(crate) fn shortest(
    grid: &Grid,
    scene: &Scene,
    connector: &Connector,
    taken: &Taken,
    memory: &mut Memory,
) -> Option<Vec<Point>> {
    limited(grid, scene, connector, taken, memory, usize::MAX)
}

/// The same search with a deterministic bound on settled states.
pub(crate) fn limited(
    grid: &Grid,
    scene: &Scene,
    connector: &Connector,
    taken: &Taken,
    memory: &mut Memory,
    states: usize,
) -> Option<Vec<Point>> {
    let (tail, head) = connector.ends;
    let start = start_of(grid, tail)?;
    let goal = goal_of(grid, head)?;
    memory.prepare(grid.len() * 4);
    let mut search = Search {
        grid,
        scene,
        taken,
        reserved: taken.reserved(grid, connector, scene),
        start,
        target: grid.point(goal.vertex),
        memory,
        queue: Queue::default(),
    };
    search.set_off();
    let mut expanded = 0;
    while let Some(item) = search.queue.pop() {
        if item.done {
            return Some(path_of(grid, tail, head, &search.memory.prev, item.state));
        }
        if !search.memory.finished[item.state] {
            if expanded == states {
                return None;
            }
            expanded += 1;
            search.memory.finished[item.state] = true;
            let here = search.memory.cost[item.state];
            let turn = (item.state / 4 == goal.vertex)
                .then(|| goal.turn(DIRS[item.state % 4], scene.params.bend))
                .flatten();
            if let Some(turn) = turn {
                search.push((here.0, here.1 + turn + goal.paid), item.state, true);
            }
            search.step_on(item.state, here);
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
pub(crate) fn simplified(points: Vec<Point>) -> Vec<Point> {
    let mut kept: Vec<Point> = Vec::with_capacity(points.len());
    for point in points {
        if kept.last().is_some_and(|last| close(*last, point)) {
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

#[cfg(test)]
mod queue_tests {
    use super::Queue;

    #[test]
    fn estimates_keep_total_order_and_fifo_ties_even_after_a_decrease() {
        let mut queue = Queue::default();
        let mut expected: Vec<((f64, f64), usize, bool)> = Vec::new();
        for state in 0..512 {
            let secondary = ((state * 7 % 19) as f64).to_bits() + (state % 3) as u64;
            let estimate = ((state % 5) as f64 * 16.0, f64::from_bits(secondary));
            let done = state % 11 == 0;
            queue.push(estimate, state, done);
            expected.push((estimate, state, done));
            expected.sort_by(|a, b| {
                a.0.0
                    .total_cmp(&b.0.0)
                    .then(a.0.1.total_cmp(&b.0.1))
                    .then(a.1.cmp(&b.1))
            });
            if state % 3 == 0 {
                let (_, state, done) = expected.remove(0);
                let actual = queue.pop().expect("the queue holds the inserted states");
                assert_eq!((actual.state, actual.done), (state, done));
            }
        }
        let actual: Vec<_> = std::iter::from_fn(|| queue.pop())
            .map(|item| (item.state, item.done))
            .collect();
        let expected: Vec<_> = expected
            .into_iter()
            .map(|(_, state, done)| (state, done))
            .collect();
        assert_eq!(actual, expected);
    }
}
