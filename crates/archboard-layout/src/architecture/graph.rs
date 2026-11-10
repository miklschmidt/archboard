//! The measured graph Track and Blocks lay out: semantic containment,
//! measured sizes, and which children are entry points of the container around
//! them. Each solve chooses ranks and attachment faces.

use std::collections::BTreeMap;

use archboard_scene::drawing::{MeasuredNode, NodeFacts};
use archboard_scene::names::word;
use archboard_scene::request::Standing;
use indexmap::IndexMap;

use super::content::{Content, Edge, Node};
use super::measured::Measured;
use crate::ecma;
use crate::graph::{DOOR, GROUPS};
use crate::json::J;

/// The option marking a child a relationship from outside its container reaches (ADR 0044).
const ENTRY_POINT: &str = "archboard.entry";
/// The option carrying each width a container's header can take, as `[width, height]` rows.
const HEADER_STEPS: &str = "archboard.header.steps";

/// How each relationship stands when a picture is compared: every subject's
/// standing, `unchanged` for one the comparison does not name.
pub type Standings = BTreeMap<String, Standing>;

/// The graph a solve lays out, in two parts: the root's own options, and
/// what follows them, so a solve adds its options to the root alone.
#[derive(Clone, Debug)]
pub(crate) struct Graph {
    /// The root's options.
    pub(crate) options: Vec<(String, String)>,
    /// The JSON of the root's children and relationships, `"children":…,"edges":…`.
    body: String,
}

impl Graph {
    /// The JSON of the graph with more root options after its own.
    pub(crate) fn with_options(&self, more: &[(&str, String)]) -> String {
        let options = self
            .options
            .iter()
            .map(|(name, value)| (name.clone(), J::str(value)))
            .chain(
                more.iter()
                    .map(|(name, value)| ((*name).to_owned(), J::str(value))),
            )
            .collect();
        let mut out = String::from("{\"id\":\"architecture:root\",\"layoutOptions\":");
        J::Obj(options).write(&mut out);
        out.push(',');
        out.push_str(&self.body);
        out.push('}');
        out
    }
}

/// A number as `String(value)` spells it.
fn text(value: f64) -> String {
    ecma::number(value)
}

/// The options that carry a container's header: its height at its least
/// width, and each width it can take with its height there.
fn header_options(measured: &MeasuredNode<NodeFacts>) -> Vec<(String, J)> {
    if measured.header_height == 0.0 {
        return Vec::new();
    }
    let mut options = vec![(
        "archboard.header.size".to_owned(),
        J::Str(text(measured.header_height)),
    )];
    if let Some(headers) = &measured.headers {
        let steps = headers
            .iter()
            .map(|header| J::Arr(vec![J::Num(header.width), J::Num(header.header_height)]))
            .collect();
        options.push((HEADER_STEPS.to_owned(), J::Str(J::Arr(steps).text())));
    }
    options
}

/// One card or container, measured, before containment is assembled.
fn node_of(node: &Node, measured: &MeasuredNode<NodeFacts>, order: f64, first: Option<bool>) -> J {
    let mut options = vec![("archboard.order".to_owned(), J::Str(text(order)))];
    if !node.groups.is_empty() {
        options.push((GROUPS.to_owned(), J::str(&node.groups.join(" "))));
    }
    if let Some(first) = first {
        options.push((
            ENTRY_POINT.to_owned(),
            J::str(if first { "true" } else { "false" }),
        ));
    }
    if node.door.is_some() {
        options.push((DOOR.to_owned(), J::str("true")));
    }
    let order_group = node.responsibility.as_ref().map_or_else(
        || text(node.order),
        |responsibility| J::Arr(vec![J::str(&node.kind), J::str(responsibility)]).text(),
    );
    options.push(("archboard.order-group".to_owned(), J::Str(order_group)));
    options.extend(header_options(measured));
    let mut members = vec![
        ("id".to_owned(), J::str(&node.id)),
        ("width".to_owned(), J::Num(measured.width)),
        ("height".to_owned(), J::Num(measured.height)),
        ("layoutOptions".to_owned(), J::Obj(options)),
    ];
    if measured.header_height != 0.0 {
        members.push(("children".to_owned(), J::Arr(Vec::new())));
    }
    J::Obj(members)
}

/// A relationship's own options: its order and kind, its look where lines of
/// another look keep apart, and its standing in a comparison.
fn edge_options(edge: &Edge, standing: Option<&str>) -> Vec<(String, J)> {
    let mut options = vec![
        ("archboard.order".to_owned(), J::Str(text(edge.order))),
        ("archboard.relationship.kind".to_owned(), J::str(&edge.kind)),
    ];
    let emphasis = word(&edge.emphasis);
    options.push((
        "archboard.relationship.emphasis".to_owned(),
        J::str(emphasis),
    ));
    let traffic = if edge.traffic.is_some() { "on" } else { "off" };
    options.push(("archboard.relationship.traffic".to_owned(), J::str(traffic)));
    if edge.two_way {
        options.push(("archboard.relationship.two-way".to_owned(), J::str("true")));
    }
    if let Some(standing) = standing {
        options.push((
            "archboard.relationship.standing".to_owned(),
            J::str(standing),
        ));
    }
    options
}

/// A relationship with its options and its measured label.
fn edge_of(edge: &Edge, measured: &Measured, standing: Option<&str>, inline: bool) -> J {
    let mut options = edge_options(edge, standing);
    if !inline && let Some(kind) = measured.held_kinds.get(&edge.id) {
        options.push(("archboard.relationship.held-kind".to_owned(), J::str(kind)));
    }
    let labels = measured
        .labels
        .get(&edge.id)
        .map_or_else(Vec::new, |label| {
            let words: Vec<&str> = label.runs.iter().map(|run| run.text.as_str()).collect();
            let mut fields = vec![
                ("id".to_owned(), J::Str(format!("{}:label", edge.id))),
                ("text".to_owned(), J::Str(words.join("\n"))),
                ("width".to_owned(), J::Num(label.width)),
                ("height".to_owned(), J::Num(label.height)),
            ];
            if let Some(narrow) = measured.narrow_labels.get(&edge.id) {
                let plate = [
                    ("width", J::Num(narrow.width)),
                    ("height", J::Num(narrow.height)),
                ];
                fields.push(("narrow".to_owned(), J::obj(plate)));
            }
            vec![J::Obj(fields)]
        });
    J::obj([
        ("id", J::str(&edge.id)),
        ("sources", J::Arr(vec![J::str(&edge.from)])),
        ("targets", J::Arr(vec![J::str(&edge.to)])),
        ("layoutOptions", J::Obj(options)),
        ("labels", J::Arr(labels)),
    ])
}

/// A node's children, once containment is assembled.
fn children_of(node: &mut J) -> Option<&mut Vec<J>> {
    let J::Obj(members) = node else { return None };
    members
        .iter_mut()
        .find(|(name, _)| name == "children")
        .and_then(|(_, value)| match value {
            J::Arr(children) => Some(children),
            _ => None,
        })
}

/// Assemble the nodes into their containers: each node, by the picture's
/// order, into its parent where the parent holds children, else onto the root.
fn assembled(content: &Content, mut nodes: IndexMap<String, J>) -> Vec<J> {
    let ordered = ecma::sorted_by(&content.nodes.iter().collect::<Vec<_>>(), |one, other| {
        one.order - other.order
    });
    let mut root = Vec::new();
    let mut placed: Vec<(Option<String>, String)> = Vec::new();
    for node in ordered {
        let parent = node
            .parent
            .as_ref()
            .filter(|parent| nodes.get(*parent).is_some_and(has_children));
        placed.push((parent.cloned(), node.id.clone()));
    }
    // Children are moved into their parents deepest last, so build bottom-up:
    // collect each parent's children in order, then nest from the root down.
    let mut kids: IndexMap<String, Vec<String>> = IndexMap::new();
    for (parent, id) in &placed {
        match parent {
            Some(parent) => kids.entry(parent.clone()).or_default().push(id.clone()),
            None => root.push(id.clone()),
        }
    }
    root.iter().map(|id| nest(id, &mut nodes, &kids)).collect()
}

/// Whether a node holds children.
fn has_children(node: &J) -> bool {
    matches!(node, J::Obj(members) if members.iter().any(|(name, _)| name == "children"))
}

/// A node with every child it holds nested inside it.
fn nest(id: &str, nodes: &mut IndexMap<String, J>, kids: &IndexMap<String, Vec<String>>) -> J {
    let mut node = nodes.get(id).cloned().unwrap_or(J::Obj(Vec::new()));
    let children: Vec<J> = kids
        .get(id)
        .into_iter()
        .flatten()
        .map(|child| nest(child, nodes, kids))
        .collect();
    if let Some(held) = children_of(&mut node) {
        held.extend(children);
    }
    node
}

/// Where each node stands among its peers: in the picture's order, with a group's
/// members right after its first member, so that a group stands together.
fn gathered_order(content: &Content) -> BTreeMap<&str, f64> {
    let ordered = ecma::sorted_by(&content.nodes.iter().collect::<Vec<_>>(), |one, other| {
        one.order - other.order
    });
    let mut first: BTreeMap<&str, usize> = BTreeMap::new();
    for (at, node) in ordered.iter().enumerate() {
        for group in &node.groups {
            first.entry(group).or_insert(at);
        }
    }
    let lead = |at: usize, node: &Node| {
        let led = node
            .groups
            .first()
            .and_then(|group| first.get(group.as_str()));
        led.copied().unwrap_or(at)
    };
    let mut keyed: Vec<(usize, usize, &str)> = (ordered.iter().enumerate())
        .map(|(at, node)| (lead(at, node), at, node.id.as_str()))
        .collect();
    keyed.sort_unstable();
    (keyed.into_iter().enumerate())
        .map(|(place, (_, _, id))| (id, place as f64))
        .collect()
}

/// The graph of a picture: its nodes in their containers, and its relationships
/// with their labels and options.
///
/// `inline` selects the retained Track input; Blocks also keeps the variant’s own overview kinds.
pub(crate) fn compound_graph(
    content: &Content,
    measured: &Measured,
    standings: Option<&Standings>,
    entries: &BTreeMap<String, bool>,
    inline: bool,
) -> Graph {
    let places = gathered_order(content);
    let by_id: BTreeMap<&str, &Node> = content
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect();
    let nodes: IndexMap<String, J> = measured
        .nodes
        .iter()
        .filter_map(|(id, value)| {
            let node = by_id.get(id.as_str())?;
            let order = places.get(id.as_str()).copied().unwrap_or(node.order);
            Some((
                id.clone(),
                node_of(node, value, order, entries.get(id).copied()),
            ))
        })
        .collect();
    let children = assembled(content, nodes);
    let edges = ecma::sorted_by(&content.edges.iter().collect::<Vec<_>>(), |one, other| {
        one.order - other.order
    });
    let unchanged = "unchanged";
    let edges: Vec<J> = edges
        .iter()
        .map(|edge| {
            let standing =
                standings.map(|standings| standings.get(&edge.id).map_or(unchanged, word));
            edge_of(edge, measured, standing, inline)
        })
        .collect();
    let mut body = String::from("\"children\":");
    J::Arr(children).write(&mut body);
    body.push_str(",\"edges\":");
    J::Arr(edges).write(&mut body);
    Graph {
        options: Vec::new(),
        body,
    }
}
