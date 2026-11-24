//! Exact box-interior queries along the coordinates reused by corridor templates.

use std::cell::RefCell;

use rustc_hash::FxHashMap;

use crate::geometry::{Point, Rect};

/// Below this box count, scanning `boxes` directly beats hashing and caching per-axis spans.
const LINEAR_LIMIT: usize = 8;

type Axes = FxHashMap<u64, Vec<(f64, f64)>>;

pub(super) struct Clearance {
    boxes: Vec<Rect>,
    /// Bounding range of all boxes along each axis: index 0 is `y` (for horizontal lines),
    /// index 1 is `x` (for vertical lines).
    extent: [(f64, f64); 2],
    /// Cached blocking spans per coordinate: index 0 for horizontal (`y`), 1 for vertical (`x`).
    axes: [RefCell<Axes>; 2],
}

fn box_axes(r: &Rect, vertical: bool) -> (f64, f64, f64, f64) {
    if vertical {
        (r.x, r.x + r.width, r.y, r.y + r.height)
    } else {
        (r.y, r.y + r.height, r.x, r.x + r.width)
    }
}

impl Clearance {
    pub(super) fn new(boxes: Vec<Rect>) -> Self {
        let mut min_x = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        for r in &boxes {
            min_x = min_x.min(r.x);
            max_x = max_x.max(r.x + r.width);
            min_y = min_y.min(r.y);
            max_y = max_y.max(r.y + r.height);
        }
        Self {
            boxes,
            extent: [(min_y, max_y), (min_x, max_x)],
            axes: [RefCell::default(), RefCell::default()],
        }
    }

    pub(super) fn clear_segment(&self, vertical: bool, at: f64, a: f64, b: f64) -> bool {
        let (min_at, max_at) = self.extent[usize::from(vertical)];
        if !(at > min_at && at < max_at) {
            return true;
        }
        let (lo, hi) = (a.min(b), a.max(b));
        if self.boxes.len() <= LINEAR_LIMIT {
            return self.boxes.iter().all(|r| {
                let (c0, c1, s0, s1) = box_axes(r, vertical);
                !(at > c0 && at < c1 && s0 < hi && s1 > lo)
            });
        }
        let mut axes = self.axes[usize::from(vertical)].borrow_mut();
        let spans = axes
            .entry(at.to_bits())
            .or_insert_with(|| self.spans(vertical, at));
        if spans.is_empty() {
            return true;
        }
        let before = spans.partition_point(|&(start, _)| start < hi);
        before == 0 || spans[before - 1].1 <= lo
    }

    pub(super) fn clear(&self, path: &[Point]) -> bool {
        if self.boxes.is_empty() {
            return true;
        }
        path.windows(2).all(|pair| {
            let vertical = pair[0].x == pair[1].x;
            let (at, a, b) = if vertical {
                (pair[0].x, pair[0].y, pair[1].y)
            } else {
                (pair[0].y, pair[0].x, pair[1].x)
            };
            self.clear_segment(vertical, at, a, b)
        })
    }

    /// How far a run on one line can reach each way from `from`: any end
    /// within the answer leaves the run clear, and no end beyond it does.
    pub(super) fn reach(&self, vertical: bool, at: f64, from: f64) -> (f64, f64) {
        let (min_at, max_at) = self.extent[usize::from(vertical)];
        if !(at > min_at && at < max_at) {
            return (f64::NEG_INFINITY, f64::INFINITY);
        }
        if self.boxes.len() <= LINEAR_LIMIT {
            return self.reach_linear(vertical, at, from);
        }
        let mut axes = self.axes[usize::from(vertical)].borrow_mut();
        let spans = axes
            .entry(at.to_bits())
            .or_insert_with(|| self.spans(vertical, at));
        if spans.is_empty() {
            return (f64::NEG_INFINITY, f64::INFINITY);
        }
        let before = spans.partition_point(|&(lo, _)| lo < from);
        let low = before
            .checked_sub(1)
            .map_or(f64::NEG_INFINITY, |last| spans[last].1);
        // The running end rises with each span, so the first to pass `from` is the nearest.
        let after = spans.partition_point(|&(_, end)| end <= from);
        let high = spans.get(after).map_or(f64::INFINITY, |&(lo, _)| lo);
        (low, high)
    }

    fn reach_linear(&self, vertical: bool, at: f64, from: f64) -> (f64, f64) {
        let (mut low, mut high) = (f64::NEG_INFINITY, f64::INFINITY);
        for r in &self.boxes {
            let (c0, c1, s0, s1) = box_axes(r, vertical);
            if at > c0 && at < c1 {
                if s0 < from {
                    low = low.max(s1);
                }
                if s1 > from {
                    high = high.min(s0);
                }
            }
        }
        (low, high)
    }

    fn spans(&self, vertical: bool, at: f64) -> Vec<(f64, f64)> {
        let mut spans: Vec<_> = self
            .boxes
            .iter()
            .filter_map(|r| {
                let (c0, c1, lo, hi) = box_axes(r, vertical);
                (at > c0 && at < c1).then_some((lo, hi))
            })
            .collect();
        if spans.len() > 1 {
            spans.sort_by(|a, b| a.0.total_cmp(&b.0));
            let mut end = f64::NEG_INFINITY;
            for span in &mut spans {
                end = end.max(span.1);
                span.1 = end;
            }
        }
        spans
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::planned::geometry::crosses_box;

    fn runs(points: &[f64]) -> impl Iterator<Item = (f64, f64, f64)> + '_ {
        points.iter().flat_map(move |&at| {
            points
                .iter()
                .flat_map(move |&from| points.iter().map(move |&to| (at, from, to)))
        })
    }

    #[test]
    fn clearance_keeps_open_walls_and_reversed_or_empty_runs() {
        let boxes = [
            Rect {
                x: 0.0,
                y: 0.0,
                width: 20.0,
                height: 30.0,
            },
            Rect {
                x: 0.0,
                y: 5.0,
                width: 20.0,
                height: 5.0,
            },
            Rect {
                x: 10.0,
                y: 40.0,
                width: 20.0,
                height: 10.0,
            },
        ];
        let linear = Clearance::new(boxes.to_vec());
        // Repeating boxes leaves the answer unchanged and makes the indexed path run.
        let index = Clearance::new(boxes.repeat(LINEAR_LIMIT));
        let points = [-1.0, 0.0, 1.0, 5.0, 10.0, 20.0, 30.0, 40.0, 50.0, 51.0];
        for (at, a, b) in runs(&points) {
            for path in [
                [Point { x: at, y: a }, Point { x: at, y: b }],
                [Point { x: a, y: at }, Point { x: b, y: at }],
            ] {
                let expected = !boxes.iter().any(|&r| crosses_box(&path, r));
                assert_eq!(linear.clear(&path), expected);
                assert_eq!(index.clear(&path), expected);
            }
        }
        assert!(index.axes.iter().all(|axis| !axis.borrow().is_empty()));
    }

    #[test]
    fn reach_answers_as_clear_does_for_every_end_of_a_run() {
        let boxes = [
            Rect {
                x: 0.0,
                y: 0.0,
                width: 20.0,
                height: 30.0,
            },
            Rect {
                x: 10.0,
                y: 40.0,
                width: 20.0,
                height: 10.0,
            },
        ];
        let points = [-1.0, 0.0, 5.0, 15.0, 30.0, 40.0, 45.0, 50.0, 51.0];
        for clearance in [
            Clearance::new(boxes.to_vec()),
            Clearance::new(boxes.repeat(LINEAR_LIMIT)),
        ] {
            for (at, from, to) in runs(&points) {
                let (low, high) = clearance.reach(true, at, from);
                let reached = if to < from { to >= low } else { to <= high };
                let run = [Point { x: at, y: from }, Point { x: at, y: to }];
                assert_eq!(reached, clearance.clear(&run));
            }
        }
    }
}
