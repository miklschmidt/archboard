//! Containers and group regions a block of cards draws inline (TASK-349). Each
//! is a Graphviz cluster of the block's own layout, headed by its title row or
//! its region's caption, which invisible edges hold above every member no line
//! inside the cluster already holds; so the board's cards are ranked across
//! containers, as the track engine ranks them.
//!
//! Reading the clusters back after Graphviz answers is `readback.rs`, and the
//! rules for the labels of lines entering or leaving a container are
//! `label_rules.rs`.

use crate::constants::{CONTAINER_INSET, REGION_INSET};
use crate::ecma::{js_min, or, sorted_by};
use crate::track::graphviz::Join;
use crate::track::scene::{Map, Set};
use crate::viz::{Attrs, Edge, Node, Value, box_node};

use super::laid::Size;
use super::lone::title_width;
use super::tree::{Block, Cluster, ClusterKind, Line};

/// How strongly a title row holds each member below it.
const TITLE_WEIGHT: f64 = 10.0;
/// Horizontal room Graphviz keeps between neighbours in a rank.
pub(crate) const NODE_GAP: f64 = 40.0;

/// The room a cluster keeps round what it holds, as Graphviz draws it and as
/// a card inside it may move.
pub(super) fn inset_of(cluster: &Cluster) -> f64 {
    (if cluster.kind == ClusterKind::Frame {
        CONTAINER_INSET
    } else {
        REGION_INSET
    }) + if cluster.lone.is_some() {
        REGION_INSET
    } else {
        0.0
    }
}

/// The vendor node heading a cluster: a frame's title row or a region's caption.
pub(crate) fn title_of(cluster: &str) -> String {
    format!("title:{cluster}")
}

/// The cluster a vendor node heads, if it heads one.
fn titled(name: &str) -> Option<&str> {
    name.strip_prefix("title:")
}

/// Whether a vendor node heads a cluster.
pub(crate) fn is_title(name: &str) -> bool {
    name.starts_with("title:")
}

/// A line Graphviz ranks, between the vendor nodes it joins.
#[derive(Clone, Debug)]
pub(crate) struct Link {
    pub tail: String,
    pub head: String,
    pub label: String,
    /// The ids of the Graphviz edges that draw it.
    pub legs: [String; 3],
}

impl Link {
    /// The line as the columns line it up.
    pub(crate) fn join(&self) -> Join {
        Join {
            tail: self.tail.clone(),
            head: self.head.clone(),
            label: Some(self.label.clone()),
            legs: Some(self.legs.to_vec()),
        }
    }
}

/// Where nodes go: the block's graph, or one of its clusters.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Holder {
    Graph,
    Cluster(usize),
}

/// A Graphviz cluster: its name, its margin, its nodes and the clusters inside it.
#[derive(Clone, Debug)]
pub(crate) struct ClusterGraph {
    pub name: String,
    pub margin: f64,
    pub nodes: Vec<Node>,
    pub subgraphs: Vec<usize>,
}

/// A block's inline clusters, in its graph and read back from it.
pub(crate) struct Clusters<'t> {
    pub block: &'t Block,
    /// Each cluster's graph, in the block's order.
    pub graphs: Vec<ClusterGraph>,
    /// Each cluster's place in `graphs`, by id.
    pub(super) index: Map<String, usize>,
    /// Each Graphviz cluster's name, by the cluster it draws.
    pub(super) names: Map<String, String>,
    /// The clusters standing in the block's graph itself, in order.
    pub top: Vec<usize>,
    /// The width of each card evened with the card over or under it.
    pub widths: Map<String, f64>,
}

impl<'t> Clusters<'t> {
    /// Make every cluster of a block, each headed by its title.
    pub(crate) fn new(block: &'t Block) -> Clusters<'t> {
        let mut clusters = Clusters {
            block,
            graphs: Vec::new(),
            index: Map::default(),
            names: Map::default(),
            top: Vec::new(),
            widths: Map::default(),
        };
        for (index, cluster) in block.clusters.values().enumerate() {
            let name = format!("cluster_{index}");
            let inset = inset_of(cluster);
            let title = box_node(
                title_of(&cluster.id),
                title_width(&cluster.header, cluster.lone.as_ref(), inset),
                cluster.header.height,
            );
            clusters.graphs.push(ClusterGraph {
                name: name.clone(),
                margin: inset,
                nodes: vec![title],
                subgraphs: Vec::new(),
            });
            clusters.index.insert(cluster.id.clone(), index);
            clusters.names.insert(name, cluster.id.clone());
            match &cluster.parent {
                None => clusters.top.push(index),
                Some(parent) => {
                    let at = clusters.index[parent.as_str()];
                    clusters.graphs[at].subgraphs.push(index);
                }
            }
        }
        clusters
    }

    /// Where a cluster's nodes go.
    fn holder(&self, cluster: &str) -> Holder {
        Holder::Cluster(self.index[cluster])
    }

    /// Every line Graphviz ranks, by where its ends stand in the board's order,
    /// a container at its first member.
    pub(crate) fn board_order(&self, vendor_of: impl Fn(&str) -> String) -> Vec<&'t Line> {
        let block = self.block;
        let mut place: Map<String, f64> = block
            .items
            .iter()
            .enumerate()
            .map(|(index, item)| (item.clone(), index as f64))
            .collect();
        for (index, item) in block.items.iter().enumerate() {
            let mut around = block.cluster_of.get(item);
            while let Some(cluster) = around {
                let title = title_of(cluster);
                let at = place.get(&title).copied().unwrap_or(index as f64);
                place.insert(title, js_min(at, index as f64));
                around = block.cluster_of.get(cluster);
            }
        }
        let placed: Vec<(&'t Line, f64, f64)> = block
            .lines
            .values()
            .filter(|line| super::walls::ranks(block, line))
            .map(|line| {
                let at = |end: &str| place.get(&vendor_of(end)).copied().unwrap_or(-1.0);
                (line, at(&line.tail), at(&line.head))
            })
            .collect();
        sorted_by(&placed, |one, other| or(one.1 - other.1, one.2 - other.2))
            .into_iter()
            .map(|(line, _, _)| line)
            .collect()
    }

    /// The size of a cluster's title node, when the vendor node heads one.
    pub(crate) fn size_of(&self, name: &str) -> Option<Size> {
        let cluster = self.block.clusters.get(titled(name)?)?;
        Some(cluster.header.size())
    }

    /// Where a member's node goes: its innermost cluster, or the block's graph.
    pub(crate) fn holder_of(&self, member: &str) -> Holder {
        self.block
            .cluster_of
            .get(member)
            .map_or(Holder::Graph, |around| self.holder(around))
    }

    /// The clusters around a vendor node, innermost first: a title stands inside
    /// its own cluster, and ports, pins and headers inside none.
    pub(crate) fn around<'a>(&'a self, vendor: &'a str) -> Vec<&'a str> {
        let start = match titled(vendor) {
            Some(cluster) => Some(cluster),
            None => self.block.cluster_of.get(vendor).map(String::as_str),
        };
        self.block.clusters_from(start)
    }

    /// Where a label between two vendor nodes goes: their innermost shared cluster.
    fn common(&self, one: &str, other: &str) -> Holder {
        let theirs = self.around(other);
        self.around(one)
            .into_iter()
            .find(|id| theirs.contains(id))
            .map_or(Holder::Graph, |shared| self.holder(shared))
    }

    /// Stand a line's label in its cluster: inside the innermost container its
    /// lower end stands in and its upper end does not, held below that
    /// container's title; else in the innermost cluster around both ends.
    /// Answers where the label goes and the edge holding it below the title.
    pub(crate) fn hold_label(&self, tail: &str, head: &str, label: &str) -> (Holder, Vec<Edge>) {
        let Some(entered) = self.entered_frame(tail, head) else {
            return (self.common(tail, head), Vec::new());
        };
        let attributes = Attrs::of([
            ("style", Value::from("invis")),
            ("weight", Value::Num(TITLE_WEIGHT)),
        ]);
        let tail = title_of(entered);
        (
            self.holder(entered),
            vec![Edge::new(tail, label, attributes)],
        )
    }

    /// The vendor node a member of a cluster stands at: a nested cluster at its title.
    pub(crate) fn vendor_of(&self, member: &str) -> String {
        if self.block.clusters.contains_key(member) {
            title_of(member)
        } else {
            member.to_owned()
        }
    }

    /// Whether a line holds its lower end below the title of the cluster that
    /// end is a member of: its upper end stands inside that cluster too.
    fn holds(&self, tail: &str, head: &str) -> bool {
        let member = titled(head).unwrap_or(head);
        self.block
            .cluster_of
            .get(member)
            .is_some_and(|around| self.around(tail).contains(&around.as_str()))
    }

    /// How strongly a line pulls its lower end: one that holds it below its
    /// cluster's title pulls as hard as that title's own edge would.
    pub(crate) fn weight_of(&self, tail: &str, head: &str) -> f64 {
        if self.holds(tail, head) {
            TITLE_WEIGHT
        } else {
            1.0
        }
    }

    /// The invisible edges that hold each title above its cluster's members,
    /// but for a member some line from inside its own cluster already holds,
    /// or something else holds down.
    pub(crate) fn title_edges(&self, lower: &Set<String>, links: &[Link]) -> Vec<Edge> {
        self.block
            .cluster_of
            .iter()
            .filter(|&(member, _)| {
                let vendor = self.vendor_of(member);
                let held = links
                    .iter()
                    .any(|link| link.head == vendor && self.holds(&link.tail, &link.head));
                !lower.contains(member) && !held
            })
            .map(|(member, around)| {
                Edge::new(
                    title_of(around),
                    self.vendor_of(member),
                    Attrs::of([
                        ("style", Value::from("invis")),
                        ("weight", Value::Num(TITLE_WEIGHT)),
                    ]),
                )
            })
            .collect()
    }
}
