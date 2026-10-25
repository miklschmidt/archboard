//! A flow drawn as a flowchart (ADR 0053): its steps as boxes, its decisions
//! as diamonds with a labelled line for each alternative, its loops as
//! hexagons, from a start to an end, in a frame that names the flow.
//!
//! The graph (`graph.rs`) is laid out by the track engine, whose top-to-bottom
//! tracks suit a flow that branches and rejoins, and painted by the
//! architecture painter: the frames, the lines, their words and their
//! crossings are an architecture's, the message boxes are cards, and only the
//! diamonds, hexagons and terminals are drawn as shapes of their own. Every
//! line that meets a shape is carried on to its outline, and a line that meets
//! a decision or a terminal to the middle of the side it crosses, a diamond's
//! point (`ports.rs`).
//!
//! A decision's answers leave it from separate points: left and right, and the
//! bottom for a third. The layout is asked for that: a decision is measured
//! wider than its diamond on either side by an answer's sideways run and half
//! the widest answer's words, and marked so that the track engine holds each
//! answer to its own point of the box (`shared/rules/track/routes/points.ts`).
//! Once laid out, the box is cut back to the diamond (`to_diamonds`), and each
//! answer is drawn out of its point. Which answer goes to which point follows
//! a first layout that holds no answer to a point (`in_free_order`): Graphviz
//! orders the answers there so that the fewest lines cross, a loop's line back
//! up included, and the second layout asks for the points in that order.
//!
//! The track engine and the text are the host's until the core holds them
//! ([`FlowchartHost`], TASK-520.04 and TASK-520.07).

mod graph;
mod ports;

use std::collections::{BTreeMap, HashMap, HashSet};
use std::future::Future;

use archboard_scene::drawing::{DrawingEdge, EdgeFacts, MeasuredLabel, MeasuredNode, Painted};
use archboard_scene::geometry::{Curve, EPSILON, Point, Rect, Segment, path_of};
use archboard_scene::js;
use archboard_scene::paint::icons::FALLBACK_ICON;
use archboard_scene::request::{
    ArchitecturePicture, Arrowhead, Dash, DocumentRequest, FlowchartParts, FlowchartShape,
    LineAppearance, NodeAppearance, PageRequest, PaintRequest, PaletteColor, Picture, ShapedCard,
};
use serde::{Deserialize, Serialize};

pub use graph::{Content, GraphEdge, GraphNode};

use crate::board::{Flow, Node};
use crate::routes::pair_crossings;
use crate::text::Text;
use graph::{FLOW_KIND, Graph, SHAPE_KIND, flowchart_of};
use ports::{at_shape_points, on_outline};

/// The widest a shape's words run before they wrap.
const SHAPE_WORDS_WIDTH: f64 = 150.0;
/// A shape's words: their size, and the room one line of them takes.
const SHAPE_TEXT_SIZE: f64 = 11.0;
const SHAPE_TEXT_LINE: f64 = 14.0;
/// The room between a shape's words and its outline.
const SHAPE_PAD: f64 = 10.0;
/// How tall a diamond is for its width: a diamond twice as wide as it is tall.
const DIAMOND_ASPECT: f64 = 0.5;
/// A terminal's size.
const TERMINAL: (f64, f64) = (96.0, 34.0);
/// How far an answer runs sideways out of a decision's left or right point
/// before it turns down: a bend and as long a straight again.
const SIDE_RUN: f64 = 2.0 * archboard_scene::geometry::BEND_RADIUS;
/// The icon a flow's frame is drawn with: one of the renderer's own icons
/// (`shared/rules/render/icons.ts`), which every host carries.
const FLOW_ICON: &str = "RiFlowChart";

/// What a vault's policy says one node kind looks like.
#[derive(Clone, Debug, Deserialize)]
pub struct KindLook {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
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
    /// Each group's colour, by group id, for a group that has one.
    pub groups: BTreeMap<String, PaletteColor>,
    pub page: PageRequest,
    pub document: DocumentRequest,
    pub icons: BTreeMap<String, Vec<String>>,
}

/// How a line is drawn: its dash and its head.
#[derive(Clone, Copy, Debug, Serialize)]
pub struct LineLook {
    pub dash: Dash,
    pub arrowhead: Arrowhead,
}

/// The graph measured, as the track engine reads it: each node's box and
/// words, each line's words and look, each by id in the graph's order.
#[derive(Clone, Debug, Serialize)]
pub struct Measured {
    pub nodes: Vec<(String, MeasuredNode<GraphNode>)>,
    pub labels: Vec<(String, MeasuredLabel)>,
    pub lines: Vec<(String, LineLook)>,
}

/// A card whose name is drawn from far away, and the box it stands in.
#[derive(Clone, Debug, Serialize)]
pub struct FarSubject<'a> {
    pub name: &'a str,
    #[serde(rename = "box")]
    pub bounds: Rect,
}

/// What the host gives a flowchart's layout: its text, and the track engine.
pub trait FlowchartHost: Text {
    /// Why the track engine could not lay the graph out.
    type Error;

    /// A card's or a container's box and words (`text/measurement.ts` `measureNode`).
    fn measure_node(&self, node: &GraphNode, container: bool) -> MeasuredNode<GraphNode>;

    /// A line's words on their plate (`measureLabel`).
    fn measure_label(&self, words: &str) -> MeasuredLabel;

    /// The one size every card's name is set at from far away (`farSizeFor`).
    fn far_size(&self, subjects: &[FarSubject<'_>]) -> f64;

    /// The graph laid out by the track engine.
    fn track(
        &self,
        content: &Content,
        measured: &Measured,
    ) -> impl Future<Output = Result<Painted, Self::Error>>;
}

/// One shape's words, wrapped, and the width and height its box takes to hold them.
fn shape_size(text: &impl Text, shape: FlowchartShape, name: &str) -> (Vec<String>, f64, f64) {
    let lines = text.message_lines(name, SHAPE_WORDS_WIDTH, SHAPE_TEXT_SIZE, SHAPE_TEXT_LINE);
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
    }
}

/// Half the widest answer's words out of each decision: how far in from the
/// edge of its box an answer from a side point runs down, so its words stand
/// on it inside the box.
fn answer_rooms(graph: &Graph, labels: &HashMap<&str, f64>) -> HashMap<String, f64> {
    let mut rooms: HashMap<String, f64> = HashMap::new();
    for edge in &graph.content.edges {
        if graph.shape(&edge.from) != Some(FlowchartShape::Decision) {
            continue;
        }
        let half = (labels.get(edge.id.as_str()).copied().unwrap_or(0.0) / 2.0).ceil();
        let room = rooms.entry(edge.from.clone()).or_insert(0.0);
        *room = js::js_max(*room, half);
    }
    rooms
}

/// The graph measured: frames, boxes and lines as an architecture's are, and
/// each shape to the size its words need, a decision wider than its diamond
/// on either side by an answer's sideways run and the room its words take
/// beside it. Each shape's wrapped words beside.
fn measured(graph: &Graph, host: &impl FlowchartHost) -> (Measured, BTreeMap<String, Vec<String>>) {
    let containers: HashSet<&str> = graph
        .content
        .nodes
        .iter()
        .filter_map(|node| node.parent.as_deref())
        .collect();
    let labels: Vec<(String, MeasuredLabel)> = graph
        .content
        .edges
        .iter()
        .filter_map(|edge| {
            let words = edge.label.as_deref().filter(|words| !words.is_empty())?;
            Some((edge.id.clone(), host.measure_label(words)))
        })
        .collect();
    let widths: HashMap<&str, f64> = labels
        .iter()
        .map(|(id, label)| (id.as_str(), label.width))
        .collect();
    let rooms = answer_rooms(graph, &widths);
    let mut words = BTreeMap::new();
    let nodes = graph
        .content
        .nodes
        .iter()
        .map(|node| {
            let Some(shape) = graph.shape(&node.id) else {
                let container = containers.contains(node.id.as_str());
                return (node.id.clone(), host.measure_node(node, container));
            };
            let (lines, width, height) = shape_size(host, shape, &node.name);
            words.insert(node.id.clone(), lines);
            let room = rooms.get(&node.id).copied().unwrap_or(0.0);
            let decision = shape == FlowchartShape::Decision;
            let measured = MeasuredNode {
                node: node.clone(),
                width: if decision {
                    width + 2.0 * (SIDE_RUN + room)
                } else {
                    width
                },
                height,
                header_height: 0.0,
                runs: Vec::new(),
                headers: None,
                pointed: decision.then_some(room),
            };
            (node.id.clone(), measured)
        })
        .collect();
    let lines = graph
        .content
        .edges
        .iter()
        .map(|edge| {
            let look = LineLook {
                dash: Dash::Solid,
                arrowhead: Arrowhead::Filled,
            };
            (edge.id.clone(), look)
        })
        .collect();
    (
        Measured {
            nodes,
            labels,
            lines,
        },
        words,
    )
}

/// Where an answer first stops below its decision in a drawing: the middle of
/// its words, or else of the card it reaches. By answer id.
fn first_stops(drawing: &Painted) -> HashMap<&str, f64> {
    let cards: HashMap<&str, Rect> = drawing
        .drawing
        .cards
        .iter()
        .map(|card| (card.measured.node.id.as_str(), card.bounds))
        .collect();
    drawing
        .drawing
        .edges
        .iter()
        .map(|edge| {
            let stop = edge
                .label
                .as_ref()
                .map(|label| label.bounds)
                .or_else(|| cards.get(edge.edge.to.as_str()).copied())
                .map_or(0.0, |bounds| bounds.x + bounds.width / 2.0);
            (edge.edge.id.as_str(), stop)
        })
        .collect()
}

/// `Array.prototype.sort`'s reading of a comparator's number: no number
/// (`NaN`) is a tie.
fn ordering(difference: f64) -> std::cmp::Ordering {
    difference
        .partial_cmp(&0.0)
        .unwrap_or(std::cmp::Ordering::Equal)
}

/// The graph's content with each decision's answers in the order a layout that
/// holds no answer to a point stood them, left to right, and whether that
/// order differs from the board's. Asked for its points in the board's order
/// instead, Graphviz keeps that order even where it costs a crossing, as when
/// a loop runs back up past one answer.
async fn in_free_order<H: FlowchartHost>(
    content: &Content,
    measure: &Measured,
    host: &H,
) -> Result<Option<Content>, H::Error> {
    let unpointed = Measured {
        nodes: measure
            .nodes
            .iter()
            .map(|(id, node)| {
                let node = MeasuredNode {
                    pointed: None,
                    ..node.clone()
                };
                (id.clone(), node)
            })
            .collect(),
        ..measure.clone()
    };
    let free = host.track(content, &unpointed).await?;
    let stops = first_stops(&free);
    let stop = |id: &str| stops.get(id).copied().unwrap_or(f64::NAN);
    let mut reordered: HashMap<&str, f64> = HashMap::new();
    for (id, node) in &measure.nodes {
        if node.pointed.is_none() {
            continue;
        }
        let answers: Vec<&GraphEdge> = content
            .edges
            .iter()
            .filter(|edge| &edge.from == id)
            .collect();
        let mut orders: Vec<f64> = answers.iter().map(|edge| edge.order).collect();
        orders.sort_by(|one, other| ordering(one - other));
        let mut placed = answers;
        placed.sort_by(|one, other| {
            let apart = stop(&one.id) - stop(&other.id);
            if apart != 0.0 && !apart.is_nan() {
                ordering(apart)
            } else {
                ordering(one.order - other.order)
            }
        });
        for (edge, order) in placed.into_iter().zip(orders) {
            reordered.insert(&edge.id, order);
        }
    }
    let edges: Vec<GraphEdge> = content
        .edges
        .iter()
        .map(|edge| GraphEdge {
            order: reordered
                .get(edge.id.as_str())
                .copied()
                .unwrap_or(edge.order),
            ..edge.clone()
        })
        .collect();
    if edges
        .iter()
        .zip(&content.edges)
        .all(|(edge, was)| edge.order == was.order)
    {
        return Ok(None);
    }
    Ok(Some(Content {
        edges,
        ..content.clone()
    }))
}

/// How many times a drawing's lines cross each other.
fn crossings_of(drawing: &Painted) -> usize {
    let lines: Vec<Vec<Point>> = drawing
        .drawing
        .edges
        .iter()
        .map(|edge| {
            std::iter::once(edge.curve.from)
                .chain(edge.curve.segments.iter().map(Segment::to))
                .collect()
        })
        .collect();
    pair_crossings(&lines)
}

/// The graph laid out with each decision's answers asked for their points in
/// the order of a first layout (`in_free_order`), or in the board's order when
/// that crosses fewer lines: asked for its points, Graphviz can still stand
/// answers' steps against the first layout's order. The first layout's order
/// wins a tie.
async fn laid_out<H: FlowchartHost>(
    content: &Content,
    measure: &Measured,
    host: &H,
) -> Result<Painted, H::Error> {
    let free = in_free_order(content, measure, host).await?;
    let first = host
        .track(free.as_ref().unwrap_or(content), measure)
        .await?;
    let crossed = crossings_of(&first);
    if free.is_none() || crossed == 0 {
        return Ok(first);
    }
    let board = host.track(content, measure).await?;
    Ok(if crossings_of(&board) < crossed {
        board
    } else {
        first
    })
}

/// The drawing with each decision's box cut to its diamond: it was laid out
/// wider on either side by an answer's sideways run and its words' room.
fn to_diamonds(mut drawing: Painted, graph: &Graph) -> Painted {
    for card in &mut drawing.drawing.cards {
        if graph.shape(&card.measured.node.id) != Some(FlowchartShape::Decision) {
            continue;
        }
        let beside = SIDE_RUN + card.measured.pointed.unwrap_or(0.0);
        card.bounds.x += beside;
        card.bounds.width -= 2.0 * beside;
    }
    drawing
}

/// The shape a line's end meets, and its box; nothing for a box drawn as a card.
type Shaped = Option<(FlowchartShape, Rect)>;

/// The straight piece between two points, or none where they are one point: a
/// piece of no length would turn an arrowhead any way at all.
fn line_between(from: Point, to: Point) -> Option<Segment> {
    let short = js::hypot(to.x - from.x, to.y - from.y) < EPSILON;
    (!short).then_some(Segment::Line { to })
}

/// Where a line's end stands once it is carried on to the shape it meets.
fn carried(shaped: Shaped, point: Point) -> Point {
    shaped.map_or(point, |(shape, bounds)| on_outline(shape, bounds, point))
}

/// A route carried on from its shapes' boxes to their outlines.
fn outlined(curve: Curve, from: Shaped, to: Shaped) -> Curve {
    let last = curve.end();
    let start = carried(from, curve.from);
    let end = carried(to, last);
    let mut segments: Vec<Segment> = line_between(start, curve.from).into_iter().collect();
    segments.extend(curve.segments);
    segments.extend(line_between(last, end));
    Curve {
        from: start,
        segments,
    }
}

/// The box of a shape a line meets at the middle of a side: a decision's
/// diamond, at one of its points, and a terminal, where a flow starts or ends.
fn pointed(shaped: Shaped) -> Option<Rect> {
    shaped
        .filter(|(shape, _)| *shape != FlowchartShape::Loop)
        .map(|(_, bounds)| bounds)
}

/// The drawing with every line that meets a shape carried on to its outline,
/// and every line that meets a decision or a terminal turned to the middle of
/// the side it crosses.
fn with_outlines(mut drawing: Painted, graph: &Graph) -> Painted {
    let boxes: HashMap<String, Rect> = drawing
        .drawing
        .cards
        .iter()
        .map(|card| (card.measured.node.id.clone(), card.bounds))
        .collect();
    let shaped = |id: &str| -> Shaped { Some((graph.shape(id)?, *boxes.get(id)?)) };
    let on_shapes = |routed: &mut DrawingEdge<EdgeFacts>| {
        let from = shaped(&routed.edge.from);
        let to = shaped(&routed.edge.to);
        let turned = at_shape_points(routed.curve.clone(), pointed(from), pointed(to));
        routed.curve = outlined(turned, from, to);
        routed.path = path_of(&routed.curve);
    };
    drawing.drawing.edges.iter_mut().for_each(on_shapes);
    drawing.bridged.edges.iter_mut().for_each(on_shapes);
    drawing
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
        .content
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
                body_color: None,
                group: None,
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
pub async fn picture<H: FlowchartHost>(
    request: FlowchartRequest,
    host: &H,
) -> Result<PaintRequest, H::Error> {
    let graph = flowchart_of(&request.flows, &request.parts);
    let (measure, words) = measured(&graph, host);
    let laid = laid_out(&graph.content, &measure, host).await?;
    let drawing = with_outlines(to_diamonds(laid, &graph), &graph);
    let next = LineAppearance {
        name: "Next".to_owned(),
        color: None,
        dash: Dash::Solid,
        arrowhead: Arrowhead::Filled,
    };
    let subjects: Vec<FarSubject<'_>> = drawing
        .drawing
        .cards
        .iter()
        .map(|card| FarSubject {
            name: &card.measured.node.name,
            bounds: card.bounds,
        })
        .collect();
    let far_size = host.far_size(&subjects);
    // Its frames, lines and boxes are painted as an architecture's, its shapes
    // as their own, and its atlas holds only what a reader can pick: the
    // flows and their steps.
    let appearances = node_appearances(&drawing, &graph, &request.node_kinds);
    let lines = drawing
        .drawing
        .edges
        .iter()
        .map(|edge| (edge.edge.id.clone(), next.clone()))
        .collect();
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
    Ok(PaintRequest {
        picture: Picture::Architecture(Box::new(ArchitecturePicture {
            drawing,
            whole: None,
            appearances,
            lines,
            steps: Vec::new(),
            groups: request.groups,
            far_size,
            flowchart: Some(FlowchartParts {
                shapes,
                subjects: graph.subjects,
            }),
        })),
        page: request.page,
        document: request.document,
        icons: request.icons,
    })
}
