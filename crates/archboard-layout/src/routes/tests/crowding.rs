//! Forced arcs are ranked by their worst clearance, independent of paint order.

use super::super::crowding::forced_crowding;
use super::super::drawn_lines::straight_runs;
use super::super::hops::{HopScene, hump};
use super::{across, drawing, lines_of};

#[test]
fn overlapping_ink_keeps_the_worst_clearance_in_either_paint_order() {
    let score = |heights: &[f64]| {
        let drawing = drawing(&heights.iter().copied().map(across).collect::<Vec<_>>());
        let scene = HopScene::new(&drawing, straight_runs(&drawing.edges), &lines_of(&drawing));
        let run = &scene.runs[0];
        forced_crowding(&scene, run, &[], &hump(run, 50.0, 50.0, 1.0))
    };
    let shallow = score(&[50.0, 46.0]);
    let deep = score(&[50.0, 44.0]);
    assert!(
        deep < shallow && shallow <= 0.0,
        "deep={deep}, shallow={shallow}"
    );
    for heights in [[50.0, 44.0, 46.0], [50.0, 46.0, 44.0]] {
        assert_eq!(score(&heights), deep);
    }
}
