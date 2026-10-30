//! Local routing with fixed strokes and deterministic work limits.

use crate::{Connector, End, Point, Rect, Route, Scene, grid, search};

/// Work limits for one local routing window.
#[derive(Clone, Copy, Debug)]
pub struct Limits {
    /// Maximum number of obstacle buffers intersecting the window.
    pub obstacles: usize,
    /// Maximum number of coordinates on either grid axis.
    pub coordinates: usize,
    /// Maximum number of settled search states per connector.
    pub states: usize,
}

/// Route inside a window without moving earlier strokes or omitting an intersecting obstacle.
/// The window perimeter stays available beyond [`Scene::minimum`].
/// Limit exhaustion returns [`Route::Unroutable`] rather than a partial path.
/// Fixed strokes contribute lane and crossing costs, not hard obstacles.
/// The caller must guard fan ownership and clearance around junctions before accepting a path.
pub fn route_bounded(
    scene: &Scene,
    fixed: &[(Connector, Vec<Point>)],
    window: Rect,
    limits: Limits,
) -> Vec<Route> {
    let Some(local) = window_scene(scene, window, limits.obstacles) else {
        return vec![Route::Unroutable; scene.connectors.len()];
    };
    search_local(&local, fixed, window, limits)
}

fn window_scene(scene: &Scene, window: Rect, limit: usize) -> Option<Scene> {
    let mut indices = vec![None; scene.obstacles.len()];
    let mut obstacles = Vec::new();
    for (index, obstacle) in scene.obstacles.iter().enumerate() {
        let b = grid::Buffer::around(obstacle, scene.params.clearance);
        if b.left <= window.x + window.width
            && b.right >= window.x
            && b.top <= window.y + window.height
            && b.bottom >= window.y
        {
            indices[index] = Some(obstacles.len());
            obstacles.push(*obstacle);
        }
    }
    if obstacles.len() > limit {
        return None;
    }
    let end = |end| match end {
        End::Pin {
            obstacle,
            at,
            leaves,
        } => Some(End::Pin {
            obstacle: indices.get(obstacle).copied().flatten()?,
            at,
            leaves,
        }),
        End::Free { at } => Some(End::Free { at }),
    };
    let connectors: Option<Vec<_>> = scene
        .connectors
        .iter()
        .map(|c| {
            Some(Connector {
                ends: (end(c.ends.0)?, end(c.ends.1)?),
                subjects: c.subjects,
            })
        })
        .collect();
    Some(Scene {
        obstacles,
        connectors: connectors?,
        minimum: scene.minimum,
        params: scene.params,
    })
}

fn search_local(
    local: &Scene,
    fixed: &[(Connector, Vec<Point>)],
    window: Rect,
    limits: Limits,
) -> Vec<Route> {
    let mut found = Vec::new();
    let mut memory = search::Memory::default();
    for (index, connector) in local.connectors.iter().enumerate() {
        let Some(grid) = grid::Grid::bounded(local, &[], &found, Some(window), limits.coordinates)
        else {
            found.push(None);
            continue;
        };
        let mut taken = search::Taken::new(&grid);
        for (earlier, points) in fixed {
            taken.add_fixed(&grid, points, earlier.subjects);
        }
        for (earlier, points) in local.connectors[..index].iter().zip(&found) {
            if let Some(points) = points {
                taken.add(&grid, points, earlier.subjects);
            }
        }
        found.push(search::limited(
            &grid,
            local,
            connector,
            &taken,
            &mut memory,
            limits.states,
        ));
    }
    found
        .into_iter()
        .map(|path| path.map_or(Route::Unroutable, Route::Routed))
        .collect()
}
