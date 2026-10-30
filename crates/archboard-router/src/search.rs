//! A* over grid vertices and arrival directions. Parallel lane reuse is the
//! first cost. Distance, bends and perpendicular crossings break ties.
//! Fixed pins reserve an exit before earlier paths can occupy it.

use std::cmp::Ordering;
use std::collections::BinaryHeap;

use crate::grid::{Grid, SAME, close, stub_end};
use crate::{Connector, Dir, End, Point, Scene};

/// Every direction, each at the index of its discriminant.
const DIRS: [Dir; 4] = [Dir::Up, Dir::Right, Dir::Down, Dir::Left];

/// Which vertices earlier routes run straight through, by axis.
pub(crate) struct Taken {
    /// Bit 1: a route runs straight through across; bit 2: down.
    through: Vec<u8>,
    routes: Vec<TakenRoute>,
}

/// One earlier path and the semantic ends that its complete bundle preserves.
struct TakenRoute {
    points: Vec<Point>,
    subjects: (Option<usize>, Option<usize>),
}

impl Taken {
    /// Nothing taken yet on any vertex of a grid.
    pub(crate) fn new(grid: &Grid) -> Taken {
        Taken {
            through: vec![0; grid.len()],
            routes: Vec::new(),
        }
    }

    /// Mark where a route runs straight through.
    pub(crate) fn add(
        &mut self,
        grid: &Grid,
        points: &[Point],
        subjects: (Option<usize>, Option<usize>),
    ) {
        self.routes.push(TakenRoute {
            points: points.to_vec(),
            subjects,
        });
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

    /// The parallel edges reserved by routes with different original ends.
    fn reserved(&self, grid: &Grid, connector: &Connector, scene: &Scene) -> Vec<u8> {
        let lane = scene.params.lane;
        let mut edges = vec![0; grid.len()];
        reserve_pins(grid, &mut edges, connector, scene);
        for route in &self.routes {
            if shares(route.subjects, connector.subjects) {
                continue;
            }
            for pair in route.points.windows(2) {
                reserve_run(grid, &mut edges, pair[0], pair[1], lane);
            }
        }
        edges
    }

    /// Whether moving through a vertex in a direction would cross a route that already runs straight through it the other way.
    fn crosses(&self, vertex: usize, dir: Dir) -> bool {
        let other = if dir.horizontal() { 2 } else { 1 };
        self.through[vertex] & other != 0
    }
}

/// A pin's fixed prefix and one lane of room beyond its turn.
fn protected_pin(grid: &Grid, end: End, lane: f64) -> Option<(Point, Point)> {
    let End::Pin {
        obstacle,
        at,
        leaves,
    } = end
    else {
        return None;
    };
    let mut stub = stub_end(&grid.buffers[obstacle], at, leaves);
    match leaves {
        Dir::Up => stub.y -= lane,
        Dir::Right => stub.x += lane,
        Dir::Down => stub.y += lane,
        Dir::Left => stub.x -= lane,
    }
    Some((at, stub))
}

/// Leave room for later pins before an earlier route occupies their exits.
fn reserve_pins(grid: &Grid, edges: &mut [u8], connector: &Connector, scene: &Scene) {
    for (at, stub) in scene
        .connectors
        .iter()
        .filter(|other| !shares(other.subjects, connector.subjects))
        .flat_map(|other| [other.ends.0, other.ends.1])
        .filter_map(|end| protected_pin(grid, end, scene.params.lane))
    {
        reserve_run(grid, edges, at, stub, scene.params.lane);
    }
}

/// Whether two connectors preserve one original end across their whole bundle.
fn shares(one: (Option<usize>, Option<usize>), other: (Option<usize>, Option<usize>)) -> bool {
    one.0.is_some() && one.0 == other.0 || one.1.is_some() && one.1 == other.1
}

/// Reserve parallel grid edges within a lane of one earlier run.
fn reserve_run(grid: &Grid, edges: &mut [u8], a: Point, b: Point, lane: f64) {
    let horizontal = (a.y - b.y).abs() < SAME;
    let (along, across, low, high, at, bit) = if horizontal {
        (&grid.xs, &grid.ys, a.x.min(b.x), a.x.max(b.x), a.y, 1)
    } else {
        (&grid.ys, &grid.xs, a.y.min(b.y), a.y.max(b.y), a.x, 2)
    };
    let start = along
        .partition_point(|&x| x <= low + SAME)
        .saturating_sub(1);
    let end = along
        .partition_point(|&x| x < high - SAME)
        .min(along.len().saturating_sub(1));
    let near = across.partition_point(|&x| x <= at - lane + SAME);
    let far = across.partition_point(|&x| x < at + lane - SAME);
    for side in near..far {
        for step in start..end {
            let vertex = if horizontal {
                side * grid.xs.len() + step
            } else {
                step * grid.xs.len() + side
            };
            edges[vertex] |= bit;
        }
    }
}

/// One item of the search's queue: a state, or the finished route through
/// the goal state that it names.
#[derive(Clone, Copy)]
struct Item {
    estimate: (f64, f64),
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
            .0
            .total_cmp(&self.estimate.0)
            .then(other.estimate.1.total_cmp(&self.estimate.1))
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
    cost: Vec<(f64, f64)>,
    prev: Vec<usize>,
    queue: BinaryHeap<Item>,
    seq: u64,
}

impl Search<'_> {
    /// Queue a state at an estimate, behind every state queued before it at the same estimate.
    fn push(&mut self, estimate: (f64, f64), state: usize, done: bool) {
        self.queue.push(Item {
            estimate,
            seq: self.seq,
            state,
            done,
        });
        self.seq += 1;
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
            self.cost[state] = (0.0, paid);
            self.push((0.0, paid + self.heuristic(vertex)), state, false);
        }
    }

    /// What one step from a vertex in a direction costs a route that arrived
    /// in another: its length, a turn, or a crossing of an earlier route.
    fn step_cost(&self, vertex: usize, next: usize, dir: Dir, arrived: Dir) -> f64 {
        let length = distance(self.grid.point(vertex), self.grid.point(next));
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
        for dir in DIRS {
            let next = self
                .grid
                .step(vertex, dir)
                .filter(|_| dir != arrived.reverse());
            let Some(next) = next else {
                continue;
            };
            let bit = if dir.horizontal() { 1 } else { 2 };
            let reused = if self.reserved[vertex.min(next)] & bit != 0 {
                distance(self.grid.point(vertex), self.grid.point(next))
            } else {
                0.0
            };
            let reached = (
                here.0 + reused,
                here.1 + self.step_cost(vertex, next, dir, arrived),
            );
            let onward = next * 4 + dir as usize;
            if reached < self.cost[onward] {
                self.cost[onward] = reached;
                self.prev[onward] = state;
                self.push((reached.0, reached.1 + self.heuristic(next)), onward, false);
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
) -> Option<Vec<Point>> {
    let (tail, head) = connector.ends;
    let start = start_of(grid, tail)?;
    let goal = goal_of(grid, head)?;
    let states = grid.len() * 4;
    let mut search = Search {
        grid,
        scene,
        taken,
        reserved: taken.reserved(grid, connector, scene),
        start,
        target: grid.point(goal.vertex),
        cost: vec![(f64::INFINITY, f64::INFINITY); states],
        prev: vec![usize::MAX; states],
        queue: BinaryHeap::new(),
        seq: 0,
    };
    search.set_off();
    let mut finished = vec![false; states];
    while let Some(item) = search.queue.pop() {
        if item.done {
            return Some(path_of(grid, tail, head, &search.prev, item.state));
        }
        if !finished[item.state] {
            finished[item.state] = true;
            let here = search.cost[item.state];
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
