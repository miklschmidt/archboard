//! A block of cards laid out on its own. Graphviz ranks and orders its cards,
//! its labels, its header and its ports; the track router then draws every
//! line inside it on tracks in the channels between its ranks, growing each
//! channel to fit, so the block's size is final when this answers. Its graph
//! is built in `card_graph.rs`, held in place by `holding.rs` and routed by
//! `routing.rs`.

use std::cell::RefCell;
use std::rc::Rc;

use rustc_hash::FxHashMap;

use crate::Graphviz;
use crate::constants::CONTAINER_INSET;
use crate::ecma::{abs, js_min};
use crate::geometry::{Point, Rect, Side};
use crate::placed::{PlacedBlock, PlacedEdge, PlacedNode};
use crate::track::graphviz::{boxes_of, centres_of, numbers, output_of, polyline_points};
use crate::track::grid::Loose;
use crate::track::scene::{Map, Set};
use crate::track::score::Plan;
use crate::viz::{Attrs, Edge, Graph, Node, Subgraph, Value, box_node, nodes_in};

use super::clusters::{Clusters, Holder, Link, is_title, title_of};
use super::laid::{Insets, Laid, LaidMap, Size};
use super::leaves::{
    PORT, corner_header, hold_resized_children, leaves_of, pinned_leaf, settled_leaf,
};
use super::readback::LinedUp;
use super::routing::routed;
use super::tree::{Block, BlockId, BlockTree, Line, header_of};
use super::walls::ranks;

/// Vertical room Graphviz keeps between ranks; the router spaces ranks again from its tracks.
const RANK_GAP: f64 = 28.0;

/// Graphviz asked once for each graph one layout of a board gives it.
/// Graphviz answers a graph the same way every time, so a graph it has
/// answered is answered again from the text it gave.
pub(crate) struct Engine<'g> {
    host: &'g mut dyn Graphviz,
    answers: FxHashMap<String, Rc<str>>,
}

impl<'g> Engine<'g> {
    /// Graphviz, answering each graph once.
    pub(crate) fn new(host: &'g mut dyn Graphviz) -> Engine<'g> {
        Engine {
            host,
            answers: FxHashMap::default(),
        }
    }

    /// A graph laid out, as Graphviz answered it the first time it was asked.
    ///
    /// # Errors
    ///
    /// What Graphviz refused the graph with.
    pub(crate) fn render(&mut self, graph: &Graph) -> Result<Rc<str>, String> {
        let text = graph.text();
        if let Some(answer) = self.answers.get(&text) {
            return Ok(Rc::clone(answer));
        }
        let answer: Rc<str> = self.host.render(&text)?.into();
        self.answers.insert(text, Rc::clone(&answer));
        Ok(answer)
    }
}

/// How a block is arranged beyond Graphviz's own ranking.
#[derive(Clone, Debug, Default)]
pub(crate) struct Arrangement {
    /// How many rows each item a wide rank wraps is set below its place.
    pub lowered: Plan,
    /// Whether the cards no line touches are set out as a grid.
    pub grid: bool,
    /// Whether a wrap's rows keep their columns, each lowered card under the one above it.
    pub columns: bool,
}

/// A subgraph of the block's graph: one of its clusters, or a rank of nodes held together.
pub(super) enum Sub {
    Cluster(usize),
    Plain(Subgraph),
}

/// The block ranked by Graphviz and lined up, its lines not yet routed.
pub(crate) struct Lined {
    pub placed: PlacedBlock,
    pub centres: Map<String, Point>,
    pub boxes: Map<String, Rect>,
}

/// One block of cards' layout, from its Graphviz graph to its routed lines.
pub(crate) struct CardLayout<'t> {
    pub(super) tree: &'t BlockTree,
    laid: &'t LaidMap,
    id: BlockId,
    pub(super) block: &'t Block,
    insets: Insets,
    pub(super) arranged: Arrangement,
    /// The containers and regions the block draws inline.
    pub clusters: Clusters<'t>,
    pub(super) attrs: Attrs,
    pub(super) nodes: Vec<Node>,
    pub(super) edges: Vec<Edge>,
    pub(super) subgraphs: Vec<Sub>,
}

impl<'t> CardLayout<'t> {
    /// Start a block's layout.
    pub(crate) fn new(
        tree: &'t BlockTree,
        laid: &'t LaidMap,
        id: BlockId,
        insets: Insets,
        arranged: Arrangement,
    ) -> CardLayout<'t> {
        let block = tree.get(id);
        let clusters = Clusters::new(block);
        let subgraphs = clusters
            .top
            .iter()
            .map(|&index| Sub::Cluster(index))
            .collect();
        let mut attrs = Attrs::of([
            ("rankdir", Value::from("TB")),
            // More passes at ordering each rank, and one more over the whole.
            ("mclimit", Value::Num(4.0)),
            ("remincross", Value::Bool(true)),
            ("splines", Value::from("polyline")),
            ("nodesep", Value::Num(super::clusters::NODE_GAP / 72.0)),
            ("ranksep", Value::Num(RANK_GAP / 72.0)),
            ("pad", Value::Num(0.0)),
            // Graphviz keeps the clusters directly in a graph its margin apart on a rank.
            ("margin", Value::Num(CONTAINER_INSET)),
        ]);
        // Ranks cross the clusters a block draws inline, as one board; a block without
        // any keeps Graphviz's own ranking, which holds its header alone on the first rank.
        if !block.clusters.is_empty() {
            attrs.set("newrank", true);
        }
        CardLayout {
            tree,
            laid,
            id,
            block,
            insets,
            arranged,
            clusters,
            attrs,
            nodes: Vec::new(),
            edges: Vec::new(),
            subgraphs,
        }
    }

    /// The vendor node a line end stands on: a pin stands on its child block.
    pub(super) fn vendor_of(&self, end: &str) -> String {
        if self.walled(end) {
            return format!("stub:{end}");
        }
        if self.block.clusters.contains_key(end) {
            return title_of(end);
        }
        self.tree
            .pins
            .get(end)
            .map_or_else(|| end.to_owned(), |pin| self.tree.get(pin.block).id.clone())
    }

    /// Whether a line end is one of the block's ports on a side wall.
    fn walled(&self, end: &str) -> bool {
        matches!(self.block.ports.get(end), Some(Side::Left | Side::Right))
    }

    /// Where a line end stands in the scene: a port a line enters by from a
    /// wall stands on its stub, one rank above.
    fn scene_end(&self, end: &str) -> String {
        if self.walled(end) {
            format!("stub:{end}")
        } else {
            end.to_owned()
        }
    }

    /// The size of a vendor node.
    fn size_of(&self, name: &str) -> Size {
        if let Some(title) = self.clusters.size_of(name) {
            return title;
        }
        if name == header_of(self.block) {
            return self.block.header.as_ref().expect("a block's header").size();
        }
        if name.starts_with("port:") || name.starts_with("stub:") {
            return Size {
                width: PORT,
                height: PORT,
            };
        }
        if let Some(inner) = self.laid.get(name) {
            return Size {
                width: inner.width,
                height: inner.height,
            };
        }
        let card = &self.tree.cards[name];
        Size {
            width: card.width,
            height: card.height,
        }
    }

    /// A vendor node of the size its item has; the header is ranked as a sliver.
    pub(super) fn node_of(&self, name: &str) -> Node {
        let Size { width, height } = self.size_of(name);
        box_node(
            name,
            if name == header_of(self.block) {
                PORT
            } else {
                width + super::peers::room(self.tree, name)
            },
            height,
        )
    }

    /// Put a node where it goes.
    pub(super) fn push(&mut self, holder: Holder, node: Node) {
        match holder {
            Holder::Graph => self.nodes.push(node),
            Holder::Cluster(index) => self.clusters.graphs[index].nodes.push(node),
        }
    }

    /// The block's own ports on one side.
    pub(super) fn ports_on(&self, side: Side) -> Vec<String> {
        self.block
            .ports
            .iter()
            .filter(|&(port, &at)| at == side && !self.block.header_entry(port))
            .map(|(port, _)| port.clone())
            .collect()
    }

    /// Every line Graphviz ranks, between the vendor nodes it joins.
    pub(crate) fn links(&self) -> Vec<Link> {
        self.links_by(|end| self.vendor_of(end))
    }

    /// Every line Graphviz ranks, its ends named as told.
    fn links_by(&self, end_of: impl Fn(&str) -> String) -> Vec<Link> {
        self.block
            .lines
            .values()
            .filter(|line| ranks(self.block, line) && !self.block.header_line(line))
            .map(|line| Link {
                tail: end_of(&line.tail),
                head: end_of(&line.head),
                label: format!("label:{}", line.edge.id),
                legs: [
                    line.key.clone(),
                    format!("{}:1", line.key),
                    format!("{}:2", line.key),
                ],
            })
            .collect()
    }

    /// The block's cards no line touches, in the board's order, with their
    /// sizes, by the cluster that holds them.
    pub(crate) fn loose_cards(&self) -> Vec<Vec<Loose>> {
        let touched: Set<String> = self
            .block
            .lines
            .values()
            .flat_map(|line| [self.vendor_of(&line.tail), self.vendor_of(&line.head)])
            .collect();
        let mut loose: Map<Option<&str>, Vec<Loose>> = Map::default();
        for item in &self.block.items {
            if self.tree.is_block(item) || touched.contains(item) {
                continue;
            }
            let around = self.block.cluster_of.get(item).map(String::as_str);
            let Size { width, height } = self.size_of(item);
            loose.entry(around).or_default().push(Loose {
                id: item.clone(),
                width,
                height,
            });
        }
        loose.into_values().collect()
    }

    /// Lay the block out and route its lines.
    ///
    /// # Errors
    ///
    /// What Graphviz refused the block's graph with, or answered unreadably.
    pub(crate) fn lay(&mut self, gv: &mut Engine<'_>) -> Result<Rc<Laid>, String> {
        let lined = self.lined(gv)?;
        Ok(self.finish(lined))
    }

    /// Route a graph that was already ranked and read, without parsing it twice.
    pub(crate) fn finish(&self, lined: Lined) -> Rc<Laid> {
        let Lined {
            placed, centres, ..
        } = lined;
        let (laid, left) = routed(
            self.tree,
            self.id,
            self.laid,
            self.insets,
            &placed,
            0.0,
            &Map::default(),
        );
        let reroute = Reroute {
            block: self.id,
            insets: self.insets,
            held: laid.width,
            left,
            placed: RefCell::new(placed),
            centres,
        };
        Rc::new(Laid {
            reroute: Some(Rc::new(reroute)),
            ..laid
        })
    }

    /// The block ranked by Graphviz and lined up, its lines not yet routed:
    /// where every item stands across the block is settled here, and routing
    /// only opens the room between its ranks.
    ///
    /// # Errors
    ///
    /// What Graphviz refused the block's graph with, or answered unreadably.
    pub(crate) fn lined(&mut self, gv: &mut Engine<'_>) -> Result<Lined, String> {
        self.build();
        let graph = self.graph();
        let answer = gv.render(&graph)?;

        let output = output_of(&answer)?;
        let bb = numbers(&output.bb)?;
        let (left, low, right, high) = (bb[0], bb[1], bb[2], bb[3]);
        let origin = Point {
            x: js_min(left, right),
            y: js_min(low, high),
        };
        let mut polylines: Map<String, Vec<Point>> = Map::default();
        for edge in &output.edges {
            if let (Some(id), Some(pos)) = (&edge.id, &edge.pos) {
                polylines.insert(id.clone(), polyline_points(pos, origin)?);
            }
        }
        let mut centres = centres_of(&output, origin)?;
        let clusters = self.clusters.boxes(&output, origin)?;
        let mut boxes = boxes_of(&nodes_in(&graph.nodes, &graph.subgraphs), &centres);
        for pin in self.pins() {
            let leaf = pinned_leaf(self.tree, self.laid, &pin, &centres);
            boxes.insert(
                pin,
                Rect {
                    x: leaf.x,
                    y: leaf.y,
                    width: leaf.width,
                    height: leaf.height,
                },
            );
        }
        // A line from a child block is lined up where it leaves the block, at its pin.
        let at_pins = self.links_by(|end| {
            if self.tree.pins.contains_key(end) {
                end.to_owned()
            } else {
                self.vendor_of(end)
            }
        });
        let joins: Vec<_> = at_pins.iter().map(Link::join).collect();
        let lowered = std::mem::take(&mut self.arranged.lowered);
        self.clusters.line_up(
            &joins,
            &mut centres,
            LinedUp {
                boxes: &mut boxes,
                clusters: &clusters,
                polylines: &polylines,
                width: abs(right - left),
                cards: &self.tree.cards,
                lowered: &lowered,
            },
        );
        self.arranged.lowered = lowered;
        super::peers::arrange(self.tree, self.block, self.laid, &mut centres, &mut boxes);
        let placed = self.placed(&graph, &centres, &polylines, &clusters);
        Ok(Lined {
            placed,
            centres,
            boxes,
        })
    }

    /// The block as the track scene reads it: its items, header, ports and pins
    /// as cards, and its lines as placed relationships.
    fn placed(
        &self,
        graph: &Graph,
        centres: &Map<String, Point>,
        polylines: &Map<String, Vec<Point>>,
        clusters: &Map<String, Rect>,
    ) -> PlacedBlock {
        let mut leaves: Vec<PlacedNode> = nodes_in(&graph.nodes, &graph.subgraphs)
            .into_iter()
            .filter(|node| !node.name.starts_with("label:") && !is_title(&node.name))
            .map(|node| {
                let id = &node.name;
                let size = self.size_of(id);
                let width = if self.tree.is_block(id) || self.tree.peer_of(id).is_some() {
                    size.width
                } else {
                    self.clusters.widths.get(id).copied().unwrap_or(size.width)
                };
                let centre = centres[id.as_str()];
                PlacedNode {
                    id: id.clone(),
                    x: centre.x - width / 2.0,
                    y: centre.y - size.height / 2.0,
                    width,
                    height: size.height,
                    children: None,
                    frame: None,
                }
            })
            .collect();
        for pin in self.pins() {
            leaves.push(pinned_leaf(self.tree, self.laid, &pin, centres));
        }
        let header = corner_header(&mut leaves, self.block, self.insets.side);
        let edges = self
            .block
            .lines
            .values()
            .filter(|line| !self.block.header_line(line))
            .map(|line| self.placed_line(line, centres, polylines))
            .collect();
        let (children, regions) = self.clusters.nest(leaves, centres, clusters);
        PlacedBlock {
            children,
            edges,
            regions,
            header,
        }
    }

    /// Every pin a line of the block ends on.
    fn pins(&self) -> Set<String> {
        self.block
            .lines
            .values()
            .flat_map(|line| [&line.from, &line.to])
            .filter(|end| self.tree.pins.contains_key(end.as_str()))
            .cloned()
            .collect()
    }

    /// One line as a placed relationship.
    fn placed_line(
        &self,
        line: &Line,
        centres: &Map<String, Point>,
        polylines: &Map<String, Vec<Point>>,
    ) -> PlacedEdge {
        let id = &line.key;
        let label = if line.labelled {
            line.edge.label()
        } else {
            None
        };
        let legs = if label.is_none() {
            vec![id.clone()]
        } else {
            vec![format!("{id}:1"), format!("{id}:2")]
        };
        let polyline = legs
            .iter()
            .flat_map(|leg| polylines.get(leg).into_iter().flatten().copied())
            .collect();
        let label = label.map(|label| {
            let (width, height) = (
                label.width.unwrap_or(f64::NAN),
                label.height.unwrap_or(f64::NAN),
            );
            let centre = centres[format!("label:{}", line.edge.id).as_str()];
            Rect {
                x: centre.x - width / 2.0,
                y: centre.y - height / 2.0,
                width,
                height,
            }
        });
        PlacedEdge {
            id: id.clone(),
            source: self.scene_end(&line.from),
            target: self.scene_end(&line.to),
            label,
            polyline,
            edge: Rc::clone(&line.edge),
        }
    }
}

/// A block of cards routed again with some of its ports moved along their
/// edges, where its parent settled them: Graphviz does not rank it again, and
/// it keeps its width.
pub(crate) struct Reroute {
    block: BlockId,
    insets: Insets,
    held: f64,
    /// The placement's horizontal shift into its block's own coordinates.
    left: f64,
    /// The placed block; its ports', pins' and blocks' leaves move in place.
    placed: RefCell<PlacedBlock>,
    centres: Map<String, Point>,
}

impl Reroute {
    /// The block routed again with each moved port at its x, in the block's
    /// own coordinates, every pin on a block inside it where that block's
    /// settled port now stands, and every block inside it as large as it was
    /// routed again.
    pub(crate) fn reroute(
        &self,
        tree: &BlockTree,
        laid: &LaidMap,
        ports: &Map<String, f64>,
    ) -> Laid {
        let mut placed = self.placed.borrow_mut();
        for leaf in leaves_of(&mut placed.children) {
            if let Some(&x) = ports.get(&leaf.id) {
                leaf.x = x - self.left - self.insets.side - leaf.width / 2.0;
            } else if let Some(at) = settled_leaf(tree, laid, &leaf.id, &self.centres) {
                (leaf.x, leaf.y, leaf.width, leaf.height) = (at.x, at.y, at.width, at.height);
            }
        }
        hold_resized_children(&mut placed.children);
        routed(
            tree,
            self.block,
            laid,
            self.insets,
            &placed,
            self.held,
            ports,
        )
        .0
    }
}
