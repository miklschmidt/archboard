//! Reading a block's clusters back from Graphviz (TASK-349): every cluster's
//! box, the cards and labels lined up inside them, and the frames nested as
//! nodes around their members with their title rows, and the regions as rows
//! on the block's root, the shape the track scene reads.

use crate::constants::ARCHITECTURE_HEADER_PADDING;
use crate::ecma::{abs, js_min};
use crate::geometry::{Point, Rect};
use crate::placed::{PlacedNode, PlacedRegion};
use crate::track::graphviz::{Holds, Join, Output, Room, Wrap, align_columns, numbers};
use crate::track::scene::Map;

use super::clusters::{Clusters, NODE_GAP, inset_of, title_of};
use super::laid::Size;
use super::lone::{Card, Head, title_row};
use super::tree::{Cluster, ClusterKind};

/// The room a card moved into line keeps from its neighbours: half what Graphviz keeps.
const LINED_UP_GAP: f64 = 20.0;

impl Clusters<'_> {
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
