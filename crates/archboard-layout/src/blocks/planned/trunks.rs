//! Reserve packed-block corridors with templates before bounded local search.

use super::geometry::{clean, crosses_box, length};
use crate::geometry::{Point, Rect, inflate};
use archboard_router::{Connector, Dir, End, Route, Scene};

fn point(p: archboard_router::Point) -> Point {
    Point { x: p.x, y: p.y }
}
fn router_point(p: Point) -> archboard_router::Point {
    archboard_router::Point { x: p.x, y: p.y }
}
fn rect(r: archboard_router::Rect) -> Rect {
    Rect {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
    }
}

fn approach(scene: &Scene, end: End) -> Point {
    let End::Pin {
        obstacle,
        at,
        leaves,
    } = end
    else {
        return point(end.at());
    };
    let r = inflate(rect(scene.obstacles[obstacle]), scene.params.clearance);
    match leaves {
        Dir::Up => Point { x: at.x, y: r.y },
        Dir::Down => Point {
            x: at.x,
            y: r.y + r.height,
        },
        Dir::Left => Point { x: r.x, y: at.y },
        Dir::Right => Point {
            x: r.x + r.width,
            y: at.y,
        },
    }
}

pub(super) fn route(scene: &Scene) -> Vec<Route> {
    let boxes: Vec<_> = scene
        .obstacles
        .iter()
        .map(|&r| inflate(rect(r), scene.params.clearance))
        .collect();
    let mut fixed: Vec<(Connector, Vec<Point>)> = Vec::new();
    let mut result = Vec::new();
    let mut windows = 0;
    for connector in &scene.connectors {
        let a = approach(scene, connector.ends.0);
        let b = approach(scene, connector.ends.1);
        let middles = templates(scene, &boxes, &fixed, a, b);
        let mut best: Option<(f64, Vec<Point>)> = None;
        for middle in middles.into_iter().filter(|middle| {
            !boxes.iter().any(|&r| crosses_box(middle, r))
                && !scene
                    .minimum
                    .is_some_and(|p| middle.iter().any(|q| q.x < p.x || q.y < p.y))
        }) {
            let path = clean(
                std::iter::once(point(connector.ends.0.at()))
                    .chain(middle)
                    .chain([point(connector.ends.1.at())])
                    .collect(),
            );
            let Some(cost) = cost(
                scene,
                &fixed,
                *connector,
                &path,
                best.as_ref().map(|(cost, _)| *cost),
            ) else {
                continue;
            };
            if best
                .as_ref()
                .is_none_or(|(old, _)| cost.total_cmp(old).is_lt())
            {
                best = Some((cost, path));
            }
        }
        let path = best
            .map(|(_, p)| p)
            .or_else(|| bounded(scene, &boxes, &fixed, *connector, a, b, &mut windows));
        match path {
            Some(path) => {
                fixed.push((*connector, path.clone()));
                result.push(Route::Routed(path.into_iter().map(router_point).collect()));
            }
            None => result.push(Route::Unroutable),
        }
    }
    result
}

/// An admissible template's cost, unless its base already loses to the best route.
fn cost(
    scene: &Scene,
    fixed: &[(Connector, Vec<Point>)],
    connector: Connector,
    path: &[Point],
    best: Option<f64>,
) -> Option<f64> {
    let base = length(path) + scene.params.bend * path.len().saturating_sub(2) as f64;
    // Crossing costs are nonnegative. A more expensive base cannot win.
    if scene.params.crossing >= 0.0 && best.is_some_and(|cost| base > cost) {
        return None;
    }
    let good = fixed.iter().all(|(other, p)| {
        let points = p;
        if super::junctions::apart(path, points) {
            return true;
        }
        let source = connector.subjects.0.is_some() && connector.subjects.0 == other.subjects.0;
        let target = connector.subjects.1.is_some() && connector.subjects.1 == other.subjects.1;
        (!(source || target) || super::junctions::sharing(path, points, source, target))
            && super::junctions::ordered(path, points, source || target)
    });
    if !good {
        return None;
    }
    let crossing: usize = fixed
        .iter()
        .map(|(_, p)| super::junctions::crossings(path, p))
        .sum();
    Some(base + scene.params.crossing * crossing as f64)
}

fn templates(
    scene: &Scene,
    boxes: &[Rect],
    fixed: &[(Connector, Vec<Point>)],
    a: Point,
    b: Point,
) -> Vec<Vec<Point>> {
    let mut xs = vec![f64::midpoint(a.x, b.x)];
    let mut ys = vec![f64::midpoint(a.y, b.y)];
    for r in boxes {
        xs.extend([
            r.x - scene.params.lane,
            r.x,
            r.x + r.width,
            r.x + r.width + scene.params.lane,
        ]);
        ys.extend([
            r.y - scene.params.lane,
            r.y,
            r.y + r.height,
            r.y + r.height + scene.params.lane,
        ]);
    }
    for (_, path) in fixed {
        for p in path {
            xs.extend([p.x - scene.params.lane, p.x + scene.params.lane]);
            ys.extend([p.y - scene.params.lane, p.y + scene.params.lane]);
        }
    }
    xs.sort_by(f64::total_cmp);
    xs.dedup();
    ys.sort_by(f64::total_cmp);
    ys.dedup();
    let mut middles = vec![
        vec![a, Point { x: a.x, y: b.y }, b],
        vec![a, Point { x: b.x, y: a.y }, b],
    ];
    for x in xs {
        middles.push(vec![a, Point { x, y: a.y }, Point { x, y: b.y }, b]);
    }
    for y in ys {
        middles.push(vec![a, Point { x: a.x, y }, Point { x: b.x, y }, b]);
    }
    middles
}

fn bounded(
    scene: &Scene,
    boxes: &[Rect],
    fixed: &[(Connector, Vec<Point>)],
    connector: Connector,
    a: Point,
    b: Point,
    windows: &mut usize,
) -> Option<Vec<Point>> {
    if *windows >= 4 {
        return None;
    }
    *windows += 1;
    let mut local = scene.clone();
    local.connectors = vec![connector];
    let x = boxes.iter().map(|r| r.x).fold(a.x.min(b.x), f64::min) - 32.0;
    let y = boxes.iter().map(|r| r.y).fold(a.y.min(b.y), f64::min) - 32.0;
    let right = boxes
        .iter()
        .map(|r| r.x + r.width)
        .fold(a.x.max(b.x), f64::max)
        + 32.0;
    let bottom = boxes
        .iter()
        .map(|r| r.y + r.height)
        .fold(a.y.max(b.y), f64::max)
        + 32.0;
    let fixed: Vec<_> = fixed
        .iter()
        .map(|(connector, path)| (*connector, path.iter().copied().map(router_point).collect()))
        .collect();
    match archboard_router::route_bounded(
        &local,
        &fixed,
        archboard_router::Rect {
            x,
            y,
            width: right - x,
            height: bottom - y,
        },
        archboard_router::Limits {
            obstacles: 128,
            coordinates: 192,
            states: 32768,
        },
    )
    .into_iter()
    .next()?
    {
        Route::Routed(points) => Some(points.into_iter().map(point).collect()),
        Route::Unroutable => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_cost_detours_keep_the_first_template() {
        let scene = Scene {
            obstacles: vec![archboard_router::Rect {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
            }],
            connectors: vec![Connector {
                ends: (
                    End::Free {
                        at: archboard_router::Point { x: -50.0, y: 50.0 },
                    },
                    End::Free {
                        at: archboard_router::Point { x: 150.0, y: 50.0 },
                    },
                ),
                subjects: (None, None),
            }],
            minimum: None,
            params: archboard_router::Params {
                clearance: 0.0,
                lane: 16.0,
                bend: 60.0,
                crossing: 300.0,
            },
        };
        let routes = route(&scene);
        let Route::Routed(points) = &routes[0] else {
            panic!("a clear detour");
        };
        assert_eq!(
            points.iter().map(|p| (p.x, p.y)).collect::<Vec<_>>(),
            vec![(-50.0, 50.0), (-50.0, 0.0), (150.0, 0.0), (150.0, 50.0)]
        );
    }
}
