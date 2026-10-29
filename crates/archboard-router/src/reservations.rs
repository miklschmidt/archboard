//! Fixed pin stubs and accepted strokes reserve parallel lanes and crossing costs.

use crate::grid::{Grid, SAME, stub_end};
use crate::{Connector, Dir, End, Point, Scene};

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

    /// Reserve a stroke that need not lie on the local grid.
    pub(crate) fn add_fixed(
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
            let (a, b) = (pair[0], pair[1]);
            let horizontal = (a.y - b.y).abs() < SAME;
            let (along, across, low, high, at) = if horizontal {
                (&grid.xs, &grid.ys, a.x.min(b.x), a.x.max(b.x), a.y)
            } else {
                (&grid.ys, &grid.xs, a.y.min(b.y), a.y.max(b.y), a.x)
            };
            let side = across.partition_point(|&p| p < at).min(across.len() - 1);
            for step in along.partition_point(|&p| p <= low)..along.partition_point(|&p| p < high) {
                let vertex = if horizontal {
                    side * width + step
                } else {
                    step * width + side
                };
                self.through[vertex] |= if horizontal { 1 } else { 2 };
            }
        }
    }

    /// The parallel edges reserved by routes with different original ends.
    pub(crate) fn reserved(&self, grid: &Grid, connector: &Connector, scene: &Scene) -> Vec<u8> {
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
    pub(crate) fn crosses(&self, vertex: usize, dir: Dir) -> bool {
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
