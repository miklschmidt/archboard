//! Points and boxes, and the few measures of them the layout takes
//! (`shared/rules/geometry.ts`).

pub use archboard_scene::geometry::{Point, Rect, covering, inflate, union};

use crate::ecma::{js_max, js_min};

/// Which face of a box a line meets.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Side {
    Top,
    Right,
    Bottom,
    Left,
}

impl Side {
    /// The face directly across from this one.
    pub fn opposite(self) -> Side {
        match self {
            Side::Top => Side::Bottom,
            Side::Bottom => Side::Top,
            Side::Left => Side::Right,
            Side::Right => Side::Left,
        }
    }

    /// The face's name, as the TypeScript engine spelt it.
    pub fn name(self) -> &'static str {
        match self {
            Side::Top => "top",
            Side::Right => "right",
            Side::Bottom => "bottom",
            Side::Left => "left",
        }
    }

    /// A face from its name.
    pub fn from_name(name: &str) -> Option<Side> {
        match name {
            "top" => Some(Side::Top),
            "right" => Some(Side::Right),
            "bottom" => Some(Side::Bottom),
            "left" => Some(Side::Left),
            _ => None,
        }
    }
}

/// The x of a polyline where it crosses a height, or nothing when it never reaches it.
pub fn polyline_x(points: &[Point], y: f64) -> Option<f64> {
    for pair in points.windows(2) {
        let (one, other) = (pair[0], pair[1]);
        let low = js_min(one.y, other.y);
        let high = js_max(one.y, other.y);
        if y < low || y > high {
            continue;
        }
        if high - low < 1e-6 {
            return Some((one.x + other.x) / 2.0);
        }
        return Some(one.x + ((other.x - one.x) * (y - one.y)) / (other.y - one.y));
    }
    None
}

/// A box with nothing in it at a point.
pub fn at_point(point: Point) -> Rect {
    Rect {
        x: point.x,
        y: point.y,
        width: 0.0,
        height: 0.0,
    }
}
