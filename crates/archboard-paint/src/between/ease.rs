//! The curves every part of a move follows, and the arithmetic they share.
//! A card, a line and a label move on one curve and fade on one curve.

use archboard_scene::geometry::Rect;
use archboard_scene::scene::Transform;

use crate::timing::EMPHASISED;

/// Where a line that travels is as far back as it goes.
const RECEDES_BY: f64 = 0.2;
/// Where a line that travels starts to return, and where it is back.
const RETURNS_FROM: f64 = 0.58;
const RETURNS_BY: f64 = 0.92;

/// How far through one phase a moment is: 0 before it, 1 after it.
pub(crate) fn phase(progress: f64, start: f64, end: f64) -> f64 {
    if end <= start {
        return if progress >= end { 1.0 } else { 0.0 };
    }
    ((progress - start) / (end - start)).clamp(0.0, 1.0)
}

/// The curve of a move. It is exact at both ends.
pub(super) fn emphasised(t: f64) -> f64 {
    if t <= 0.0 || t >= 1.0 {
        t.clamp(0.0, 1.0)
    } else {
        EMPHASISED.at(t)
    }
}

/// The curve of a fade: most of it early, the rest gently.
pub(super) fn ease_out(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

/// The curve of a cross-fade: gentle at both ends, so neither side is seen to
/// start or stop.
pub(super) fn ease_in_out(t: f64) -> f64 {
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}

/// How much of what travels shows at a moment of a move, 1 when all of it does.
/// It recedes as the move starts and returns before the move ends, by as much as
/// `depth` at its deepest.
pub(super) fn receded(depth: f64, progress: f64) -> f64 {
    let gone = ease_in_out(phase(progress, 0.0, RECEDES_BY));
    let back = ease_in_out(phase(progress, RETURNS_FROM, RETURNS_BY));
    1.0 - depth * gone * (1.0 - back)
}

/// A number some way between two.
pub(super) fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// A box some way between two.
pub(super) fn mix_rect(a: Rect, b: Rect, t: f64) -> Rect {
    Rect {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        width: lerp(a.width, b.width, t),
        height: lerp(a.height, b.height, t),
    }
}

/// The move that scales about the middle of a box.
pub(super) fn scale_about(rect: Rect, scale: f64) -> Transform {
    let (cx, cy) = (rect.x + rect.width / 2.0, rect.y + rect.height / 2.0);
    Transform {
        x: cx * (1.0 - scale),
        y: cy * (1.0 - scale),
        scale: Some(scale),
    }
}

/// Where a box stands after a move.
pub(super) fn carried(rect: Rect, by: Transform) -> Rect {
    let scale = by.scale.unwrap_or(1.0);
    Rect {
        x: rect.x * scale + by.x,
        y: rect.y * scale + by.y,
        width: rect.width * scale,
        height: rect.height * scale,
    }
}

/// The move that does `inner` first and `outer` after it.
pub(super) fn then(outer: Transform, inner: Option<Transform>) -> Transform {
    let Some(inner) = inner else { return outer };
    let scale = outer.scale.unwrap_or(1.0);
    Transform {
        x: scale * inner.x + outer.x,
        y: scale * inner.y + outer.y,
        scale: match (outer.scale, inner.scale) {
            (None, None) => None,
            (a, b) => Some(a.unwrap_or(1.0) * b.unwrap_or(1.0)),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{emphasised, phase, scale_about, then};
    use archboard_scene::geometry::Rect;
    use archboard_scene::scene::Transform;

    #[test]
    fn a_phase_holds_before_and_after_it() {
        assert_eq!(phase(0.1, 0.2, 0.6), 0.0);
        assert_eq!(phase(0.9, 0.2, 0.6), 1.0);
        assert!((phase(0.4, 0.2, 0.6) - 0.5).abs() < 1e-12);
    }

    #[test]
    fn the_move_curve_is_exact_at_its_ends_and_runs_ahead_between() {
        assert_eq!(emphasised(0.0), 0.0);
        assert_eq!(emphasised(1.0), 1.0);
        assert!(emphasised(0.5) > 0.5);
    }

    #[test]
    fn a_scale_about_a_box_keeps_its_middle_still() {
        let rect = Rect {
            x: 10.0,
            y: 20.0,
            width: 40.0,
            height: 20.0,
        };
        let about = scale_about(rect, 0.5);
        let scale = about.scale.expect("a scale");
        assert_eq!(
            (30.0 * scale + about.x, 30.0 * scale + about.y),
            (30.0, 30.0)
        );
    }

    #[test]
    fn a_move_after_a_scale_scales_the_move() {
        let both = then(
            Transform {
                x: 1.0,
                y: 0.0,
                scale: Some(2.0),
            },
            Some(Transform::translate(3.0, 4.0)),
        );
        assert_eq!((both.x, both.y, both.scale), (7.0, 8.0, Some(2.0)));
    }
}
