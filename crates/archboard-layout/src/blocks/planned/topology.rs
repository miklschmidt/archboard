//! Ownership before coordinates: labels, exact obstacles, portals, and whole fans.

use crate::geometry::Rect;

use super::model::Model;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum CommonEndpoint {
    Source(usize),
    Target(usize),
}

/// Membership is established from one common identity, never pairwise overlap.
pub(super) struct Fan {
    pub common: CommonEndpoint,
    pub treatment: String,
    pub members: Vec<usize>,
}

/// A source owns its measured label before any shelf is chosen.
pub(super) struct Label {
    pub edge: usize,
    pub scope: usize,
    pub size: Rect,
}

/// A route crosses these scopes in source-to-target order.
pub(super) struct Route {
    pub scope: usize,
    pub outward: Vec<usize>,
    pub inward: Vec<usize>,
}

pub(super) struct Topology {
    pub fans: Vec<Fan>,
    pub memberships: Vec<[Option<usize>; 2]>,
    pub labels: Vec<Label>,
    pub routes: Vec<Route>,
}

impl Topology {
    pub(super) fn new(model: &Model<'_>) -> Self {
        let mut topology = Self {
            fans: Vec::new(),
            memberships: vec![[None, None]; model.edges.len()],
            labels: Vec::new(),
            routes: Vec::new(),
        };
        for (index, edge) in model.edges.iter().enumerate() {
            let (from, to) = model.ends[index];
            let mut outward = ancestors(model, model.endpoints[from].scope);
            let mut inward = ancestors(model, model.endpoints[to].scope);
            let mut scope = 0;
            while outward.last() == inward.last() && !outward.is_empty() {
                scope = outward.pop().expect("a common ancestor");
                inward.pop();
            }
            inward.reverse();
            topology.routes.push(Route {
                scope,
                outward,
                inward,
            });
            if let Some(label) = edge.label() {
                topology.labels.push(Label {
                    edge: index,
                    scope: model.endpoints[from].scope,
                    size: Rect {
                        x: 0.0,
                        y: 0.0,
                        width: label.width.unwrap_or(0.0),
                        height: label.height.unwrap_or(0.0),
                    },
                });
            }
            for common in [CommonEndpoint::Source(from), CommonEndpoint::Target(to)] {
                topology.add_fan(index, common, &model.treatments[index]);
            }
        }
        topology.fans.retain(|fan| fan.members.len() > 1);
        topology.assign_memberships();
        topology
    }

    fn assign_memberships(&mut self) {
        for (index, fan) in self.fans.iter().enumerate() {
            let side = usize::from(matches!(fan.common, CommonEndpoint::Target(_)));
            for &edge in &fan.members {
                self.memberships[edge][side] = Some(index);
            }
        }
    }
    fn add_fan(&mut self, index: usize, common: CommonEndpoint, treatment: &str) {
        let treatment = treatment.to_owned();
        if let Some(fan) = self
            .fans
            .iter_mut()
            .find(|fan| fan.common == common && fan.treatment == treatment)
        {
            fan.members.push(index);
        } else {
            self.fans.push(Fan {
                common,
                treatment,
                members: vec![index],
            });
        }
    }

    pub(super) fn complete(&self, model: &Model<'_>) -> bool {
        self.routes.len() == model.edges.len()
            && self.fans.iter().all(|fan| {
                fan.members.iter().all(|&edge| {
                    let ends = model.ends[edge];
                    (match fan.common {
                        CommonEndpoint::Source(from) => ends.0 == from,
                        CommonEndpoint::Target(to) => ends.1 == to,
                    }) && model.treatments[edge] == fan.treatment
                })
            })
            && self.labels.iter().all(|label| {
                label.scope == model.endpoints[model.ends[label.edge].0].scope
                    && label.size.width.is_finite()
                    && label.size.height.is_finite()
            })
            && self.routes.iter().enumerate().all(|(edge, route)| {
                let (from, to) = model.ends[edge];
                let mut chain = route.outward.clone();
                chain.push(route.scope);
                let mut target = route.inward.clone();
                target.reverse();
                target.push(route.scope);
                chain
                    == ancestors(model, model.endpoints[from].scope)
                        .into_iter()
                        .take_while(|&scope| scope != route.scope)
                        .chain([route.scope])
                        .collect::<Vec<_>>()
                    && target
                        == ancestors(model, model.endpoints[to].scope)
                            .into_iter()
                            .take_while(|&scope| scope != route.scope)
                            .chain([route.scope])
                            .collect::<Vec<_>>()
            })
    }
}

fn ancestors(model: &Model<'_>, scope: usize) -> Vec<usize> {
    let mut out = vec![scope];
    while let Some(parent) = model.scopes[*out.last().expect("a scope")].parent {
        out.push(parent);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::Node;
    use serde_json::json;

    #[test]
    fn fans_never_merge_through_pairwise_compatibility_or_mixed_treatments() {
        let graph: Node = serde_json::from_value(json!({"id":"root", "children": [
            {"id":"a","width":160,"height":80},{"id":"b","width":160,"height":80},
            {"id":"x","width":160,"height":80},{"id":"y","width":160,"height":80}],
            "edges":[{"id":"ax","sources":["a"],"targets":["x"]},
                {"id":"ay","sources":["a"],"targets":["y"]},
                {"id":"by","sources":["b"],"targets":["y"]},
                {"id":"dash","sources":["a"],"targets":["y"],
                    "layoutOptions":{"archboard.relationship.kind":"event"}}]}))
        .unwrap();
        let model = Model::new(&graph).unwrap();
        let topology = Topology::new(&model);
        assert!(topology.complete(&model));
        assert_eq!(topology.fans.len(), 2);
        assert!(topology.fans.iter().all(|fan| fan.members.len() == 2));
    }

    #[test]
    fn nested_groups_keep_header_endpoints_and_source_labels_in_their_own_scope() {
        let graph: Node = serde_json::from_value(json!({"id":"root", "children":[
            {"id":"frame","width":220,"height":60,"children":[
                {"id":"source","width":160,"height":80,"layoutOptions":{"archboard.group":"g"}},
                {"id":"peer","width":160,"height":80,"layoutOptions":{"archboard.group":"g"}}]},
            {"id":"target","width":160,"height":80}],
            "edges":[{"id":"work","sources":["source"],"targets":["target"],"labels":[{"width":100,"height":30}]},
                {"id":"interface","sources":["target"],"targets":["frame"]}]})).unwrap();
        let model = Model::new(&graph).unwrap();
        let topology = Topology::new(&model);
        assert!(model.complete() && topology.complete(&model));
        let label = &topology.labels[0];
        assert_eq!(model.scopes[label.scope].group, Some("g"));
        assert_eq!(model.scopes[label.scope].semantic_parent, Some("frame"));
        let work = model.edges.iter().position(|e| e.id == "work").unwrap();
        assert_eq!(topology.routes[work].outward.len(), 2);
        assert_eq!(model.endpoints[model.ends[work].0].walls.len(), 4);
    }
}
