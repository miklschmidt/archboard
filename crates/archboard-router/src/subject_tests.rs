//! A geometric block port does not identify the card behind it.
use super::tests::{pin, rect, routed};
use super::{Connector, Dir, Params, Point, Scene, route};

struct Run {
    vertical: bool,
    at: f64,
    low: f64,
    high: f64,
}

fn runs(points: &[Point]) -> Vec<Run> {
    points
        .windows(2)
        .map(|pair| {
            let vertical = (pair[0].x - pair[1].x).abs() < 1e-6;
            let (at, a, b) = if vertical {
                (pair[0].x, pair[0].y, pair[1].y)
            } else {
                (pair[0].y, pair[0].x, pair[1].x)
            };
            Run {
                vertical,
                at,
                low: a.min(b),
                high: a.max(b),
            }
        })
        .collect()
}

fn overlap(one: &Run, other: &Run) -> f64 {
    if one.vertical == other.vertical && (one.at - other.at).abs() < 1e-6 {
        one.high.min(other.high) - one.low.max(other.low)
    } else {
        0.0
    }
}

fn shared(a: &[Point], b: &[Point]) -> f64 {
    let (one, other) = (runs(a), runs(b));
    one.iter()
        .flat_map(|one| other.iter().map(move |other| overlap(one, other)))
        .fold(0.0, f64::max)
}

#[test]
fn coincident_ports_share_only_their_fixed_stub_when_the_original_sources_differ() {
    let mut scene = Scene {
        minimum: None,
        obstacles: vec![
            rect(0.0, 0.0, 100.0, 50.0),
            rect(200.0, 250.0, 100.0, 50.0),
            rect(400.0, 250.0, 100.0, 50.0),
        ],
        connectors: vec![
            Connector {
                ends: (pin(0, 50.0, 50.0, Dir::Down), pin(1, 250.0, 250.0, Dir::Up)),
                subjects: (Some(0), Some(1)),
            },
            Connector {
                ends: (pin(0, 50.0, 50.0, Dir::Down), pin(2, 450.0, 250.0, Dir::Up)),
                subjects: (Some(3), Some(2)),
            },
        ],
        params: Params {
            clearance: 16.0,
            lane: 16.0,
            bend: 60.0,
            crossing: 300.0,
        },
    };
    let distinct = route(&scene);
    assert!(shared(routed(&distinct[0]), routed(&distinct[1])) <= scene.params.clearance + 1e-6);
    scene.connectors[1].subjects.0 = Some(0);
    let common = route(&scene);
    assert!(shared(routed(&common[0]), routed(&common[1])) > 100.0);
}
