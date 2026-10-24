//! Points, boxes and routes, and the one place a coordinate is rounded.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::js;

/// A position in the diagram's own units.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct Point {
    /// Distance from the left edge.
    pub x: f64,
    /// Distance from the top edge.
    pub y: f64,
}

/// A rectangle in the diagram's own units.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(rename = "Box")]
pub struct Rect {
    /// The left edge.
    pub x: f64,
    /// The top edge.
    pub y: f64,
    /// How wide.
    pub width: f64,
    /// How tall.
    pub height: f64,
}

/// One piece of a route: a straight run, or a cubic bend.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Segment {
    /// A straight run to a point.
    Line {
        /// Where it ends.
        to: Point,
    },
    /// A cubic bend to a point.
    Cubic {
        /// The first control point.
        first: Point,
        /// The second control point.
        second: Point,
        /// Where it ends.
        to: Point,
    },
}

impl Segment {
    /// Where the segment ends.
    pub fn to(&self) -> Point {
        match self {
            Segment::Line { to } | Segment::Cubic { to, .. } => *to,
        }
    }
}

/// A route: where it starts, and its pieces in order.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct Curve {
    /// Where it starts.
    pub from: Point,
    /// Its pieces, in order.
    pub segments: Vec<Segment>,
}

impl Curve {
    /// Where the route ends.
    pub fn end(&self) -> Point {
        self.segments.last().map_or(self.from, Segment::to)
    }
}

/// The page a picture is drawn on, and how far its content had to move onto it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Canvas {
    pub width: f64,
    pub height: f64,
    pub shift_x: f64,
    pub shift_y: f64,
}

/// A coordinate to two decimal places, negative zero flattened: every
/// coordinate the renderer writes goes through here.
pub fn round_coord(value: f64) -> f64 {
    let rounded = js::round(value * 100.0) / 100.0;
    if rounded == 0.0 { 0.0 } else { rounded }
}

/// A coordinate as it is written into the document.
pub fn coord(value: f64) -> String {
    js::number(round_coord(value))
}

/// The smallest box containing both of them.
pub fn covering(a: Rect, b: Rect) -> Rect {
    let left = js::js_min(a.x, b.x);
    let top = js::js_min(a.y, b.y);
    let right = js::js_max(a.x + a.width, b.x + b.width);
    let bottom = js::js_max(a.y + a.height, b.y + b.height);
    Rect { x: left, y: top, width: right - left, height: bottom - top }
}

/// A box grown by the same amount on every side.
pub fn inflate(rect: Rect, by: f64) -> Rect {
    Rect {
        x: rect.x - by,
        y: rect.y - by,
        width: rect.width + by * 2.0,
        height: rect.height + by * 2.0,
    }
}

/// The smallest box containing all of them, or nothing when there are none.
pub fn union(boxes: impl IntoIterator<Item = Rect>) -> Option<Rect> {
    boxes
        .into_iter()
        .fold(None, |grown, rect| Some(grown.map_or(rect, |held| covering(held, rect))))
}

/// A canvas big enough for everything that was drawn, never smaller than the
/// size the layout asked for, and the whole-unit shift the drawing needs.
pub fn canvas_for(laid_width: f64, laid_height: f64, drawn: Option<Rect>, margin: f64) -> Canvas {
    let Some(drawn) = drawn else {
        return Canvas { width: laid_width, height: laid_height, shift_x: 0.0, shift_y: 0.0 };
    };
    let shift_x = js::js_max(0.0, margin - drawn.x).ceil();
    let shift_y = js::js_max(0.0, margin - drawn.y).ceil();
    Canvas {
        width: (js::js_max(laid_width, drawn.x + drawn.width + margin) + shift_x).ceil(),
        height: (js::js_max(laid_height, drawn.y + drawn.height + margin) + shift_y).ceil(),
        shift_x,
        shift_y,
    }
}

/// Where one segment of a route starts.
pub fn segment_start(curve: &Curve, index: usize) -> Point {
    if index == 0 {
        return curve.from;
    }
    curve.segments.get(index - 1).map_or(curve.from, Segment::to)
}

/// The point a fraction of the way along one segment.
pub fn point_on_segment(from: Point, segment: &Segment, t: f64) -> Point {
    match segment {
        Segment::Line { to } => {
            Point { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
        }
        Segment::Cubic { first, second, to } => {
            let inverse = 1.0 - t;
            let weights = [
                js::powi(inverse, 3),
                3.0 * js::powi(inverse, 2) * t,
                3.0 * inverse * js::powi(t, 2),
                js::powi(t, 3),
            ];
            let points = [from, *first, *second, *to];
            let mut x = 0.0;
            let mut y = 0.0;
            for (point, weight) in points.iter().zip(weights) {
                x += point.x * weight;
            }
            for (point, weight) in points.iter().zip(weights) {
                y += point.y * weight;
            }
            Point { x, y }
        }
    }
}

/// The point a fraction of the way along a route, by its segments.
pub fn point_at(curve: &Curve, t: f64) -> Point {
    let count = curve.segments.len();
    let scaled = js::js_min(js::js_max(t, 0.0), 1.0) * count as f64;
    let index = js::js_min(scaled.floor(), count as f64 - 1.0);
    if index < 0.0 {
        return curve.from;
    }
    let index = index as usize;
    match curve.segments.get(index) {
        Some(segment) => {
            point_on_segment(segment_start(curve, index), segment, scaled - index as f64)
        }
        None => curve.from,
    }
}

/// One segment as path data, with its leading space.
fn segment_path(segment: &Segment) -> String {
    match segment {
        Segment::Line { to } => format!(" L{},{}", coord(to.x), coord(to.y)),
        Segment::Cubic { first, second, to } => format!(
            " C{},{} {},{} {},{}",
            coord(first.x),
            coord(first.y),
            coord(second.x),
            coord(second.y),
            coord(to.x),
            coord(to.y)
        ),
    }
}

/// A route as path data.
pub fn path_of(curve: &Curve) -> String {
    let mut path = format!("M{},{}", coord(curve.from.x), coord(curve.from.y));
    for segment in &curve.segments {
        path.push_str(&segment_path(segment));
    }
    path
}

/// The box round every point a route runs through, its control points included.
pub fn curve_bounds(curve: &Curve) -> Rect {
    let mut points = vec![curve.from];
    for segment in &curve.segments {
        if let Segment::Cubic { first, second, .. } = segment {
            points.push(*first);
            points.push(*second);
        }
        points.push(segment.to());
    }
    let left = js::min(points.iter().map(|point| point.x));
    let top = js::min(points.iter().map(|point| point.y));
    Rect {
        x: left,
        y: top,
        width: js::max(points.iter().map(|point| point.x)) - left,
        height: js::max(points.iter().map(|point| point.y)) - top,
    }
}

/// How close two points must be to be one, and the least a turn may move.
pub const EPSILON: f64 = 0.01;
/// How far a cubic's control points stand toward its corner, per unit of radius.
const KAPPA: f64 = 0.5523;
/// The radius of every bend a route takes.
pub const BEND_RADIUS: f64 = 8.0;

/// Waypoints without repeats and without points that run straight on.
fn simplify(points: &[Point]) -> Vec<Point> {
    let mut kept: Vec<Point> = Vec::new();
    for point in points {
        if kept.last().is_some_and(|last| js::hypot(last.x - point.x, last.y - point.y) < EPSILON)
        {
            continue;
        }
        if kept.len() >= 2 && collinear(kept[kept.len() - 2], kept[kept.len() - 1], *point) {
            kept.pop();
        }
        kept.push(*point);
    }
    kept
}

/// Whether three points lie on one row or one column.
fn collinear(a: Point, b: Point, c: Point) -> bool {
    ((a.x - b.x).abs() < EPSILON && (b.x - c.x).abs() < EPSILON)
        || ((a.y - b.y).abs() < EPSILON && (b.y - c.y).abs() < EPSILON)
}

/// A bend through a corner, and the straight run up to it from where the route is.
fn bend_through(previous: Point, vertex: Point, next: Point, start: Point, fitted: bool) -> Vec<Segment> {
    let in_length = js::hypot(vertex.x - previous.x, vertex.y - previous.y);
    let out_length = js::hypot(next.x - vertex.x, next.y - vertex.y);
    let radius = if fitted {
        js::min([BEND_RADIUS, in_length / 2.0, out_length / 2.0])
    } else {
        BEND_RADIUS
    };
    let in_dir = Point { x: (vertex.x - previous.x) / in_length, y: (vertex.y - previous.y) / in_length };
    let out_dir = Point { x: (next.x - vertex.x) / out_length, y: (next.y - vertex.y) / out_length };
    let arrive = Point { x: vertex.x - in_dir.x * radius, y: vertex.y - in_dir.y * radius };
    let leave = Point { x: vertex.x + out_dir.x * radius, y: vertex.y + out_dir.y * radius };
    let bend = Segment::Cubic {
        first: Point {
            x: arrive.x + in_dir.x * radius * KAPPA,
            y: arrive.y + in_dir.y * radius * KAPPA,
        },
        second: Point {
            x: leave.x - out_dir.x * radius * KAPPA,
            y: leave.y - out_dir.y * radius * KAPPA,
        },
        to: leave,
    };
    if js::hypot(arrive.x - start.x, arrive.y - start.y) > EPSILON {
        vec![Segment::Line { to: arrive }, bend]
    } else {
        vec![bend]
    }
}

/// A route through waypoints: straight runs, each corner bent.
pub fn curve_through(waypoints: &[Point], fitted: bool) -> Curve {
    let points = simplify(waypoints);
    let first = points.first().copied().unwrap_or(Point { x: 0.0, y: 0.0 });
    let mut segments: Vec<Segment> = Vec::new();
    let last = points.len().saturating_sub(1);
    for index in 1..last {
        let start = segments.last().map_or(first, Segment::to);
        segments.extend(bend_through(points[index - 1], points[index], points[index + 1], start, fitted));
    }
    if let Some(end) = points.last() {
        let start = segments.last().map_or(first, Segment::to);
        if segments.is_empty() || js::hypot(end.x - start.x, end.y - start.y) > EPSILON {
            segments.push(Segment::Line { to: *end });
        }
    }
    Curve { from: first, segments }
}

/// A route's ends and the corners its bends round, in order.
pub fn vertices_of(curve: &Curve) -> Vec<Point> {
    let mut points = vec![curve.from];
    let mut from = curve.from;
    for segment in &curve.segments {
        if let Segment::Cubic { first, to, .. } = segment {
            let vertical = (first.x - from.x).abs() < (first.y - from.y).abs();
            points.push(if vertical {
                Point { x: from.x, y: to.y }
            } else {
                Point { x: to.x, y: from.y }
            });
        }
        from = segment.to();
    }
    points.push(from);
    points
}

/// Where a line's words would stand: the middle of its longest straight run.
pub fn label_anchor_of(curve: &Curve) -> Point {
    let mut best: Option<(f64, Point)> = None;
    for (index, segment) in curve.segments.iter().enumerate() {
        let Segment::Line { to } = segment else { continue };
        let start = segment_start(curve, index);
        let length = js::hypot(to.x - start.x, to.y - start.y);
        if best.is_none_or(|(held, _)| length > held) {
            best = Some((length, Point { x: (start.x + to.x) / 2.0, y: (start.y + to.y) / 2.0 }));
        }
    }
    best.map_or_else(|| point_at(curve, 0.5), |(_, middle)| middle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounds_coordinates_to_hundredths() {
        assert_eq!(coord(1.005), "1");
        assert_eq!(coord(-0.001), "0");
        assert_eq!(coord(12.345), "12.35");
        assert_eq!(coord(0.125), "0.13");
    }

    #[test]
    fn bends_a_route_through_its_corners() {
        let curve = curve_through(
            &[Point { x: 0.0, y: 0.0 }, Point { x: 100.0, y: 0.0 }, Point { x: 100.0, y: 50.0 }],
            false,
        );
        assert_eq!(path_of(&curve), "M0,0 L92,0 C96.42,0 100,3.58 100,8 L100,50");
    }
}
