//! Where the frames of a dense placement stand together: in rows, or in stacks side by side.

use crate::geometry::Point;

use super::readable;

/// Room between two frames before routing. Contraction takes back what the routes leave.
pub(super) const FRAME_GAP: f64 = 112.0;
/// The share of the readable page's width that three frames or more fill in their rows or
/// stacks. The doors that stand round the frames widen the page more than they heighten it.
const ROWS_SHARE: f64 = 0.6;
/// The most frames that weigh every way to share them among their stacks. Past it, each frame
/// takes the shortest stack.
const SHARED: usize = 8;

/// Where each frame stands in the whole that the doors stand round, and that whole's size. Two
/// frames stand in one row, or one above the other. Three frames or more stand in rows, or in
/// stacks side by side: in as many rows or stacks as land their whole at the largest scale on the
/// readable page, so they make neither a strip nor a column.
pub(super) fn together(sizes: &[Point], stacked: bool, room: f64) -> (Vec<Point>, Point) {
    let gap = FRAME_GAP + room;
    let widest = sizes.iter().map(|size| size.x).fold(0.0, f64::max);
    if sizes.len() < 3 {
        return in_rows(sizes, if stacked { widest } else { f64::INFINITY }, gap);
    }
    let ways: Vec<(Vec<Point>, Point)> = if stacked {
        (1..sizes.len())
            .map(|count| in_stacks(sizes, count, gap))
            .collect()
    } else {
        (row_widths(sizes, gap, widest).into_iter())
            .map(|width| in_rows(sizes, width, gap))
            .collect()
    };
    (ways.into_iter())
        .min_by(|a, b| landing(a.1).total_cmp(&landing(b.1)))
        .unwrap_or_else(|| in_rows(sizes, f64::INFINITY, gap))
}

/// How far a whole of three frames or more shrinks to land on the readable page, with the doors
/// that stand round it.
fn landing(whole: Point) -> f64 {
    let page = readable();
    (whole.x / (page.x * ROWS_SHARE)).max(whole.y / page.y)
}

/// Each width at which the frames fill their rows another way: the width of every run of frames
/// in their order, from the widest frame up. The narrowest comes first.
fn row_widths(sizes: &[Point], gap: f64, widest: f64) -> Vec<f64> {
    let mut widths: Vec<f64> = (0..sizes.len())
        .flat_map(|start| {
            sizes[start..].iter().scan(-gap, move |width, size| {
                *width += gap + size.x;
                Some(*width)
            })
        })
        .filter(|&width| width >= widest)
        .collect();
    widths.sort_by(f64::total_cmp);
    widths.dedup();
    widths
}

/// The frames in rows no wider than a width, and that whole's size. Each frame takes the first
/// row with room, so a small frame late in the order fills what a short row leaves.
pub(super) fn in_rows(sizes: &[Point], width: f64, gap: f64) -> (Vec<Point>, Point) {
    let mut rows: Vec<Point> = Vec::new();
    let seats: Vec<(usize, f64)> = sizes
        .iter()
        .map(|size| {
            let row = rows
                .iter()
                .position(|row| row.x + gap + size.x <= width)
                .unwrap_or_else(|| {
                    rows.push(Point { x: -gap, y: 0.0 });
                    rows.len() - 1
                });
            let x = rows[row].x + gap;
            rows[row] = Point {
                x: x + size.x,
                y: rows[row].y.max(size.y),
            };
            (row, x)
        })
        .collect();
    let tops: Vec<f64> = rows
        .iter()
        .scan(0.0, |top, row| {
            let at = *top;
            *top += row.y + gap;
            Some(at)
        })
        .collect();
    let places = seats
        .into_iter()
        .map(|(row, x)| Point { x, y: tops[row] })
        .collect();
    let size = Point {
        x: rows.iter().map(|row| row.x).fold(0.0, f64::max),
        y: rows.iter().map(|row| row.y + gap).sum::<f64>() - gap,
    };
    (places, size)
}

/// The frames in some stacks side by side, and that whole's size. The frames share the stacks
/// the way that lands their whole at the largest scale, and of those the smallest, so a short
/// frame stands under another beside a tall one rather than leave that height blank. A stack
/// holds its frames in their order, and the stacks stand in the order of their first frames.
fn in_stacks(sizes: &[Point], count: usize, gap: f64) -> (Vec<Point>, Point) {
    let mut best: Option<((f64, f64), Vec<usize>)> = None;
    let mut weigh = |of: &[usize]| {
        let whole = stacks(sizes, of, count, gap).1;
        let rank = (landing(whole), whole.x * whole.y);
        if best.as_ref().is_none_or(|(least, _)| rank < *least) {
            best = Some((rank, of.to_vec()));
        }
    };
    if sizes.len() <= SHARED {
        shares(&mut Vec::new(), (sizes.len(), count), &mut weigh);
    } else {
        weigh(&shortest(sizes, count, gap));
    }
    let of = best.map_or_else(|| shortest(sizes, count, gap), |(_, of)| of);
    stacks(sizes, &of, count, gap)
}

/// The stack of each frame when each in its order takes the shortest stack.
fn shortest(sizes: &[Point], count: usize, gap: f64) -> Vec<usize> {
    let mut heights = vec![-gap; count];
    (sizes.iter())
        .map(|size| {
            let stack = (0..count)
                .min_by(|&a, &b| heights[a].total_cmp(&heights[b]))
                .unwrap_or(0);
            heights[stack] += gap + size.y;
            stack
        })
        .collect()
}

/// Visit every way to share some frames among some stacks, each stack holding a frame at least
/// and the stacks numbered in the order of their first frames, from the stacks of the frames
/// before.
fn shares(of: &mut Vec<usize>, (frames, count): (usize, usize), visit: &mut impl FnMut(&[usize])) {
    let used = of.iter().max().map_or(0, |&last| last + 1);
    if of.len() == frames {
        if used == count {
            visit(of);
        }
        return;
    }
    if count - used > frames - of.len() {
        return;
    }
    for stack in 0..=used.min(count - 1) {
        of.push(stack);
        shares(of, (frames, count), visit);
        of.pop();
    }
}

/// The frames in the stacks that each takes, the stacks in their numbers' order, and that
/// whole's size.
fn stacks(sizes: &[Point], of: &[usize], count: usize, gap: f64) -> (Vec<Point>, Point) {
    let mut heights = vec![-gap; count];
    let mut widths = vec![0.0_f64; count];
    let tops: Vec<f64> = (sizes.iter().zip(of))
        .map(|(size, &stack)| {
            let top = heights[stack] + gap;
            heights[stack] = top + size.y;
            widths[stack] = widths[stack].max(size.x);
            top
        })
        .collect();
    let lefts: Vec<f64> = widths
        .iter()
        .scan(-gap, |right, width| {
            let left = *right + gap;
            *right = left + width;
            Some(left)
        })
        .collect();
    let places = (tops.iter().zip(of))
        .map(|(&y, &stack)| Point { x: lefts[stack], y })
        .collect();
    let size = Point {
        x: lefts[count - 1] + widths[count - 1],
        y: heights.iter().copied().fold(0.0, f64::max),
    };
    (places, size)
}
