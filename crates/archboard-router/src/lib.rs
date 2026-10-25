//! Orthogonal connector routing around rectangular obstacles (ADR 0057).
//!
//! Written from the published algorithms, not from any existing router's
//! source:
//!
//! - [W09] M. Wybrow, K. Marriott and P. J. Stuckey, "Orthogonal Connector
//!   Routing", Graph Drawing 2009, LNCS 5849, pp. 219-231: the path search
//!   with bend penalties and the nudging of shared segments.
//! - [W12] M. Wybrow, K. Marriott and P. J. Stuckey, "Orthogonal Hyperedge
//!   Routing", Diagrams 2012: connectors that share an end run as one line
//!   until they part.
//! - [D05] T. Dwyer, K. Marriott and P. J. Stuckey, "Fast Node Overlap
//!   Removal", Graph Drawing 2005: the separation-constraint solver (VPSC).
//!
//! A route never throws. A connector with no route through free space is
//! answered [`Route::Unroutable`], and the caller decides what to draw.
//! Every tie is broken by input order, so the same scene gives the same
//! routes on every platform.

#![forbid(unsafe_code)]

mod grid;
mod nudge;
mod order;
mod search;
mod vpsc;

/// A point in diagram units.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// An axis-aligned rectangle: its top-left corner and its size.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A direction a route runs in, or the way a pin leaves its obstacle.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Dir {
    Up,
    Right,
    Down,
    Left,
}

impl Dir {
    /// The direction back the way this one came.
    pub fn reverse(self) -> Dir {
        match self {
            Dir::Up => Dir::Down,
            Dir::Down => Dir::Up,
            Dir::Left => Dir::Right,
            Dir::Right => Dir::Left,
        }
    }

    /// Whether this direction runs along the x axis.
    pub fn horizontal(self) -> bool {
        matches!(self, Dir::Left | Dir::Right)
    }
}

/// One end of a connector.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum End {
    /// A point on, or inside, one obstacle, which the route leaves in one
    /// direction until it is clear of that obstacle's buffer.
    Pin {
        obstacle: usize,
        at: Point,
        leaves: Dir,
    },
    /// A point the route reaches from any side.
    Free { at: Point },
}

impl End {
    /// Where the end stands.
    pub fn at(&self) -> Point {
        match *self {
            End::Pin { at, .. } | End::Free { at } => at,
        }
    }
}

/// What a route pays for and how far it keeps from things.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Params {
    /// How far a route keeps from every obstacle it passes.
    pub clearance: f64,
    /// How far apart nudging puts routes that would run on one line.
    pub lane: f64,
    /// What a route pays for each turn, in diagram units of length.
    pub bend: f64,
    /// What a route pays for crossing a route found before it.
    pub crossing: f64,
}

/// Everything one routing call reads.
#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub obstacles: Vec<Rect>,
    /// Each connector's two ends, from its tail to its head.
    pub connectors: Vec<(End, End)>,
    pub params: Params,
}

/// One connector's answer.
#[derive(Clone, Debug, PartialEq)]
pub enum Route {
    /// The route's points, from its tail to its head, each run horizontal or
    /// vertical.
    Routed(Vec<Point>),
    /// No route through free space reaches the head.
    Unroutable,
}

/// The buffers of other obstacles that a pin's route starts inside: where it
/// leaves its own obstacle's buffer lies in theirs. The route may cross
/// them, or it could never start.
fn started_inside(buffers: &[grid::Buffer], ends: [End; 2]) -> Vec<usize> {
    let mut inside = Vec::new();
    for end in ends {
        let End::Pin {
            obstacle,
            at,
            leaves,
        } = end
        else {
            continue;
        };
        let stub = grid::stub_end(&buffers[obstacle], at, leaves);
        inside.extend(
            (0..buffers.len()).filter(|&other| other != obstacle && buffers[other].holds(stub)),
        );
    }
    inside.sort_unstable();
    inside.dedup();
    inside
}

/// Route every connector of a scene, in order, then nudge the routes apart.
pub fn route(scene: &Scene) -> Vec<Route> {
    let grid = grid::Grid::new(scene, &[]);
    let mut found: Vec<Option<Vec<Point>>> = Vec::with_capacity(scene.connectors.len());
    let mut taken = search::Taken::new(&grid);
    for (tail, head) in &scene.connectors {
        let inside = started_inside(&grid.buffers, [*tail, *head]);
        // The grid's coordinates do not depend on what blocks, so `taken`
        // reads the same vertices on either grid.
        let own = (!inside.is_empty()).then(|| grid::Grid::new(scene, &inside));
        let path = search::shortest(own.as_ref().unwrap_or(&grid), scene, *tail, *head, &taken);
        if let Some(points) = &path {
            taken.add(&grid, points);
        }
        found.push(path);
    }
    let nudged = nudge::nudge(scene, &grid.buffers, &found);
    nudged
        .into_iter()
        .map(|points| match points {
            Some(points) => Route::Routed(points),
            None => Route::Unroutable,
        })
        .collect()
}

#[cfg(test)]
mod tests;
