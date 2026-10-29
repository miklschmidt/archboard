//! Exact box-interior queries along the coordinates reused by corridor templates.

use std::cell::RefCell;

use rustc_hash::FxHashMap;

use crate::geometry::{Point, Rect};

type Axes = FxHashMap<(bool, u64), Vec<(f64, f64)>>;

pub(super) struct Clearance {
    boxes: Vec<Rect>,
    axes: RefCell<Axes>,
}
impl Clearance {
    pub(super) fn new(boxes: Vec<Rect>) -> Self {
        Self {
            boxes,
            axes: RefCell::default(),
        }
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
            let mut axes = self.axes.borrow_mut();
            let spans = axes
                .entry((vertical, at.to_bits()))
                .or_insert_with(|| self.spans(vertical, at));
            let before = spans.partition_point(|&(lo, _)| lo < a.max(b));
            before == 0 || spans[before - 1].1 <= a.min(b)
        })
    }
    fn spans(&self, vertical: bool, at: f64) -> Vec<(f64, f64)> {
        let mut spans: Vec<_> = self
            .boxes
            .iter()
            .filter_map(|r| {
                let (across, size, lo, hi) = if vertical {
                    (r.x, r.width, r.y, r.y + r.height)
                } else {
                    (r.y, r.height, r.x, r.x + r.width)
                };
                (at > across && at < across + size).then_some((lo, hi))
            })
            .collect();
        spans.sort_by(|a, b| a.0.total_cmp(&b.0));
        let mut end = f64::NEG_INFINITY;
        for span in &mut spans {
            end = end.max(span.1);
            span.1 = end;
        }
        spans
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::planned::geometry::crosses_box;

    #[test]
    fn indexed_clearance_keeps_open_walls_and_reversed_or_empty_runs() {
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
        let index = Clearance::new(boxes.to_vec());
        let points = [-1.0, 0.0, 1.0, 5.0, 10.0, 20.0, 30.0, 40.0, 50.0, 51.0];
        for at in points {
            for a in points {
                for b in points {
                    for path in [
                        [Point { x: at, y: a }, Point { x: at, y: b }],
                        [Point { x: a, y: at }, Point { x: b, y: at }],
                    ] {
                        assert_eq!(
                            index.clear(&path),
                            !boxes.iter().any(|&r| crosses_box(&path, r))
                        );
                    }
                }
            }
        }
    }
}
