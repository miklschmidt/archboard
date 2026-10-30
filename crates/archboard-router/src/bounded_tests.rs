use crate::{Connector, End, Limits, Params, Point, Rect, Route, Scene, route_bounded};

const WINDOW: Rect = Rect {
    x: 0.0,
    y: 0.0,
    width: 200.0,
    height: 200.0,
};
const LIMITS: Limits = Limits {
    obstacles: 8,
    coordinates: 64,
    states: 1024,
};

fn scene() -> Scene {
    Scene {
        obstacles: vec![Rect {
            x: 90.0,
            y: 70.0,
            width: 20.0,
            height: 60.0,
        }],
        connectors: vec![Connector {
            ends: (
                End::Free {
                    at: Point { x: 20.0, y: 100.0 },
                },
                End::Free {
                    at: Point { x: 180.0, y: 100.0 },
                },
            ),
            subjects: (Some(0), Some(1)),
        }],
        minimum: None,
        params: Params {
            clearance: 8.0,
            lane: 16.0,
            bend: 60.0,
            crossing: 300.0,
        },
    }
}

#[test]
fn a_local_route_stays_in_its_window_and_exhaustion_never_drops_an_obstacle() {
    let scene = scene();
    let routes = route_bounded(&scene, &[], WINDOW, LIMITS);
    let Route::Routed(points) = &routes[0] else {
        panic!("a local detour");
    };
    assert!(
        points
            .iter()
            .all(|p| p.x >= 0.0 && p.x <= 200.0 && p.y >= 0.0 && p.y <= 200.0)
    );
    assert!(points.iter().any(|p| p.y <= 62.0 || p.y >= 138.0));
    for limits in [
        Limits {
            obstacles: 0,
            ..LIMITS
        },
        Limits {
            coordinates: 2,
            ..LIMITS
        },
        Limits {
            states: 0,
            ..LIMITS
        },
    ] {
        assert_eq!(
            route_bounded(&scene, &[], WINDOW, limits),
            vec![Route::Unroutable]
        );
    }
}

#[test]
fn an_obstacle_whose_buffer_enters_the_window_still_blocks_a_free_endpoint() {
    let mut scene = scene();
    scene.obstacles = vec![Rect {
        x: -20.0,
        y: 80.0,
        width: 15.0,
        height: 40.0,
    }];
    scene.connectors[0].ends.0 = End::Free {
        at: Point { x: 2.0, y: 100.0 },
    };
    assert_eq!(
        route_bounded(&scene, &[], WINDOW, LIMITS),
        vec![Route::Unroutable]
    );
}

#[test]
fn earlier_unrelated_strokes_reserve_parallel_space_without_moving() {
    let mut scene = scene();
    scene.obstacles.clear();
    let fixed = (
        Connector {
            ends: (
                End::Free {
                    at: Point { x: 40.0, y: 100.0 },
                },
                End::Free {
                    at: Point { x: 160.0, y: 100.0 },
                },
            ),
            subjects: (Some(2), Some(3)),
        },
        vec![Point { x: 40.0, y: 100.0 }, Point { x: 160.0, y: 100.0 }],
    );
    let routes = route_bounded(&scene, &[fixed], WINDOW, LIMITS);
    let Route::Routed(points) = &routes[0] else {
        panic!("a free parallel lane");
    };
    assert!(points.iter().any(|p| (p.y - 100.0).abs() >= 16.0));
}

#[test]
fn a_window_keeps_its_perimeter_available_beyond_the_interior_inset() {
    let mut scene = scene();
    scene.minimum = Some(Point { x: 0.0, y: 60.0 });
    scene.obstacles = vec![Rect {
        x: 80.0,
        y: 40.0,
        width: 60.0,
        height: 200.0,
    }];
    let routes = route_bounded(&scene, &[], WINDOW, LIMITS);
    assert!(matches!(routes.as_slice(), [Route::Routed(_)]));
}
