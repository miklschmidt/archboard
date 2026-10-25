//! Containers and group regions a block of cards draws inline (TASK-349). Each
//! is a Graphviz cluster of the block's own layout, headed by its title row or
//! its region's caption, which invisible edges hold above every member no line
//! inside the cluster already holds; so the board's cards are ranked across
//! containers, as the track engine ranks them.
//! After Graphviz answers, the clusters are read back into the shape the track
//! scene reads: every frame a node around its members with its title row, and
//! every region on the block's root.
//!
//! The label rules ride here too: where the label of a line entering a
//! container is held (`anchors.ts`), and how hard the label of a line leaving
//! one is pulled (`leaving.ts`).

use crate::constants::{ARCHITECTURE_HEADER_PADDING, CONTAINER_INSET, REGION_INSET};
use crate::ecma::{abs, js_min, or, sorted_by};
use crate::geometry::{Point, Rect};
use crate::placed::{PlacedNode, PlacedRegion};
use crate::track::graphviz::{Holds, Join, Output, Room, Wrap, align_columns, numbers};
use crate::track::scene::{Map, Set};
use crate::viz::{Attrs, Edge, Node, Value, box_node};

use super::laid::{Laid, Size};
use super::lone::{Card, Head, title_row, title_width};
use super::tree::{Below, Block, Cluster, ClusterKind, Line};

/// The room a card moved into line keeps from its neighbours: half what Graphviz keeps.
const LINED_UP_GAP: f64 = 20.0;
/// How strongly a title row holds each member below it.
const TITLE_WEIGHT: f64 = 10.0;
/// Horizontal room Graphviz keeps between neighbours in a rank.
pub(crate) const NODE_GAP: f64 = 40.0;

/// The room a cluster keeps round what it holds, as Graphviz draws it and as
/// a card inside it may move.
fn inset_of(cluster: &Cluster) -> f64 {
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
    /// Whether a label sits between.
    pub labelled: bool,
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

/// How much harder a graph's edges pull each vendor node down than up.
fn pulls_down(edges: &[Edge]) -> Map<String, f64> {
    let mut pulls: Map<String, f64> = Map::default();
    for edge in edges {
        let weight = edge.attributes.get("weight").map_or(1.0, Value::number);
        *pulls.entry(edge.tail.clone()).or_insert(0.0) += weight;
        let head = pulls.entry(edge.head.clone()).or_insert(0.0);
        *head -= weight;
    }
    pulls
}

/// A block's inline clusters, in its Graphviz graph and read back from it.
#[expect(
    clippy::struct_excessive_bools,
    reason = "each switch is one remedy a relaying turns on (laying.rs), in any mix with the others"
)]
pub(crate) struct Clusters<'t> {
    pub block: &'t Block,
    /// Each cluster's graph, in the block's order.
    pub graphs: Vec<ClusterGraph>,
    /// Each cluster's place in `graphs`, by id.
    index: Map<String, usize>,
    /// Each Graphviz cluster's name, by the cluster it draws.
    names: Map<String, String>,
    /// The clusters standing in the block's graph itself, in order.
    pub top: Vec<usize>,
    /// The width of each card evened with the card over or under it.
    pub widths: Map<String, f64>,
    /// Whether a title pulled up as hard as down is left tied, for Graphviz to break.
    pub keep_ties: bool,
    /// Whether some title was pulled up as hard as down.
    pub tied: bool,
    /// Whether the label of a line leaving a container is pulled onto its lower end.
    pub pulls_leaving: bool,
    /// Whether the label of a line entering a container is held below a line from inside it.
    pub anchors_labels: bool,
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
            keep_ties: false,
            tied: false,
            pulls_leaving: false,
            anchors_labels: false,
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
    /// Where labels are anchored, it is held below a labelled line into the
    /// same card from inside the container instead. Answers where the label
    /// goes, and the edge holding it below its cluster's title, if it needs one.
    pub(crate) fn hold_label(
        &self,
        tail: &str,
        head: &str,
        label: &str,
        links: &[Link],
    ) -> (Holder, Vec<Edge>) {
        let Some(entered) = self.entered_frame(tail, head) else {
            return (self.common(tail, head), Vec::new());
        };
        let upper = if self.anchors_labels {
            self.anchor_of(tail, head, entered, links)
        } else {
            None
        };
        let attributes = Attrs::of([
            ("style", Value::from("invis")),
            ("weight", Value::Num(TITLE_WEIGHT)),
        ]);
        let tail = upper.map_or_else(|| title_of(entered), str::to_owned);
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

    /// Pull every title a little harder onto its members where it is pulled up
    /// exactly as hard as down, unless ties are kept.
    pub(crate) fn untie(&mut self, edges: &mut [Edge]) {
        let pulls = pulls_down(edges);
        let downs: Vec<usize> = self
            .block
            .clusters
            .keys()
            .filter_map(|cluster| {
                let title = title_of(cluster);
                let down = edges.iter().position(|edge| {
                    edge.tail == title && edge.attributes.get("weight").is_some_and(Value::truthy)
                });
                (pulls.get(&title) == Some(&0.0)).then_some(down).flatten()
            })
            .collect();
        self.tied = !downs.is_empty();
        if self.keep_ties {
            return;
        }
        for down in downs {
            let weight = edges[down]
                .attributes
                .get("weight")
                .map_or(f64::NAN, Value::number);
            edges[down].attributes.set("weight", weight + 1.0);
        }
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

    /// The invisible edges that hold a container a line from another container
    /// enters below the line's source, so containers in a chain stack, but for
    /// one that would close a loop.
    pub(crate) fn entering_edges(&self, links: &[Link]) -> Vec<Edge> {
        let mut below = Below::default();
        for link in links {
            below.add(&link.tail, &link.head);
        }
        for (member, around) in &self.block.cluster_of {
            below.add(&title_of(around), &self.vendor_of(member));
        }
        let mut edges = Vec::new();
        for link in links {
            let entered: Vec<&str> = self
                .entered(&link.tail, &link.head)
                .into_iter()
                .filter(|cluster| !below.reaches(&title_of(cluster), &link.tail))
                .collect();
            for cluster in entered {
                below.add(&link.tail, &title_of(cluster));
                let minlen = if link.labelled { 2.0 } else { 1.0 };
                edges.push(Edge::new(
                    link.tail.clone(),
                    title_of(cluster),
                    Attrs::of([
                        ("style", Value::from("invis")),
                        ("minlen", Value::Num(minlen)),
                        ("weight", Value::Num(0.0)),
                    ]),
                ));
            }
        }
        edges
    }

    /// The clusters a line from inside another cluster enters.
    fn entered<'a>(&'a self, tail: &'a str, head: &'a str) -> Vec<&'a str> {
        let theirs = self.around(tail);
        if theirs.is_empty() {
            return Vec::new();
        }
        self.around(head)
            .into_iter()
            .filter(|cluster| !theirs.contains(cluster))
            .collect()
    }

    /// The innermost cluster a vendor node stands in.
    fn holding(&self, name: &str) -> Option<&str> {
        if let Some(around) = self.block.cluster_of.get(name) {
            return Some(around);
        }
        let at = self
            .graphs
            .iter()
            .position(|graph| graph.nodes.iter().any(|node| node.name == name))?;
        self.block.clusters.get_index(at).map(|(id, _)| id.as_str())
    }

    /// The span a card or label may move in: inside its innermost cluster,
    /// clear of the cluster's inset, or inside the block.
    fn span_of(&self, name: &str, boxes: &Map<String, Rect>, width: f64) -> Option<(f64, f64)> {
        if !self.block.items.iter().any(|item| item == name) && !name.starts_with("label:") {
            return None;
        }
        let Some(around) = self.holding(name) else {
            return Some((0.0, width));
        };
        let inset = inset_of(&self.block.clusters[around]);
        let bounds = boxes[around];
        Some((bounds.x + inset, bounds.x + bounds.width - inset))
    }

    /// Line up the joined cards Graphviz stacked a few points out of one column:
    /// a card or label moves inside its cluster, or the block, and clear of the
    /// other clusters and the lines.
    pub(crate) fn line_up(
        &mut self,
        joins: &[Join],
        centres: &mut Map<String, Point>,
        placed: LinedUp<'_>,
    ) {
        let LinedUp {
            boxes,
            clusters,
            polylines,
            width,
            cards,
            lowered,
        } = placed;
        for (id, &at) in clusters {
            boxes.insert(format!("cluster:{id}"), at);
        }
        {
            let within = |name: &str| self.span_of(name, clusters, width);
            let card = |name: &str| cards.contains_key(name);
            let around = |card: &str| self.block.cluster_of.get(card).cloned();
            let room = Room {
                gap: LINED_UP_GAP,
                polylines: Some(polylines),
                within: &within,
                card: Some(&card),
                wrap: Some(Wrap {
                    rows: lowered,
                    around: &around,
                }),
                holds: Some(Holds {
                    slot: NODE_GAP + 2.0,
                    around: &around,
                }),
            };
            align_columns(boxes, joins, &room);
        }
        for (name, at) in boxes.iter() {
            if cards.contains_key(name.as_str()) {
                self.widths.insert(name.clone(), at.width);
            }
        }
        for (name, at) in boxes.iter() {
            if let Some(centre) = centres.get_mut(name) {
                *centre = Point {
                    x: at.x + at.width / 2.0,
                    y: centre.y,
                };
            }
        }
    }

    /// Every cluster's box, as Graphviz answered it.
    ///
    /// # Errors
    ///
    /// When Graphviz answered geometry that is not a number.
    pub(crate) fn boxes(
        &self,
        output: &Output,
        origin: Point,
    ) -> Result<Map<String, Rect>, String> {
        let mut boxes = Map::default();
        for object in &output.objects {
            let (Some(id), Some(bb)) = (self.names.get(&object.name), &object.bb) else {
                continue;
            };
            let at = numbers(bb)?;
            let (x1, y1, x2, y2) = (at[0], at[1], at[2], at[3]);
            boxes.insert(
                id.clone(),
                Rect {
                    x: js_min(x1, x2) - origin.x,
                    y: js_min(y1, y2) - origin.y,
                    width: abs(x2 - x1),
                    height: abs(y2 - y1),
                },
            );
        }
        Ok(boxes)
    }

    /// Every frame as a node of the scene, around nothing yet, with its title row.
    fn frame_node(
        cluster: &Cluster,
        centres: &Map<String, Point>,
        boxes: &Map<String, Rect>,
    ) -> PlacedNode {
        let bounds = boxes[cluster.id.as_str()];
        let head = Head {
            centre: centres[title_of(&cluster.id).as_str()].y,
            height: cluster.header.height,
            words: cluster.header.width - ARCHITECTURE_HEADER_PADDING,
            steps: cluster.header.steps.as_deref(),
        };
        PlacedNode {
            id: cluster.id.clone(),
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            children: Some(Vec::new()),
            frame: Some(title_row(bounds, &head, cluster.lone.as_ref())),
        }
    }

    /// The placed block's children nested as the track scene reads them: every
    /// frame a node around its members with its title row, every region a row
    /// on the root.
    pub(crate) fn nest(
        &self,
        leaves: Vec<PlacedNode>,
        centres: &Map<String, Point>,
        boxes: &Map<String, Rect>,
    ) -> (Vec<PlacedNode>, Vec<PlacedRegion>) {
        let block = self.block;
        let frames: Vec<&Cluster> = block
            .clusters
            .values()
            .filter(|cluster| cluster.kind == ClusterKind::Frame)
            .collect();
        // What each frame holds, and what the block's root holds, in the order they were put there.
        let mut held: Map<Option<String>, Vec<Nested>> = Map::default();
        for (index, cluster) in frames.iter().enumerate() {
            let frame = block.frame_around(cluster.parent.as_deref());
            held.entry(frame).or_default().push(Nested::Frame(index));
        }
        for (index, leaf) in leaves.iter().enumerate() {
            let frame = block.frame_around(block.cluster_of.get(&leaf.id).map(String::as_str));
            held.entry(frame).or_default().push(Nested::Leaf(index));
        }
        let mut leaves: Vec<Option<PlacedNode>> = leaves.into_iter().map(Some).collect();
        let root = held.get(&None).map(Vec::as_slice).unwrap_or_default();
        let children = Self::nested(root, &frames, &held, &mut leaves, centres, boxes);
        (children, self.region_rows(centres, boxes))
    }

    /// What one frame, or the block's root, holds (`entries`), each frame nested with what it holds.
    fn nested(
        entries: &[Nested],
        frames: &[&Cluster],
        held: &Map<Option<String>, Vec<Nested>>,
        leaves: &mut [Option<PlacedNode>],
        centres: &Map<String, Point>,
        boxes: &Map<String, Rect>,
    ) -> Vec<PlacedNode> {
        entries
            .iter()
            .map(|entry| match *entry {
                Nested::Leaf(index) => leaves[index].take().expect("a leaf placed once"),
                Nested::Frame(index) => {
                    let cluster = frames[index];
                    let mut node = Self::frame_node(cluster, centres, boxes);
                    let inside = held
                        .get(&Some(cluster.id.clone()))
                        .map(Vec::as_slice)
                        .unwrap_or_default();
                    node.children =
                        Some(Self::nested(inside, frames, held, leaves, centres, boxes));
                    node
                }
            })
            .collect()
    }

    /// Every region as the track scene reads it: its group, frame, direct
    /// members, band and caption.
    fn region_rows(
        &self,
        centres: &Map<String, Point>,
        boxes: &Map<String, Rect>,
    ) -> Vec<PlacedRegion> {
        let block = self.block;
        block
            .clusters
            .values()
            .filter(|cluster| cluster.kind == ClusterKind::Region)
            .map(|cluster| {
                let bounds = boxes[cluster.id.as_str()];
                let centre = centres[title_of(&cluster.id).as_str()];
                let Size { width, height } = cluster.header.size();
                PlacedRegion {
                    group: cluster.group.clone().unwrap_or_default(),
                    parent: block.frame_around(cluster.parent.as_deref()),
                    members: block
                        .cluster_of
                        .iter()
                        .filter(|&(_, around)| *around == cluster.id)
                        .map(|(member, _)| member.clone())
                        .collect(),
                    bx: [bounds.x, bounds.y, bounds.width, bounds.height],
                    caption: [
                        centre.x - width / 2.0,
                        centre.y - height / 2.0,
                        width,
                        height,
                    ],
                }
            })
            .collect()
    }

    /// The innermost container a line enters: a frame its lower end stands in
    /// and its upper end does not. A group region is no boundary a line must go
    /// round, so a line enters none.
    pub(crate) fn entered_frame<'a>(&'a self, tail: &'a str, head: &'a str) -> Option<&'a str> {
        if is_title(head) {
            return None;
        }
        let theirs = self.around(tail);
        self.around(head)
            .into_iter()
            .find(|id| !theirs.contains(id) && self.block.clusters[*id].kind == ClusterKind::Frame)
    }

    /// The upper end of another labelled line into the same card from inside
    /// the container a line enters, which its label may be held below.
    fn anchor_of<'a>(
        &self,
        tail: &str,
        head: &str,
        entered: &str,
        links: &'a [Link],
    ) -> Option<&'a str> {
        links
            .iter()
            .find(|link| {
                link.head == head
                    && link.labelled
                    && link.tail != tail
                    && self.around(&link.tail).contains(&entered)
            })
            .map(|link| link.tail.as_str())
    }

    /// Whether anchoring would hold some entering line's label below another
    /// line rather than below its container's title.
    pub(crate) fn anchorable(&self, links: &[Link]) -> bool {
        links.iter().any(|link| {
            let entered = if link.labelled {
                self.entered_frame(&link.tail, &link.head)
            } else {
                None
            };
            entered.is_some_and(|entered| {
                self.anchor_of(&link.tail, &link.head, entered, links)
                    .is_some()
            })
        })
    }

    /// The containers a line leaves: frames its upper end stands in and its lower end does not.
    fn left_frames<'a>(&'a self, tail: &'a str, head: &'a str) -> Vec<&'a str> {
        let theirs = self.around(head);
        self.around(tail)
            .into_iter()
            .filter(|id| {
                !theirs.contains(id) && self.block.clusters[*id].kind == ClusterKind::Frame
            })
            .collect()
    }

    /// How much harder a line's label is pulled onto its lower end than onto
    /// its upper: one where the line leaves a container and its block pulls such labels.
    pub(crate) fn leaving_pull(&self, tail: &str, head: &str) -> f64 {
        if self.pulls_leaving && !self.left_frames(tail, head).is_empty() {
            1.0
        } else {
            0.0
        }
    }

    /// How many lines' labels a laid-out block stands beside a container the line leaves.
    pub(crate) fn labels_beside(&self, links: &[Link], laid: &Laid) -> usize {
        let frames: Map<&str, Rect> = laid
            .frames
            .iter()
            .flatten()
            .map(|frame| (frame.id.as_str(), frame.bx))
            .collect();
        links
            .iter()
            .filter(|link| {
                let Some(at) = laid.boxes.get(&link.label) else {
                    return false;
                };
                link.labelled
                    && self
                        .left_frames(&link.tail, &link.head)
                        .iter()
                        .any(|id| frames.get(id).is_some_and(|frame| beside(at, frame)))
            })
            .count()
    }
}

/// What a frame or the root holds: a frame, by its place among the block's
/// frames, or a leaf, by its place among the placed leaves.
#[derive(Clone, Copy)]
enum Nested {
    Frame(usize),
    Leaf(usize),
}

/// What lining a block's cards up reads and moves.
pub(crate) struct LinedUp<'a> {
    /// Every vendor node's box; the moved ones are replaced.
    pub boxes: &'a mut Map<String, Rect>,
    /// Every cluster's box.
    pub clusters: &'a Map<String, Rect>,
    /// Every vendor edge's polyline, by id.
    pub polylines: &'a Map<String, Vec<Point>>,
    /// The block's width.
    pub width: f64,
    /// The block's cards, whose widths may be evened with the card over or under them.
    pub cards: &'a Map<String, Card>,
    /// How far a wrap lowered each card of its rank; empty when none.
    pub lowered: &'a Map<String, usize>,
}

/// Whether a box stands beside another: on some of its height, wholly left or right of it.
fn beside(one: &Rect, other: &Rect) -> bool {
    let level = one.y < other.y + other.height && other.y < one.y + one.height;
    level && (one.x >= other.x + other.width || one.x + one.width <= other.x)
}
