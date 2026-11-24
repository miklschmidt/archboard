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

/// Where along the ring a door would stand alone: the middle of its cheapest places.
fn alone(costs: &[f64]) -> f64 {
    let least = costs.iter().copied().fold(f64::INFINITY, f64::min);
    let (mut sum, mut count) = (0usize, 0usize);
    for (slot, &cost) in costs.iter().enumerate() {
        if cost.is_finite() && cost <= least + 1.0 {
            sum += slot;
            count += 1;
        }
    }
    sum as f64 / count.max(1) as f64
}

/// Update `least` and `from` with every placement along one wall starting at `start`.
fn frees_wall(
    wall_best: &[f64],
    start: usize,
    take: usize,
    least: &mut [f64],
    from: &mut [usize],
) {
    let count = wall_best.len();
    let mid = count.saturating_sub(take);
    for (along, &cost) in wall_best[..mid].iter().enumerate() {
        let free = start + along + take;
        if cost < least[free] {
            least[free] = cost;
            from[free] = start + along;
        }
    }
    let end = start + count;
    let (mut tail_cost, mut tail_from) = (least[end], from[end]);
    for (idx, &cost) in wall_best[mid..].iter().enumerate() {
        if cost < tail_cost {
            tail_cost = cost;
            tail_from = start + mid + idx;
        }
    }
    least[end] = tail_cost;
    from[end] = tail_from;
}

/// For a door after the doors placed so far, the least those doors cost in all that leaves each
/// place along the ring free for it, and where the last of them stands for that. `best` holds
/// what they cost in all with the last door at each place, in linear order from the first slot
/// of a wall.
fn frees(
    ring: &Ring,
    takes: [usize; 4],
    best: &[f64],
    first: usize,
    least: &mut [f64],
    from: &mut [usize],
) {
    least.fill(f64::INFINITY);
    from.fill(usize::MAX);
    // The walls in linear order. The first place free past a door is past its room on the same
    // wall, or the next wall's first slot, which stands clear of it round the corner. A wall's
    // end is the next wall's start, so that place stays linear past the cut.
    let mut start = 0;
    for offset in 0..4 {
        let wall = (first + offset) & 3;
        let count = ring.walls[wall].1;
        frees_wall(&best[start..start + count], start, takes[wall], least, from);
        start += count;
    }
    // A place further along is free wherever an earlier one is.
    let mut earlier = (f64::INFINITY, usize::MAX);
    for (least, from) in least.iter_mut().zip(from.iter_mut()) {
        if earlier.0 < *least {
            (*least, *from) = earlier;
        } else {
            earlier = (*least, *from);
        }
    }
}

/// Add a door's costs (rotated to start at `cut`) into `dest`.
fn add_rotated(dest: &mut [f64], door_costs: &[f64], cut: usize) {
    let (before_cut, after_cut) = door_costs.split_at(cut);
    let tail = after_cut.len();
    for (own, &cost) in dest[..tail].iter_mut().zip(after_cut) {
        *own += cost;
    }
    for (own, &cost) in dest[tail..].iter_mut().zip(before_cut) {
        *own += cost;
    }
}

/// The cheapest places of doors that keep one order along the ring from a wall's first slot
/// on, and what they cost in all.
fn line_up(
    ring: &Ring,
    takes: &[[usize; 4]],
    costs: &[f64],
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
    scratch.prev.fill(0.0);
    add_rotated(
        &mut scratch.prev,
        &costs[first_door * slots..(first_door + 1) * slots],
        cut,
    );
    for rank in 1..doors {
        let prev_door = scratch.order[rank - 1];
        let door = scratch.order[rank];
        let from_slice = &mut scratch.before[rank * stride..(rank + 1) * stride];
        frees(
            ring,
            takes[prev_door],
            &scratch.prev,
            first,
            &mut scratch.curr,
            from_slice,
        );
        add_rotated(
            &mut scratch.curr[..slots],
            &costs[door * slots..(door + 1) * slots],
            cut,
        );
        scratch.prev.copy_from_slice(&scratch.curr[..slots]);
    }
    let end = (0..slots).min_by(|&a, &b| scratch.prev[a].total_cmp(&scratch.prev[b]))?;
    let total = scratch.prev[end];
    if !total.is_finite() {
        return None;
    }
    // Back from the last door, each door's place and the place of the door before it.
    let mut linear = end;
    let mut places = vec![0; doors];
    for rank in (0..doors).rev() {
        places[rank] = (cut + linear) % slots;
        if rank > 0 {
            linear = scratch.before[rank * stride + linear];
        }
    }
    Some((total, places))
}

/// The cheapest places of doors round a ring at what each place costs each door (flat
/// `doors * slots`, with `f64::INFINITY` where disallowed), for the four orders that start at a
/// wall's first slot.
pub(super) fn cheapest(
    ring: &Ring,
    takes: &[[usize; 4]],
    costs: &[f64],
    scratch: &mut Scratch,
) -> Option<(f64, Vec<usize>, Vec<usize>)> {
    let slots = ring.slots();
    let doors = takes.len();
    scratch.wanted.clear();
    scratch.wanted.extend(
        (0..doors).map(|door| alone(&costs[door * slots..(door + 1) * slots])),
    );
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
        let Some((total, places)) = line_up(ring, takes, costs, wall, scratch) else {
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
