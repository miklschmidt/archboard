//! The grid of free space around obstacle buffers and fixed ports. Each search
//! also uses the coordinates of earlier paths and one lane beside each coordinate.
//! This lets another path take the next lane without moving an existing route.

use crate::{Dir, End, Point, Rect, Scene};

/// Two coordinates closer than this are one.
pub(crate) const SAME: f64 = 1e-6;

/// Whether two points are one point.
pub(crate) fn close(a: Point, b: Point) -> bool {
    (a.x - b.x).abs() < SAME && (a.y - b.y).abs() < SAME
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
    /// Refuse an oversized grid before allocating its vertices. A window never drops an obstacle.
    pub(crate) fn bounded(
        scene: &Scene,
        routes: &[Option<Vec<Point>>],
        window: Rect,
        coordinates: usize,
    ) -> Option<Grid> {
        let clearance = scene.params.clearance;
        let buffers: Vec<Buffer> = scene
            .obstacles
            .iter()
            .map(|rect| Buffer::around(rect, clearance))
            .collect();
        let (xs, ys) = coordinates_of(scene, &buffers, routes, window, coordinates)?;
        let (width, height) = (xs.len(), ys.len());
        let mut grid = Grid {
            free: vec![true; width * height],
            across: vec![true; width * height],
            down: vec![true; width * height],
            xs,
            ys,
            buffers,
        };
        grid.block_buffers();
        Some(grid)
    }

    /// Mark each obstacle in contiguous row slices. Edge midpoints keep the
    /// same strict buffer predicate as vertices, including its tolerance.
    fn block_buffers(&mut self) {
        let midpoints = |coordinates: &[f64]| -> Vec<f64> {
            coordinates
                .windows(2)
                .map(|pair| f64::midpoint(pair[0], pair[1]))
                .collect()
        };
        let (across, down) = (midpoints(&self.xs), midpoints(&self.ys));
        let width = self.xs.len();
        for buffer in &self.buffers {
            let left = self.xs.partition_point(|&x| x <= buffer.left + SAME);
            let right = self
                .xs
                .partition_point(|&x| x < buffer.right - SAME)
                .max(left);
            let top = self.ys.partition_point(|&y| y <= buffer.top + SAME);
            let bottom = self.ys.partition_point(|&y| y < buffer.bottom - SAME);
            let edge_left = across.partition_point(|&x| x <= buffer.left + SAME);
            let edge_right = across
                .partition_point(|&x| x < buffer.right - SAME)
                .max(edge_left);
            for j in top..bottom {
                self.free[j * width + left..j * width + right].fill(false);
                self.across[j * width + edge_left..j * width + edge_right].fill(false);
            }
            let edge_top = down.partition_point(|&y| y <= buffer.top + SAME);
            let edge_bottom = down.partition_point(|&y| y < buffer.bottom - SAME);
            for j in edge_top..edge_bottom {
                self.down[j * width + left..j * width + right].fill(false);
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
    let at = values.partition_point(|&v| v < value && value - v >= SAME);
    (at < values.len() && (values[at] - value).abs() < SAME).then_some(at)
}

/// Build bounded axes before allocating any grid vertices.
fn coordinates_of(
    scene: &Scene,
    buffers: &[Buffer],
    routes: &[Option<Vec<Point>>],
    window: Rect,
    limit: usize,
) -> Option<(Vec<f64>, Vec<f64>)> {
    let mut xs = Vec::new();
    let mut ys = Vec::new();
    for buffer in buffers {
        xs.extend([buffer.left, buffer.right]);
        ys.extend([buffer.top, buffer.bottom]);
    }
    for end in scene
        .connectors
        .iter()
        .flat_map(|connector| [&connector.ends.0, &connector.ends.1])
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
    for point in routes.iter().flatten().flatten() {
        xs.push(point.x);
        ys.push(point.y);
    }
    let (xs, ys) = bounded_axes(xs, ys, scene, window);
    let xs = sorted(xs);
    let ys = sorted(ys);
    if xs.len() > limit || ys.len() > limit {
        return None;
    }
    Some((xs, ys))
}

fn bounded_axes(
    mut xs: Vec<f64>,
    mut ys: Vec<f64>,
    scene: &Scene,
    window: Rect,
) -> (Vec<f64>, Vec<f64>) {
    let lane = scene.params.lane;
    xs = xs
        .into_iter()
        .flat_map(|x| [x - lane, x, x + lane])
        .collect();
    ys = ys
        .into_iter()
        .flat_map(|y| [y - lane, y, y + lane])
        .collect();
    if let Some(low) = scene.minimum {
        xs.retain(|&x| x >= low.x - SAME);
        xs.push(low.x);
        ys.retain(|&y| y >= low.y - SAME);
        ys.push(low.y);
    }
    xs.retain(|&x| x >= window.x && x <= window.x + window.width);
    ys.retain(|&y| y >= window.y && y <= window.y + window.height);
    xs.extend([window.x, window.x + window.width]);
    ys.extend([window.y, window.y + window.height]);
    (xs, ys)
}
