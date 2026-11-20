//! The marks a viewer draws by: the far view draws some lines wider, the
//! canvas painters by a scale at a moment of the swap, the SVG painter by one
//! CSS rule per widened width, and both read which widths and how much wider
//! from the viewer marks.

use archboard_scene::paint::viewer_marks;

#[test]
fn the_far_view_widens_every_line_weight_by_its_scale_and_nothing_else() {
    let marks = viewer_marks();
    assert!(marks.far_scale > 1.0);
    let widened: Vec<f64> = marks.far_lines.iter().map(|&(near, _)| near).collect();
    assert!(
        marks
            .line_widths
            .iter()
            .all(|(_, width)| widened.contains(width))
    );
    assert!(
        marks
            .far_lines
            .iter()
            .all(|&(near, wide)| wide == near * marks.far_scale)
    );
    // A card's outline keeps its width.
    assert!(!widened.contains(&1.0));
}
