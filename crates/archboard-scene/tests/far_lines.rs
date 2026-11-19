//! The far view draws some lines wider: the canvas painters by a scale at a
//! moment of the swap, the SVG painter by one CSS rule per widened width.

use archboard_scene::paint::{far_line_scale, far_line_widths};

#[test]
fn a_far_view_widens_on_the_canvas_exactly_the_lines_its_stylesheet_widens() {
    for (near, wide) in far_line_widths() {
        assert_eq!(far_line_scale(near, 0.0), 1.0);
        assert!((near * far_line_scale(near, 1.0) - wide).abs() < 1e-12);
        let halfway = far_line_scale(near, 0.5);
        assert!(1.0 < halfway && halfway < wide / near);
    }
    // A muted line, or a card's outline, keeps its width.
    assert_eq!(far_line_scale(1.0, 1.0), 1.0);
}
