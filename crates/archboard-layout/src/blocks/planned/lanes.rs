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
    fans: [Option<usize>; 2],
}
type Bands = std::collections::BTreeMap<(bool, u64, u64), Vec<Reservation>>;

fn bands(
    model: &super::model::Model<'_>,
    topology: &super::topology::Topology,
    scope: usize,
    shape: &super::shape::Shape,
) -> Bands {
    let boxes: Vec<_> = model.scopes[scope]
        .children
        .iter()
        .map(|child| match child {
            super::model::Child::Endpoint(id) => shape.endpoints[id],
            super::model::Child::Scope(id) => shape.scopes[id].bounds,
        })
        .collect();
    let mut groups = Bands::new();
    let fans = band_fans(topology);
    for (edge, _) in topology
        .routes
        .iter()
        .enumerate()
        .filter(|(_, route)| route.scope == scope)
    {
        let (from, to) = model.ends[edge];
        if let Some((horizontal, low, high, interval)) = band(
            facing_box(model, scope, shape, from),
            facing_box(model, scope, shape, to),
            &boxes,
        ) {
            let group = groups
                .entry((horizontal, low.to_bits(), high.to_bits()))
                .or_default();
            reserve(topology, edge, interval, fans[edge], group);
        }
    }
    groups
}

/// A source fan's shared band must precede private labels. A target fan follows them.
fn band_fans(topology: &super::topology::Topology) -> Vec<Option<usize>> {
    let mut labelled = vec![false; topology.routes.len()];
    for label in &topology.labels {
        labelled[label.edge] = true;
    }
    let mut fans = vec![None; topology.routes.len()];
    for (index, fan) in topology.fans.iter().enumerate() {
        if matches!(fan.common, super::topology::CommonEndpoint::Source(_))
            && fan.members.iter().any(|&member| labelled[member])
        {
            continue;
        }
        for &edge in &fan.members {
            fans[edge].get_or_insert(index);
        }
    }
    fans
}

fn reserve(
    topology: &super::topology::Topology,
    edge: usize,
    interval: Interval,
    fan: Option<usize>,
    group: &mut Vec<Reservation>,
) {
    let existing = fan.and_then(|fan| {
        group
            .iter_mut()
            .find(|request| request.fans.contains(&Some(fan)))
    });
    if let Some(request) = existing {
        request.edges.push(edge);
        request.interval.start = request.interval.start.min(interval.start);
        request.interval.end = request.interval.end.max(interval.end);
        for fan in &mut request.fans {
            if !topology.memberships[edge].contains(fan) {
                *fan = None;
            }
        }
    } else {
        group.push(Reservation {
            edges: vec![edge],
            interval,
            fans: topology.memberships[edge],
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

fn facing_box(
    model: &super::model::Model<'_>,
    scope: usize,
    shape: &super::shape::Shape,
    endpoint: usize,
) -> crate::geometry::Rect {
    let mut owner = model.endpoints[endpoint].scope;
    if owner == scope {
        return shape.endpoints[&endpoint];
    }
    while model.scopes[owner].parent != Some(scope) {
        owner = model.scopes[owner].parent.expect("an ancestor scope");
    }
    shape.scopes[&owner].bounds
}

fn band(
    source: crate::geometry::Rect,
    target: crate::geometry::Rect,
    boxes: &[crate::geometry::Rect],
) -> Option<(bool, f64, f64, Interval)> {
    let vertical = (source.y + source.height).min(target.y + target.height);
    let mut bottom = source.y.max(target.y);
    let mut vertical = vertical;
    let upper = if source.y < target.y { source } else { target };
    vertical = boxes
        .iter()
        .filter(|r| (r.y - upper.y).abs() < 1e-6)
        .map(|r| r.y + r.height)
        .fold(vertical, f64::max);
    bottom = boxes
        .iter()
        .filter(|r| r.y >= vertical + 2.0 * super::shape::CLEAR)
        .map(|r| r.y)
        .fold(bottom, f64::min);
    let horizontal = (source.x + source.width).min(target.x + target.width);
    let mut right = source.x.max(target.x);
    let mut horizontal = horizontal;
    let left = if source.x < target.x { source } else { target };
    horizontal = boxes
        .iter()
        .filter(|r| (r.x - left.x).abs() < 1e-6)
        .map(|r| r.x + r.width)
        .fold(horizontal, f64::max);
    right = boxes
        .iter()
        .filter(|r| r.x >= horizontal + 2.0 * super::shape::CLEAR)
        .map(|r| r.x)
        .fold(right, f64::min);
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
    use crate::blocks::planned::{model::Model, topology::Topology};
    use crate::graph::Node;
    use serde_json::json;

    #[test]
    fn bands_keep_the_first_eligible_fan_and_never_merge_through_a_former_member() {
        for (labelled, target_first) in [(false, false), (true, false), (false, true)] {
            let graph = fan_graph(labelled, target_first);
            let model = Model::new(&graph).unwrap();
            let topology = Topology::new(&model);
            let fans = band_fans(&topology);
            let mut requests = Vec::new();
            for id in ["ax", "bx", "ay", "ax2"] {
                let edge = model.edge_index[id];
                reserve(
                    &topology,
                    edge,
                    Interval {
                        start: 0.0,
                        end: 100.0,
                    },
                    fans[edge],
                    &mut requests,
                );
            }
            let members: Vec<Vec<_>> = requests
                .iter()
                .map(|request| {
                    request
                        .edges
                        .iter()
                        .map(|&edge| model.edges[edge].id.as_str())
                        .collect()
                })
                .collect();
            let expected = if labelled || target_first {
                vec![vec!["ax", "bx", "ax2"], vec!["ay"]]
            } else {
                vec![vec!["ax", "bx"], vec!["ay", "ax2"]]
            };
            assert_eq!(members, expected);
        }
    }

    fn fan_graph(labelled: bool, target_first: bool) -> Node {
        let mut graph = json!({"id":"root", "children":[
            {"id":"a","width":160,"height":80},
            {"id":"b","width":160,"height":80},
            {"id":"x","width":160,"height":80},
            {"id":"y","width":160,"height":80}], "edges":[
            {"id":"ax","sources":["a"],"targets":["x"]},
            {"id":"ax2","sources":["a"],"targets":["x"]},
            {"id":"bx","sources":["b"],"targets":["x"]},
            {"id":"ay","sources":["a"],"targets":["y"]}]});
        if labelled {
            graph["edges"][3]["labels"] = json!([{"width":80,"height":24}]);
        }
        if target_first {
            graph["edges"][2]["layoutOptions"] = json!({"archboard.order":"-1"});
        }
        serde_json::from_value(graph).unwrap()
    }

    #[test]
    fn disjoint_connections_reuse_room_but_nearby_intervals_keep_clearance() {
        let intervals = [(0.0, 100.0), (50.0, 120.0), (140.0, 180.0), (190.0, 220.0)]
            .map(|(start, end)| Interval { start, end });
        assert_eq!(assign(&intervals), [0, 1, 0, 1]);
    }
}
