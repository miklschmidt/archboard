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

struct Reservation {
    edges: Vec<usize>,
    interval: Interval,
}
type Bands = std::collections::BTreeMap<(bool, u64, u64), Vec<Reservation>>;

fn bands(
    model: &super::model::Model<'_>,
    topology: &super::topology::Topology,
    scope: usize,
    shape: &super::shape::Shape,
) -> Bands {
    let mut groups = Bands::new();
    for (edge, _) in topology
        .routes
        .iter()
        .enumerate()
        .filter(|(_, route)| route.scope == scope)
    {
        let (from, to) = model.ends[edge];
        if let Some((horizontal, low, high, interval)) =
            band(shape.endpoints[&from], shape.endpoints[&to])
        {
            let group = groups
                .entry((horizontal, low.to_bits(), high.to_bits()))
                .or_default();
            reserve(topology, edge, interval, group);
        }
    }
    groups
}

/// A source fan's shared band must precede private labels. A target fan follows them.
fn reserve(
    topology: &super::topology::Topology,
    edge: usize,
    interval: Interval,
    group: &mut Vec<Reservation>,
) {
    let fan = topology.fans.iter().find(|fan| {
        fan.members.contains(&edge)
            && (!matches!(fan.common, super::topology::CommonEndpoint::Source(_))
                || fan
                    .members
                    .iter()
                    .all(|member| !topology.labels.iter().any(|label| label.edge == *member)))
    });
    let existing = group.iter_mut().find(|request| {
        fan.is_some_and(|fan| request.edges.iter().all(|edge| fan.members.contains(edge)))
    });
    if let Some(request) = existing {
        request.edges.push(edge);
        request.interval.start = request.interval.start.min(interval.start);
        request.interval.end = request.interval.end.max(interval.end);
    } else {
        group.push(Reservation {
            edges: vec![edge],
            interval,
        });
    }
}

fn lanes(requests: &[Reservation]) -> Vec<usize> {
    assign(
        &requests
            .iter()
            .map(|request| Interval {
                start: request.interval.start,
                end: request.interval.end,
            })
            .collect::<Vec<_>>(),
    )
}

pub(super) struct Room {
    pub gap: crate::geometry::Point,
    pub peak: usize,
}

/// Grow each axis only to its peak simultaneous occupancy, before the candidate freezes.
pub(super) fn room(
    model: &super::model::Model<'_>,
    topology: &super::topology::Topology,
    scope: usize,
    shape: &super::shape::Shape,
) -> Room {
    let mut peak = 0;
    let mut room = crate::geometry::Point {
        x: 2.0 * super::shape::CLEAR,
        y: 2.0 * super::shape::CLEAR,
    };
    for ((horizontal, _, _), requests) in bands(model, topology, scope, shape) {
        let count = lanes(&requests).into_iter().max().unwrap_or(0) + 1;
        peak = peak.max(count);
        let extra = count.saturating_sub(1) as f64 * LANE;
        let gap = 2.0 * super::shape::CLEAR + extra;
        if horizontal {
            room.y = room.y.max(gap);
        } else {
            room.x = room.x.max(gap);
        }
    }
    Room { gap: room, peak }
}

/// Assign only intervals that share the same free band. Disjoint bands are independent.
pub(super) fn corridors(
    model: &super::model::Model<'_>,
    topology: &super::topology::Topology,
    scope: usize,
    shape: &super::shape::Shape,
) -> std::collections::BTreeMap<usize, Hint> {
    let mut hints = std::collections::BTreeMap::new();
    for ((horizontal, low, high), requests) in bands(model, topology, scope, shape) {
        let assigned = lanes(&requests);
        for (request, lane) in requests.into_iter().zip(assigned) {
            let at = f64::from_bits(low) + super::shape::CLEAR + lane as f64 * LANE;
            if at <= f64::from_bits(high) - super::shape::CLEAR {
                hints.extend(
                    request
                        .edges
                        .into_iter()
                        .map(|edge| (edge, Hint { horizontal, at })),
                );
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
