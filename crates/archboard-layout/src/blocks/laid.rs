//! What laying a block out answers, and the small geometry the block engine
//! moves it with.

use std::rc::Rc;

use crate::ecma::{abs, hypot};
use crate::geometry::{Point, Rect};
use crate::track::containers::{FrameShape, RegionShape};
use crate::track::scene::Map;

use super::card_layout::Reroute;

/// How far a region's caption sits in from its band's corner.
pub(crate) const CAPTION_INSET: f64 = 4.0;

/// How close two coordinates are and still one.
pub(crate) const SAME: f64 = 0.01;

/// A width and a height.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Size {
    pub width: f64,
    pub height: f64,
}

/// A region's header as a block lays it out: its caption's tab, from the
/// region's top down to the caption's foot, so the room a block keeps under
/// its header is the room under the tab.
pub(crate) fn tab_of(caption: Option<Size>) -> Size {
    let Size { width, height } = caption.unwrap_or(Size {
        width: 1.0,
        height: 1.0,
    });
    Size {
        width,
        height: CAPTION_INSET + height,
    }
}

/// One rank of a laid-out block: where it lies, and the block's items on it.
#[derive(Clone, Debug)]
pub(crate) struct Band {
    pub top: f64,
    pub bottom: f64,
    pub items: Vec<String>,
}

/// A block laid out: its size, and where its items, labels, ports and lines are inside it.
#[derive(Clone, Default)]
pub(crate) struct Laid {
    pub width: f64,
    pub height: f64,
    /// Every item's, header's, port's and label's box, in the block's own coordinates.
    pub boxes: Map<String, Rect>,
    /// Each line's points, by key, from its source end to its target end.
    pub lines: Map<String, Vec<Point>>,
    /// Its ranks, top to bottom, when Graphviz ranked it.
    pub bands: Vec<Band>,
    /// The containers it draws inline, in its own coordinates.
    pub frames: Option<Vec<FrameShape>>,
    /// The group regions it draws inline, in its own coordinates.
    pub regions: Option<Vec<RegionShape>>,
    /// Which of its header's wider sizes a container's block took, when it took one.
    pub header: Option<usize>,
    /// How many of its lines lap round it, which its score counts as crossings.
    pub laps: Option<f64>,
    /// The block routed again with some of its ports moved along their edges,
    /// keeping its width, when it can be.
    pub reroute: Option<Rc<Reroute>>,
}

/// Every block laid out so far, by id.
pub(crate) type LaidMap = Map<String, Rc<Laid>>;

/// The room a block keeps around what it holds.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Insets {
    pub side: f64,
    pub top: f64,
    pub bottom: f64,
}

/// Points moved by an offset.
pub(crate) fn shifted(points: &[Point], by: Point) -> Vec<Point> {
    points
        .iter()
        .map(|point| Point {
            x: point.x + by.x,
            y: point.y + by.y,
        })
        .collect()
}

/// A box moved by an offset.
pub(crate) fn moved(one: Rect, by: Point) -> Rect {
    Rect {
        x: one.x + by.x,
        y: one.y + by.y,
        ..one
    }
}

/// Whether three points lie on one horizontal or vertical line.
fn straight(one: Point, two: Point, three: Point) -> bool {
    let vertical = abs(one.x - two.x) < SAME && abs(two.x - three.x) < SAME;
    let horizontal = abs(one.y - two.y) < SAME && abs(two.y - three.y) < SAME;
    vertical || horizontal
}

/// Points without repeats or points in the middle of a straight run.
pub(crate) fn corners(points: &[Point]) -> Vec<Point> {
    let mut kept: Vec<Point> = Vec::with_capacity(points.len());
    for &point in points {
        let last = kept.last().copied();
        if let Some(last) = last
            && hypot(last.x - point.x, last.y - point.y) < SAME
        {
            continue;
        }
        if kept.len() >= 2 && straight(kept[kept.len() - 2], last.expect("a last point"), point) {
            kept.pop();
        }
        kept.push(point);
    }
    kept
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    #[test]
    fn corners_drop_repeats_and_straight_middles() {
        let points = [
            at(0.0, 0.0),
            at(0.0, 0.0),
            at(0.0, 5.0),
            at(0.0, 10.0),
            at(5.0, 10.0),
        ];
        assert_eq!(
            corners(&points),
            vec![at(0.0, 0.0), at(0.0, 10.0), at(5.0, 10.0)]
        );
    }
}
