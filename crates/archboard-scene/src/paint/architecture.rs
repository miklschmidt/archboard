//! A complete architecture drawing painted. Placement, wrapping and routing
//! are already settled; the atlas comes from the same boxes.

use std::collections::{BTreeMap, HashSet};

use crate::attrs;
use crate::drawing::{Edge, Emphasis, Node, Painted};
use crate::geometry::{Rect, canvas_for, coord, curve_bounds, inflate, label_anchor_of, union};
use crate::markup::{Markup, concat, group, lines, tag, wrap};
use crate::paint::Ctx;
use crate::paint::appearance::label_look;
use crate::paint::colour::colour_id;
use crate::paint::crossings::{
    Cutout, crossing_cutouts, crossing_masks, label_cutouts, trunk_cutouts,
};
use crate::paint::design::{DIAGRAM_MARGIN, PILL_RADIUS, SLAB_RADIUS};
use crate::paint::junctions::junction_marks;
use crate::paint::measured_cards::{
    paint_measured_card, paint_measured_frame, paint_measured_header,
};
use crate::paint::page::{PaintedPage, atlas_boxes, shifted};
use crate::paint::palette::Palette;
use crate::paint::ports::{Port, ends_in_port, port_inside, port_plan, ports_of, ride_into};
use crate::paint::regions::paint_region;
use crate::paint::slab::{Lift, shadow_under, slab, slab_seat, slab_shadow};
use crate::paint::standing::{
    PART_ATTRIBUTE, Standings, Unsettled, ghost_opacity, marked_box, standing_palette,
    standing_swipe, subject, warning_on_line,
};
use crate::paint::styles::{
    HEAD_LENGTH, Styles, edge_attributes, head_widths, quietened, relationship_ink, stroke_width,
};
use crate::paint::text_runs::paint_text_runs;
use crate::paint::traffic::{TrafficLine, paint_traffic};
use crate::request::{Arrowhead, LineAppearance, NodeAppearance, PaletteColor, Standing};
use crate::scene::{Atlas, Role, SubjectKind};

/// Width added to a connection's invisible selection halo.
const EDGE_HALO_EXTRA: f64 = 5.0;
/// An arrowhead's drawing: a square this many marker units wide.
const MARKER_BOX: f64 = 10.0;
/// How thick the open head's arms are drawn, in marker units.
const OPEN_ARM: f64 = 1.7;

/// Where each head form puts the line's end, and where its ink reaches back to.
fn marker_form(head: Arrowhead) -> (f64, f64) {
    match head {
        Arrowhead::Open => (10.0, 2.0 - OPEN_ARM / 2.0),
        Arrowhead::Filled | Arrowhead::None => (8.0, 0.0),
    }
}

/// How far back from a route's end its arrowhead's ink reaches.
fn arrowhead_reach(head: Arrowhead) -> f64 {
    if head == Arrowhead::None {
        return 0.0;
    }
    let (ref_x, back) = marker_form(head);
    ((ref_x - back) * HEAD_LENGTH) / MARKER_BOX
}

/// A head in the line's ink, in SVG's proportional stroke-width units.
fn edge_marker(id: &str, head: Arrowhead, weight: Emphasis, ink: &str) -> Markup {
    if head == Arrowhead::None {
        return Markup::new();
    }
    let side = coord(head_widths(weight));
    let shape = if head == Arrowhead::Filled {
        tag("path", attrs! { "d": "M0,0 L10,5 L0,10 z", "fill": ink })
    } else {
        tag(
            "path",
            attrs! {
                "d": "M2,1 L10,5 L2,9",
                "fill": "none",
                "stroke": ink,
                "stroke-width": OPEN_ARM,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
            },
        )
    };
    wrap(
        "defs",
        attrs! {},
        wrap(
            "marker",
            attrs! {
                "id": id,
                "viewBox": format!("0 0 {} {}", crate::js::number(MARKER_BOX), crate::js::number(MARKER_BOX)),
                "refX": marker_form(head).0,
                "refY": MARKER_BOX / 2.0,
                "markerWidth": side.as_str(),
                "markerHeight": side.as_str(),
                "orient": "auto-start-reverse",
            },
            shape,
        ),
    )
}

/// The subject kind a drawn line is: a flow step drawn on the board, or a relationship.
fn line_kind(step: bool) -> SubjectKind {
    if step {
        SubjectKind::Step
    } else {
        SubjectKind::Edge
    }
}

/// One final route, its head, its halo and the insides of the ports it runs into.
#[allow(clippy::too_many_arguments)]
fn paint_edge_line(
    routed: &Edge,
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &LineAppearance,
    mask: Option<&String>,
    step: bool,
    ports: &[(Port, bool)],
) -> Markup {
    let edge = &routed.edge;
    let styles = Styles::of(palette);
    let width = stroke_width(edge.emphasis);
    let attributes = edge_attributes(edge.emphasis, palette, standing, appearance);
    let ink = attributes
        .get("stroke")
        .map(crate::markup::spelt)
        .unwrap_or_default();
    let weight = edge.emphasis;
    let marker_id = format!(
        "edge-head-{}-{}-{}",
        appearance.arrowhead.as_str(),
        weight.as_str(),
        colour_id(&ink)
    );
    let mut parts = vec![
        edge_marker(&marker_id, appearance.arrowhead, weight, &ink),
        standing_swipe(&routed.path, width, standing, palette),
        tag(
            "path",
            attrs! {
                "class": "ab-halo",
                "d": routed.path.as_str(),
                "stroke-width": width + EDGE_HALO_EXTRA,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
            }
            .with(styles.halo()),
        ),
        tag(
            "path",
            attrs! {
                "d": routed.path.as_str(),
                "marker-end": (appearance.arrowhead != Arrowhead::None).then(|| format!("url(#{marker_id})")),
            }
            .with(attributes.clone()),
        ),
    ];
    for (port, well) in ports {
        parts.push(port_inside(port, *well, attributes.clone(), width, palette));
    }
    group(
        Role::Line,
        subject(line_kind(step), &edge.id, standing),
        attrs! {
            "opacity": ghost_opacity(standing),
            "mask": mask.map(|mask| format!("url(#{mask})")),
            "data-type-name": appearance.name.as_str(),
            "data-type-kind": edge.kind.as_str(),
            "data-line-color": appearance.color.map_or("neutral", PaletteColor::as_str),
            "data-line-dash": appearance.dash.as_str(),
            "data-arrowhead": appearance.arrowhead.as_str(),
        },
        lines(parts),
    )
}

/// A relationship's label and warning, above all connections.
fn paint_edge_words(
    routed: &Edge,
    palette: &Palette,
    standing: Option<Standing>,
    unsettled: bool,
    step: bool,
) -> Markup {
    let at = match &routed.label {
        None => label_anchor_of(&routed.curve),
        Some(label) => crate::geometry::Point {
            x: label.bounds.x,
            y: label.bounds.y + label.bounds.height / 2.0,
        },
    };
    let badge = warning_on_line(Some(at), unsettled, palette);
    let pill = match &routed.label {
        None => Markup::new(),
        Some(label) => {
            let mut parts = vec![slab_seat(label.bounds, PILL_RADIUS)];
            for chip in label.chips() {
                // A removed label's ghost; a label's shadow lies under the lines (`label_shadow`).
                if standing == Some(Standing::Removed) {
                    parts.push(slab_shadow(
                        chip,
                        PILL_RADIUS,
                        Lift::Chip,
                        palette,
                        standing,
                    ));
                }
                parts.push(slab(chip, &label_look(palette), palette, standing, None));
            }
            parts.push(paint_text_runs(
                &label.measured.runs,
                label.bounds,
                &standing_palette(palette, standing),
                None,
            ));
            lines(parts)
        }
    };
    if pill.is_empty() && badge.is_empty() {
        return Markup::new();
    }
    group(
        Role::Label,
        subject(line_kind(step), &routed.edge.id, standing),
        attrs! { PART_ATTRIBUTE: "label" },
        lines(vec![pill, badge]),
    )
}

/// The shadow a relationship's label casts, under every line.
fn label_shadow(routed: &Edge, palette: &Palette, standing: Option<Standing>) -> Markup {
    match &routed.label {
        None => Markup::new(),
        Some(label) => lines(
            label
                .chips()
                .map(|chip| {
                    shadow_under(
                        &routed.edge.id,
                        chip,
                        PILL_RADIUS,
                        Lift::Chip,
                        palette,
                        standing,
                        None,
                    )
                })
                .collect(),
        ),
    }
}

/// Boxes by subject id, in the order they were found.
type Boxed<'edge> = Vec<(&'edge str, Rect)>;

/// Each line's inked box, and each of its words' box.
fn line_boxes(edges: &[Edge]) -> (Boxed<'_>, Boxed<'_>) {
    let inked = edges
        .iter()
        .map(|routed| {
            (
                routed.edge.id.as_str(),
                inflate(
                    curve_bounds(&routed.curve),
                    stroke_width(routed.edge.emphasis) / 2.0,
                ),
            )
        })
        .collect();
    let labelled = edges
        .iter()
        .filter_map(|routed| {
            routed
                .label
                .as_ref()
                .map(|label| (routed.edge.id.as_str(), label.bounds))
        })
        .collect();
    (inked, labelled)
}

/// What the page must hold of a drawing.
fn extent_of(drawing: &Painted, standings: &Standings, unsettled: &Unsettled) -> Option<Rect> {
    let (inked, labelled) = line_boxes(&drawing.bridged.edges);
    let mut boxes: Vec<Rect> = drawing
        .drawing
        .cards
        .iter()
        .chain(&drawing.drawing.containers)
        .map(|node| {
            let id = &node.measured.node.id;
            marked_box(node.bounds, standings.of(id), unsettled.of(id))
        })
        .collect();
    boxes.extend(inked.iter().chain(&labelled).map(|(_, rect)| *rect));
    boxes.extend(
        drawing
            .drawing
            .regions
            .iter()
            .flatten()
            .map(|region| region.bounds),
    );
    union(boxes)
}

/// The cards drawn as shapes of their own: a flowchart's decisions, loops and terminals.
pub trait Shapes {
    fn has(&self, id: &str) -> bool;
    fn shadow(&self, card: &Node, standing: Option<Standing>) -> Markup;
    fn paint(&self, card: &Node, standing: Option<Standing>, unsettled: bool) -> Markup;
}

/// What an architecture is painted with besides its drawing.
pub struct Vocabulary<'a> {
    pub appearances: &'a BTreeMap<String, NodeAppearance>,
    pub lines: &'a BTreeMap<String, LineAppearance>,
    pub groups: &'a BTreeMap<String, PaletteColor>,
    /// The lines that are flow steps drawn on the board.
    pub steps: HashSet<&'a str>,
    pub far_size: f64,
}

/// The drawing a page is fitted to, and how its subjects stand for the marks it holds.
pub struct HeldPage<'a> {
    pub drawing: &'a Painted,
    pub standings: &'a Standings,
    pub shapes: Option<&'a dyn Shapes>,
    pub card_kind: SubjectKind,
}

/// The line appearance of a relationship.
fn look_of<'a>(vocabulary: &'a Vocabulary, id: &str) -> &'a LineAppearance {
    vocabulary
        .lines
        .get(id)
        .unwrap_or_else(|| panic!("no line appearance for {id}"))
}

/// The final drawing painted, with the atlas from the same boxes.
#[allow(clippy::too_many_arguments)]
pub fn paint_architecture(
    ctx: &Ctx,
    drawing: &Painted,
    palette: &Palette,
    standings: &Standings,
    unsettled: &Unsettled,
    vocabulary: &Vocabulary,
    page: &HeldPage,
) -> PaintedPage {
    let cards = &drawing.drawing.cards;
    let containers = &drawing.drawing.containers;
    let edges = &drawing.bridged.edges;
    let bridges = &drawing.bridged.bridges;
    let removed = |id: &str| standings.of(id) == Some(Standing::Removed);
    let mut cutouts: Vec<Cutout> = crossing_cutouts(edges, bridges);
    cutouts.extend(trunk_cutouts(edges));
    let see_through: Vec<Rect> = edges
        .iter()
        .filter(|routed| removed(&routed.edge.id))
        .filter_map(|routed| routed.label.as_ref().map(|label| label.bounds))
        .collect();
    cutouts.extend(label_cutouts(edges, &see_through));
    let masks = crossing_masks(edges, cutouts);
    let shaped = |id: &str| page.shapes.is_some_and(|shapes| shapes.has(id));
    let ports = ports_of(cards, edges, &|id| !removed(id) && !shaped(id));
    let plan = port_plan(&ports, edges);
    let appearance_of = |id: &str| {
        vocabulary
            .appearances
            .get(id)
            .unwrap_or_else(|| panic!("no appearance for {id}"))
    };
    let (inked, labelled) = line_boxes(edges);
    let traffic_lines: Vec<TrafficLine> = edges
        .iter()
        .filter_map(|routed| {
            let edge = &routed.edge;
            let traffic = edge.traffic?;
            if removed(&edge.id) {
                return None;
            }
            let appearance = look_of(vocabulary, &edge.id);
            let into_ports = ports.of_edge(&edge.id);
            Some(TrafficLine {
                routed,
                traffic,
                head_reach: if ends_in_port(&routed.curve, &into_ports) {
                    0.0
                } else {
                    arrowhead_reach(appearance.arrowhead)
                },
                into: ride_into(&routed.curve, &into_ports),
                ink: quietened(
                    &relationship_ink(palette, standings.of(&edge.id), appearance),
                    palette,
                    edge.emphasis,
                ),
                line_width: stroke_width(edge.emphasis),
            })
        })
        .collect();
    let card_boxes: Vec<(String, Rect)> = cards
        .iter()
        .map(|card| (card.measured.node.id.clone(), card.bounds))
        .collect();
    let traffic = paint_traffic(&traffic_lines, &card_boxes, palette);
    let framed: Vec<(&str, Rect)> = containers
        .iter()
        .map(|node| (node.measured.node.id.as_str(), node.bounds))
        .collect();
    let carded: Vec<(&str, Rect)> = cards
        .iter()
        .map(|node| (node.measured.node.id.as_str(), node.bounds))
        .collect();
    let canvas = canvas_for(
        page.drawing.drawing.width,
        page.drawing.drawing.height,
        extent_of(page.drawing, page.standings, unsettled),
        DIAGRAM_MARGIN,
    );
    let mut boxes: Vec<&Node> = containers.iter().collect();
    boxes.sort_by(|a, b| {
        let depth = a.depth - b.depth;
        let difference = if depth != 0.0 && !depth.is_nan() {
            depth
        } else {
            a.measured.node.order - b.measured.node.order
        };
        difference
            .partial_cmp(&0.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut ordered_cards: Vec<&Node> = cards.iter().collect();
    ordered_cards.sort_by(|a, b| {
        (a.measured.node.order - b.measured.node.order)
            .partial_cmp(&0.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut regions: Vec<_> = drawing.drawing.regions.iter().flatten().collect();
    regions.sort_by(|a, b| {
        (a.depth - b.depth)
            .partial_cmp(&0.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let routes: Vec<&crate::geometry::Curve> = edges.iter().map(|routed| &routed.curve).collect();

    let mut painted: Vec<Markup> = vec![masks.definitions];
    painted.push(if plan.cuts.is_empty() {
        Markup::new()
    } else {
        wrap(
            "defs",
            attrs! {},
            concat(
                plan.cuts
                    .iter()
                    .map(|(_, cut)| cut.markup.clone())
                    .collect(),
            ),
        )
    });
    for held in &boxes {
        let id = &held.measured.node.id;
        painted.push(paint_measured_frame(
            held,
            palette,
            standings.of(id),
            appearance_of(id),
        ));
    }
    for region in regions {
        painted.push(paint_region(
            ctx,
            region,
            palette,
            vocabulary.groups.get(&region.group).copied(),
            vocabulary.far_size,
            &routes,
        ));
    }
    for card in &ordered_cards {
        let id = &card.measured.node.id;
        painted.push(match page.shapes.filter(|shapes| shapes.has(id)) {
            Some(shapes) => shapes.shadow(card, standings.of(id)),
            None => shadow_under(
                id,
                card.bounds,
                SLAB_RADIUS,
                Lift::Card,
                palette,
                standings.of(id),
                None,
            ),
        });
    }
    for routed in edges {
        painted.push(label_shadow(routed, palette, standings.of(&routed.edge.id)));
    }
    for routed in edges {
        let id = &routed.edge.id;
        let slots: Vec<(Port, bool)> = ports
            .by_edge
            .get(id)
            .map(Vec::as_slice)
            .unwrap_or(&[])
            .iter()
            .map(|index| (ports.all[*index], plan.wells.get(index) == Some(id)))
            .collect();
        painted.push(paint_edge_line(
            routed,
            palette,
            standings.of(id),
            look_of(vocabulary, id),
            masks.masks.get(id),
            vocabulary.steps.contains(id.as_str()),
            &slots,
        ));
    }
    let joined: Vec<&Edge> = drawing
        .drawing
        .edges
        .iter()
        .filter(|routed| !removed(&routed.edge.id))
        .collect();
    let inks: Vec<(String, f64)> = joined
        .iter()
        .map(|routed| {
            let edge = &routed.edge;
            let attributes = edge_attributes(
                edge.emphasis,
                palette,
                standings.of(&edge.id),
                look_of(vocabulary, &edge.id),
            );
            (
                attributes
                    .get("stroke")
                    .map(crate::markup::spelt)
                    .unwrap_or_default(),
                stroke_width(edge.emphasis),
            )
        })
        .collect();
    painted.push(junction_marks(&joined, &inks));
    for routed in edges {
        painted.push(traffic.get(&routed.edge.id).cloned().unwrap_or_default());
    }
    for card in &ordered_cards {
        let id = &card.measured.node.id;
        painted.push(match page.shapes.filter(|shapes| shapes.has(id)) {
            Some(shapes) => shapes.paint(card, standings.of(id), unsettled.of(id)),
            None => paint_measured_card(
                ctx,
                card,
                palette,
                standings.of(id),
                unsettled.of(id),
                appearance_of(id),
                plan.cut_of(id).map(|cut| cut.id.as_str()),
                page.card_kind,
            ),
        });
    }
    for routed in edges {
        let id = &routed.edge.id;
        painted.push(paint_edge_words(
            routed,
            palette,
            standings.of(id),
            unsettled.of(id),
            vocabulary.steps.contains(id.as_str()),
        ));
    }
    for held in &boxes {
        let id = &held.measured.node.id;
        painted.push(paint_measured_header(
            ctx,
            held,
            palette,
            standings.of(id),
            unsettled.of(id),
            appearance_of(id),
        ));
    }
    let mut node_entries = carded.clone();
    node_entries.extend(framed.iter().copied());
    let mut edge_entries = inked;
    edge_entries.extend(labelled);
    PaintedPage {
        width: canvas.width,
        height: canvas.height,
        body: shifted(&canvas, lines(painted)),
        atlas: Atlas {
            nodes: atlas_boxes(&node_entries, &canvas),
            edges: atlas_boxes(&edge_entries, &canvas),
            regions: atlas_boxes(&framed, &canvas),
        },
    }
}
