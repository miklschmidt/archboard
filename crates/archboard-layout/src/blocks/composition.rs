//! Parents whose members communicate through outside cards need local ranks.
//! A shared ranking otherwise stretches the frame across the external path.

use crate::graph::Node;
use crate::track::scene::{Map, Set};

/// Collect each parent's leaf members, including members of nested parents.
fn members_of<'a>(
    nodes: &'a [Node],
    ancestors: &mut Vec<&'a str>,
    members: &mut Map<&'a str, Set<&'a str>>,
    leaves: &mut Set<&'a str>,
) {
    for node in nodes {
        if node.has_children() {
            members.entry(&node.id).or_default();
            ancestors.push(&node.id);
            members_of(node.kids(), ancestors, members, leaves);
            ancestors.pop();
        } else {
            leaves.insert(&node.id);
            for ancestor in ancestors.iter() {
                members
                    .get_mut(ancestor)
                    .expect("a parent")
                    .insert(&node.id);
            }
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
    members
        .into_iter()
        .filter(|(_, members)| leaves_and_returns(members, &next))
        .map(|(parent, _)| parent.to_owned())
        .collect()
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
        assert!(
            local_frames(&graph("a")).is_empty(),
            "a cycle to the same card does not stretch siblings apart"
        );
    }
}
