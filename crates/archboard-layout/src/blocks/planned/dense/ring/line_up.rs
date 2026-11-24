//! The cheapest places of the doors round one ring for what each place costs each door: an
//! exact dynamic program over places along the ring, for doors that keep one order round it.

use super::Ring;

/// Reusable scratch buffers for `cheapest`, avoiding per-page and per-door allocations.
#[derive(Default)]
pub(super) struct Scratch {
    prev: Vec<f64>,
    curr: Vec<f64>,
    before: Vec<usize>,
    wanted: Vec<f64>,
    order: Vec<usize>,
}

/// Where along the ring a door would stand alone: the middle of its cheapest allowed places.
fn alone(ring: &Ring, costs: &[f64], ranges: [(usize, usize); 4]) -> f64 {
    let mut least = f64::INFINITY;
    for (wall, &(lo, hi)) in ranges.iter().enumerate() {
        let start = ring.walls[wall].0;
        for &cost in &costs[start + lo..start + hi] {
            least = least.min(cost);
        }
    }
    let (mut sum, mut count) = (0usize, 0usize);
    let limit = least + 1.0;
    for (wall, &(lo, hi)) in ranges.iter().enumerate() {
        let start = ring.walls[wall].0;
        for (idx, &cost) in costs[start + lo..start + hi].iter().enumerate() {
            if cost.is_finite() && cost <= limit {
                sum += start + lo + idx;
                count += 1;
            }
        }
    }
    sum as f64 / count.max(1) as f64
}

/// The smallest linear index that any placement of `prev_door` at or past `prev_min` can leave
/// free.
fn first_free(
    ring: &Ring,
    takes: [usize; 4],
    prev_ranges: [(usize, usize); 4],
    prev_min: usize,
    first: usize,
) -> usize {
    let mut start = 0;
    for offset in 0..4 {
        let wall = (first + offset) & 3;
        let count = ring.walls[wall].1;
        let (lo, hi) = prev_ranges[wall];
        let lo = lo.max(prev_min.saturating_sub(start));
        if lo < hi {
            return (start + lo + takes[wall]).min(start + count);
        }
        start += count;
    }
    ring.slots()
}

/// Update `least` and `from` with every placement along `lo..hi` on one wall starting at `start`.
fn frees_wall(
    wall_best: &[f64],
    (start, lo, hi): (usize, usize, usize),
    take: usize,
    least: &mut [f64],
    from: &mut [usize],
) {
    let count = wall_best.len();
    let mid = count.saturating_sub(take);
    let body_hi = hi.min(mid);
    let body_lo = lo.min(body_hi);
    for (idx, &cost) in wall_best[body_lo..body_hi].iter().enumerate() {
        let along = body_lo + idx;
        let free = start + along + take;
        if cost < least[free] {
            least[free] = cost;
            from[free] = start + along;
        }
    }
    let tail_lo = lo.max(mid).min(hi);
    let end = start + count;
    let (mut tail_cost, mut tail_from) = (least[end], from[end]);
    for (idx, &cost) in wall_best[tail_lo..hi].iter().enumerate() {
        if cost < tail_cost {
            tail_cost = cost;
            tail_from = start + tail_lo + idx;
        }
    }
    least[end] = tail_cost;
    from[end] = tail_from;
}

/// For a door after the doors placed so far, the least those doors cost in all that leaves each
/// place along the ring (from `min_free` onward) free for it, and where the last of them stands.
fn frees(
    ring: &Ring,
    takes: [usize; 4],
    best: &[f64],
    (prev_ranges, prev_min, first): ([(usize, usize); 4], usize, usize),
    (least, from): (&mut [f64], &mut [usize]),
) -> usize {
    let min_free = first_free(ring, takes, prev_ranges, prev_min, first);
    if min_free >= ring.slots() {
        return min_free;
    }
    least[min_free..].fill(f64::INFINITY);
    from[min_free..].fill(usize::MAX);
    // The walls in linear order. The first place free past a door is past its room on the same
    // wall, or the next wall's first slot, which stands clear of it round the corner. A wall's
    // end is the next wall's start, so that place stays linear past the cut.
    let mut start = 0;
    for offset in 0..4 {
        let wall = (first + offset) & 3;
        let count = ring.walls[wall].1;
        let (lo, hi) = prev_ranges[wall];
        let lo = lo.max(prev_min.saturating_sub(start));
        if lo < hi {
            frees_wall(
                &best[start..start + count],
                (start, lo, hi),
                takes[wall],
                least,
                from,
            );
        }
        start += count;
    }
    // A place further along is free wherever an earlier one is.
    let mut earlier = (f64::INFINITY, usize::MAX);
    for (least, from) in least[min_free..].iter_mut().zip(from[min_free..].iter_mut()) {
        if earlier.0 < *least {
            (*least, *from) = earlier;
        } else {
            earlier = (*least, *from);
        }
    }
    min_free
}

/// Write the first door's costs into `prev` across its allowed wall ranges, returning the
/// smallest linear index written (or `ring.slots()` if none).
fn seed_first(
    ring: &Ring,
    door_costs: &[f64],
    door_ranges: [(usize, usize); 4],
    first: usize,
    prev: &mut [f64],
) -> usize {
    let mut lin_start = 0;
    let mut min_lin = ring.slots();
    for offset in 0..4 {
        let wall = (first + offset) & 3;
        let (ring_start, count) = ring.walls[wall];
        let (lo, hi) = door_ranges[wall];
        if lo < hi {
            min_lin = min_lin.min(lin_start + lo);
            prev[lin_start + lo..lin_start + hi]
                .copy_from_slice(&door_costs[ring_start + lo..ring_start + hi]);
        }
        lin_start += count;
    }
    min_lin
}

/// Add a door's costs across its allowed ranges at or past `min_free`, writing `curr + cost`
/// directly into `prev`, and returning the smallest linear index written (or `ring.slots()`).
fn step_door(
    ring: &Ring,
    door_costs: &[f64],
    door_ranges: [(usize, usize); 4],
    (first, min_free): (usize, usize),
    (curr, prev): (&[f64], &mut [f64]),
) -> usize {
    let mut lin_start = 0;
    let mut min_lin = ring.slots();
    for offset in 0..4 {
        let wall = (first + offset) & 3;
        let (ring_start, count) = ring.walls[wall];
        let (lo, hi) = door_ranges[wall];
        let lo = lo.max(min_free.saturating_sub(lin_start));
        if lo < hi {
            min_lin = min_lin.min(lin_start + lo);
            let dst = &mut prev[lin_start + lo..lin_start + hi];
            let src = &curr[lin_start + lo..lin_start + hi];
            let own = &door_costs[ring_start + lo..ring_start + hi];
            for ((out, &base), &cost) in dst.iter_mut().zip(src).zip(own) {
                *out = base + cost;
            }
        }
        lin_start += count;
    }
    min_lin
}

/// Find the linear slot of the cheapest final placement for `last_door` at or past `min_lin`.
fn best_end(
    ring: &Ring,
    prev: &[f64],
    last_ranges: [(usize, usize); 4],
    (first, min_lin): (usize, usize),
) -> Option<(usize, f64)> {
    let mut best: Option<(usize, f64)> = None;
    let mut lin_start = 0;
    for offset in 0..4 {
        let wall = (first + offset) & 3;
        let count = ring.walls[wall].1;
        let (lo, hi) = last_ranges[wall];
        let lo = lo.max(min_lin.saturating_sub(lin_start));
        if lo < hi {
            for (idx, &cost) in prev[lin_start + lo..lin_start + hi].iter().enumerate() {
                if best.is_none_or(|(_, cur)| cost.total_cmp(&cur).is_lt()) {
                    best = Some((lin_start + lo + idx, cost));
                }
            }
        }
        lin_start += count;
    }
    best.filter(|&(_, total)| total.is_finite())
}

/// The cheapest places of doors that keep one order along the ring from a wall's first slot
/// on, and what they cost in all.
fn line_up(
    ring: &Ring,
    takes: &[[usize; 4]],
    costs: &[f64],
    ranges: &[[(usize, usize); 4]],
    first: usize,
    scratch: &mut Scratch,
) -> Option<(f64, Vec<usize>)> {
    let doors = scratch.order.len();
    if doors == 0 {
        return None;
    }
    let slots = ring.slots();
    let stride = slots + 1;
    let cut = ring.walls[first].0;
    scratch.prev.resize(slots, 0.0);
    scratch.curr.resize(stride, 0.0);
    scratch.before.resize(doors * stride, usize::MAX);
    let first_door = scratch.order[0];
    let mut min_lin = seed_first(
        ring,
        &costs[first_door * slots..(first_door + 1) * slots],
        ranges[first_door],
        first,
        &mut scratch.prev,
    );
    if min_lin >= slots {
        return None;
    }
    for rank in 1..doors {
        let prev_door = scratch.order[rank - 1];
        let door = scratch.order[rank];
        let from_slice = &mut scratch.before[rank * stride..(rank + 1) * stride];
        let min_free = frees(
            ring,
            takes[prev_door],
            &scratch.prev,
            (ranges[prev_door], min_lin, first),
            (&mut scratch.curr, from_slice),
        );
        if min_free >= slots {
            return None;
        }
        min_lin = step_door(
            ring,
            &costs[door * slots..(door + 1) * slots],
            ranges[door],
            (first, min_free),
            (&scratch.curr, &mut scratch.prev),
        );
        if min_lin >= slots {
            return None;
        }
    }
    let last_door = scratch.order[doors - 1];
    let (end, total) = best_end(ring, &scratch.prev, ranges[last_door], (first, min_lin))?;
    Some((total, backtrack(&scratch.before, doors, slots, cut, end)))
}

/// Recover each door's ring slot back from the last door's linear slot.
fn backtrack(before: &[usize], doors: usize, slots: usize, cut: usize, end: usize) -> Vec<usize> {
    let stride = slots + 1;
    let mut linear = end;
    let mut places = vec![0; doors];
    for rank in (0..doors).rev() {
        places[rank] = (cut + linear) % slots;
        if rank > 0 {
            linear = before[rank * stride + linear];
        }
    }
    places
}

/// The cheapest places of doors round a ring at what each place costs each door (flat
/// `doors * slots`), restricted to `ranges`, for the four orders that start at a wall's first
/// slot.
pub(super) fn cheapest(
    ring: &Ring,
    takes: &[[usize; 4]],
    costs: &[f64],
    ranges: &[[(usize, usize); 4]],
    scratch: &mut Scratch,
) -> Option<(f64, Vec<usize>, Vec<usize>)> {
    let slots = ring.slots();
    let doors = takes.len();
    scratch.wanted.clear();
    scratch.wanted.extend((0..doors).map(|door| {
        alone(
            ring,
            &costs[door * slots..(door + 1) * slots],
            ranges[door],
        )
    }));
    let mut best: Option<(f64, Vec<usize>, Vec<usize>)> = None;
    for wall in 0..4 {
        let cut = ring.walls[wall].0 as f64;
        let span = slots as f64;
        scratch.order.clear();
        scratch.order.extend(0..doors);
        let wanted = &scratch.wanted;
        scratch.order.sort_by(|&a, &b| {
            let along_a = (wanted[a] - cut).rem_euclid(span);
            let along_b = (wanted[b] - cut).rem_euclid(span);
            along_a.total_cmp(&along_b).then(a.cmp(&b))
        });
        let Some((total, places)) = line_up(ring, takes, costs, ranges, wall, scratch) else {
            continue;
        };
        if best
            .as_ref()
            .is_none_or(|cur| total.total_cmp(&cur.0).is_lt())
        {
            best = Some((total, scratch.order.clone(), places));
        }
    }
    best
}
