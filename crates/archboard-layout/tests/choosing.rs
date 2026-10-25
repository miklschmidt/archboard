//! What the renderer's choices between solves count, through the crate's
//! interface: how often lines cross, each pair counted at each place, as the
//! joins' earlier weighing and a flowchart's answer order count them.

use archboard_layout::pair_crossings;
use archboard_scene::geometry::Point;

fn point(x: f64, y: f64) -> Point {
    Point { x, y }
}

#[test]
fn counts_each_pair_of_lines_once_at_each_place_they_cross() {
    let across = vec![point(0.0, 50.0), point(100.0, 50.0)];
    let down = vec![point(50.0, 0.0), point(50.0, 100.0)];
    let beside = vec![point(50.4, 0.0), point(50.4, 100.0)];
    assert_eq!(pair_crossings(&[across.clone(), down.clone()]), 1);
    // Two lines down one place cross the line across once each.
    assert_eq!(pair_crossings(&[across, down, beside]), 2);
    let touching = vec![point(0.0, 0.0), point(100.0, 0.0)];
    assert_eq!(
        pair_crossings(&[touching, vec![point(50.0, 0.0), point(50.0, 9.0)]]),
        0
    );
}
