//! The grid routes run on: every coordinate that bounds an obstacle's buffer
//! or that an end stands on, in both axes. A shortest route with the fewest
//! turns can always run on these coordinates, because a route only needs to
//! turn where it passes the edge of a buffer or meets an end; [W09] §3 builds
//! the same choice of coordinates as its orthogonal visibility graph.

use crate::{Dir, End, Point, Rect, Scene};

/// Two coordinates closer than this are one.
pub(crate) const SAME: f64 = 1e-6;

/// Whether two points are one point.
pub(crate) fn close(a: Point, b: Point) -> bool {
    (a.x - b.x).abs() < SAME && (a.y - b.y).abs() < SAME
}

/// The sign of a difference: 1, -1, or 0 within [`SAME`].
pub(crate) fn sign(value: f64) -> i32 {
    if value > SAME {
        1
    } else if value < -SAME {
        -1
    } else {
        0
    }
}

/// A buffered obstacle: the space no route may enter.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Buffer {
    pub left: f64,
    pub right: f64,
    pub top: f64,
    pub bottom: f64,
}

impl Buffer {
    /// The obstacle grown by the clearance on every side.
    pub(crate) fn around(rect: &Rect, clearance: f64) -> Buffer {
        Buffer {
            left: rect.x - clearance,
            right: rect.x + rect.width + clearance,
            top: rect.y - clearance,
            bottom: rect.y + rect.height + clearance,
        }
    }

    /// Whether a point lies strictly inside, not on the edge.
    pub(crate) fn holds(&self, point: Point) -> bool {
        self.spans_x(point.x) && self.spans_y(point.y)
    }

    /// Whether an x lies strictly between the left and right edges.
    fn spans_x(&self, x: f64) -> bool {
        x > self.left + SAME && x < self.right - SAME
    }

    /// Whether a y lies strictly between the top and bottom edges.
    fn spans_y(&self, y: f64) -> bool {
        y > self.top + SAME && y < self.bottom - SAME
    }
}

/// Mark the vertices and the edges to their right in one row of the grid
/// that lie inside a buffer the row runs through.
fn block_row(xs: &[f64], buffer: &Buffer, free: &mut [bool], across: &mut [bool]) {
    for (i, &x) in xs.iter().enumerate() {
        if buffer.spans_x(x) {
            free[i] = false;
        }
        if let Some(&next) = xs.get(i + 1)
            && buffer.spans_x(f64::midpoint(x, next))
        {
            across[i] = false;
        }
    }
}

/// Where a pin's route leaves its own obstacle's buffer, going the way the
/// pin leaves.
pub(crate) fn stub_end(buffer: &Buffer, at: Point, leaves: Dir) -> Point {
    match leaves {
        Dir::Up => Point {
            x: at.x,
            y: buffer.top,
        },
        Dir::Down => Point {
            x: at.x,
            y: buffer.bottom,
        },
        Dir::Left => Point {
            x: buffer.left,
            y: at.y,
        },
        Dir::Right => Point {
            x: buffer.right,
            y: at.y,
        },
    }
}

/// The grid of one scene, with which vertices and edges lie in free space.
pub(crate) struct Grid {
    pub xs: Vec<f64>,
    pub ys: Vec<f64>,
    /// Every obstacle's buffer, by obstacle index.
    pub buffers: Vec<Buffer>,
    /// The buffers that block routes: those that hold no free end.
    pub blocking: Vec<Buffer>,
    free: Vec<bool>,
    /// Whether the edge from (i, j) to (i + 1, j) is free.
    across: Vec<bool>,
    /// Whether the edge from (i, j) to (i, j + 1) is free.
    down: Vec<bool>,
}

/// Coordinates sorted, with near-equal ones made one.
fn sorted(mut values: Vec<f64>) -> Vec<f64> {
    values.sort_by(f64::total_cmp);
    values.dedup_by(|later, earlier| (*later - *earlier).abs() < SAME);
    values
}

impl Grid {
    /// The grid of a scene, the buffers named in `exempt` not blocking.
    pub(crate) fn new(scene: &Scene, exempt: &[usize]) -> Grid {
        let clearance = scene.params.clearance;
        let buffers: Vec<Buffer> = scene
            .obstacles
            .iter()
            .map(|rect| Buffer::around(rect, clearance))
            .collect();
        let free_ends: Vec<Point> = scene
            .connectors
            .iter()
            .flat_map(|(tail, head)| [tail, head])
            .filter_map(|end| match end {
                End::Free { at } => Some(*at),
                End::Pin { .. } => None,
            })
            .collect();
        // A free end inside a buffer could never be reached, so that buffer
        // does not block: a free end is reached from any side.
        let blocking: Vec<Buffer> = buffers
            .iter()
            .enumerate()
            .filter(|(index, buffer)| {
                !exempt.contains(index) && !free_ends.iter().any(|at| buffer.holds(*at))
            })
            .map(|(_, buffer)| *buffer)
            .collect();
        let mut xs = Vec::new();
        let mut ys = Vec::new();
        for buffer in &buffers {
            xs.extend([buffer.left, buffer.right]);
            ys.extend([buffer.top, buffer.bottom]);
        }
        for end in scene
            .connectors
            .iter()
            .flat_map(|(tail, head)| [tail, head])
        {
            let at = end.at();
            xs.push(at.x);
            ys.push(at.y);
            if let End::Pin {
                obstacle, leaves, ..
            } = *end
            {
                let stub = stub_end(&buffers[obstacle], at, leaves);
                xs.push(stub.x);
                ys.push(stub.y);
            }
        }
        let xs = sorted(xs);
        let ys = sorted(ys);
        let (width, height) = (xs.len(), ys.len());
        let mut grid = Grid {
            free: vec![true; width * height],
            across: vec![true; width * height],
            down: vec![true; width * height],
            xs,
            ys,
            buffers,
            blocking,
        };
        grid.block_rows();
        grid.block_columns();
        grid
    }

    /// Mark the vertices and horizontal edges that lie inside a buffer.
    fn block_rows(&mut self) {
        let width = self.xs.len();
        for (j, &y) in self.ys.iter().enumerate() {
            let row = j * width..(j + 1) * width;
            for buffer in self.blocking.iter().filter(|buffer| buffer.spans_y(y)) {
                let (free, across) = (&mut self.free[row.clone()], &mut self.across[row.clone()]);
                block_row(&self.xs, buffer, free, across);
            }
        }
    }

    /// Mark the vertical edges that lie inside a buffer.
    fn block_columns(&mut self) {
        let width = self.xs.len();
        let height = self.ys.len();
        for (i, &x) in self.xs.iter().enumerate() {
            for buffer in self.blocking.iter().filter(|buffer| buffer.spans_x(x)) {
                for j in 0..height.saturating_sub(1) {
                    if buffer.spans_y(f64::midpoint(self.ys[j], self.ys[j + 1])) {
                        self.down[j * width + i] = false;
                    }
                }
            }
        }
    }

    /// The column of an x coordinate, if the grid has it.
    pub(crate) fn column(&self, x: f64) -> Option<usize> {
        index_of(&self.xs, x)
    }

    /// The row of a y coordinate, if the grid has it.
    pub(crate) fn row(&self, y: f64) -> Option<usize> {
        index_of(&self.ys, y)
    }

    /// The vertex of a point, if it stands on the grid in free space.
    pub(crate) fn vertex(&self, at: Point) -> Option<usize> {
        let (i, j) = (self.column(at.x)?, self.row(at.y)?);
        let vertex = j * self.xs.len() + i;
        self.free[vertex].then_some(vertex)
    }

    /// How many vertices the grid has.
    pub(crate) fn len(&self) -> usize {
        self.xs.len() * self.ys.len()
    }

    /// Where a vertex stands.
    pub(crate) fn point(&self, vertex: usize) -> Point {
        let width = self.xs.len();
        Point {
            x: self.xs[vertex % width],
            y: self.ys[vertex / width],
        }
    }

    /// The free neighbour of a vertex one step in a direction, if any.
    pub(crate) fn step(&self, vertex: usize, dir: Dir) -> Option<usize> {
        let width = self.xs.len();
        let (i, j) = (vertex % width, vertex / width);
        let next = match dir {
            Dir::Right if i + 1 < width && self.across[vertex] => vertex + 1,
            Dir::Left if i > 0 && self.across[vertex - 1] => vertex - 1,
            Dir::Down if j + 1 < self.ys.len() && self.down[vertex] => vertex + width,
            Dir::Up if j > 0 && self.down[vertex - width] => vertex - width,
            _ => return None,
        };
        self.free[next].then_some(next)
    }
}

/// The index of a coordinate in sorted coordinates, within [`SAME`].
fn index_of(values: &[f64], value: f64) -> Option<usize> {
    let at = values.partition_point(|&v| v < value - SAME);
    (at < values.len() && (values[at] - value).abs() < SAME).then_some(at)
}
