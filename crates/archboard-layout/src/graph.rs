//! The measured graph a solve lays out, as the host's `compoundGraph` builds
//! it: the board's containment, every card's and container's measured size,
//! every relationship's ends and label, and the layout options that carry the
//! rest as text (`shared/rules/layout/compound-graph.ts`).

use std::rc::Rc;

use indexmap::IndexMap;
use serde::Deserialize;

/// Layout options: text by name, in the order they were set.
pub(crate) type Options = IndexMap<String, String>;

/// A card, a container or the board.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct Node {
    pub id: String,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
    #[serde(default)]
    pub children: Option<Vec<Node>>,
    #[serde(default)]
    pub edges: Option<Vec<Rc<Edge>>>,
    #[serde(default, rename = "layoutOptions")]
    pub layout_options: Option<Options>,
}

/// A relationship.
#[derive(Debug, Deserialize)]
pub(crate) struct Edge {
    pub id: String,
    pub sources: Vec<String>,
    pub targets: Vec<String>,
    #[serde(default)]
    pub labels: Option<Vec<Label>>,
    #[serde(default, rename = "layoutOptions")]
    pub layout_options: Option<Options>,
}

/// A relationship's measured label.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct Label {
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
}

impl Node {
    /// One layout option, if set.
    pub(crate) fn option(&self, name: &str) -> Option<&str> {
        self.layout_options.as_ref()?.get(name).map(String::as_str)
    }

    /// Whether the node holds children: `node.children?.length` is truthy.
    pub(crate) fn has_children(&self) -> bool {
        self.children
            .as_ref()
            .is_some_and(|children| !children.is_empty())
    }

    /// Its children, none when it has no list.
    pub(crate) fn kids(&self) -> &[Node] {
        self.children.as_deref().unwrap_or(&[])
    }

    /// Its measured width; a measured node always has one.
    pub(crate) fn w(&self) -> f64 {
        self.width.unwrap_or(f64::NAN)
    }

    /// Its measured height.
    pub(crate) fn h(&self) -> f64 {
        self.height.unwrap_or(f64::NAN)
    }
}

impl Edge {
    /// One layout option, if set.
    pub(crate) fn option(&self, name: &str) -> Option<&str> {
        self.layout_options.as_ref()?.get(name).map(String::as_str)
    }

    /// Its source's id.
    pub(crate) fn source(&self) -> &str {
        self.sources.first().map_or("", String::as_str)
    }

    /// Its target's id.
    pub(crate) fn target(&self) -> &str {
        self.targets.first().map_or("", String::as_str)
    }

    /// How many labels it carries: `edge.labels?.length ?? 0`.
    pub(crate) fn label_count(&self) -> usize {
        self.labels.as_ref().map_or(0, Vec::len)
    }

    /// Its first label.
    pub(crate) fn label(&self) -> Option<&Label> {
        self.labels.as_ref()?.first()
    }
}

/// `semanticOrder`: the authored order a shape carries.
pub(crate) fn semantic_order(options: Option<&Options>) -> f64 {
    crate::ecma::number_of(
        options
            .and_then(|options| options.get("archboard.order"))
            .map_or("0", String::as_str),
    )
}

/// The layout option naming the group a node is placed with.
pub(crate) const PLACING_GROUP: &str = "archboard.group";
/// The root option carrying each placing group's caption size.
pub(crate) const GROUP_CAPTIONS: &str = "archboard.group.captions";
/// The option marking a child an entry point of its container.
pub(crate) const ENTRY_POINT: &str = "archboard.entry";
/// The option carrying each size a container's header can take.
pub(crate) const HEADER_STEPS: &str = "archboard.header.steps";
/// The option marking a line that leaves its source from the source's points.
pub(crate) const FROM_POINTS: &str = "archboard.from-points";
/// How far in from its source's sides a line from a side point runs down.
pub(crate) const POINTS_INSET: &str = "archboard.from-points.inset";
