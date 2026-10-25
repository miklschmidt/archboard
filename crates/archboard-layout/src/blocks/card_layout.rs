//! A block of cards laid out on its own. Graphviz ranks and orders its cards,
//! its labels, its header and its ports; the track router then draws every
//! line inside it on tracks in the channels between its ranks, growing each
//! channel to fit, so the block's size is final when this answers.

use std::cell::RefCell;
use std::rc::Rc;

use rustc_hash::FxHashMap;

use crate::Graphviz;
use crate::constants::CONTAINER_INSET;
use crate::ecma::{abs, js_min, max};
use crate::geometry::{Point, Rect, Side};
use crate::graph::FROM_POINTS;
use crate::placed::{PlacedBlock, PlacedEdge, PlacedNode};
use crate::track::containers::Edges;
use crate::track::graphviz::{boxes_of, centres_of, numbers, output_of, polyline_points};
use crate::track::grid::{Loose, grid_edges, wrap_edges};
use crate::track::route::{SceneLine, order_of, route_scene, trunk_kind};
use crate::track::scene::{Map, Placement, Set};
use crate::track::score::{Plan, anchored, laps_of};
use crate::track::sides::fit_sides;
use crate::viz::{Attrs, Edge, Graph, Node, Subgraph, Value, box_node, nodes_in};

use super::clusters::{Clusters, Holder, LinedUp, Link, is_title, title_of};
use super::laid::{Band, Insets, Laid, LaidMap, Size};
use super::leaves::{
    PORT, corner_header, hold_resized_children, leaves_of, let_ports_slide, mark_regions,
    pinned_leaf, rim_of, settled_leaf,
};
use super::lone::frame_shape;
use super::tree::{Below, Block, BlockId, BlockTree, ClusterKind, Kind, Line, header_of};
use super::walls::{
    beside_points, beside_walls, channel_wall, enters_by, inner_points, labelled_out, mark_besides,
    ranks, wall_lines,
};

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
    /// Whether a container a line from another container enters is held below the line's source.
    pub stacked: bool,
}

/// A subgraph of the block's graph: one of its clusters, or a rank of nodes held together.
enum Sub {
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
    tree: &'t BlockTree,
    laid: &'t LaidMap,
    id: BlockId,
    block: &'t Block,
    insets: Insets,
    arranged: Arrangement,
    /// The containers and regions the block draws inline.
    pub clusters: Clusters<'t>,
    attrs: Attrs,
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    subgraphs: Vec<Sub>,
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
    fn vendor_of(&self, end: &str) -> String {
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
    fn node_of(&self, name: &str) -> Node {
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

    /// Put a node where it goes.
    fn push(&mut self, holder: Holder, node: Node) {
        match holder {
            Holder::Graph => self.nodes.push(node),
            Holder::Cluster(index) => self.clusters.graphs[index].nodes.push(node),
        }
    }

    /// The block's own ports on one side.
    fn ports_on(&self, side: Side) -> Vec<String> {
        self.block
            .ports
            .iter()
            .filter(|&(_, &at)| at == side)
            .map(|(port, _)| port.clone())
            .collect()
    }

    /// Build the block's Graphviz graph: its items, its header and top ports
    /// alone on the first rank with the header leftmost, its bottom ports alone
    /// on the last, and every line through its label's box.
    fn build(&mut self) {
        let block = self.block;
        for item in &block.items {
            let node = self.node_of(item);
            self.push(self.clusters.holder_of(item), node);
        }
        let header: Vec<String> = block
            .header
            .as_ref()
            .map(|_| header_of(block))
            .into_iter()
            .collect();
        let (tops, bottoms) = (self.ports_on(Side::Top), self.ports_on(Side::Bottom));
        let invisible = || Attrs::of([("style", Value::from("invis"))]);
        let first = Subgraph {
            graph_attributes: Some(Attrs::of([("rank", Value::from("source"))])),
            nodes: Some(
                header
                    .iter()
                    .chain(&tops)
                    .map(|name| self.node_of(name))
                    .collect(),
            ),
            edges: Some(
                header
                    .iter()
                    .flat_map(|tail| {
                        tops.iter()
                            .map(move |head| Edge::new(tail.clone(), head.clone(), invisible()))
                    })
                    .collect(),
            ),
            ..Subgraph::default()
        };
        let last = Subgraph {
            graph_attributes: Some(Attrs::of([("rank", Value::from("sink"))])),
            nodes: Some(bottoms.iter().map(|name| self.node_of(name)).collect()),
            edges: Some(Vec::new()),
            ..Subgraph::default()
        };
        for subgraph in [first, last] {
            if subgraph
                .nodes
                .as_ref()
                .is_some_and(|nodes| !nodes.is_empty())
            {
                self.subgraphs.push(Sub::Plain(subgraph));
            }
        }
        // Ranked across clusters, an outermost title held by nothing shared the
        // header's rank, and a region's caption stood over its containers' titles.
        for cluster in block
            .clusters
            .values()
            .filter(|cluster| cluster.parent.is_none())
        {
            for tail in &header {
                self.edges
                    .push(Edge::new(tail.clone(), title_of(&cluster.id), invisible()));
            }
        }
        let mut stubs: Set<String> = Set::default();
        for line in block.lines.values() {
            if enters_by(block, line).is_some() {
                stubs.insert(self.vendor_of(&line.from));
            }
            if labelled_out(block, line).is_some() {
                stubs.insert(self.vendor_of(&line.to));
            }
        }
        self.nodes
            .extend(stubs.iter().map(|stub| box_node(stub.as_str(), PORT, PORT)));
        let ordered = self.clusters.board_order(|end| self.vendor_of(end));
        for line in ordered {
            self.connect(line);
        }
        self.arrange();
    }

    /// Hold the block's items where its clusters, a grid, a wrap or an
    /// interface put them: titles above their members, loose cards in a grid,
    /// a wrapped item a row of cards and its labels lower per row, hidden parts
    /// below entry points.
    fn arrange(&mut self) {
        let grid: Vec<Edge> = if self.arranged.grid {
            self.loose_cards()
                .iter()
                .flat_map(|cards| grid_edges(cards))
                .collect()
        } else {
            Vec::new()
        };
        let links = self.links();
        let lower: Set<String> = grid.iter().map(|edge| edge.head.clone()).collect();
        let titles = self.clusters.title_edges(&lower, &links);
        let entering = if self.arranged.stacked {
            self.clusters.entering_edges(&links)
        } else {
            Vec::new()
        };
        let holds = self.wrap_holds();
        self.edges.extend(grid);
        self.edges.extend(titles);
        self.edges.extend(entering);
        self.edges.extend(holds);
        let entries = self.entry_row_edges();
        self.edges.extend(entries);
        self.clusters.untie(&mut self.edges);
        self.hold_sources();
        self.hold_sinks();
    }

    /// The invisible edges that hold a wrap's lowered cards down: each under
    /// the card above it in its column when the rows keep their columns, and
    /// one no line or column reaches by the first card of the rank's first row.
    fn wrap_holds(&self) -> Vec<Edge> {
        let Arrangement {
            lowered, columns, ..
        } = &self.arranged;
        let mut held = if *columns {
            wrap_edges(lowered)
        } else {
            Vec::new()
        };
        let mut arriving: Set<String> = self
            .block
            .lines
            .values()
            .map(|line| self.vendor_of(&line.head))
            .collect();
        for edge in &held {
            arriving.insert(edge.head.clone());
        }
        for (card, rows, anchor) in anchored(lowered, &arriving) {
            held.push(Edge::new(
                anchor,
                card,
                Attrs::of([
                    ("style", Value::from("invis")),
                    ("minlen", Value::Num(2.0 * rows as f64)),
                    ("weight", Value::Num(0.0)),
                ]),
            ));
        }
        held
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
            .filter(|line| ranks(self.block, line))
            .map(|line| Link {
                tail: end_of(&line.tail),
                head: end_of(&line.head),
                labelled: line.labelled && line.edge.label_count() > 0,
                label: format!("label:{}", line.edge.id),
                legs: [
                    line.key.clone(),
                    format!("{}:1", line.key),
                    format!("{}:2", line.key),
                ],
            })
            .collect()
    }

    /// Whether stacking would change the block: some line runs from one inline
    /// container into another.
    pub(crate) fn stacks(&self) -> bool {
        !self.clusters.entering_edges(&self.links()).is_empty()
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

    /// Connect one line, through its label's box when it carries the label here.
    fn connect(&mut self, line: &Line) {
        let tail = self.vendor_of(&line.tail);
        let head = self.vendor_of(&line.head);
        let label = if line.labelled {
            line.edge.label()
        } else {
            None
        };
        let id = &line.key;
        // A wrapped item sits a row of cards and its labels lower for each row it is lowered.
        let minlen = 1.0 + 2.0 * self.arranged.lowered.get(&head).copied().unwrap_or(0) as f64;
        let weight = self.clusters.weight_of(&tail, &head);
        let leaves = line
            .edge
            .option(FROM_POINTS)
            .filter(|_| tail == line.edge.source());
        let leg = |id: String| {
            let mut attributes = Attrs::of([
                ("id", Value::from(id)),
                ("minlen", Value::Num(minlen)),
                ("weight", Value::Num(weight)),
            ]);
            if let Some(point) = leaves {
                attributes.set("tailport", point);
            }
            attributes
        };
        let Some(label) = label else {
            let attributes = leg(id.clone());
            self.edges.push(Edge::new(tail, head, attributes));
            return;
        };
        let name = format!("label:{}", line.edge.id);
        let down = weight + self.clusters.leaving_pull(&tail, &head);
        let links = self.links();
        let (holder, holds) = self.clusters.hold_label(&tail, &head, &name, &links);
        let node = box_node(
            name.as_str(),
            label.width.unwrap_or(f64::NAN),
            label.height.unwrap_or(f64::NAN),
        );
        self.push(holder, node);
        self.edges.extend(holds);
        let attributes = leg(format!("{id}:1"));
        self.edges.push(Edge::new(tail, name.clone(), attributes));
        let attributes = Attrs::of([
            ("id", Value::from(format!("{id}:2"))),
            ("weight", Value::Num(down)),
        ]);
        self.edges.push(Edge::new(name, head, attributes));
    }

    /// The block's Graphviz graph, as built.
    fn graph(&self) -> Graph {
        Graph {
            graph_attributes: self.attrs.clone(),
            node_attributes: Attrs::of([
                ("shape", Value::from("box")),
                ("fixedsize", Value::Bool(true)),
                ("label", Value::from("")),
                ("margin", Value::Num(0.0)),
            ]),
            edge_attributes: Attrs::of([("dir", Value::from("none"))]),
            nodes: self.nodes.clone(),
            edges: self.edges.clone(),
            subgraphs: self
                .subgraphs
                .iter()
                .map(|sub| match sub {
                    Sub::Cluster(index) => self.cluster_graph(*index),
                    Sub::Plain(subgraph) => subgraph.clone(),
                })
                .collect(),
        }
    }

    /// One cluster as a Graphviz subgraph, with the clusters inside it.
    fn cluster_graph(&self, index: usize) -> Subgraph {
        let cluster = &self.clusters.graphs[index];
        Subgraph {
            name: Some(cluster.name.clone()),
            graph_attributes: Some(Attrs::of([("margin", Value::Num(cluster.margin))])),
            nodes: Some(cluster.nodes.clone()),
            edges: None,
            subgraphs: Some(
                cluster
                    .subgraphs
                    .iter()
                    .map(|&inner| self.cluster_graph(inner))
                    .collect(),
            ),
        }
    }

    /// Lay the block out and route its lines.
    ///
    /// # Errors
    ///
    /// What Graphviz refused the block's graph with, or answered unreadably.
    pub(crate) fn lay(&mut self, gv: &mut Engine<'_>) -> Result<Rc<Laid>, String> {
        let Lined {
            placed, centres, ..
        } = self.lined(gv)?;
        let laid = routed(self.tree, self.id, self.insets, &placed, 0.0);
        let reroute = Reroute {
            block: self.id,
            insets: self.insets,
            held: laid.width,
            placed: RefCell::new(placed),
            centres,
        };
        Ok(Rc::new(Laid {
            reroute: Some(Rc::new(reroute)),
            ..laid
        }))
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
        &mut self,
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
                let width = self.clusters.widths.get(id).copied().unwrap_or(size.width);
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
        corner_header(&mut leaves, self.block, self.insets.side);
        let edges = self
            .block
            .lines
            .values()
            .map(|line| self.placed_line(line, centres, polylines))
            .collect();
        let (children, regions) = self.clusters.nest(leaves, centres, clusters);
        PlacedBlock {
            children,
            edges,
            regions,
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

    /// The invisible edges that stand each container's hidden parts below its
    /// first entry points (ADR 0044): the parts its callers reach take its
    /// first row, under its title, and what they hide sits beneath them.
    fn entry_row_edges(&self) -> Vec<Edge> {
        let entries = &self.tree.entries;
        if !entries.values().any(|&first| first) {
            return Vec::new();
        }
        let mut below = Below::default();
        for edge in &self.edges {
            below.add(&edge.tail, &edge.head);
        }
        let block = self.block;
        let is_part = |member: &str| {
            self.tree.cards.contains_key(member)
                || block
                    .clusters
                    .get(member)
                    .is_some_and(|cluster| cluster.kind == ClusterKind::Frame)
        };
        let mut parts: Map<String, Vec<&str>> = Map::default();
        for (member, around) in &block.cluster_of {
            if let Some(frame) = block.frame_around(Some(around))
                && is_part(member)
            {
                parts.entry(frame).or_default().push(member);
            }
        }
        let mut edges = Vec::new();
        for members in parts.values() {
            let first: Vec<String> = members
                .iter()
                .filter(|&&one| entries.get(one) == Some(&true))
                .map(|one| self.clusters.vendor_of(one))
                .collect();
            let under: Set<String> = first.iter().flat_map(|entry| below.reach(entry)).collect();
            let hidden: Vec<String> = members
                .iter()
                .filter(|&&one| !entries.contains_key(one))
                .map(|one| self.clusters.vendor_of(one))
                .collect();
            for part in hidden.iter().filter(|part| !under.contains(*part)) {
                let above = below.reach(part);
                let held: Vec<&String> = first
                    .iter()
                    .filter(|entry| !above.contains(*entry))
                    .collect();
                for entry in held {
                    below.add(entry, part);
                    edges.push(Edge::new(
                        entry.clone(),
                        part.clone(),
                        Attrs::of([("style", Value::from("invis")), ("weight", Value::Num(0.0))]),
                    ));
                }
            }
        }
        edges
    }

    /// Hold every item no line enters on a block's first rank of items, when
    /// the block has ports on its bottom: Graphviz ranks those ports last and
    /// joins every item no line leaves to them at no cost, so a short chain
    /// would hang from the bottom.
    fn hold_sources(&mut self) {
        let block = self.block;
        if !block.has_bottom_port() {
            return;
        }
        let entered: Set<&str> = self.edges.iter().map(|edge| edge.head.as_str()).collect();
        let leaving: Set<&str> = self.edges.iter().map(|edge| edge.tail.as_str()).collect();
        let sources: Vec<String> = block
            .items
            .iter()
            .filter(|item| !entered.contains(item.as_str()) && leaving.contains(item.as_str()))
            .cloned()
            .collect();
        if sources.is_empty() {
            return;
        }
        let above = if block.header.is_some() {
            Some(header_of(block))
        } else {
            self.ports_on(Side::Top).into_iter().next()
        };
        let Some(above) = above else {
            let nodes = sources.iter().map(|source| self.node_of(source)).collect();
            self.subgraphs.push(Sub::Plain(Subgraph {
                graph_attributes: Some(Attrs::of([("rank", Value::from("min"))])),
                nodes: Some(nodes),
                ..Subgraph::default()
            }));
            return;
        };
        for head in sources {
            self.edges.push(Edge::new(
                above.clone(),
                head,
                Attrs::of([
                    ("style", Value::from("invis")),
                    ("weight", Value::Num(1.0)),
                    ("minlen", Value::Num(1.0)),
                ]),
            ));
        }
    }

    /// Hold every item no line leaves above a block's bottom ports, when the
    /// block ranks across the clusters it draws inline: Graphviz's `newrank`
    /// ranking does not stand `rank=sink` ports alone on the last rank.
    fn hold_sinks(&mut self) {
        let block = self.block;
        let Some(port) = self.ports_on(Side::Bottom).into_iter().next() else {
            return;
        };
        if block.clusters.is_empty() {
            return;
        }
        let leaving: Set<&str> = self.edges.iter().map(|edge| edge.tail.as_str()).collect();
        let sinks: Vec<String> = block
            .items
            .iter()
            .filter(|item| !leaving.contains(item.as_str()))
            .cloned()
            .collect();
        for tail in sinks {
            self.edges.push(Edge::new(
                tail,
                port.clone(),
                Attrs::of([
                    ("style", Value::from("invis")),
                    ("weight", Value::Num(0.0)),
                    ("minlen", Value::Num(1.0)),
                ]),
            ));
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
                leaf.x = x - self.insets.side - leaf.width / 2.0;
            } else if let Some(at) = settled_leaf(tree, laid, &leaf.id, &self.centres) {
                (leaf.x, leaf.y, leaf.width, leaf.height) = (at.x, at.y, at.width, at.height);
            }
        }
        hold_resized_children(&mut placed.children);
        routed(tree, self.block, self.insets, &placed, self.held)
    }
}

/// Route a placed block's lines on tracks and read it back.
fn routed(tree: &BlockTree, id: BlockId, insets: Insets, placed: &PlacedBlock, held: f64) -> Laid {
    let block = tree.get(id);
    let mut scene = Placement::new(placed);
    scene.edges_page = block.kind == Kind::Root;
    scene.inline = true;
    mark_regions(&mut scene, block, tree);
    let_ports_slide(&mut scene, block);
    let beside = beside_walls(block, tree, &scene);
    let straight: Set<&str> = beside.iter().map(|one| one.key.as_str()).collect();
    mark_besides(&mut scene, &beside);
    let lines: Vec<SceneLine<'_>> = placed
        .edges
        .iter()
        .filter(|edge| !straight.contains(edge.id.as_str()))
        .map(|edge| {
            let line = &block.lines[edge.id.as_str()];
            SceneLine {
                id: edge.id.clone(),
                order: order_of(edge),
                kind: trunk_kind(&edge.edge).into(),
                placed: edge,
                wall: channel_wall(block, line),
                enters: enters_by(block, line),
                leaves: labelled_out(block, line),
            }
        })
        .collect();
    let mut routes = route_scene(
        &mut scene,
        &lines,
        insets.side,
        insets.top,
        rim_of(block, insets),
    );
    for (key, points) in beside_points(&scene, &beside, insets.side) {
        routes.insert(key, points);
    }
    let edges: Edges<'_> = placed
        .edges
        .iter()
        .map(|edge| (edge.id.as_str(), edge))
        .collect();
    read(block, insets, &scene, routes, &edges, held)
}

/// Read the routed scene back into the laid-out block.
fn read(
    block: &Block,
    insets: Insets,
    scene: &Placement,
    lines: Map<String, Vec<Point>>,
    edges: &Edges<'_>,
    held: f64,
) -> Laid {
    let Insets { side, bottom, .. } = insets;
    let mut boxes: Map<String, Rect> = Map::default();
    for (id, &item) in &scene.cards {
        boxes.insert(id.clone(), scene.moved_id(item, side));
    }
    for (id, &item) in &scene.labels {
        boxes.insert(format!("label:{id}"), scene.moved_id(item, side));
    }
    let bands: Vec<Band> = scene
        .bands
        .iter()
        .enumerate()
        .map(|(index, band)| Band {
            top: band.new_top,
            bottom: band.new_top + band.bottom - band.top,
            items: block
                .items
                .iter()
                .filter(|item| {
                    scene
                        .cards
                        .get(item.as_str())
                        .is_some_and(|&card| scene.item(card).band == index)
                })
                .cloned()
                .collect(),
        })
        .collect();
    let (drawn, regions) = {
        let routes: Vec<&[Point]> = lines.values().map(Vec::as_slice).collect();
        fit_sides(scene, edges, &routes, side)
    };
    let mut walled = lines;
    let mut reach: Vec<Rect> = boxes.values().copied().collect();
    reach.extend(drawn.iter().map(|frame| frame.bx));
    reach.extend(regions.iter().map(|region| region.bx));
    reach.extend(
        inner_points(block, &walled)
            .into_iter()
            .map(|Point { x, y }| Rect {
                x,
                y,
                width: 0.0,
                height: 0.0,
            }),
    );
    let header = block.header.as_ref().map_or(0.0, |header| header.width);
    let width = max([held, header]
        .into_iter()
        .chain(reach.iter().map(|one| one.x + one.width + side)));
    let tracks = wall_lines(block, &mut walled, &mut boxes, width);
    let cards: Vec<Rect> = boxes.values().copied().collect();
    let laps = laps_of(walled.values().map(Vec::as_slice), &cards);
    let height = max(reach.iter().map(|one| one.y + one.height).chain(tracks)) + bottom;
    Laid {
        laps: Some(laps),
        width,
        height,
        boxes,
        lines: walled,
        bands,
        frames: Some(
            drawn
                .into_iter()
                .map(|shape| {
                    let lone = block
                        .clusters
                        .get(&shape.id)
                        .and_then(|cluster| cluster.lone.as_ref());
                    frame_shape(shape, lone)
                })
                .collect(),
        ),
        regions: Some(regions),
        reroute: None,
    }
}
