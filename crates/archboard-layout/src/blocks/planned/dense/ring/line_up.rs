//! The cheapest places of the doors round one ring for what each place costs each door: an
//! exact dynamic program over places along the ring, for doors that keep one order round it.

use super::{Door, Ring};

/// Where along the ring a door would stand alone: the middle of its cheapest places.
fn alone(costs: &[Option<f64>]) -> f64 {
    let least = costs
        .iter()
        .flatten()
        .copied()
        .fold(f64::INFINITY, f64::min);
    let cheapest: Vec<usize> = (0..costs.len())
        .filter(|&slot| costs[slot].is_some_and(|cost| cost <= least + 1.0))
        .collect();
    cheapest.iter().sum::<usize>() as f64 / cheapest.len().max(1) as f64
}

/// For a door after the doors placed so far, the least those doors cost in all that leaves each
/// place along the ring free for it, and where the last of them stands for that. `best` holds
/// what they cost in all with the last door at each place.
fn frees(
    ring: &Ring,
    last: Door,
    best: &[f64],
    slot: impl Fn(usize) -> usize,
) -> (Vec<f64>, Vec<usize>) {
    let slots = ring.slots();
    let mut least = vec![f64::INFINITY; slots + 1];
    let mut from = vec![usize::MAX; slots + 1];
    for (linear, &cost) in best.iter().enumerate().filter(|(_, cost)| cost.is_finite()) {
        // A wall's end is the next wall's start, so `after` stays linear past the cut.
        let free = ring.after(slot(linear), last) - slot(linear) + linear;
        if free <= slots && cost < least[free] {
            least[free] = cost;
            from[free] = linear;
        }
    }
    // A place further along is free wherever an earlier one is.
    for linear in 1..=slots {
        if least[linear - 1] < least[linear] {
            least[linear] = least[linear - 1];
            from[linear] = from[linear - 1];
        }
    }
    (least, from)
}

/// The cheapest places of doors that keep one order along the ring from one slot on, and
/// what they cost in all.
fn line_up(
    ring: &Ring,
    sizes: &[Door],
    costs: &[Vec<Option<f64>>],
    order: &[usize],
    cut: usize,
) -> Option<(f64, Vec<usize>)> {
    let slots = ring.slots();
    let slot = |linear: usize| (cut + linear) % slots;
    // Each door's least cost in all at each linear place, and where the door before it stands.
    let mut best: Vec<Vec<f64>> = Vec::with_capacity(order.len());
    let mut before: Vec<Vec<usize>> = Vec::with_capacity(order.len());
    for (rank, &door) in order.iter().enumerate() {
        let (least, from) = match rank.checked_sub(1) {
            None => (vec![0.0; slots + 1], vec![usize::MAX; slots + 1]),
            Some(previous) => frees(ring, sizes[order[previous]], &best[previous], slot),
        };
        let own: Vec<f64> = (0..slots)
            .map(|linear| {
                costs[door][slot(linear)].map_or(f64::INFINITY, |cost| least[linear] + cost)
            })
            .collect();
        best.push(own);
        before.push(from);
    }
    let last = best.last()?;
    let end = (0..slots).min_by(|&a, &b| last[a].total_cmp(&last[b]))?;
    let total = last[end];
    if !total.is_finite() {
        return None;
    }
    // Back from the last door, each door's place and the place of the door before it.
    let mut linear = end;
    let mut places: Vec<usize> = (before.iter().rev())
        .map(|from| {
            let at = slot(linear);
            linear = from[linear];
            at
        })
        .collect();
    places.reverse();
    Some((total, places))
}

/// The cheapest places of doors round a ring at what each place costs each door, for the four
/// orders that start at a wall's first slot.
pub(super) fn cheapest(
    ring: &Ring,
    sizes: &[Door],
    costs: &[Vec<Option<f64>>],
) -> Option<(f64, Vec<usize>, Vec<usize>)> {
    let wanted: Vec<f64> = costs.iter().map(|costs| alone(costs)).collect();
    let slots = ring.slots();
    (0..4)
        .filter_map(|wall| {
            let cut = ring.walls[wall].0;
            let along = |door: usize| (wanted[door] - cut as f64).rem_euclid(slots as f64);
            let mut order: Vec<usize> = (0..sizes.len()).collect();
            order.sort_by(|&a, &b| along(a).total_cmp(&along(b)).then(a.cmp(&b)));
            let (total, places) = line_up(ring, sizes, costs, &order, cut)?;
            Some((total, order, places))
        })
        .min_by(|a, b| a.0.total_cmp(&b.0))
}
