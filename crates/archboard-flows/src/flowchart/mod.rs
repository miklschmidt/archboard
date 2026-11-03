//! A flow drawn as a flowchart (ADR 0053): its steps as boxes, its decisions
//! as diamonds with a labelled line for each alternative, its loops as
//! hexagons, from a start to an end, in a frame that names the flow.
//!
//! The flowchart is laid out from the structure of its flow (ADR 0073,
//! `layout.rs`), with no solve: a run of steps stacks on one axis, a
//! decision's answers stand side by side below its diamond and leave it from
//! its points, and a loop runs its line back up beside the steps it repeats.
//! A flowchart too tall for the reference pane breaks its runs of steps into
//! columns side by side (`frames.rs`). A line that would run far round other
//! blocks, or from one column to the next, jumps: it stops at a jump out and
//! goes on at the jump in of the same letter and ink. It is painted by the
//! architecture painter: the frames, the lines and their words are an
//! architecture's, the message boxes are cards, and only the diamonds,
//! hexagons, terminals and jumps are drawn as shapes of their own. Every line
//! meets a shape at a point of its outline: a box and a terminal at the middle
//! of their top and foot, a diamond at its points, a hexagon at its flat top
//! and foot and its side points.

mod frames;
mod graph;
mod layout;

use std::collections::{BTreeMap, HashMap, HashSet};

use archboard_layout::Node as GraphNode;
use archboard_scene::drawing::{
    ArchitectureDrawing, Bridged, DrawingEdge, DrawingNode, EdgeFacts, Emphasis, MeasuredLabel,
    MeasuredNode, NodeFacts, Painted, PaintedDrawing, PlacedLabel, ReadingDirection,
};
use archboard_scene::geometry::curve_through;
use archboard_scene::js;
use archboard_scene::measure::{self, CardWords};
use archboard_scene::paint::design::{
    FALLBACK_ICON, FLOW_ICON, FLOW_KIND, SHAPE_TEXT_LINE, SHAPE_TEXT_SIZE,
};
use archboard_scene::request::{
    ArchitecturePicture, Arrowhead, Dash, DocumentRequest, FlowchartParts, FlowchartShape,
    LineAppearance, NodeAppearance, PageRequest, PaintRequest, PaletteColor, Picture, ShapedCard,
};
use serde::Deserialize;

use crate::content::{Flow, Node};
use frames::{Header, Page, fitted};
use graph::{Answer, Block, Graph, SHAPE_KIND, flowchart_of};
use layout::{DONE, REPEAT, Run};

/// The widest a shape's words run before they wrap.
const SHAPE_WORDS_WIDTH: f64 = 150.0;
/// The room between a shape's words and its outline.
const SHAPE_PAD: f64 = 10.0;
/// How tall a diamond is for its width: a diamond twice as wide as it is tall.
const DIAMOND_ASPECT: f64 = 0.5;
/// A terminal's size.
const TERMINAL: (f64, f64) = (96.0, 34.0);
/// The kind of every line: one step leads to the next.
const NEXT_KIND: &str = "next";
/// What a vault's policy says one node kind looks like.
#[derive(Clone, Debug, Deserialize)]
pub struct KindLook {
    /// What the kind is called, when the policy names it; the kind's key is shown otherwise.
    #[serde(default)]
    pub name: Option<String>,
    /// The export name of the kind's icon, when the policy gives one.
    #[serde(default)]
    pub icon: Option<String>,
    /// The kind's colour, when the policy gives one.
    #[serde(default)]
    pub color: Option<PaletteColor>,
}

/// Everything a flowchart is laid out and painted from.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowchartRequest {
    /// The flows the picture draws, in document order.
    pub flows: Vec<Flow>,
    /// The nodes of the same reading, for the parts a message runs between.
    pub parts: Vec<Node>,
    /// The vault policy's node kinds, which a message box is drawn as.
    pub node_kinds: BTreeMap<String, KindLook>,
    /// The comparison the picture is read against, and the page around it.
    pub page: PageRequest,
    /// What the document says about itself and what it needs from its host.
    pub document: DocumentRequest,
    /// Each icon's path data, by its export name.
    pub icons: BTreeMap<String, Vec<String>>,
}

/// One shape's words, wrapped, and the width and height its box takes to hold them.
fn shape_size(shape: FlowchartShape, name: &str) -> (Vec<String>, f64, f64) {
    let lines = measure::message_lines(name, SHAPE_WORDS_WIDTH, SHAPE_TEXT_SIZE, SHAPE_TEXT_LINE);
    let text_width = lines
        .iter()
        .fold(0.0, |widest, line| js::js_max(widest, line.width));
    let text_height = lines.len() as f64 * SHAPE_TEXT_LINE;
    let words = lines.into_iter().map(|line| line.text).collect();
    match shape {
        FlowchartShape::Decision => {
            // The words' box inscribed in the diamond: (w/2)/a + (h/2)/b = 1, with b = aspect × a.
            let half =
                text_width / 2.0 + SHAPE_PAD + (text_height / 2.0 + SHAPE_PAD) / DIAMOND_ASPECT;
            (
                words,
                (half * 2.0).ceil(),
                (half * 2.0 * DIAMOND_ASPECT).ceil(),
            )
        }
        FlowchartShape::Loop => {
            let height = (text_height + SHAPE_PAD * 2.0).ceil();
            (
                words,
                (text_width + SHAPE_PAD * 2.0 + height).ceil(),
                height,
            )
        }
        FlowchartShape::Start | FlowchartShape::End => (words, TERMINAL.0, TERMINAL.1),
        // The layout sizes a jump where it places it.
        FlowchartShape::Jump { .. } => (words, 0.0, 0.0),
    }
}

/// A node drawn as a shape of its own, at a size.
fn shape_node(node: NodeFacts, width: f64, height: f64) -> MeasuredNode<NodeFacts> {
    MeasuredNode {
        node,
        width,
        height,
        header_height: 0.0,
        runs: Vec::new(),
        headers: None,
    }
}

/// Every node measured: a frame as a flow's is, a message box as a card is,
/// and each shape to the size its words need. Each shape's wrapped words beside.
fn measured(
    graph: &Graph,
) -> (
    HashMap<String, MeasuredNode<NodeFacts>>,
    BTreeMap<String, Vec<String>>,
) {
    let mut words = BTreeMap::new();
    let nodes = graph
        .nodes
        .iter()
        .map(|node| {
            let Some(shape) = graph.shape(&node.id) else {
                let card = CardWords {
                    name: &node.name,
                    responsibility: node.responsibility.as_deref(),
                    path: None,
                    tags: &[],
                    drills: false,
                    door: false,
                    toggle: None,
                };
                let measured = if node.parent.is_none() {
                    measure::measure_flow_frame(node.facts(), &card)
                } else {
                    measure::measure_node(node.facts(), &card, false)
                };
                return (node.id.clone(), measured);
            };
            let (lines, width, height) = shape_size(shape, &node.name);
            words.insert(node.id.clone(), lines);
            (node.id.clone(), shape_node(node.facts(), width, height))
        })
        .collect();
    (nodes, words)
}

/// The words of every line the blocks draw, measured: each answer's, and a
/// loop's "repeat" and "done".
fn line_words(blocks: &[Block], words: &mut HashMap<String, MeasuredLabel>) {
    for block in blocks {
        match block {
            Block::Step(_) | Block::Terminal(_) | Block::Land(_) => {}
            Block::Guard { side, main, .. } => {
                for label in [&side.label, main] {
                    words
                        .entry(label.clone())
                        .or_insert_with(|| measure::measure_label(label));
                }
                line_words(&side.blocks, words);
            }
            Block::Decision { answers, .. } => {
                for Answer { label, blocks } in answers {
                    words
                        .entry(label.clone())
                        .or_insert_with(|| measure::measure_label(label));
                    line_words(blocks, words);
                }
            }
            Block::Loop { body, .. } => {
                for label in [REPEAT, DONE] {
                    words
                        .entry(label.to_owned())
                        .or_insert_with(|| measure::measure_label(label));
                }
                line_words(body, words);
            }
        }
    }
}

/// The page as the painter draws it: every frame and box with its words,
/// every line along its corners with its words, and how each line reads: one
/// that joins another line has no arrowhead. Its lines cross nowhere, so no
/// line hops another, and the layout owns where they run.
fn drawing_of(
    page: Page,
    graph: &Graph,
    nodes: &HashMap<String, MeasuredNode<NodeFacts>>,
) -> (Painted, BTreeMap<String, LineAppearance>) {
    let next = LineAppearance {
        name: "Next".to_owned(),
        color: None,
        dash: Dash::Solid,
        arrowhead: Arrowhead::Filled,
    };
    let joining = LineAppearance {
        arrowhead: Arrowhead::None,
        ..next.clone()
    };
    let lines = page
        .runs
        .iter()
        .enumerate()
        .map(|(order, run)| {
            let look = if run.joins { &joining } else { &next };
            (edge_id(run, order), look.clone())
        })
        .collect();
    let boxes: HashMap<String, _> = page.boxes.into_iter().collect();
    let frames: HashMap<String, _> = page.frames.into_iter().collect();
    let placed = |id: &str, depth: f64, bounds| {
        nodes.get(id).map(|measured| DrawingNode {
            measured: measured.clone(),
            bounds,
            depth,
        })
    };
    let cards = graph
        .nodes
        .iter()
        .filter_map(|node| placed(&node.id, 1.0, *boxes.get(&node.id)?))
        .collect();
    let containers = graph
        .nodes
        .iter()
        .filter_map(|node| placed(&node.id, 0.0, *frames.get(&node.id)?))
        .collect();
    let edges: Vec<DrawingEdge<EdgeFacts>> = page
        .runs
        .into_iter()
        .enumerate()
        .map(|(order, run)| DrawingEdge {
            edge: EdgeFacts {
                id: edge_id(&run, order),
                from: run.from,
                to: run.to,
                kind: NEXT_KIND.to_owned(),
                emphasis: Emphasis::Normal,
                traffic: None,
                two_way: false,
            },
            curve: curve_through(&run.points, true),
            label: run
                .words
                .map(|(measured, bounds)| PlacedLabel { bounds, measured }),
        })
        .collect();
    let drawing = ArchitectureDrawing {
        direction: ReadingDirection::Down,
        width: page.width,
        height: page.height,
        cards,
        containers,
        edges,
    };
    let bridged = Bridged {
        edges: drawing.edges.clone(),
        bridges: Vec::new(),
    };
    let painted = PaintedDrawing {
        frozen: true,
        drawing,
        bridged,
    };
    (painted, lines)
}

/// A line's id: the nodes it runs between, and where it stands among the
/// page's lines, since two lines can run between the same two nodes.
fn edge_id(run: &Run, order: usize) -> String {
    format!("{}>{}#{order}", run.from, run.to)
}

/// Every end of a jump on the page as a shape of its own, in its flow's
/// frame: each jump numbered in the order the page holds its ends, and
/// lettered from A by that number.
fn add_jumps(
    page: &mut Page,
    graph: &mut Graph,
    nodes: &mut HashMap<String, MeasuredNode<NodeFacts>>,
    words: &mut BTreeMap<String, Vec<String>>,
) {
    let mut numbers: HashMap<String, u32> = HashMap::new();
    let mut count = 0;
    for (flow, marker) in std::mem::take(&mut page.markers) {
        let number = *numbers.entry(marker.jump.clone()).or_insert_with(|| {
            count += 1;
            count - 1
        });
        let letter = char::from_u32(u32::from('A') + number % 26)
            .unwrap_or_default()
            .to_string();
        let shape = FlowchartShape::Jump {
            end: marker.end,
            number,
        };
        let facts = graph.add_jump(&flow, &marker.id, shape, letter.clone());
        let bounds = marker.bounds;
        nodes.insert(
            marker.id.clone(),
            shape_node(facts, bounds.width, bounds.height),
        );
        words.insert(marker.id.clone(), vec![letter]);
        page.boxes.push((marker.id, bounds));
    }
}

/// How a node of the graph is drawn: a flow's frame with the flowchart's own
/// icon, a shape never by its kind, and a message box as a card of the part
/// that receives it, in the vault's look for its kind.
fn node_appearances(
    drawing: &Painted,
    graph: &Graph,
    kinds: &BTreeMap<String, KindLook>,
) -> BTreeMap<String, NodeAppearance> {
    let flow = KindLook {
        name: Some("Flow".to_owned()),
        icon: Some(FLOW_ICON.to_owned()),
        color: None,
    };
    let step = KindLook {
        name: Some("Step".to_owned()),
        icon: Some("RiGitBranchLine".to_owned()),
        color: None,
    };
    let look = |kind: &str| match kind {
        FLOW_KIND => Some(&flow),
        SHAPE_KIND => Some(&step),
        _ => kinds.get(kind),
    };
    let by_id: HashMap<&str, &GraphNode> = graph
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect();
    let drawn: Vec<&GraphNode> = drawing
        .drawing
        .cards
        .iter()
        .chain(&drawing.drawing.containers)
        .filter_map(|card| by_id.get(card.measured.node.id.as_str()).copied())
        .collect();
    let parents: HashSet<&str> = drawn
        .iter()
        .filter_map(|node| node.parent.as_deref())
        .collect();
    drawn
        .iter()
        .map(|node| {
            let kind = look(&node.kind);
            let appearance = NodeAppearance {
                container: parents.contains(node.id.as_str()),
                tags: Vec::new(),
                type_color: kind.and_then(|kind| kind.color),
                icon: kind
                    .and_then(|kind| kind.icon.clone())
                    .unwrap_or_else(|| FALLBACK_ICON.to_owned()),
                type_name: kind
                    .and_then(|kind| kind.name.clone())
                    .unwrap_or_else(|| node.kind.clone()),
                type_kind: node.kind.clone(),
                drill: None,
            };
            (node.id.clone(), appearance)
        })
        .collect()
}

/// Every flow of a reading laid out as a flowchart, as the painter's request.
pub fn picture(request: FlowchartRequest) -> PaintRequest {
    let mut graph = flowchart_of(&request.flows, &request.parts);
    let (mut nodes, mut words) = measured(&graph);
    let sizes: HashMap<String, (f64, f64)> = nodes
        .iter()
        .map(|(id, node)| (id.clone(), (node.width, node.height)))
        .collect();
    let headers: HashMap<String, Header> = graph
        .charts
        .iter()
        .filter_map(|chart| {
            let frame = nodes.get(&chart.flow)?;
            let header = Header {
                height: frame.header_height,
                width: frame.width,
            };
            Some((chart.flow.clone(), header))
        })
        .collect();
    let mut line_words_measured = HashMap::new();
    for chart in &graph.charts {
        line_words(&chart.blocks, &mut line_words_measured);
    }
    let mut page = fitted(&graph.charts, &headers, &sizes, &line_words_measured);
    add_jumps(&mut page, &mut graph, &mut nodes, &mut words);
    let (drawing, lines) = drawing_of(page, &graph, &nodes);
    // Its frames, lines and boxes are painted as an architecture's, its shapes
    // as their own, and its atlas holds only what a reader can pick: the
    // flows and their steps.
    let appearances = node_appearances(&drawing, &graph, &request.node_kinds);
    let shapes = graph
        .shapes
        .iter()
        .map(|(id, shape)| {
            let card = ShapedCard {
                shape: *shape,
                words: words.get(id).cloned().unwrap_or_default(),
            };
            (id.clone(), card)
        })
        .collect();
    PaintRequest {
        picture: Picture::Architecture(Box::new(ArchitecturePicture {
            drawing,
            whole: None,
            appearances,
            lines,
            steps: Vec::new(),
            flowchart: Some(FlowchartParts {
                shapes,
                subjects: graph.subjects,
            }),
        })),
        page: request.page,
        document: request.document,
        icons: request.icons,
    }
}
