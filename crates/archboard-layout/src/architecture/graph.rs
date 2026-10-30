//! The measured graph Track and Blocks lay out: semantic containment,
//! measured sizes, which children are entry points of the container around
//! them, and which point of a flowchart's decision each of its answers leaves
//! from. Each solve chooses ranks and attachment faces.

use std::collections::BTreeMap;

use archboard_scene::drawing::{MeasuredNode, NodeFacts};
use archboard_scene::names::word;
use archboard_scene::request::Standing;
use indexmap::IndexMap;

use super::content::{Content, Edge, Node};
use super::measured::Measured;
use crate::ecma;
use crate::json::J;

/// The layout option naming the group a node is placed with (TASK-347).
const PLACING_GROUP: &str = "archboard.group";
/// The root option carrying each placing group's caption size, as `[id, width, height]` rows.
const GROUP_CAPTIONS: &str = "archboard.group.captions";
/// The option marking a child a relationship from outside its container reaches (ADR 0044).
const ENTRY_POINT: &str = "archboard.entry";
/// The option carrying each width a container's header can take, as `[width, height]` rows.
const HEADER_STEPS: &str = "archboard.header.steps";
/// The option marking a line that leaves its source from the source's points.
const FROM_POINTS: &str = "archboard.from-points";
/// How far in from its source's edges the lines from its side points run down.
const POINTS_INSET: &str = "archboard.from-points.inset";

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

/// The options of each line out of a card that leaves from its points: the
/// first of two or more asks for the bottom-left corner of the card's box,
/// the last for the bottom-right, and any other for the middle of its bottom.
fn points_of(
    edges: &[&Edge],
    measured: &Measured,
) -> BTreeMap<String, Vec<(&'static str, String)>> {
    let mut leaving: IndexMap<&str, Vec<&str>> = IndexMap::new();
    for edge in edges {
        let pointed = measured.nodes.get(&edge.from).and_then(|node| node.pointed);
        if pointed.is_some() {
            leaving
                .entry(edge.from.as_str())
                .or_default()
                .push(&edge.id);
        }
    }
    let mut points = BTreeMap::new();
    for (from, ids) in leaving {
        let inset = measured.nodes[from].pointed.map_or_else(String::new, text);
        for (index, id) in ids.iter().enumerate() {
            let end = ids.len() > 1 && (index == 0 || index == ids.len() - 1);
            let compass = match (end, index) {
                (true, 0) => "sw",
                (true, _) => "se",
                _ => "s",
            };
            let options = vec![
                (FROM_POINTS, compass.to_owned()),
                (POINTS_INSET, inset.clone()),
            ];
            points.insert((*id).to_owned(), options);
        }
    }
    points
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
fn node_of(
    node: &Node,
    measured: &MeasuredNode<NodeFacts>,
    group: Option<&String>,
    first: Option<bool>,
) -> J {
    let mut options = vec![("archboard.order".to_owned(), J::Str(text(node.order)))];
    if let Some(group) = group {
        options.push((PLACING_GROUP.to_owned(), J::str(group)));
    }
    if let Some(first) = first {
        options.push((
            ENTRY_POINT.to_owned(),
            J::str(if first { "true" } else { "false" }),
        ));
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
    if let Some(standing) = standing {
        options.push((
            "archboard.relationship.standing".to_owned(),
            J::str(standing),
        ));
    }
    options
}

/// A relationship with its options and its measured label.
fn edge_of(
    edge: &Edge,
    measured: &Measured,
    standing: Option<&str>,
    inline: bool,
    points: Option<&Vec<(&'static str, String)>>,
) -> J {
    let mut options = edge_options(edge, standing);
    if !inline && let Some(kind) = measured.held_kinds.get(&edge.id) {
        options.push(("archboard.relationship.held-kind".to_owned(), J::str(kind)));
    }
    for (name, value) in points.into_iter().flatten() {
        options.push(((*name).to_owned(), J::str(value)));
    }
    let labels = measured
        .labels
        .get(&edge.id)
        .map_or_else(Vec::new, |label| {
            let words: Vec<&str> = label.runs.iter().map(|run| run.text.as_str()).collect();
            vec![J::obj([
                ("id", J::Str(format!("{}:label", edge.id))),
                ("text", J::Str(words.join("\n"))),
                ("width", J::Num(label.width)),
                ("height", J::Num(label.height)),
                ("stacked", J::Bool(label.chips.len() > 1)),
            ])]
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

/// Assemble the nodes into their containers: each node, by the board's
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

/// The graph of a board: its nodes in their containers, its relationships
/// with their labels and options, and each placing group's caption size.
///
/// `inline` selects the retained Track input; Blocks also keeps the variant’s own overview kinds.
pub(crate) fn compound_graph(
    content: &Content,
    measured: &Measured,
    standings: Option<&Standings>,
    entries: &BTreeMap<String, bool>,
    inline: bool,
) -> Graph {
    let placing = measured.groups.as_ref().map(|groups| &groups.placing);
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
            let group = placing.and_then(|placing| placing.get(id));
            Some((
                id.clone(),
                node_of(node, value, group, entries.get(id).copied()),
            ))
        })
        .collect();
    let children = assembled(content, nodes);
    let edges = ecma::sorted_by(&content.edges.iter().collect::<Vec<_>>(), |one, other| {
        one.order - other.order
    });
    let points = points_of(&edges, measured);
    let unchanged = "unchanged";
    let edges: Vec<J> = edges
        .iter()
        .map(|edge| {
            let standing =
                standings.map(|standings| standings.get(&edge.id).map_or(unchanged, word));
            edge_of(edge, measured, standing, inline, points.get(&edge.id))
        })
        .collect();
    let mut body = String::from("\"children\":");
    J::Arr(children).write(&mut body);
    body.push_str(",\"edges\":");
    J::Arr(edges).write(&mut body);
    Graph {
        options: caption_options(measured),
        body,
    }
}

/// The root options carrying each placing group's caption size, when any group places.
fn caption_options(measured: &Measured) -> Vec<(String, String)> {
    let Some(groups) = measured
        .groups
        .as_ref()
        .filter(|groups| !groups.captions.is_empty())
    else {
        return Vec::new();
    };
    let rows = groups
        .captions
        .iter()
        .map(|(id, label)| J::Arr(vec![J::str(id), J::Num(label.width), J::Num(label.height)]))
        .collect();
    vec![(GROUP_CAPTIONS.to_owned(), J::Arr(rows).text())]
}
