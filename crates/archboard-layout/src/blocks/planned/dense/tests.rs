use super::together::{FRAME_GAP, in_rows};
use super::*;

/// Frames of one size, as a module with its groups open draws them.
fn frames(count: usize) -> Vec<Point> {
    vec![
        Point {
            x: 1000.0,
            y: 600.0,
        };
        count
    ]
}

/// How far a whole must shrink to fit the readable page.
fn scale(whole: Point) -> f64 {
    let page = readable();
    (whole.x / page.x).max(whole.y / page.y)
}

#[test]
fn two_frames_stand_in_one_row() {
    let (places, whole) = together(&frames(2), false, 0.0);
    assert_eq!(places[0].y, places[1].y);
    assert_eq!(whole.y, 600.0);
}

#[test]
fn many_frames_stand_in_rows_that_land_larger_than_one_row() {
    let sizes = frames(7);
    let (_, row) = in_rows(&sizes, f64::INFINITY, FRAME_GAP);
    let (_, whole) = together(&sizes, false, 0.0);
    assert!(whole.y > 600.0, "seven frames take more than one row");
    assert!(
        scale(whole) < scale(row) / 2.0,
        "the rows land {} times smaller than the page, and one row {} times",
        scale(whole),
        scale(row)
    );
}

#[test]
fn short_frames_stack_beside_a_tall_one() {
    let size = |x: f64, y: f64| Point { x, y };
    // A tall frame first, then three short ones that stand together as tall as it.
    let sizes = [
        size(1000.0, 1800.0),
        size(1000.0, 500.0),
        size(1000.0, 500.0),
        size(1000.0, 500.0),
    ];
    let (places, whole) = together(&sizes, true, 0.0);
    assert!(
        places[1..]
            .iter()
            .all(|at| at.x == places[1].x && at.x > places[0].x)
    );
    assert_eq!(
        whole.y, 1800.0,
        "the short frames end above the tall one's foot"
    );
}
