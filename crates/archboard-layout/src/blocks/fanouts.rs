//! A source can share an entry before its branches acquire their labels.

use crate::track::route::trunk_kind;
use crate::track::scene::{Map, Set};

use super::tree::{BlockId, BlockTree, Nesting, Projection};

#[derive(Default)]
struct Branches {
    targets: Set<String>,
    edges: Vec<(String, String)>,
}

/// A direct header entry stays separate. Branch labels must follow this entry.
fn after_entry(tree: &BlockTree, projection: &Projection, depth: usize, label: BlockId) -> bool {
    let block = projection.into[depth];
    projection.edge.target() != tree.get(block).id
        && (projection.edge.label_count() == 0 || projection.into[..=depth].contains(&label))
}

/// Forward calls within each boundary, keyed by their original destination.
fn interior_sources(tree: &BlockTree, back: &Set<String>) -> Map<(BlockId, String), Set<String>> {
    let mut incoming: Map<(BlockId, String), Set<String>> = Map::default();
    for projection in tree
        .projections
        .iter()
        .filter(|projection| !back.contains(&projection.edge.id))
    {
        let edge = &projection.edge;
        let mut from = tree.above(edge.source());
        from.extend(tree.block_of(edge.source()));
        let into = tree.above(edge.target());
        for block in from.into_iter().filter(|block| into.contains(block)) {
            incoming
                .entry((block, edge.target().to_owned()))
                .or_default()
                .insert(edge.source().to_owned());
        }
    }
    incoming
}

/// A fork starts local work. A step called from other member work keeps its port.
fn shared_entries(
    block: BlockId,
    branches: Branches,
    incoming: &Map<(BlockId, String), Set<String>>,
) -> Vec<(BlockId, String)> {
    let targets: Set<String> = branches
        .targets
        .iter()
        .filter(|target| {
            incoming
                .get(&(block, (*target).clone()))
                .is_none_or(|sources| {
                    sources
                        .iter()
                        .all(|source| branches.targets.contains(source))
                })
        })
        .cloned()
        .collect();
    if targets.len() < 2 {
        return Vec::new();
    }
    branches
        .edges
        .into_iter()
        .filter_map(|(edge, target)| targets.contains(&target).then_some((block, edge)))
        .collect()
}

/// Decide shared-source entries from the complete graph before creating ports.
pub(super) fn entry_fanouts(
    tree: &BlockTree,
    before: &Set<String>,
    back: &Set<String>,
) -> Set<(BlockId, String)> {
    if tree.nesting != Nesting::Blocks {
        return Set::default();
    }
    let incoming = interior_sources(tree, back);
    let mut groups: Map<(BlockId, String, String, bool), Branches> = Map::default();
    for projection in &tree.projections {
        let edge = &projection.edge;
        let label = tree.label_holder(projection, before.contains(&edge.id));
        for (depth, &block) in projection.into.iter().enumerate() {
            if !after_entry(tree, projection, depth, label) {
                continue;
            }
            let key = (
                block,
                edge.source().to_owned(),
                trunk_kind(edge),
                back.contains(&edge.id),
            );
            let group = groups.entry(key).or_default();
            group.targets.insert(edge.target().to_owned());
            group
                .edges
                .push((edge.id.clone(), edge.target().to_owned()));
        }
    }
    groups
        .into_iter()
        .filter(|((block, source, _, _), branches)| {
            tree.projections
                .iter()
                .filter(|projection| {
                    projection.edge.source() == source && projection.into.contains(block)
                })
                .count()
                == branches.edges.len()
        })
        .flat_map(|((block, _, _, _), branches)| shared_entries(block, branches, &incoming))
        .collect()
}
