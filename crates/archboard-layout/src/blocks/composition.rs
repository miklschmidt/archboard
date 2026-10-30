//! Tight local work and transparent wrappers get local ranks. Named parent
//! interfaces retain shared ranks unless an external member path requires them.

use crate::graph::Node;
use crate::track::scene::{Map, Set};

/// Collect every descendant, with the leaf cards also kept separately.
fn members_of<'a>(
    nodes: &'a [Node],
    ancestors: &mut Vec<&'a str>,
    members: &mut Map<&'a str, Set<&'a str>>,
    leaves: &mut Set<&'a str>,
) {
    for node in nodes {
        for ancestor in ancestors.iter() {
            members
                .get_mut(ancestor)
                .expect("a parent")
                .insert(&node.id);
        }
        if node.has_children() {
            members.entry(&node.id).or_default();
            ancestors.push(&node.id);
            members_of(node.kids(), ancestors, members, leaves);
            ancestors.pop();
        } else {
            leaves.insert(&node.id);
        }
    }
}

/// Whether a member reaches another member through outside cards alone.
fn leaves_and_returns(members: &Set<&str>, next: &Map<&str, Vec<&str>>) -> bool {
    members.iter().any(|&source| {
        let mut pending: Vec<&str> = next
            .get(source)
            .into_iter()
            .flatten()
            .copied()
            .filter(|target| !members.contains(target))
            .collect();
        let mut seen = Set::default();
        while let Some(at) = pending.pop() {
            if members.contains(at) {
                if at != source {
                    return true;
                }
            } else if seen.insert(at) {
                pending.extend(next.get(at).into_iter().flatten().copied());
            }
        }
        false
    })
}

/// An outside leaf used only by one parent's members shares their rank context.
/// A loop through that private collaborator does not need an opaque parent block.
fn context_members<'a>(
    members: &Set<&'a str>,
    graph: &'a Node,
    next: &Map<&str, Vec<&str>>,
) -> Set<&'a str> {
    let mut context = members.clone();
    for node in graph.kids().iter().filter(|node| !node.has_children()) {
        let id = node.id.as_str();
        let feedback = next.get(id).into_iter().flatten().any(|target| {
            next.get(target)
                .is_some_and(|targets| targets.contains(&id))
        });
        if !feedback {
            continue;
        }
        let exclusive = graph
            .edges
            .iter()
            .flatten()
            .filter(|edge| edge.source() == node.id || edge.target() == node.id)
            .all(|edge| {
                members.contains(if edge.source() == node.id {
                    edge.target()
                } else {
                    edge.source()
                })
            });
        if exclusive {
            context.insert(&node.id);
        }
    }
    context
}

/// A parent and its direct members form one caller context.
fn context_of<'a>(id: &'a str, frames: &Map<&'a str, Set<&'a str>>) -> Option<&'a str> {
    if frames.contains_key(id) {
        return Some(id);
    }
    frames
        .iter()
        .filter(|(_, members)| members.contains(id))
        .min_by_key(|(_, members)| members.len())
        .map(|(&parent, _)| parent)
}

/// A root leaf belongs only to this workflow when it calls once and receives no work.
fn private_caller(graph: &Node, source: &str) -> bool {
    graph
        .kids()
        .iter()
        .any(|node| node.id == source && !node.has_children())
        && !graph
            .edges
            .iter()
            .flatten()
            .any(|edge| edge.target() == source)
        && graph
            .edges
            .iter()
            .flatten()
            .filter(|edge| edge.source() == source)
            .count()
            == 1
}

/// The one outside call into a scope, from a caller with no other work.
fn private_entry(parent: &str, members: &Set<&str>, graph: &Node) -> bool {
    let inside = |id: &str| id == parent || members.contains(id);
    let mut incoming = graph
        .edges
        .iter()
        .flatten()
        .filter(|edge| inside(edge.target()) && !inside(edge.source()));
    let Some(entry) = incoming.next() else {
        return false;
    };
    incoming.next().is_none() && private_caller(graph, entry.source())
}

/// A collection of transparent wrappers has no hidden member ordering to rebuild.
fn wrapper_collection(members: &Set<&str>, frames: &Map<&str, Set<&str>>) -> bool {
    let nested: Vec<_> = members.iter().filter_map(|id| frames.get(*id)).collect();
    !nested.is_empty()
        && nested.iter().all(|inside| {
            inside
                .iter()
                .filter(|id| !frames.contains_key(**id))
                .count()
                == 1
        })
        && members
            .iter()
            .copied()
            .filter(|id| !frames.contains_key(*id))
            .all(|leaf| nested.iter().any(|inside| inside.contains(leaf)))
}

/// A flat sink used by one caller context can rank its internals locally.
fn closed(parent: &str, members: &Set<&str>, graph: &Node, frames: &Map<&str, Set<&str>>) -> bool {
    let flat = !members.iter().any(|id| frames.contains_key(id));
    let private = wrapper_collection(members, frames) && private_entry(parent, members, graph);
    let inside = |id: &str| id == parent || members.contains(id);
    let contexts: Set<_> = graph
        .edges
        .iter()
        .flatten()
        .filter(|edge| inside(edge.target()) && !inside(edge.source()))
        .map(|edge| context_of(edge.source(), frames))
        .collect();
    let internal = graph
        .edges
        .iter()
        .flatten()
        .any(|edge| members.contains(edge.source()) && members.contains(edge.target()));
    let coherent = flat && contexts.len() == 1 && !contexts.contains(&None);
    (private || coherent)
        && internal
        && !graph
            .edges
            .iter()
            .flatten()
            .any(|edge| inside(edge.source()) && !inside(edge.target()))
}

/// Only a leaf with one incoming relationship and no outgoing work is exclusive.
fn sole_caller<'a>(graph: &'a Node, id: &str) -> Option<&'a str> {
    if graph.edges.iter().flatten().any(|edge| edge.source() == id) {
        return None;
    }
    let mut incoming = graph
        .edges
        .iter()
        .flatten()
        .filter(|edge| edge.target() == id);
    let source = incoming.next()?.source();
    incoming.next().is_none().then_some(source)
}

fn one_partner(parent: &str, inside: &Set<&str>, graph: &Node, exclusive: &[&str]) -> bool {
    let mut candidates = exclusive.iter().filter(|source| inside.contains(**source));
    let Some(source) = candidates.next() else {
        return false;
    };
    candidates.next().is_none()
        && graph
            .edges
            .iter()
            .flatten()
            .filter(|edge| {
                edge.source() == *source
                    && edge.target() != parent
                    && !inside.contains(edge.target())
            })
            .count()
            == 1
}

/// A nested one-member wrapper needs its own ranks only when work leaves it.
fn passthrough(
    parent: &str,
    inside: &Set<&str>,
    members: &Map<&str, Set<&str>>,
    graph: &Node,
) -> bool {
    inside.len() == 1
        && members.values().any(|outer| outer.contains(parent))
        && graph
            .edges
            .iter()
            .flatten()
            .any(|edge| inside.contains(edge.source()) && !inside.contains(edge.target()))
}

fn local_shape(
    parent: &str,
    inside: &Set<&str>,
    members: &Map<&str, Set<&str>>,
    graph: &Node,
    exclusive: &[&str],
) -> bool {
    let interface = graph
        .edges
        .iter()
        .flatten()
        .any(|edge| edge.source() == parent || edge.target() == parent);
    !interface
        && (one_partner(parent, inside, graph, exclusive)
            || closed(parent, inside, graph, members)
            || passthrough(parent, inside, members, graph))
}

/// Fix local composition from containment and member relationships before layout.
/// Relationships naming a parent describe its interface, not an intermediate
/// card on a path between members.
pub(crate) fn local_frames(graph: &Node) -> Set<String> {
    let mut members = Map::default();
    let mut leaves = Set::default();
    members_of(graph.kids(), &mut Vec::new(), &mut members, &mut leaves);
    let mut next: Map<&str, Vec<&str>> = Map::default();
    for edge in graph.edges.iter().flatten() {
        if leaves.contains(edge.source()) && leaves.contains(edge.target()) {
            next.entry(edge.source()).or_default().push(edge.target());
        }
    }
    let exclusive: Vec<&str> = graph
        .kids()
        .iter()
        .filter(|node| !node.has_children())
        .filter_map(|node| sole_caller(graph, &node.id))
        .filter(|source| leaves.contains(source))
        .collect();
    let mut local: Set<String> = members
        .iter()
        .filter(|(parent, inside)| {
            leaves_and_returns(&context_members(inside, graph, &next), &next)
                || local_shape(parent, inside, &members, graph, &exclusive)
        })
        .map(|(parent, _)| (*parent).to_owned())
        .collect();
    // One exclusive caller makes the whole closed hierarchy a local composition.
    let scoped: Vec<String> = members
        .iter()
        .filter(|(parent, inside)| {
            local.contains(**parent)
                && private_entry(parent, inside, graph)
                && closed(parent, inside, graph, &members)
        })
        .flat_map(|(_, inside)| inside.iter())
        .filter(|member| members.contains_key(*member))
        .map(|member| (*member).to_owned())
        .collect();
    local.extend(scoped);
    local
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_path_through_outside_cards_requires_local_composition() {
        let graph = |target: &str| {
            serde_json::from_value::<Node>(json!({
                "id": "root",
                "children": [
                    {"id": "loop", "children": [{"id": "a"}, {"id": "b"}]},
                    {"id": "flat", "children": [{"id": "c"}, {"id": "d"}]},
                    {"id": "outside"}
                ],
                "edges": [
                    {"id": "out", "sources": ["a"], "targets": ["outside"]},
                    {"id": "back", "sources": ["outside"], "targets": [target]},
                    {"id": "within", "sources": ["c"], "targets": ["d"]}
                ]
            }))
            .unwrap()
        };
        assert_eq!(
            local_frames(&graph("b")).into_iter().collect::<Vec<_>>(),
            ["loop"]
        );
        assert_eq!(
            local_frames(&graph("a")).into_iter().collect::<Vec<_>>(),
            Vec::<&str>::new(),
            "an isolated scope and a same-card cycle do not stretch siblings apart"
        );
    }
    #[test]
    fn a_named_interface_keeps_shared_ranks_while_a_transparent_wrapper_stays_tight() {
        let graph = serde_json::from_value::<Node>(json!({
            "id": "root",
            "children": [
                {"id": "outer", "children": [
                    {"id": "plain", "children": [{"id": "a"}]},
                    {"id": "api", "children": [{"id": "b"}]},
                    {"id": "idle", "children": [{"id": "c"}]}
                ]},
                {"id": "outside"}
            ],
            "edges": [
                {"id": "call", "sources": ["api"], "targets": ["outside"]},
                {"id": "work", "sources": ["a"], "targets": ["outside"]}
            ]
        }))
        .unwrap();
        let local = local_frames(&graph);
        assert!(local.contains("plain"));
        assert!(!local.contains("api"));
        assert!(!local.contains("idle"));
    }
}
