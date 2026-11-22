//! A block of cards laid out on its own. Graphviz ranks and orders its cards,
//! its labels, its header and its ports; the lane router then draws every
//! line inside it on tracks in the channels between its ranks, growing each
//! channel to fit, so the block's size is final when this answers. Its graph
//! is built in `card_graph.rs`, held in place by `holding.rs` and routed by
//! `routing.rs`.

use std::cell::RefCell;
use std::rc::Rc;

use rustc_hash::FxHashMap;

use crate::Graphviz;
use crate::ecma::{abs, js_max, js_min};
use crate::geometry::{Point, Rect, Side};
use crate::lanes::graphviz::{Join, boxes_of, centres_of, numbers, output_of, polyline_points};
use crate::lanes::grid::Loose;
use crate::lanes::scene::{Map, Set};
use crate::lanes::score::Plan;
use crate::placed::{PlacedBlock, PlacedEdge, PlacedNode};
use crate::viz::{Attrs, Edge, Graph, Node, Subgraph, Value, box_node, nodes_in};

use super::laid::{Insets, Laid, LaidMap, Size};
use super::leaves::{
    PORT, corner_header, hold_resized_children, leaves_of, pinned_leaf, settled_leaf,
};
use super::line_up::LinedUp;
use super::routing::{Settling, routed};
use super::tree::{Block, BlockId, BlockTree, Line, header_of};
use super::walls::ranks;

/// Vertical room Graphviz keeps between ranks; the router spaces ranks again from its tracks.
const RANK_GAP: f64 = 28.0;
/// Horizontal room Graphviz keeps between neighbours in a rank.
const NODE_GAP: f64 = 40.0;

/// Graphviz asked once for each graph one layout of a picture gives it.
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
    pub(super) attrs: Attrs,
    pub(super) nodes: Vec<Node>,
    pub(super) edges: Vec<Edge>,
    pub(super) subgraphs: Vec<Subgraph>,
    /// The width of each card evened with the card over or under it.
    pub(super) widths: Map<String, f64>,
    /// The card widths reserved for independent ports during this placement.
    pub(super) port_widths: Map<String, f64>,
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
        let attrs = Attrs::of([
            ("rankdir", Value::from("TB")),
            // More passes at ordering each rank, and one more over the whole.
            ("mclimit", Value::Num(4.0)),
            ("remincross", Value::Bool(true)),
            ("splines", Value::from("polyline")),
            ("nodesep", Value::Num(NODE_GAP / 72.0)),
            ("ranksep", Value::Num(RANK_GAP / 72.0)),
            ("pad", Value::Num(0.0)),
        ]);
        CardLayout {
            tree,
            laid,
            id,
            block,
            insets,
            arranged,
            attrs,
            nodes: Vec::new(),
            edges: Vec::new(),
            subgraphs: Vec::new(),
            widths: Map::default(),
            port_widths: Map::default(),
        }
    }

    /// The vendor node a line end stands on: a pin stands on its child block.
    pub(super) fn vendor_of(&self, end: &str) -> String {
        if self.walled(end) {
            return format!("stub:{end}");
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
    pub(super) fn size_of(&self, name: &str) -> Size {
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
        let reserved = self.port_widths.get(name).copied().unwrap_or(0.0);
        Size {
            width: js_max(card.width, reserved),
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
                width
            },
            height,
        )
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

    /// Every line Graphviz ranks as a join, a line from a child block ended
    /// at its pin, where it leaves the block.
    fn joins(&self) -> Vec<Join> {
        let end_of = |end: &str| {
            if self.tree.pins.contains_key(end) {
                end.to_owned()
            } else {
                self.vendor_of(end)
            }
        };
        self.block
            .lines
            .values()
            .filter(|line| ranks(self.block, line) && !self.block.header_line(line))
            .map(|line| Join {
                tail: end_of(&line.tail),
                head: end_of(&line.head),
                label: Some(format!("label:{}", line.edge.id)),
                legs: Some(vec![
                    line.key.clone(),
                    format!("{}:1", line.key),
                    format!("{}:2", line.key),
                ]),
            })
            .collect()
    }

    /// The block's cards no line touches, in the picture's order, with their sizes.
    pub(crate) fn loose_cards(&self) -> Vec<Loose> {
        let touched: Set<String> = self
            .block
            .lines
            .values()
            .flat_map(|line| [self.vendor_of(&line.tail), self.vendor_of(&line.head)])
            .collect();
        self.block
            .items
            .iter()
            .filter(|item| !self.tree.is_block(item) && !touched.contains(*item))
            .map(|item| {
                let Size { width, height } = self.size_of(item);
                Loose {
                    id: item.clone(),
                    width,
                    height,
                }
            })
            .collect()
    }

    /// Lay the block out and route its lines.
    ///
    /// # Errors
    ///
    /// What Graphviz refused the block's graph with, or answered unreadably.
    pub(crate) fn lay(&mut self, gv: &mut Engine<'_>) -> Result<Rc<Laid>, String> {
        let lined = self.lined(gv, &Map::default())?;
        self.finish(gv, lined)
    }

    /// Route a graph that was already ranked and read, without parsing it
    /// twice. A card too narrow for its independent ports takes the width they
    /// need, and the block is ranked again, so a crowded block costs a solve
    /// more and any other none.
    ///
    /// # Errors
    ///
    /// What Graphviz refused the block's graph with, or answered unreadably.
    pub(crate) fn finish(
        &mut self,
        gv: &mut Engine<'_>,
        mut lined: Lined,
    ) -> Result<Rc<Laid>, String> {
        let (tree, id, insets) = (self.tree, self.id, self.insets);
        let (laid, left) = loop {
            match routed(tree, id, insets, &lined.placed, &Settling::First) {
                Ok(done) => break done,
                Err(widths) if self.reserve_ports(&widths) => lined = self.place(gv)?,
                Err(_) => {
                    let ports = Map::default();
                    let again = Settling::Again {
                        held: 0.0,
                        ports: &ports,
                    };
                    break routed(tree, id, insets, &lined.placed, &again)
                        .expect("a routing that stands stops for no card");
                }
            }
        };
        let Lined {
            placed, centres, ..
        } = lined;
        let reroute = Reroute {
            block: self.id,
            insets: self.insets,
            held: laid.width,
            left,
            placed: RefCell::new(placed),
            centres,
        };
        Ok(Rc::new(Laid {
            reroute: Some(Rc::new(reroute)),
            port_widths: self.port_widths.clone(),
            ..laid
        }))
    }

    /// The block ranked by Graphviz and lined up, its lines not yet routed:
    /// where every item stands across the block is settled here, and routing
    /// only opens the room between its ranks. A wrap starts from the widths
    /// the block whole reserved, so it need not find them again.
    ///
    /// # Errors
    ///
    /// What Graphviz refused the block's graph with, or answered unreadably.
    pub(crate) fn lined(
        &mut self,
        gv: &mut Engine<'_>,
        widths: &Map<String, f64>,
    ) -> Result<Lined, String> {
        self.build();
        self.reserve_ports(widths);
        self.place(gv)
    }

    /// Rank the built graph at its cards' current widths and line it up.
    fn place(&mut self, gv: &mut Engine<'_>) -> Result<Lined, String> {
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
        let joins = self.joins();
        let lowered = std::mem::take(&mut self.arranged.lowered);
        self.line_up(
            &joins,
            &mut centres,
            LinedUp {
                boxes: &mut boxes,
                polylines: &polylines,
                width: abs(right - left),
                cards: &self.tree.cards,
                lowered: &lowered,
            },
        );
        self.arranged.lowered = lowered;
        let placed = self.placed(&graph, &centres, &polylines);
        Ok(Lined {
            placed,
            centres,
            boxes,
        })
    }

    /// The block as the lane scene reads it: its items, header, ports and pins
    /// as cards, and its lines as placed relationships.
    fn placed(
        &self,
        graph: &Graph,
        centres: &Map<String, Point>,
        polylines: &Map<String, Vec<Point>>,
    ) -> PlacedBlock {
        let mut leaves: Vec<PlacedNode> = nodes_in(&graph.nodes, &graph.subgraphs)
            .into_iter()
            .filter(|node| !node.name.starts_with("label:"))
            .map(|node| {
                let id = &node.name;
                let size = self.size_of(id);
                let width = if self.tree.is_block(id) || self.tree.peer_of(id).is_some() {
                    size.width
                } else {
                    self.widths.get(id).copied().unwrap_or(size.width)
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
        PlacedBlock {
            children: leaves,
            edges,
            regions: Vec::new(),
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
            self.insets,
            &placed,
            &Settling::Again {
                held: self.held,
                ports,
            },
        )
        .expect("a routing that stands stops for no card")
        .0
    }
}
