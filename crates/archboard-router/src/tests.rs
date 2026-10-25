use crate::grid::{Buffer, SAME};
use crate::vpsc::{self, Constraint, Var};
use crate::{Dir, End, Params, Point, Rect, Route, Scene, route};

const PARAMS: Params = Params {
    clearance: 16.0,
    lane: 16.0,
    bend: 60.0,
    crossing: 300.0,
};

fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect {
        x,
        y,
        width,
        height,
    }
}

fn pin(obstacle: usize, x: f64, y: f64, leaves: Dir) -> End {
    End::Pin {
        obstacle,
        at: Point { x, y },
        leaves,
    }
}

fn routed(answer: &Route) -> &[Point] {
    match answer {
        Route::Routed(points) => points,
        Route::Unroutable => panic!("expected a route"),
    }
}

/// Every run of a route stays out of every buffer it does not end in.
fn clear_of_buffers(scene: &Scene, connector: usize, points: &[Point]) -> bool {
    let (tail, head) = scene.connectors[connector];
    let owners: Vec<usize> = [tail, head]
        .iter()
        .filter_map(|end| match end {
            End::Pin { obstacle, .. } => Some(*obstacle),
            End::Free { .. } => None,
        })
        .collect();
    points.windows(2).all(|pair| {
        let middle = Point {
            x: f64::midpoint(pair[0].x, pair[1].x),
            y: f64::midpoint(pair[0].y, pair[1].y),
        };
        scene.obstacles.iter().enumerate().all(|(index, obstacle)| {
            owners.contains(&index)
                || !Buffer::around(obstacle, scene.params.clearance).holds(middle)
        })
    })
}

fn orthogonal(points: &[Point]) -> bool {
    points
        .windows(2)
        .all(|pair| (pair[0].x - pair[1].x).abs() < SAME || (pair[0].y - pair[1].y).abs() < SAME)
}

#[test]
fn facing_pins_join_by_a_straight_line() {
    let scene = Scene {
        obstacles: vec![rect(0.0, 0.0, 100.0, 50.0), rect(0.0, 200.0, 100.0, 50.0)],
        connectors: vec![(pin(0, 50.0, 50.0, Dir::Down), pin(1, 50.0, 200.0, Dir::Up))],
        params: PARAMS,
    };
    let answer = route(&scene);
    assert_eq!(
        routed(&answer[0]),
        &[Point { x: 50.0, y: 50.0 }, Point { x: 50.0, y: 200.0 }]
    );
}

#[test]
fn a_route_goes_round_an_obstacle_at_its_clearance() {
    let scene = Scene {
        obstacles: vec![
            rect(0.0, 0.0, 100.0, 50.0),
            rect(0.0, 300.0, 100.0, 50.0),
            rect(-20.0, 140.0, 140.0, 40.0),
        ],
        connectors: vec![(pin(0, 50.0, 50.0, Dir::Down), pin(1, 50.0, 300.0, Dir::Up))],
        params: PARAMS,
    };
    let answer = route(&scene);
    let points = routed(&answer[0]);
    assert!(orthogonal(points));
    assert!(clear_of_buffers(&scene, 0, points));
    assert_eq!(points.first(), Some(&Point { x: 50.0, y: 50.0 }));
    assert_eq!(points.last(), Some(&Point { x: 50.0, y: 300.0 }));
}

#[test]
fn an_enclosed_head_is_unroutable() {
    // The head's pin leaves into a ring of obstacles with no way out.
    let scene = Scene {
        obstacles: vec![
            rect(0.0, 0.0, 50.0, 50.0),
            rect(300.0, 300.0, 40.0, 40.0),
            rect(240.0, 240.0, 160.0, 20.0),
            rect(240.0, 380.0, 160.0, 20.0),
            rect(240.0, 240.0, 20.0, 160.0),
            rect(380.0, 240.0, 20.0, 160.0),
        ],
        connectors: vec![(pin(0, 25.0, 50.0, Dir::Down), pin(1, 320.0, 300.0, Dir::Up))],
        params: PARAMS,
    };
    assert_eq!(route(&scene), vec![Route::Unroutable]);
}

#[test]
fn routes_that_would_share_a_line_stand_a_lane_apart() {
    // Two connectors between separate pin pairs, both forced through one gap.
    let scene = Scene {
        obstacles: vec![
            rect(0.0, 0.0, 200.0, 50.0),
            rect(0.0, 400.0, 200.0, 50.0),
            rect(-200.0, 200.0, 280.0, 40.0),
            rect(200.0, 200.0, 280.0, 40.0),
        ],
        connectors: vec![
            (pin(0, 40.0, 50.0, Dir::Down), pin(1, 40.0, 400.0, Dir::Up)),
            (
                pin(0, 160.0, 50.0, Dir::Down),
                pin(1, 160.0, 400.0, Dir::Up),
            ),
        ],
        params: PARAMS,
    };
    let answer = route(&scene);
    let gap_runs: Vec<f64> = answer
        .iter()
        .map(|one| {
            let points = routed(one);
            assert!(orthogonal(points));
            // The x of the run that passes the gap between y 200 and 240.
            points
                .windows(2)
                .find(|pair| {
                    (pair[0].x - pair[1].x).abs() < SAME
                        && pair[0].y.min(pair[1].y) < 200.0
                        && pair[0].y.max(pair[1].y) > 240.0
                })
                .map(|pair| pair[0].x)
                .expect("a run through the gap")
        })
        .collect();
    assert!((gap_runs[0] - gap_runs[1]).abs() >= PARAMS.lane - SAME);
    for (index, one) in answer.iter().enumerate() {
        assert!(clear_of_buffers(&scene, index, routed(one)));
    }
}

#[test]
fn routes_from_one_pin_run_as_one_line_until_they_part() {
    let scene = Scene {
        obstacles: vec![
            rect(100.0, 0.0, 100.0, 50.0),
            rect(0.0, 300.0, 80.0, 50.0),
            rect(220.0, 300.0, 80.0, 50.0),
        ],
        connectors: vec![
            (pin(0, 150.0, 50.0, Dir::Down), pin(1, 40.0, 300.0, Dir::Up)),
            (
                pin(0, 150.0, 50.0, Dir::Down),
                pin(2, 260.0, 300.0, Dir::Up),
            ),
        ],
        params: PARAMS,
    };
    let answer = route(&scene);
    let (a, b) = (routed(&answer[0]), routed(&answer[1]));
    assert_eq!(a[0], b[0]);
    assert_eq!(a[1], b[1], "both leave the shared pin along one run");
}

#[test]
fn the_same_scene_routes_the_same_way() {
    let scene = Scene {
        obstacles: vec![
            rect(0.0, 0.0, 200.0, 50.0),
            rect(0.0, 400.0, 200.0, 50.0),
            rect(60.0, 200.0, 80.0, 40.0),
        ],
        connectors: vec![
            (pin(0, 40.0, 50.0, Dir::Down), pin(1, 160.0, 400.0, Dir::Up)),
            (pin(0, 160.0, 50.0, Dir::Down), pin(1, 40.0, 400.0, Dir::Up)),
        ],
        params: PARAMS,
    };
    assert_eq!(route(&scene), route(&scene));
}

#[test]
fn a_free_end_is_reached_from_any_side() {
    let scene = Scene {
        obstacles: vec![rect(0.0, 0.0, 100.0, 50.0)],
        connectors: vec![(
            pin(0, 50.0, 50.0, Dir::Down),
            End::Free {
                at: Point { x: 300.0, y: 200.0 },
            },
        )],
        params: PARAMS,
    };
    let answer = route(&scene);
    let points = routed(&answer[0]);
    assert!(orthogonal(points));
    assert_eq!(points.last(), Some(&Point { x: 300.0, y: 200.0 }));
}

#[test]
fn vpsc_separates_two_variables_that_want_one_place() {
    let placed = vpsc::solve(
        &[
            Var {
                desired: 0.0,
                weight: 1.0,
            },
            Var {
                desired: 0.0,
                weight: 1.0,
            },
        ],
        &[Constraint {
            left: 0,
            right: 1,
            gap: 10.0,
        }],
    );
    assert!((placed[0] + 5.0).abs() < 1e-6 && (placed[1] - 5.0).abs() < 1e-6);
}

#[test]
fn vpsc_splits_a_block_that_holds_a_variable_back() {
    // [D05] Example 3's shape: a chain where the optimum leaves one
    // constraint inactive, which satisfy alone does not find.
    let vars = [
        Var {
            desired: 2.0,
            weight: 1.0,
        },
        Var {
            desired: 0.0,
            weight: 1.0,
        },
        Var {
            desired: 9.0,
            weight: 1.0,
        },
    ];
    let constraints = [
        Constraint {
            left: 0,
            right: 1,
            gap: 2.0,
        },
        Constraint {
            left: 1,
            right: 2,
            gap: 2.0,
        },
    ];
    let placed = vpsc::solve(&vars, &constraints);
    // 0 and 1 meet at 0 and 2; 2 stays where it wants to be.
    assert!((placed[0] - 0.0).abs() < 1e-6, "{placed:?}");
    assert!((placed[1] - 2.0).abs() < 1e-6, "{placed:?}");
    assert!((placed[2] - 9.0).abs() < 1e-6, "{placed:?}");
}

/// How often two routes' runs cross.
fn crossings(a: &[Point], b: &[Point]) -> usize {
    let mut count = 0;
    for p in a.windows(2) {
        for q in b.windows(2) {
            let (h, v) = if (p[0].y - p[1].y).abs() < SAME {
                (p, q)
            } else {
                (q, p)
            };
            if (h[0].y - h[1].y).abs() > SAME || (v[0].x - v[1].x).abs() > SAME {
                continue;
            }
            let (x0, x1) = (h[0].x.min(h[1].x), h[0].x.max(h[1].x));
            let (y0, y1) = (v[0].y.min(v[1].y), v[0].y.max(v[1].y));
            if v[0].x > x0 + SAME && v[0].x < x1 - SAME && h[0].y > y0 + SAME && h[0].y < y1 - SAME
            {
                count += 1;
            }
        }
    }
    count
}

#[test]
fn routes_that_share_a_path_stand_in_the_order_they_part() {
    // Both run down from one block, round its corner and up into the other;
    // the first parts first at both ends, so it runs inside the second.
    let scene = Scene {
        obstacles: vec![
            rect(24.0, 24.0, 1963.7, 1358.0),
            rect(2059.7, 24.0, 3238.3, 2600.0),
        ],
        connectors: vec![
            (
                pin(0, 975.7, 1382.0, Dir::Down),
                pin(1, 2455.7, 24.0, Dir::Up),
            ),
            (
                pin(0, 1721.7, 1382.0, Dir::Down),
                pin(1, 3980.0, 24.0, Dir::Up),
            ),
        ],
        params: PARAMS,
    };
    let answer = route(&scene);
    assert_eq!(crossings(routed(&answer[0]), routed(&answer[1])), 0);
}

#[test]
fn a_pin_that_leaves_into_another_buffer_still_routes() {
    // A port on a block's top wall, over the block's header: where its route
    // leaves the port's buffer lies in the header's.
    let scene = Scene {
        obstacles: vec![
            rect(48.0, 161.0, 1202.0, 628.0),
            rect(48.0, 0.0, 340.0, 113.0),
            rect(375.5, 0.0, 1.0, 1.0),
        ],
        connectors: vec![(pin(2, 376.0, 0.5, Dir::Down), pin(0, 376.0, 161.0, Dir::Up))],
        params: PARAMS,
    };
    assert!(matches!(route(&scene)[0], Route::Routed(_)));
}

#[test]
fn a_line_crossed_either_way_does_not_turn_the_others_round() {
    // Four lines leave one block's right side and climb one channel exactly
    // four lanes wide. The one that runs down crosses each of the others
    // whichever side it takes, so the orders it gives contradict each other;
    // the three that climb still stand in the order where they part.
    let scene = Scene {
        obstacles: vec![
            rect(24.0, 372.0, 340.0, 573.0),
            rect(444.0, 468.0, 960.0, 825.0),
            rect(444.0, 24.0, 748.0, 364.0),
        ],
        connectors: vec![
            (
                pin(0, 364.0, 709.0, Dir::Right),
                pin(2, 444.0, 117.0, Dir::Left),
            ),
            (
                pin(0, 364.0, 389.0, Dir::Right),
                pin(1, 444.0, 1037.0, Dir::Left),
            ),
            (
                pin(0, 364.0, 525.0, Dir::Right),
                pin(2, 444.0, 101.0, Dir::Left),
            ),
            (
                pin(0, 364.0, 893.0, Dir::Right),
                pin(1, 444.0, 646.0, Dir::Left),
            ),
        ],
        params: PARAMS,
    };
    let answer = route(&scene);
    let [middle, _, upper, lower] = [0, 1, 2, 3].map(|index| routed(&answer[index]));
    assert_eq!(crossings(upper, middle), 0);
    assert_eq!(crossings(middle, lower), 0);
}

/// A scene in the flat numbers of the renderer core's binding:
/// `clearance, lane, bend, crossing`, the obstacles, then the connectors.
fn decoded(text: &str) -> Scene {
    let mut next = text
        .trim()
        .split(',')
        .map(|number| number.parse::<f64>().unwrap());
    let mut take = || next.next().unwrap();
    let params = Params {
        clearance: take(),
        lane: take(),
        bend: take(),
        crossing: take(),
    };
    let obstacles = (0..take() as usize)
        .map(|_| rect(take(), take(), take(), take()))
        .collect();
    let connectors = (0..take() as usize)
        .map(|_| {
            let mut end = || {
                let (kind, obstacle, x, y, leaves) = (take(), take(), take(), take(), take());
                if kind == 1.0 {
                    End::Free { at: Point { x, y } }
                } else {
                    let leaves = [Dir::Up, Dir::Right, Dir::Down, Dir::Left][leaves as usize];
                    pin(obstacle as usize, x, y, leaves)
                }
            };
            (end(), end())
        })
        .collect();
    Scene {
        obstacles,
        connectors,
        params,
    }
}

// The trunks of Agent workbench (Blocks): a line whose head pin stands near
// a corridor's wall turned towards its pin high up, and the whole segment
// into the pin, held at the pin, left three other lines the room of one
// for 500 px.
#[test]
fn a_pin_holds_only_its_stub_where_its_segment_crowds_a_channel() {
    let scene = decoded(include_str!("fixtures/agent-workbench-blocks.txt"));
    let answer = route(&scene);
    let runs: Vec<(usize, bool, f64, f64, f64)> = answer
        .iter()
        .enumerate()
        .flat_map(|(index, route)| {
            routed(route)
                .windows(2)
                .map(move |pair| {
                    let (a, b) = (pair[0], pair[1]);
                    if (a.x - b.x).abs() < SAME {
                        (index, true, a.x, a.y.min(b.y), a.y.max(b.y))
                    } else {
                        (index, false, a.y, a.x.min(b.x), a.x.max(b.x))
                    }
                })
                .collect::<Vec<_>>()
        })
        .collect();
    for (i, one) in runs.iter().enumerate() {
        for other in &runs[i + 1..] {
            let apart = (one.2 - other.2).abs();
            let beside = one.4.min(other.4) - one.3.max(other.3);
            let squeezed = one.0 != other.0
                && one.1 == other.1
                && apart > SAME
                && apart < 0.75 * PARAMS.lane
                && beside > 4.0 * PARAMS.lane;
            assert!(
                !squeezed,
                "routes {} and {} stand {apart} apart",
                one.0, other.0
            );
        }
    }
}
