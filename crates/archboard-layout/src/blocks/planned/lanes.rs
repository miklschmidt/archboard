//! A corridor consumes peak interval occupancy, not one lane per relationship.

use crate::track::chains::LANE;

pub(super) struct Interval {
    pub start: f64,
    pub end: f64,
}

/// Stable interval coloring with clearance and lowest-lane reuse.
pub(super) fn assign(intervals: &[Interval]) -> Vec<usize> {
    let mut order: Vec<_> = (0..intervals.len()).collect();
    order.sort_by(|&a, &b| {
        intervals[a]
            .start
            .total_cmp(&intervals[b].start)
            .then_with(|| intervals[a].end.total_cmp(&intervals[b].end))
            .then(a.cmp(&b))
    });
    let mut ends = Vec::new();
    let mut lanes = vec![0; intervals.len()];
    for index in order {
        let interval = &intervals[index];
        let lane = ends
            .iter()
            .position(|&end| end + LANE < interval.start)
            .unwrap_or(ends.len());
        if lane == ends.len() {
            ends.push(interval.end);
        } else {
            ends[lane] = interval.end;
        }
        lanes[index] = lane;
    }
    lanes
}

/// An assigned channel coordinate inside one measured gap.
#[derive(Clone, Copy)]
pub(super) struct Hint {
    pub horizontal: bool,
    pub at: f64,
}

/// Assign only intervals that share the same free band. Disjoint bands are independent.
pub(super) fn corridors(
    model: &super::model::Model<'_>,
    topology: &super::topology::Topology,
    scope: usize,
    shape: &super::shape::Shape,
) -> std::collections::BTreeMap<usize, Hint> {
    use std::collections::BTreeMap;
    let mut groups: BTreeMap<(bool, u64, u64), Vec<(usize, Interval)>> = BTreeMap::new();
    for (edge, _) in topology
        .routes
        .iter()
        .enumerate()
        .filter(|(_, route)| route.scope == scope)
    {
        let (from, to) = model.ends[edge];
        let source = shape.endpoints[&from];
        let target = shape.endpoints[&to];
        if let Some((horizontal, low, high, interval)) = band(source, target) {
            groups
                .entry((horizontal, low.to_bits(), high.to_bits()))
                .or_default()
                .push((edge, interval));
        }
    }
    let mut hints = BTreeMap::new();
    for ((horizontal, low, high), requests) in groups {
        let intervals: Vec<_> = requests
            .iter()
            .map(|(_, i)| Interval {
                start: i.start,
                end: i.end,
            })
            .collect();
        for ((edge, _), lane) in requests.into_iter().zip(assign(&intervals)) {
            let at = f64::from_bits(low) + super::shape::CLEAR + lane as f64 * LANE;
            if at <= f64::from_bits(high) - super::shape::CLEAR {
                hints.insert(edge, Hint { horizontal, at });
            }
        }
    }
    hints
}

fn band(
    source: crate::geometry::Rect,
    target: crate::geometry::Rect,
) -> Option<(bool, f64, f64, Interval)> {
    let vertical = (source.y + source.height).min(target.y + target.height);
    let bottom = source.y.max(target.y);
    let horizontal = (source.x + source.width).min(target.x + target.width);
    let right = source.x.max(target.x);
    if bottom - vertical >= 2.0 * super::shape::CLEAR {
        let a = source.x + source.width / 2.0;
        let b = target.x + target.width / 2.0;
        Some((
            true,
            vertical,
            bottom,
            Interval {
                start: a.min(b),
                end: a.max(b),
            },
        ))
    } else if right - horizontal >= 2.0 * super::shape::CLEAR {
        let a = source.y + source.height / 2.0;
        let b = target.y + target.height / 2.0;
        Some((
            false,
            horizontal,
            right,
            Interval {
                start: a.min(b),
                end: a.max(b),
            },
        ))
    } else {
        None
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disjoint_connections_reuse_room_but_nearby_intervals_keep_clearance() {
        let intervals = [(0.0, 100.0), (50.0, 120.0), (140.0, 180.0), (190.0, 220.0)]
            .map(|(start, end)| Interval { start, end });
        assert_eq!(assign(&intervals), [0, 1, 0, 1]);
    }
}
