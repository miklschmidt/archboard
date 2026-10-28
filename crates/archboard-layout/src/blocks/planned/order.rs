//! Local dependency hints. Cycles keep their real routes and authored internal order.

use super::model::{Child, Model};
use super::topology::Topology;
use crate::blocks::cycles::Below;

pub(super) struct Order {
    pub children: Vec<usize>,
    pub ranks: Vec<usize>,
    pub uniform: bool,
    independent: Vec<(usize, usize)>,
}

impl Order {
    /// One bounded adjacent exchange, after dependency order, for a packing candidate.
    pub(super) fn exchanged(&self, choice: usize) -> Vec<usize> {
        let mut order = self.children.clone();
        if let Some(&(a, b)) = self.independent.get(choice) {
            order.swap(a, b);
        }
        order
    }
}

pub(super) fn hints(model: &Model<'_>, topology: &Topology, scope: usize) -> Order {
    let count = model.scopes[scope].children.len();
    let dependencies: Vec<_> = topology
        .routes
        .iter()
        .enumerate()
        .filter(|(_, r)| r.scope == scope)
        .filter_map(|(edge, _)| {
            let (source, target) = model.ends[edge];
            let a = child_of(model, scope, source)?;
            let b = child_of(model, scope, target)?;
            (a != b).then_some((a, b))
        })
        .collect();
    let ids: Vec<_> = (0..count).map(|i| i.to_string()).collect();
    let mut below = Below::default();
    for &(a, b) in &dependencies {
        below.add(&ids[a], &ids[b]);
    }
    let reach: Vec<_> = ids.iter().map(|id| below.reach(id)).collect();
    let mut components = Vec::new();
    for i in 0..count {
        let leader = (0..i).find(|&j| reach[i].contains(&ids[j]) && reach[j].contains(&ids[i]));
        components.push(leader.map_or(i, |j| components[j]));
    }
    let uniform = !dependencies.is_empty()
        && (0..count).all(|node| {
            components[node] == node
                && dependencies
                    .iter()
                    .filter(|&&(from, _)| from == node)
                    .count()
                    <= 1
                && dependencies.iter().filter(|&&(_, to)| to == node).count() <= 1
        });
    let ranks = ranked(&components, &dependencies);
    let mut children: Vec<_> = (0..count).collect();
    children.sort_by_key(|&i| (ranks[i], i));
    let independent = children
        .windows(2)
        .enumerate()
        .filter_map(|(at, pair)| {
            let (a, b) = (pair[0], pair[1]);
            (ranks[a] == ranks[b] && !reach[a].contains(&ids[b]) && !reach[b].contains(&ids[a]))
                .then_some((at, at + 1))
        })
        .collect();
    Order {
        children,
        ranks,
        uniform,
        independent,
    }
}

fn ranked(components: &[usize], dependencies: &[(usize, usize)]) -> Vec<usize> {
    let mut ranks = vec![0; components.len()];
    for _ in 0..components.len() {
        let changed = dependencies.iter().fold(false, |changed, &(from, to)| {
            let (a, b) = (components[from], components[to]);
            if a != b && ranks[b] <= ranks[a] {
                ranks[b] = ranks[a] + 1;
                true
            } else {
                changed
            }
        });
        if !changed {
            break;
        }
    }
    components
        .iter()
        .map(|&component| ranks[component])
        .collect()
}

fn child_of(model: &Model<'_>, scope: usize, endpoint: usize) -> Option<usize> {
    let mut at = model.endpoints[endpoint].scope;
    if at == scope {
        return model.scopes[scope]
            .children
            .iter()
            .position(|child| *child == Child::Endpoint(endpoint));
    }
    while model.scopes[at].parent != Some(scope) {
        at = model.scopes[at].parent?;
    }
    model.scopes[scope]
        .children
        .iter()
        .position(|child| *child == Child::Scope(at))
}

/// Source and target fans impose one compatible branch order on local routes.
pub(super) fn fan_order(
    model: &Model<'_>,
    topology: &Topology,
    scope: usize,
    shape: &super::shape::Shape,
) -> Vec<usize> {
    let edges: Vec<_> = topology
        .routes
        .iter()
        .enumerate()
        .filter(|(_, route)| route.scope == scope)
        .map(|(i, _)| i)
        .collect();
    let mut before = Vec::new();
    for fan in &topology.fans {
        let mut members: Vec<_> = fan
            .members
            .iter()
            .copied()
            .filter(|edge| edges.contains(edge))
            .collect();
        members.sort_by(|&a, &b| {
            let position = |edge: usize| {
                let endpoint = match fan.common {
                    super::topology::CommonEndpoint::Source(_) => model.ends[edge].1,
                    super::topology::CommonEndpoint::Target(_) => model.ends[edge].0,
                };
                let at = super::ports::center(shape.endpoints[&endpoint]);
                if shape.axis == super::shape::Axis::Down {
                    (at.x, at.y)
                } else {
                    (at.y, at.x)
                }
            };
            let (one, other) = (position(a), position(b));
            one.0
                .total_cmp(&other.0)
                .then_with(|| one.1.total_cmp(&other.1))
                .then(a.cmp(&b))
        });
        before.extend(members.windows(2).map(|pair| (pair[0], pair[1])));
    }
    let mut ordered = Vec::new();
    while ordered.len() < edges.len() {
        let next = edges
            .iter()
            .find(|edge| {
                !ordered.contains(*edge)
                    && before
                        .iter()
                        .all(|(a, b)| b != *edge || ordered.contains(a))
            })
            .or_else(|| edges.iter().find(|edge| !ordered.contains(*edge)))
            .expect("an unordered branch remains");
        ordered.push(*next);
    }
    ordered
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::Node;
    use serde_json::json;

    #[test]
    fn a_return_stays_inside_its_component_and_does_not_reverse_a_downstream_dependency() {
        let graph: Node = serde_json::from_value(json!({"id":"root","children":[
            {"id":"end","width":100,"height":60,"layoutOptions":{"archboard.order":"0"}},
            {"id":"a","width":100,"height":60,"layoutOptions":{"archboard.order":"1"}},
            {"id":"b","width":100,"height":60,"layoutOptions":{"archboard.order":"2"}}],
            "edges":[{"id":"ab","sources":["a"],"targets":["b"]},
                {"id":"ba","sources":["b"],"targets":["a"]},
                {"id":"be","sources":["b"],"targets":["end"]}]}))
        .unwrap();
        let model = Model::new(&graph).unwrap();
        let topology = Topology::new(&model);
        let order = hints(&model, &topology, 0);
        assert_eq!(order.children, [1, 2, 0]);
        assert_eq!(order.ranks, [1, 0, 0]);
        assert_eq!(order.independent, Vec::<(usize, usize)>::new());
        assert_eq!(topology.routes.len(), 3);
    }
}
