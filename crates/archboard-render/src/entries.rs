//! The children that are entry points of the container around them, as the
//! variant states its interface (ADR 0044), and whether each is first: no
//! other part of the container leads to it along the relationships, from
//! source to target, inside the container or round through parts outside. An
//! entry point another part leads to stands below that part, as a caller
//! stands above what it calls.
//!
//! Both are read off the whole variant: an entry point stays one in a view
//! that hides its caller, a child a comparison puts back is never one, since
//! the variant does not hold it, and a view holds a container's first row
//! only where the whole variant does. The interface itself is the board's
//! (`@archboard/board/container-interface`, `inspectContainer`).

use std::collections::{BTreeMap, HashMap, HashSet};

use archboard_layout::Node;

use crate::request::Reading;

/// Each part's id with its parent's, for the parts that have one.
type Parents<'a> = HashMap<&'a str, &'a str>;

/// A part and every container round it, nearest first, each once.
fn lineage<'a>(parents: &Parents<'a>, start: &'a str) -> Vec<&'a str> {
    let mut chain = vec![start];
    while let Some(up) = parents.get(chain[chain.len() - 1]).copied() {
        if chain.contains(&up) {
            break;
        }
        chain.push(up);
    }
    chain
}

/// Which child of a container holds each part inside it, at any depth: the
/// container itself holds itself.
fn holders_in<'a>(nodes: &'a [Node], parents: &Parents<'a>, id: &str) -> HashMap<&'a str, &'a str> {
    nodes
        .iter()
        .filter_map(|node| {
            let chain = lineage(parents, &node.id);
            let at = chain.iter().position(|up| *up == id)?;
            Some((
                node.id.as_str(),
                if at == 0 { chain[0] } else { chain[at - 1] },
            ))
        })
        .collect()
}

/// The children of a container that a relationship from outside it reaches,
/// in the variant's order.
fn entry_points<'a>(variant: &'a Reading, parents: &Parents<'a>, id: &str) -> Vec<&'a str> {
    let holders = holders_in(&variant.nodes, parents, id);
    let reached: HashSet<&str> = variant
        .edges
        .iter()
        .filter(|edge| !holders.contains_key(edge.from.as_str()))
        .filter_map(|edge| holders.get(edge.to.as_str()).copied())
        .collect();
    variant
        .nodes
        .iter()
        .filter(|node| node.parent.as_deref() == Some(id) && reached.contains(node.id.as_str()))
        .map(|node| node.id.as_str())
        .collect()
}

/// Whether an entry point is first: no part the container holds under
/// another child leads to it.
fn first(entry: &str, holding: &HashMap<&str, &str>, sources: &HashMap<&str, Vec<&str>>) -> bool {
    let mut open: Vec<&str> = holding
        .iter()
        .filter(|(_, child)| **child == entry)
        .map(|(part, _)| *part)
        .collect();
    let mut leading: HashSet<&str> = HashSet::new();
    while let Some(at) = open.pop() {
        if leading.insert(at) {
            open.extend(sources.get(at).into_iter().flatten().copied());
        }
    }
    !leading
        .iter()
        .any(|part| holding.get(part).is_some_and(|child| *child != entry))
}

/// Each entry point a laid reading's containers have on the whole variant,
/// by id, true when it is first.
pub(crate) fn entry_points_of(laid: &Reading, variant: &Reading) -> BTreeMap<String, bool> {
    let parents: Parents<'_> = variant
        .nodes
        .iter()
        .filter_map(|node| Some((node.id.as_str(), node.parent.as_deref()?)))
        .collect();
    let mut sources: HashMap<&str, Vec<&str>> = HashMap::new();
    for edge in &variant.edges {
        sources
            .entry(edge.to.as_str())
            .or_default()
            .push(edge.from.as_str());
    }
    let held: HashSet<&str> = variant.nodes.iter().map(|node| node.id.as_str()).collect();
    let containers: HashSet<&str> = laid
        .nodes
        .iter()
        .filter_map(|node| node.parent.as_deref())
        .collect();
    let mut entries = BTreeMap::new();
    for id in containers.into_iter().filter(|id| held.contains(id)) {
        let holding: HashMap<&str, &str> = holders_in(&variant.nodes, &parents, id)
            .into_iter()
            .filter(|(part, _)| *part != id)
            .collect();
        for entry in entry_points(variant, &parents, id) {
            entries.insert(entry.to_owned(), first(entry, &holding, &sources));
        }
    }
    entries
}
