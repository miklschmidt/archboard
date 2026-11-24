//! The pages round a frames' whole that doors can stand within, and the cheapest ring and page
//! for those doors.

use rustc_hash::FxHashSet;

use crate::geometry::{Point, Rect};

use super::super::super::reading::{DEAD_SPACE, ring_pane_cost};
use super::line_up::{Scratch, cheapest};
use super::{PITCH, Priced, Ring, WALLS, Wall, slot_count};

/// Where the page can stand round the frames' whole, as shares of the room it has to spare.
const WINDOWS: [f64; 3] = [0.0, 0.5, 1.0];

/// The pages that the doors can stand within round a whole, those that read both ways first. On
/// each side of the whole a page holds nothing or the band of one row of doors. A page that
/// reads where it lands, at a few places round the whole, also lets a row reach past the whole's
/// corners. A page taller than one that reads still holds its doors within the width that reads.
pub(super) fn pages(whole: Rect, page: Point, band: Point) -> [Vec<Rect>; 2] {
    let mut pages = Vec::new();
    for (before, after) in [(0.0, 0.0), (band.x, 0.0), (0.0, band.x), (band.x, band.x)] {
        for (above, below) in [(0.0, 0.0), (band.y, 0.0), (0.0, band.y), (band.y, band.y)] {
            pages.push(Rect {
                x: whole.x - before,
                y: whole.y - above,
                width: whole.width + before + after,
                height: whole.height + above + below,
            });
        }
    }
    let slack = Point {
        x: (page.x - whole.width).max(0.0),
        y: (page.y - whole.height).max(0.0),
    };
    for across in WINDOWS.map(|share| share * slack.x) {
        for down in WINDOWS.map(|share| share * slack.y) {
            pages.push(Rect {
                x: whole.x - across,
                y: whole.y - down,
                width: whole.width + slack.x,
                height: whole.height + slack.y,
            });
        }
    }
    let reads = |size: f64, most: f64, whole: f64| size <= most.max(whole) + 1e-6;
    pages.retain(|one| reads(one.width, page.x, whole.width));
    let both = (pages.iter())
        .copied()
        .filter(|one| reads(one.height, page.y, whole.height))
        .collect();
    let across = (pages.iter())
        .map(|&one| Rect {
            y: f64::NEG_INFINITY,
            height: f64::INFINITY,
            ..one
        })
        .collect();
    [both, across]
}

/// The box round a whole and some doors.
fn bounds(whole: Rect, doors: impl Iterator<Item = Rect>) -> Rect {
    let (mut low, mut high) = (
        Point {
            x: whole.x,
            y: whole.y,
        },
        Point {
            x: whole.x + whole.width,
            y: whole.y + whole.height,
        },
    );
    for at in doors {
        low = Point {
            x: low.x.min(at.x),
            y: low.y.min(at.y),
        };
        high = Point {
            x: high.x.max(at.x + at.width),
            y: high.y.max(at.y + at.height),
        };
    }
    Rect {
        x: low.x,
        y: low.y,
        width: high.x - low.x,
        height: high.y - low.y,
    }
}

/// Whether a box stands within another.
fn within(at: Rect, one: &Rect) -> bool {
    at.x >= one.x - 1e-6
        && at.y >= one.y - 1e-6
        && at.x + at.width <= one.x + one.width + 1e-6
        && at.y + at.height <= one.y + one.height + 1e-6
}

/// Approximate offset bounds `[lo_f, hi_f)` along `wall` for a door starting at `first` inside
/// `holds`, or `None` when the wall's fixed axis lies outside `holds`.
fn wall_bounds(wall: usize, first: Rect, holds: &Rect) -> Option<(f64, f64)> {
    let (min_x, max_x) = (holds.x - 1e-6, holds.x + holds.width + 1e-6);
    let (min_y, max_y) = (holds.y - 1e-6, holds.y + holds.height + 1e-6);
    if min_x.is_nan() || max_x.is_nan() || min_y.is_nan() || max_y.is_nan() {
        return None;
    }
    let bounds = match WALLS[wall] {
        Wall::Top => (first.y >= min_y && first.y + first.height <= max_y).then(|| {
            (
                ((min_x - first.x) / PITCH).floor(),
                ((max_x - first.width - first.x) / PITCH).ceil() + 1.0,
            )
        }),
        Wall::Right => (first.x >= min_x && first.x + first.width <= max_x).then(|| {
            (
                ((min_y - first.y) / PITCH).floor(),
                ((max_y - first.height - first.y) / PITCH).ceil() + 1.0,
            )
        }),
        Wall::Bottom => (first.y >= min_y && first.y + first.height <= max_y).then(|| {
            (
                ((first.x + first.width - max_x) / PITCH).floor(),
                ((first.x - min_x) / PITCH).ceil() + 1.0,
            )
        }),
        Wall::Left => (first.x >= min_x && first.x + first.width <= max_x).then(|| {
            (
                ((first.y + first.height - max_y) / PITCH).floor(),
                ((first.y - min_y) / PITCH).ceil() + 1.0,
            )
        }),
    }?;
    (bounds.1 >= -1.0 && bounds.0 <= bounds.1 + 2.0).then_some(bounds)
}

/// Exact allowed slot offset range `[lo, hi)` on `wall` for one door inside `holds`.
fn wall_range(
    ring: &Ring,
    boxes: &[Option<Rect>],
    wall: usize,
    fit: usize,
    holds: &Rect,
) -> (usize, usize) {
    if fit == 0 {
        return (0, 0);
    }
    let start = ring.walls[wall].0;
    let Some(first) = boxes[start] else {
        return (0, 0);
    };
    let Some((lo_f, hi_f)) = wall_bounds(wall, first, holds) else {
        return (0, 0);
    };
    if lo_f > fit as f64 + 1.0 {
        return (0, 0);
    }
    let mut lo = if lo_f <= 1.0 {
        0
    } else {
        slot_count((lo_f - 1.0).min(fit as f64))
    };
    let mut hi = if hi_f <= 0.0 {
        0
    } else {
        slot_count((hi_f + 1.0).min(fit as f64))
    };
    let ok = |k: usize| boxes[start + k].is_some_and(|at| within(at, holds));
    while lo < hi && !ok(lo) {
        lo += 1;
    }
    while hi > lo && !ok(hi - 1) {
        hi -= 1;
    }
    if lo == hi { (0, 0) } else { (lo, hi) }
}

/// Build the per-door allowed wall slot ranges for one ring inside one page, returning `false`
/// when some door has no allowed slot at all.
fn allowed_ranges(one: &Priced, holds: &Rect, out: &mut Vec<[(usize, usize); 4]>) -> bool {
    out.clear();
    for (boxes, &fits) in one.boxes.iter().zip(&one.fits) {
        let mut wall_ranges = [(0, 0); 4];
        let mut any = false;
        for wall in 0..4 {
            let range = wall_range(&one.ring, boxes, wall, fits[wall], holds);
            wall_ranges[wall] = range;
            any |= range.0 < range.1;
        }
        if !any {
            return false;
        }
        out.push(wall_ranges);
    }
    true
}

/// The cheapest places of doors on any of some rings within any of some pages, with the box
/// that they and the whole fill weighed as dead space: the ring's index, the doors' order and
/// their places.
pub(super) fn cheapest_page(
    rings: &[Priced],
    pages: &[Rect],
    takes: &[[usize; 4]],
    whole: Rect,
    scratch: &mut Scratch,
) -> Option<(usize, Vec<usize>, Vec<usize>)> {
    let mut best: Option<(f64, usize, Vec<usize>, Vec<usize>)> = None;
    let mut ranges = Vec::new();
    for (at, one) in rings.iter().enumerate() {
        // A page that allows the same places as one before it stands the doors alike, at the
        // same cost, and an earlier page wins a tie.
        let mut met: FxHashSet<Vec<[(usize, usize); 4]>> = FxHashSet::default();
        for holds in pages {
            if !allowed_ranges(one, holds, &mut ranges) || !met.insert(ranges.clone()) {
                continue;
            }
            let Some((total, order, places)) =
                cheapest(&one.ring, takes, &one.costs, &ranges, scratch)
            else {
                continue;
            };
            let stood =
                (order.iter().zip(&places)).filter_map(|(&door, &slot)| one.boxes[door][slot]);
            let filled = bounds(whole, stood);
            let total = total
                + filled.width * filled.height / DEAD_SPACE
                + ring_pane_cost(filled.width, filled.height);
            if best
                .as_ref()
                .is_none_or(|best| total.total_cmp(&best.0).is_lt())
            {
                best = Some((total, at, order, places));
            }
        }
    }
    best.map(|(_, at, order, places)| (at, order, places))
}
