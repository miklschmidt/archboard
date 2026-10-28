//! Measured semantic scopes. Visual groups never replace semantic ancestry.

use std::collections::BTreeMap;

use crate::constants::HEADER_SLAB_INSET;
use crate::geometry::{Rect, Side};
use crate::graph::{Edge, GROUP_CAPTIONS, Node, PLACING_GROUP, semantic_order};

/// A local handle, never a semantic subject id.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Child {
    Endpoint(usize),
    Scope(usize),
}

/// A scope keeps its semantic parent independently of its visual parent.
pub(super) struct Scope<'a> {
    pub parent: Option<usize>,
    pub semantic_parent: Option<&'a str>,
    pub group: Option<&'a str>,
    pub header: Option<usize>,
    pub children: Vec<Child>,
    pub caption: Option<(f64, f64)>,
    pub depth: usize,
}

/// A card or painted parent header, with four admissible wall candidates.
pub(super) struct Endpoint<'a> {
    pub node: &'a Node,
    pub scope: usize,
    pub bounds: Rect,
    pub walls: [Side; 4],
}

/// The measured graph, normalized once without changing either engine's input.
pub(super) struct Model<'a> {
    pub scopes: Vec<Scope<'a>>,
    pub endpoints: Vec<Endpoint<'a>>,
    pub edges: Vec<&'a Edge>,
    pub ends: Vec<(usize, usize)>,
    pub treatments: Vec<String>,
    pub outgoing: Vec<Vec<usize>>,
    pub incoming: Vec<Vec<usize>>,
}

impl<'a> Model<'a> {
    pub(super) fn new(graph: &'a Node) -> Result<Self, String> {
        let captions: Vec<(String, f64, f64)> =
            serde_json::from_str(graph.option(GROUP_CAPTIONS).unwrap_or("[]"))
                .map_err(|error| format!("Measured group captions are unreadable: {error}"))?;
        let captions: BTreeMap<_, _> = captions
            .into_iter()
            .map(|(id, w, h)| (id, (w, h)))
            .collect();
        let mut model = Self {
            scopes: vec![Scope {
                parent: None,
                semantic_parent: None,
                group: None,
                header: None,
                children: Vec::new(),
                caption: None,
                depth: 0,
            }],
            endpoints: Vec::new(),
            edges: graph.edges.iter().flatten().map(AsRef::as_ref).collect(),
            ends: Vec::new(),
            treatments: Vec::new(),
            outgoing: Vec::new(),
            incoming: Vec::new(),
        };
        model.edges.sort_by(|a, b| {
            semantic_order(a.layout_options.as_ref())
                .total_cmp(&semantic_order(b.layout_options.as_ref()))
                .then_with(|| a.id.cmp(&b.id))
        });
        model.children(graph.kids(), 0, None, 0, &captions);
        let ids: BTreeMap<_, _> = model
            .endpoints
            .iter()
            .enumerate()
            .map(|(i, n)| (n.node.id.as_str(), i))
            .collect();
        for edge in &model.edges {
            let from = ids.get(edge.source());
            let to = ids.get(edge.target());
            let (Some(&from), Some(&to)) = (from, to) else {
                return Err(format!(
                    "Relationship {} names an endpoint outside the measured hierarchy.",
                    edge.id
                ));
            };
            model.ends.push((from, to));
        }
        model.treatments = model
            .edges
            .iter()
            .map(|edge| {
                format!(
                    "{}|{}",
                    crate::track::route::trunk_kind(edge),
                    edge.option("archboard.relationship.held-kind")
                        .unwrap_or("")
                )
            })
            .collect();
        model.outgoing = vec![Vec::new(); model.endpoints.len()];
        model.incoming = vec![Vec::new(); model.endpoints.len()];
        for (edge, &(from, to)) in model.ends.iter().enumerate() {
            model.outgoing[from].push(edge);
            model.incoming[to].push(edge);
        }
        Ok(model)
    }

    fn children(
        &mut self,
        nodes: &'a [Node],
        parent: usize,
        semantic: Option<&'a str>,
        depth: usize,
        captions: &BTreeMap<String, (f64, f64)>,
    ) {
        let mut ordered: Vec<_> = nodes.iter().collect();
        ordered.sort_by(|a, b| {
            semantic_order(a.layout_options.as_ref())
                .total_cmp(&semantic_order(b.layout_options.as_ref()))
                .then_with(|| a.id.cmp(&b.id))
        });
        let mut groups = BTreeMap::new();
        for node in ordered {
            let owner = if let Some(group) = node.option(PLACING_GROUP) {
                *groups.entry(group).or_insert_with(|| {
                    let index = self.scopes.len();
                    self.scopes.push(Scope {
                        parent: Some(parent),
                        semantic_parent: semantic,
                        group: Some(group),
                        header: None,
                        children: Vec::new(),
                        caption: captions.get(group).copied(),
                        depth,
                    });
                    self.scopes[parent].children.push(Child::Scope(index));
                    index
                })
            } else {
                parent
            };
            self.node(node, owner, semantic, depth, captions);
        }
    }

    fn node(
        &mut self,
        node: &'a Node,
        parent: usize,
        semantic: Option<&'a str>,
        depth: usize,
        captions: &BTreeMap<String, (f64, f64)>,
    ) {
        let header = node.has_children();
        let scope = if header {
            let index = self.scopes.len();
            self.scopes.push(Scope {
                parent: Some(parent),
                semantic_parent: semantic,
                group: None,
                header: Some(self.endpoints.len()),
                children: Vec::new(),
                caption: None,
                depth,
            });
            self.scopes[parent].children.push(Child::Scope(index));
            index
        } else {
            parent
        };
        let inset = if header { HEADER_SLAB_INSET } else { 0.0 };
        let bounds = Rect {
            x: inset,
            y: inset,
            width: node.w() - 2.0 * inset,
            height: if header {
                node.option("archboard.header.size")
                    .and_then(|n| n.parse().ok())
                    .unwrap_or_else(|| node.h())
                    - inset
            } else {
                node.h()
            },
        };
        let endpoint = self.endpoints.len();
        self.endpoints.push(Endpoint {
            node,
            scope,
            bounds,
            walls: [Side::Top, Side::Right, Side::Bottom, Side::Left],
        });
        if header {
            self.children(node.kids(), scope, Some(&node.id), depth + 1, captions);
        } else {
            self.scopes[scope].children.push(Child::Endpoint(endpoint));
        }
    }

    /// Input invariants required before a plan can own geometry.
    pub(super) fn complete(&self) -> bool {
        self.edges.len() == self.ends.len()
            && self.endpoints.iter().all(|endpoint| {
                endpoint.scope < self.scopes.len()
                    && endpoint.bounds.width.is_finite()
                    && endpoint.bounds.height.is_finite()
                    && endpoint.walls.len() == 4
            })
            && self.scopes.iter().enumerate().all(|(index, scope)| {
                scope.parent.is_none_or(|parent| parent < index)
                    && scope
                        .header
                        .is_none_or(|header| self.endpoints[header].scope == index)
                    && scope.children.iter().all(|child| match child {
                        Child::Scope(child) => self.scopes[*child].parent == Some(index),
                        Child::Endpoint(child) => self.endpoints[*child].scope == index,
                    })
                    && scope
                        .semantic_parent
                        .is_none_or(|id| self.endpoints.iter().any(|e| e.node.id == id))
                    && (scope.group.is_some() || scope.caption.is_none())
                    && scope
                        .parent
                        .is_none_or(|p| scope.depth >= self.scopes[p].depth)
            })
    }
}
