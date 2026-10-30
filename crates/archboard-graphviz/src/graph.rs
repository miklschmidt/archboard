//! The graph the layout hands Graphviz, as viz-js reads a `Graph` object:
//! every attribute in the order it was set, its value as `String(value)`
//! spells it. The layout writes a directed graph that is not strict.

use serde::Deserialize;
use serde::de::{Deserializer, Error, MapAccess, Visitor};

/// Attributes in the order they were set, each value spelt as text.
#[derive(Debug, Default)]
pub(crate) struct Attributes(pub(crate) Vec<(String, String)>);

impl<'de> Deserialize<'de> for Attributes {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_map(InOrder)
    }
}

/// Reads an attribute object, keeping its order.
struct InOrder;

impl<'de> Visitor<'de> for InOrder {
    type Value = Attributes;

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("an object of attributes")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Attributes, A::Error> {
        let mut pairs = Vec::new();
        while let Some((key, value)) = map.next_entry::<String, serde_json::Value>()? {
            pairs.push((key, spelt(&value).map_err(A::Error::custom)?));
        }
        Ok(Attributes(pairs))
    }
}

/// `String(value)` of a value the layout writes: a string, a number or a truth.
fn spelt(value: &serde_json::Value) -> Result<String, String> {
    match value {
        serde_json::Value::String(text) => Ok(text.clone()),
        serde_json::Value::Number(number) => number
            .as_f64()
            .map(archboard_scene::js::number)
            .ok_or_else(|| format!("the attribute value {number} is no number")),
        serde_json::Value::Bool(truth) => Ok(truth.to_string()),
        other => Err(format!(
            "an attribute value is a string, a number or a truth, not {other}"
        )),
    }
}

/// A node, by name.
#[derive(Debug, Deserialize)]
pub(crate) struct Node {
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) attributes: Attributes,
}

/// An edge between two nodes, by name.
#[derive(Debug, Deserialize)]
pub(crate) struct Edge {
    pub(crate) tail: String,
    pub(crate) head: String,
    #[serde(default)]
    pub(crate) attributes: Attributes,
}

/// A graph, or one of its subgraphs, with what it holds in the order it holds it.
#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
#[expect(
    clippy::struct_field_names,
    reason = "the fields are viz-js's graphAttributes, nodeAttributes and edgeAttributes"
)]
pub(crate) struct Graph {
    pub(crate) name: Option<String>,
    pub(crate) graph_attributes: Attributes,
    pub(crate) node_attributes: Attributes,
    pub(crate) edge_attributes: Attributes,
    pub(crate) nodes: Vec<Node>,
    pub(crate) edges: Vec<Edge>,
    pub(crate) subgraphs: Vec<Graph>,
}
