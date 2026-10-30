//! A reading drawn as an architecture: its words measured, laid out once per
//! distinct content and comparison, what the picture leaves out of the layout
//! left undrawn, and the drawing handed to the painter with the look the
//! vault's policy gives each subject.
//!
//! A picture without its comparison is laid out from the same content as the
//! one with it, so every subject the two share stands in the same place and
//! every line runs the same route: the one without leaves out what the
//! variant's own reading of the view does not hold, and only the hops and
//! cuts of the lines left are settled again (`archboard_layout::shown_drawing`).
//! The page is still the whole layout's page.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::rc::Rc;

use archboard_flows::board::{Step, every_step};
use archboard_layout::{LineLook, Measured, MeasuredGroups, Node, Standings, draw, shown_drawing};
use archboard_scene::drawing::Painted;
use archboard_scene::measure::{CardWords, measure_caption, measure_label, measure_node};
use archboard_scene::request::{ArchitecturePicture, PaintRequest, Picture, Standing};
use indexmap::IndexMap;

use crate::appearance::{gathering_groups, line_appearance, line_look, node_appearances};
use crate::entries::entry_points_of;
use crate::memo::Layouts;
use crate::request::{Policy, Reading, RenderRequest};
use crate::steps::with_step_lines;
use crate::{Host, Outline, document_request, icons_of, page_request};

/// Every word of a reading measured before the layout places anything: each
/// part's box, each label, how each line is drawn, and each region's caption.
fn measured(laid: &Reading, policy: &Policy, steps: &HashSet<&str>) -> Measured {
    let containers: HashSet<&str> = laid
        .nodes
        .iter()
        .filter_map(|node| node.parent.as_deref())
        .collect();
    let nodes = laid
        .nodes
        .iter()
        .map(|node| {
            let words = CardWords {
                name: &node.name,
                responsibility: node.responsibility.as_deref(),
                drills: node.drills,
            };
            let container = containers.contains(node.id.as_str());
            (
                node.id.clone(),
                measure_node(node.facts(), &words, container),
            )
        })
        .collect();
    let labels = laid
        .edges
        .iter()
        .filter_map(|edge| {
            let words = edge.label.as_deref().filter(|words| !words.is_empty())?;
            Some((edge.id.clone(), measure_label(words)))
        })
        .collect();
    let lines = laid
        .edges
        .iter()
        .map(|edge| {
            (
                edge.id.clone(),
                line_look(&edge.kind, policy, steps.contains(edge.id.as_str())),
            )
        })
        .collect();
    let placing = gathering_groups(&laid.nodes, policy);
    let groups = (!placing.is_empty()).then(|| {
        let mut captions = IndexMap::new();
        for group in placing.values() {
            if !captions.contains_key(group) {
                let name = policy
                    .groups
                    .get(group)
                    .map_or(group.as_str(), |look| look.name.as_str());
                captions.insert(group.clone(), measure_caption(name));
            }
        }
        MeasuredGroups { placing, captions }
    });
    Measured {
        nodes,
        labels,
        lines,
        groups,
    }
}

/// The ids laid out that a reading does not hold: what a picture without its
/// comparison leaves undrawn. A line drawn for a flow's message is held when
/// the message is.
fn unshown_of(laid: &Reading, held: &Reading) -> HashSet<String> {
    let kept: HashSet<&str> = held
        .nodes
        .iter()
        .map(|node| node.id.as_str())
        .chain(held.edges.iter().map(|edge| edge.id.as_str()))
        .chain(
            held.flows
                .iter()
                .flat_map(|flow| every_step(&flow.steps))
                .map(Step::id),
        )
        .collect();
    laid.nodes
        .iter()
        .map(|node| &node.id)
        .chain(laid.edges.iter().map(|edge| &edge.id))
        .filter(|id| !kept.contains(id.as_str()))
        .cloned()
        .collect()
}

/// What a layout is remembered by: everything it is laid out from.
fn layout_key(
    request: &RenderRequest,
    laid: &Reading,
    steps: &[String],
    standings: Option<&Standings>,
    entries: &BTreeMap<String, bool>,
) -> String {
    let names: Vec<(&String, &String)> = request
        .policy
        .groups
        .iter()
        .map(|(id, look)| (id, &look.name))
        .collect();
    let looks: Vec<(&String, LineLook)> = request
        .policy
        .relationship_kinds
        .iter()
        .map(|(kind, look)| {
            let (dash, arrowhead) = (look.dash, look.arrowhead);
            (kind, LineLook { dash, arrowhead })
        })
        .collect();
    serde_json::to_string(&(
        request.layout,
        &laid.nodes,
        &laid.edges,
        steps,
        standings,
        names,
        looks,
        entries,
    ))
    .expect("what a layout is laid out from always writes as JSON")
}

/// The accessible name of an architecture nobody gave a title to.
fn title_for(told: &Reading) -> String {
    let count = |count: usize, one: &str, many: &str| {
        format!("{count} {}", if count == 1 { one } else { many })
    };
    format!(
        "Architecture diagram: {}, {}",
        count(told.nodes.len(), "node", "nodes"),
        count(told.edges.len(), "connection", "connections")
    )
}

/// The longer description: which containers the picture is divided into.
fn description_for(drawing: &Painted) -> Option<String> {
    let names: Vec<&str> = drawing
        .drawing
        .containers
        .iter()
        .map(|node| node.measured.node.name.as_str())
        .collect();
    (!names.is_empty()).then(|| format!("Grouped by {}.", names.join(", ")))
}

/// How each subject laid out stands in the comparison, when there is one: an
/// id the comparison does not mention stands unchanged.
fn standings_of(request: &RenderRequest, laid: &Reading) -> Option<Standings> {
    let standing = request.standing.as_ref()?;
    let ids = laid
        .nodes
        .iter()
        .map(|node| &node.id)
        .chain(laid.edges.iter().map(|edge| &edge.id));
    Some(
        ids.map(|id| {
            let stands = standing.get(id).copied().unwrap_or(Standing::Unchanged);
            (id.clone(), stands)
        })
        .collect(),
    )
}

/// What a reading is laid out as: its words measured, and the drawing the
/// engine it names laid out, remembered by everything it was laid out from.
async fn laid_out<H: Host>(
    request: &RenderRequest,
    laid: &Reading,
    steps: &[String],
    layouts: &Layouts,
    host: &H,
) -> Result<(Measured, Rc<Painted>), String> {
    let stepping: HashSet<&str> = steps.iter().map(String::as_str).collect();
    let standings = standings_of(request, laid);
    let entries = entry_points_of(laid, request.variant());
    let measure = measured(laid, &request.policy, &stepping);
    let key = layout_key(request, laid, steps, standings.as_ref(), &entries);
    let content = laid.content();
    let solving = draw(
        &content,
        &measure,
        standings.as_ref(),
        &entries,
        request.layout,
        host,
    );
    let drawing = layouts.laid(&key, solving).await?;
    Ok((measure, drawing))
}

/// What a picture draws of its layout, and the whole layout when that is
/// more: without its comparison, what the variant's own reading holds.
fn shown_of(
    request: &RenderRequest,
    laid: &Reading,
    drawing: &Painted,
    measure: &Measured,
) -> (Painted, Option<Painted>) {
    let unshown = if request.plain() {
        unshown_of(laid, request.held())
    } else {
        HashSet::new()
    };
    if unshown.is_empty() {
        return (drawing.clone(), None);
    }
    let shown = shown_drawing(drawing, &unshown, &measure.lines);
    (shown, Some(drawing.clone()))
}

/// The painter's request for a drawing: the look the policy gives each part
/// and line of the whole layout, the document's words and the icons it draws.
fn paint_request<H: Host>(
    request: &RenderRequest,
    laid: &Reading,
    steps: Vec<String>,
    (shown, whole): (Painted, Option<Painted>),
    host: &H,
) -> Result<PaintRequest, String> {
    let policy = &request.policy;
    let drawn = whole.as_ref().unwrap_or(&shown);
    // Every part the page lays out, drawn or not, so leaving some out changes
    // no kept card's colour or whether it draws as a container.
    let by_id: HashMap<&str, &Node> = laid
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect();
    let parts: Vec<&Node> = drawn
        .drawing
        .cards
        .iter()
        .chain(&drawn.drawing.containers)
        .filter_map(|node| by_id.get(node.measured.node.id.as_str()).copied())
        .collect();
    let appearances = node_appearances(&parts, policy, request.level.as_deref());
    let lines = drawn
        .drawing
        .edges
        .iter()
        .map(|edge| {
            let step = steps.contains(&edge.edge.id);
            let look = line_appearance(&edge.edge.kind, policy, step);
            (edge.edge.id.clone(), look)
        })
        .collect();
    let document = document_request(request, title_for(request.told()), description_for(&shown));
    let named: Vec<&str> = appearances
        .values()
        .map(|look| look.icon.as_str())
        .collect();
    let icons = icons_of(host, &named)?;
    let picture = ArchitecturePicture {
        drawing: shown,
        whole,
        appearances,
        lines,
        steps,
        groups: policy.group_colours(),
        flowchart: None,
    };
    Ok(PaintRequest {
        picture: Picture::Architecture(Box::new(picture)),
        page: page_request(request),
        document,
        icons,
    })
}

/// A reading drawn as an architecture, as the painter's request.
///
/// # Errors
///
/// A solve the host failed or answered unreadably.
pub(crate) async fn picture<H: Host>(
    request: &RenderRequest,
    layouts: &Layouts,
    host: &H,
) -> Result<Outline, String> {
    if request.told().nodes.is_empty() {
        return Ok(Outline::Nothing);
    }
    let (laid, steps) = with_step_lines(&request.content, request.held());
    let (measure, drawing) = laid_out(request, &laid, &steps, layouts, host).await?;
    let shown = shown_of(request, &laid, &drawing, &measure);
    let paint = paint_request(request, &laid, steps, shown, host)?;
    Ok(Outline::Paint(Box::new(paint)))
}
