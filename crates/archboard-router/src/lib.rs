//! Orthogonal connector routing around rectangular obstacles (ADR 0061).
//!
//! The path search follows \[W09\] M. Wybrow, K. Marriott and P. J. Stuckey,
//! "Orthogonal Connector Routing", Graph Drawing 2009, LNCS 5849, pp. 219-231.
//! It uses A* with direction, length, bend and crossing costs.
//!
//! Earlier paths reserve parallel lanes unless the connectors share a semantic
//! source or target. Fixed pin stubs reserve their exits before any path runs.
//! The search minimizes reused lane length first, then its ordinary cost.
//! No later pass moves a route's bends. Input order breaks every tie.
//!
//! A connector with no path through free space answers [`Route::Unroutable`].
//! The caller decides how to handle that result.

#![forbid(unsafe_code)]

mod grid;
mod search;

/// A point in diagram units.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point {
    /// Distance along the x axis, which grows to the right.
    pub x: f64,
    /// Distance along the y axis, which grows downward.
    pub y: f64,
}

/// An axis-aligned rectangle: its top-left corner and its size.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    /// The left edge.
    pub x: f64,
    /// The top edge.
    pub y: f64,
    /// How wide it is, to the right of `x`.
    pub width: f64,
    /// How tall it is, below `y`.
    pub height: f64,
}

/// A direction a route runs in, or the way a pin leaves its obstacle: up is
/// toward smaller y.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[expect(
    missing_docs,
    reason = "each variant is the compass direction its name says"
)]
pub enum Dir {
    Up,
    Right,
    Down,
    Left,
}

impl Dir {
    /// The direction back the way this one came.
    #[must_use]
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
        /// Index into [`Scene::obstacles`] of the obstacle it sits on.
        obstacle: usize,
        /// Where the end stands, on or inside the obstacle.
        at: Point,
        /// The direction the route runs in as it leaves the obstacle.
        leaves: Dir,
    },
    /// A point the route reaches from any side.
    Free {
        /// Where the end stands.
        at: Point,
    },
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
    /// How far apart unrelated parallel routes reserve their lanes.
    pub lane: f64,
    /// What a route pays for each turn, in diagram units of length.
    pub bend: f64,
    /// What a route pays for crossing a route found before it.
    pub crossing: f64,
}

/// A route's geometric ends and original semantic source and target.
/// Subject numbers identify cards across block boundaries, even when ports coincide.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Connector {
    /// The source-side and target-side points and their attachment directions.
    pub ends: (End, End),
    /// Semantic stroke identities. The caller keeps different original cards distinct.
    /// A label before a branch can refine its source identity. None spans several cards.
    pub subjects: (Option<usize>, Option<usize>),
}

/// Everything one routing call reads.
#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    /// The rectangles routes keep clear of, which a pin names by index.
    pub obstacles: Vec<Rect>,
    /// The least body coordinates. Fixed pin stubs can extend beyond this inset.
    pub minimum: Option<Point>,
    /// Each connector's two ends, from its tail to its head.
    pub connectors: Vec<Connector>,
    /// What routes pay for and how far they keep from things.
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

/// Route each connector in order, with earlier paths and every fixed pin reserved.
pub fn route(scene: &Scene) -> Vec<Route> {
    let mut found: Vec<Option<Vec<Point>>> = Vec::with_capacity(scene.connectors.len());
    for (index, connector) in scene.connectors.iter().enumerate() {
        let (tail, head) = connector.ends;
        let grid = grid::Grid::new(scene, &[], &found);
        let inside = started_inside(&grid.buffers, [tail, head]);
        let own = (!inside.is_empty()).then(|| grid::Grid::new(scene, &inside, &found));
        let mut taken = search::Taken::new(&grid);
        for (previous, path) in scene.connectors[..index].iter().zip(&found) {
            if let Some(points) = path {
                taken.add(&grid, points, previous.subjects);
            }
        }
        let path = search::shortest(own.as_ref().unwrap_or(&grid), scene, connector, &taken);
        found.push(path);
    }
    found
        .into_iter()
        .map(|points| match points {
            Some(points) => Route::Routed(points),
            None => Route::Unroutable,
        })
        .collect()
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod subject_tests;
