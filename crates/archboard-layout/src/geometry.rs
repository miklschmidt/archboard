//! Points and boxes, and the few measures of them the layout takes.

pub(crate) use archboard_scene::geometry::{Point, Rect, covering, inflate};

use crate::ecma::{js_max, js_min};

/// Which face of a box a line meets.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) enum Side {
    Top,
    Right,
    Bottom,
    Left,
}

impl Side {
    /// The face's name, as the TypeScript engine spelt it.
    pub(crate) fn name(self) -> &'static str {
        match self {
            Side::Top => "top",
            Side::Right => "right",
            Side::Bottom => "bottom",
            Side::Left => "left",
        }
    }
}

/// The x of a polyline where it crosses a height, or nothing when it never reaches it.
pub(crate) fn polyline_x(points: &[Point], y: f64) -> Option<f64> {
    for pair in points.windows(2) {
        let (one, other) = (pair[0], pair[1]);
        let low = js_min(one.y, other.y);
        let high = js_max(one.y, other.y);
        if y < low || y > high {
            continue;
        }
        if high - low < 1e-6 {
            return Some(f64::midpoint(one.x, other.x));
        }
        return Some(one.x + ((other.x - one.x) * (y - one.y)) / (other.y - one.y));
    }
    None
}
