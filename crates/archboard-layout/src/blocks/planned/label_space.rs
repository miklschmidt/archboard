//! Fixed obstacles near a label, shared by all candidate routes of one placement.

use super::shape::Shape;
use crate::geometry::{Rect, inflate};
use rustc_hash::FxHashMap;
use std::cell::RefCell;

const CELL: f64 = 128.0;

#[derive(Default)]
pub(super) struct Protection {
    cells: FxHashMap<(i64, i64), Vec<Rect>>,
    obstacles: Vec<Rect>,
    strips: RefCell<FxHashMap<(bool, u64, u64), Vec<Rect>>>,
    clearance: RefCell<FxHashMap<[u64; 4], bool>>,
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "floor maps finite drawing coordinates to integer spatial cells"
)]
fn cells(r: Rect) -> impl Iterator<Item = (i64, i64)> {
    let x = (r.x / CELL).floor() as i64;
    let y = (r.y / CELL).floor() as i64;
    let right = ((r.x + r.width) / CELL).floor() as i64;
    let bottom = ((r.y + r.height) / CELL).floor() as i64;
    (x..=right).flat_map(move |x| (y..=bottom).map(move |y| (x, y)))
}

impl Protection {
    pub(super) fn new(shape: &Shape) -> Self {
        let mut protection = Self::default();
        let mut insert = |r: Rect, clear: f64, fallback: f64| {
            protection.obstacles.push(inflate(r, fallback));
            let r = inflate(r, clear);
            for cell in cells(r) {
                protection.cells.entry(cell).or_default().push(r);
            }
        };
        for &r in shape.endpoints.values() {
            insert(r, 8.01, 8.02);
        }
        for region in &shape.drawing.regions {
            insert(region.caption, 8.01, 8.02);
        }
        for scope in shape.scopes.values() {
            let r = scope.bounds;
            for wall in [
                Rect { height: 0.0, ..r },
                Rect {
                    y: r.y + r.height,
                    height: 0.0,
                    ..r
                },
                Rect { width: 0.0, ..r },
                Rect {
                    x: r.x + r.width,
                    width: 0.0,
                    ..r
                },
            ] {
                insert(wall, 0.1, 0.11);
            }
        }
        protection
    }

    /// Fallback runs on the same axis reuse the same fixed obstacles in their original order.
    pub(super) fn nearby(
        &self,
        horizontal: bool,
        across: f64,
        half: f64,
        mut visit: impl FnMut(Rect),
    ) {
        let mut strips = self.strips.borrow_mut();
        let boxes = strips
            .entry((horizontal, across.to_bits(), half.to_bits()))
            .or_insert_with(|| {
                self.obstacles
                    .iter()
                    .copied()
                    .filter(|r| {
                        let (left, right) = if horizontal {
                            (r.y, r.y + r.height)
                        } else {
                            (r.x, r.x + r.width)
                        };
                        across + half >= left && across - half <= right
                    })
                    .collect()
            });
        for &r in boxes.iter() {
            visit(r);
        }
    }

    pub(super) fn clear(&self, at: Rect) -> bool {
        let key = [at.x, at.y, at.width, at.height].map(f64::to_bits);
        *self.clearance.borrow_mut().entry(key).or_insert_with(|| {
            cells(at).all(|cell| {
                self.cells.get(&cell).is_none_or(|boxes| {
                    boxes.iter().all(|r| {
                        at.x >= r.x + r.width
                            || r.x >= at.x + at.width
                            || at.y >= r.y + r.height
                            || r.y >= at.y + at.height
                    })
                })
            })
        })
    }
}

/// Cell membership only. The current rectangles remain in the drawing's label map.
#[derive(Default)]
pub(super) struct Labels {
    cells: FxHashMap<(i64, i64), Vec<usize>>,
}
impl Labels {
    pub(super) fn new(labels: &std::collections::BTreeMap<usize, Rect>) -> Self {
        let mut index = Self::default();
        for (&edge, &at) in labels {
            index.remember(edge, at);
        }
        index
    }
    pub(super) fn remember(&mut self, edge: usize, at: Rect) {
        for cell in cells(inflate(at, 8.01)) {
            let ids = self.cells.entry(cell).or_default();
            if !ids.contains(&edge) {
                ids.push(edge);
            }
        }
    }
    pub(super) fn clear(&self, at: Rect, labels: &std::collections::BTreeMap<usize, Rect>) -> bool {
        cells(at).all(|cell| {
            self.cells.get(&cell).is_none_or(|ids| {
                ids.iter().all(|id| {
                    labels.get(id).is_none_or(|&r| {
                        let r = inflate(r, 8.01);
                        at.x >= r.x + r.width
                            || r.x >= at.x + at.width
                            || at.y >= r.y + r.height
                            || r.y >= at.y + at.height
                    })
                })
            })
        })
    }
}
