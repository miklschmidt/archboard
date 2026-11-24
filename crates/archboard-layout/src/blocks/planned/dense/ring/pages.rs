//! The pages round a frames' whole that doors can stand within, and the cheapest ring and page
//! for those doors.

use rustc_hash::FxHashSet;

use crate::geometry::{Point, Rect};

use super::super::super::reading::{DEAD_SPACE, ring_pane_cost};
use super::line_up::{Scratch, cheapest};
use super::{Priced, Ring, WALLS, Wall};

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

/// Exact allowed slot offset range `[lo, hi)` on `wall` for one door inside `holds`.
fn wall_range(
    ring: &Ring,
    boxes: &[Option<Rect>],
    wall: usize,
    fit: usize,
    holds: &Rect,
) -> (usize, usize) {
    let start = ring.walls[wall].0;
    let wall_boxes = &boxes[start..start + fit];
    let Some(Some(first)) = wall_boxes.first() else {
        return (0, 0);
    };
    let (along, across) = match WALLS[wall] {
        Wall::Top | Wall::Bottom => ((holds.x, holds.width), (holds.y, holds.height)),
        Wall::Right | Wall::Left => ((holds.y, holds.height), (holds.x, holds.width)),
    };
    let edges = |at: &Rect| match WALLS[wall] {
        Wall::Top | Wall::Bottom => ((at.x, at.x + at.width), (at.y, at.y + at.height)),
        Wall::Right | Wall::Left => ((at.y, at.y + at.height), (at.x, at.x + at.width)),
    };
    let (_, (near, far)) = edges(first);
    if !(near >= across.0 - 1e-6 && far <= across.0 + across.1 + 1e-6) {
        return (0, 0);
    }

    let (min, max) = (along.0 - 1e-6, along.0 + along.1 + 1e-6);
    if min.is_nan() || max.is_nan() {
        return (0, 0);
    }
    // Each edge is monotone along a wall, even when several slots round to the same
    // coordinate. Search the stored edges to keep the page's original containment test.
    let along_edges = |at: &Option<Rect>| edges(at.as_ref().expect("a fitting door box")).0;
    let (lo, hi) = match WALLS[wall] {
        Wall::Top | Wall::Right => {
            let lo = wall_boxes.partition_point(|at| along_edges(at).0 < min);
            let hi = lo + wall_boxes[lo..].partition_point(|at| along_edges(at).1 <= max);
            (lo, hi)
        }
        Wall::Bottom | Wall::Left => {
            let lo = wall_boxes.partition_point(|at| along_edges(at).1 > max);
            let hi = lo + wall_boxes[lo..].partition_point(|at| along_edges(at).0 >= min);
            (lo, hi)
        }
    };
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::planned::dense::ring::Door;

    fn within(at: Rect, page: &Rect) -> bool {
        at.x >= page.x - 1e-6
            && at.y >= page.y - 1e-6
            && at.x + at.width <= page.x + page.width + 1e-6
            && at.y + at.height <= page.y + page.height + 1e-6
    }

    #[test]
    fn wall_ranges_match_the_stored_boxes_after_coordinate_rounding() {
        let whole = Rect {
            x: 2.0_f64.powi(58),
            y: 2.0_f64.powi(58),
            width: 192.0,
            height: 192.0,
        };
        let ring = Ring::new(whole, 0.0, Point { x: 120.0, y: 120.0 });
        let door = Door {
            size: Point { x: 12.0, y: 12.0 },
            plates: 0.0,
        };
        let boxes: Vec<_> = (0..ring.slots())
            .map(|slot| ring.place(slot, door))
            .collect();
        for (wall, &(start, count)) in ring.walls.iter().enumerate() {
            let wall_boxes = &boxes[start..start + count];
            let fit = wall_boxes.partition_point(Option::is_some);
            let (lo, hi) = wall_range(&ring, &boxes, wall, fit, &whole);
            for (offset, at) in wall_boxes.iter().enumerate() {
                assert_eq!(
                    (lo..hi).contains(&offset),
                    at.is_some_and(|at| within(at, &whole)),
                    "wall {wall}, slot {offset}",
                );
            }
        }
    }
}
