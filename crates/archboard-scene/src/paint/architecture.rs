//! A complete architecture drawing painted. Placement, wrapping and routing
//! are already settled; the atlas comes from the same boxes.

use std::collections::{BTreeMap, HashMap, HashSet};

use crate::attrs;
use crate::drawing::{DrawingRegion, Edge, Emphasis, Node, Painted};
use crate::geometry::{
    Curve, Rect, canvas_for, coord, curve_bounds, inflate, label_anchor_of, union,
};
use crate::markup::{Markup, concat, group, lines, tag, wrap};
use crate::paint::Ctx;
use crate::paint::appearance::label_look;
use crate::paint::colour::colour_id;
use crate::paint::crossings::{
    Cutout, Masks, crossing_cutouts, crossing_masks, label_cutouts, trunk_cutouts,
};
use crate::paint::design::{DIAGRAM_MARGIN, PILL_RADIUS, SLAB_RADIUS};
use crate::paint::far_card::Part;
use crate::paint::junctions::junction_marks;
use crate::paint::measured_cards::{
    paint_measured_card, paint_measured_frame, paint_measured_header,
};
use crate::paint::page::{PaintedPage, atlas_boxes, shifted};
use crate::paint::palette::Palette;
use crate::paint::ports::{
    Port, PortPlan, Ports, ends_in_port, port_inside, port_plan, ports_of, ride_into,
};
use crate::paint::regions::paint_region;
use crate::paint::slab::{Lift, shadow_under, slab, slab_seat, slab_shadow};
use crate::paint::standing::{
    PART_ATTRIBUTE, Standings, Unsettled, ghost_opacity, marked_box, standing_palette,
    standing_swipe, subject, warning_on_line,
};
use crate::paint::styles::{
    HEAD_LENGTH, Head, Styles, drawn_ink, edge_attributes, head_ref_x, head_widths, quietened,
    relationship_ink, stroke_width,
};
use crate::paint::text_runs::paint_text_runs;
use crate::paint::traffic::{TrafficLine, paint_traffic};
use crate::request::{LineAppearance, NodeAppearance, PaletteColor, Standing};
use crate::scene::{Atlas, Role, SubjectKind};

/// Width added to a connection's invisible selection halo.
const EDGE_HALO_EXTRA: f64 = 5.0;
/// An arrowhead's drawing: a square this many marker units wide.
const MARKER_BOX: f64 = 10.0;
/// How thick the open head's arms are drawn, in marker units.
const OPEN_ARM: f64 = 1.7;

/// How far back from a route's end its arrowhead's ink reaches.
fn arrowhead_reach(head: Head) -> f64 {
    let back = match head {
        Head::Open => 2.0 - OPEN_ARM / 2.0,
        Head::Filled => 0.0,
    };
    ((head_ref_x(head) - back) * HEAD_LENGTH) / MARKER_BOX
}

/// An arrowhead marker in one ink, in SVG's proportional stroke-width units.
pub(super) fn arrowhead_marker(id: &str, head: Head, weight: Emphasis, ink: &str) -> Markup {
    let side = coord(head_widths(weight));
    let shape = match head {
        Head::Filled => tag("path", attrs! { "d": "M0,0 L10,5 L0,10 z", "fill": ink }),
        Head::Open => tag(
            "path",
            attrs! {
                "d": "M2,1 L10,5 L2,9",
                "fill": "none",
                "stroke": ink,
                "stroke-width": OPEN_ARM,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
            },
        ),
    };
    wrap(
        "marker",
        attrs! {
            "id": id,
            "viewBox": format!("0 0 {} {}", crate::js::number(MARKER_BOX), crate::js::number(MARKER_BOX)),
            "refX": head_ref_x(head),
            "refY": MARKER_BOX / 2.0,
            "markerWidth": side.as_str(),
            "markerHeight": side.as_str(),
            "orient": "auto-start-reverse",
        },
        shape,
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

/// The ink a relationship's line, its arrowhead and its junction marks are drawn in.
fn line_ink(
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &LineAppearance,
    weight: Emphasis,
) -> String {
    drawn_ink(
        &relationship_ink(palette, standing, appearance),
        palette,
        weight,
    )
}

/// One final route, its head, its halo and the insides of the ports it runs into.
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
    let weight = edge.emphasis;
    let ink = line_ink(palette, standing, appearance, weight);
    let marker_id = format!(
        "edge-head-{}-{}-{}",
        appearance.arrowhead.as_str(),
        weight.as_str(),
        colour_id(&ink)
    );
    let head = Head::of(appearance.arrowhead);
    let mut parts = vec![
        head.map_or_else(Markup::new, |head| {
            wrap(
                "defs",
                attrs! {},
                arrowhead_marker(&marker_id, head, weight, &ink),
            )
        }),
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
                "marker-end": head.map(|_| format!("url(#{marker_id})")),
            }
            .with(attributes.clone()),
        ),
    ];
    for (port, well) in ports {
        parts.push(port_inside(port, *well, attributes.clone(), width, palette));
    }
    group(
        Role::Line,
        Some(subject(line_kind(step), &edge.id, standing)),
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
        Some(subject(line_kind(step), &routed.edge.id, standing)),
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
pub(super) trait Shapes {
    /// Whether a card is drawn as one of these shapes.
    fn has(&self, id: &str) -> bool;
    /// The shadow under a card drawn as its shape.
    fn shadow(&self, card: &Node, standing: Option<Standing>) -> Markup;
    /// A card drawn as its shape, with how it stands against the variant it came from.
    fn paint(&self, card: &Node, standing: Option<Standing>, unsettled: bool) -> Markup;
}

/// What an architecture is painted with besides its drawing.
pub(super) struct Vocabulary<'a> {
    pub appearances: &'a BTreeMap<String, NodeAppearance>,
    pub lines: &'a BTreeMap<String, LineAppearance>,
    pub groups: &'a BTreeMap<String, PaletteColor>,
    /// The lines that are flow steps drawn on the board.
    pub steps: HashSet<&'a str>,
    pub far_size: f64,
}

/// The drawing a page is fitted to and how its subjects stand for the marks it
/// holds, and, on a flowchart, the shapes its cards are drawn as.
pub(super) struct HeldPage<'a> {
    pub drawing: &'a Painted,
    pub standings: &'a Standings,
    pub shapes: Option<&'a dyn Shapes>,
}

/// Two numbers in ascending order, a number that is not one tied with every other.
fn ascending(a: f64, b: f64) -> std::cmp::Ordering {
    a.partial_cmp(&b).unwrap_or(std::cmp::Ordering::Equal)
}

/// The line appearance of a relationship.
fn look_of<'a>(vocabulary: &'a Vocabulary<'_>, id: &str) -> &'a LineAppearance {
    vocabulary
        .lines
        .get(id)
        .unwrap_or_else(|| panic!("no line appearance for {id}"))
}

/// One architecture being painted: its drawing, what it is painted with, and
/// what its layers share: the masks that hide crossings, and the ports with
/// the plan of how they are drawn.
struct Painting<'p> {
    ctx: &'p Ctx<'p>,
    drawing: &'p Painted,
    palette: &'p Palette,
    standings: &'p Standings,
    unsettled: &'p Unsettled,
    vocabulary: &'p Vocabulary<'p>,
    page: &'p HeldPage<'p>,
    masks: Masks,
    ports: Ports,
    plan: PortPlan,
}

/// The order a page draws its boxes in: containers by depth, then cards and
/// group regions.
struct Stacked<'p> {
    containers: Vec<&'p Node>,
    cards: Vec<&'p Node>,
    regions: Vec<&'p DrawingRegion>,
}

impl<'p> Stacked<'p> {
    /// A drawing's boxes in the order they are painted: containers shallowest
    /// first, then the board's order, cards in the board's order, and regions
    /// shallowest first.
    fn of(drawing: &'p Painted) -> Stacked<'p> {
        let mut containers: Vec<&Node> = drawing.drawing.containers.iter().collect();
        containers.sort_by(|a, b| {
            ascending(a.depth, b.depth)
                .then_with(|| ascending(a.measured.node.order, b.measured.node.order))
        });
        let mut cards: Vec<&Node> = drawing.drawing.cards.iter().collect();
        cards.sort_by(|a, b| ascending(a.measured.node.order, b.measured.node.order));
        let mut regions: Vec<&DrawingRegion> = drawing.drawing.regions.iter().flatten().collect();
        regions.sort_by(|a, b| ascending(a.depth, b.depth));
        Stacked {
            containers,
            cards,
            regions,
        }
    }
}

impl<'p> Painting<'p> {
    /// Read what every layer shares: the masks that cut lines where they cross or
    /// meet a label, and the ports of the cards neither removed nor drawn as shapes.
    fn new(
        ctx: &'p Ctx<'p>,
        drawing: &'p Painted,
        palette: &'p Palette,
        (standings, unsettled): (&'p Standings, &'p Unsettled),
        vocabulary: &'p Vocabulary<'p>,
        page: &'p HeldPage<'p>,
    ) -> Painting<'p> {
        let edges = &drawing.bridged.edges;
        let removed = |id: &str| standings.of(id) == Some(Standing::Removed);
        let mut cutouts: Vec<Cutout> = crossing_cutouts(edges, &drawing.bridged.bridges);
        cutouts.extend(trunk_cutouts(edges));
        let see_through: Vec<Rect> = edges
            .iter()
            .filter(|routed| removed(&routed.edge.id))
            .filter_map(|routed| routed.label.as_ref().map(|label| label.bounds))
            .collect();
        cutouts.extend(label_cutouts(edges, &see_through));
        let masks = crossing_masks(edges, cutouts);
        let shaped = |id: &str| page.shapes.is_some_and(|shapes| shapes.has(id));
        let ports = ports_of(&drawing.drawing.cards, edges, &|id| {
            !removed(id) && !shaped(id)
        });
        let plan = port_plan(&ports, edges);
        Painting {
            ctx,
            drawing,
            palette,
            standings,
            unsettled,
            vocabulary,
            page,
            masks,
            ports,
            plan,
        }
    }

    /// Whether the comparison removes a subject.
    fn removed(&self, id: &str) -> bool {
        self.standings.of(id) == Some(Standing::Removed)
    }

    /// How a part looks. Every part drawn has an appearance, so a missing one is a broken request.
    fn appearance_of(&self, id: &str) -> &'p NodeAppearance {
        self.vocabulary
            .appearances
            .get(id)
            .unwrap_or_else(|| panic!("no appearance for {id}"))
    }

    /// The shapes that draw a card of its own, if the card is one of theirs.
    fn shapes_of(&self, id: &str) -> Option<&'p dyn Shapes> {
        self.page.shapes.filter(|shapes| shapes.has(id))
    }

    /// The traffic a relationship carries, as the traffic painter reads it:
    /// none on a removed line.
    fn traffic_line(&self, routed: &'p Edge) -> Option<TrafficLine<'p>> {
        let edge = &routed.edge;
        let traffic = edge.traffic.filter(|_| !self.removed(&edge.id))?;
        let appearance = look_of(self.vocabulary, &edge.id);
        let into_ports = self.ports.of_edge(&edge.id);
        let head_reach = Head::of(appearance.arrowhead)
            .filter(|_| !ends_in_port(&routed.curve, &into_ports))
            .map_or(0.0, arrowhead_reach);
        Some(TrafficLine {
            routed,
            traffic,
            head_reach,
            into: ride_into(&routed.curve, &into_ports),
            ink: quietened(
                &relationship_ink(self.palette, self.standings.of(&edge.id), appearance),
                self.palette,
                edge.emphasis,
            ),
            line_width: stroke_width(edge.emphasis),
        })
    }

    /// The clips of the cards a port's well cuts into.
    fn cuts(&self) -> Markup {
        if self.plan.cuts.is_empty() {
            return Markup::new();
        }
        let cuts = self.plan.cuts.iter().map(|(_, cut)| cut.markup.clone());
        wrap("defs", attrs! {}, concat(cuts.collect()))
    }

    /// A container's tray, before anything inside it.
    fn frame(&self, held: &Node) -> Markup {
        let id = &held.measured.node.id;
        paint_measured_frame(
            held,
            self.palette,
            self.standings.of(id),
            self.appearance_of(id),
        )
    }

    /// A group's region, its caption kept clear of the routes.
    fn region(&self, region: &DrawingRegion, routes: &[&Curve]) -> Markup {
        let color = self.vocabulary.groups.get(&region.group).copied();
        let far_size = self.vocabulary.far_size;
        paint_region(self.ctx, region, self.palette, color, far_size, routes)
    }

    /// The shadow under a card: its shape's own, or the slab's.
    fn card_shadow(&self, card: &Node) -> Markup {
        let id = &card.measured.node.id;
        let standing = self.standings.of(id);
        match self.shapes_of(id) {
            Some(shapes) => shapes.shadow(card, standing),
            None => shadow_under(
                id,
                card.bounds,
                SLAB_RADIUS,
                Lift::Card,
                self.palette,
                standing,
                None,
            ),
        }
    }

    /// A relationship's line, with the ports it runs into and the masks that cut it.
    fn edge_line(&self, routed: &Edge) -> Markup {
        let id = &routed.edge.id;
        let slots: Vec<(Port, bool)> = self
            .ports
            .by_edge
            .get(id)
            .map(Vec::as_slice)
            .unwrap_or_default()
            .iter()
            .map(|index| {
                (
                    self.ports.all[*index],
                    self.plan.wells.get(index) == Some(id),
                )
            })
            .collect();
        paint_edge_line(
            routed,
            self.palette,
            self.standings.of(id),
            look_of(self.vocabulary, id),
            self.masks.masks.get(id),
            self.vocabulary.steps.contains(id.as_str()),
            &slots,
        )
    }

    /// The marks where lines join, each in its line's ink, removed lines left out.
    fn junctions(&self) -> Markup {
        let joined: Vec<(&Edge, String)> = self
            .drawing
            .drawing
            .edges
            .iter()
            .filter(|routed| !self.removed(&routed.edge.id))
            .map(|routed| {
                let edge = &routed.edge;
                let ink = line_ink(
                    self.palette,
                    self.standings.of(&edge.id),
                    look_of(self.vocabulary, &edge.id),
                    edge.emphasis,
                );
                (routed, ink)
            })
            .collect();
        junction_marks(&joined)
    }

    /// A card: its shape when it is drawn as one, else its slab with its words,
    /// clipped where a port's well cuts into it.
    fn card(&self, card: &Node) -> Markup {
        let id = &card.measured.node.id;
        let (standing, unsettled) = (self.standings.of(id), self.unsettled.of(id));
        if let Some(shapes) = self.shapes_of(id) {
            return shapes.paint(card, standing, unsettled);
        }
        // A flowchart's cards are its steps.
        let kind = if self.page.shapes.is_some() {
            SubjectKind::Step
        } else {
            SubjectKind::Node
        };
        let part = Part {
            kind,
            node: &card.measured.node,
            rect: card.bounds,
            appearance: self.appearance_of(id),
            standing,
            unsettled,
        };
        let cut = self.plan.cut_of(id).map(|cut| cut.id.as_str());
        paint_measured_card(self.ctx, card, &part, self.palette, cut)
    }

    /// A relationship's words on their plate.
    fn edge_words(&self, routed: &Edge) -> Markup {
        let id = &routed.edge.id;
        paint_edge_words(
            routed,
            self.palette,
            self.standings.of(id),
            self.unsettled.of(id),
            self.vocabulary.steps.contains(id.as_str()),
        )
    }

    /// A container's header slab with its name and responsibility, painted over its contents.
    fn header(&self, held: &Node) -> Markup {
        let id = &held.measured.node.id;
        paint_measured_header(
            self.ctx,
            held,
            self.palette,
            self.standings.of(id),
            self.unsettled.of(id),
            self.appearance_of(id),
        )
    }

    /// Every layer of the picture, bottom to top.
    fn layers(&self, stacked: &Stacked<'_>, traffic: &HashMap<String, Markup>) -> Vec<Markup> {
        let edges = &self.drawing.bridged.edges;
        let routes: Vec<&Curve> = edges.iter().map(|routed| &routed.curve).collect();
        let mut painted: Vec<Markup> = vec![self.masks.definitions.clone(), self.cuts()];
        painted.extend(stacked.containers.iter().map(|held| self.frame(held)));
        painted.extend(
            stacked
                .regions
                .iter()
                .map(|region| self.region(region, &routes)),
        );
        painted.extend(stacked.cards.iter().map(|card| self.card_shadow(card)));
        painted.extend(
            edges.iter().map(|routed| {
                label_shadow(routed, self.palette, self.standings.of(&routed.edge.id))
            }),
        );
        painted.extend(edges.iter().map(|routed| self.edge_line(routed)));
        painted.push(self.junctions());
        painted.extend(
            edges
                .iter()
                .map(|routed| traffic.get(&routed.edge.id).cloned().unwrap_or_default()),
        );
        painted.extend(stacked.cards.iter().map(|card| self.card(card)));
        painted.extend(edges.iter().map(|routed| self.edge_words(routed)));
        painted.extend(stacked.containers.iter().map(|held| self.header(held)));
        painted
    }
}

/// The final drawing painted, with the atlas from the same boxes.
pub(super) fn paint_architecture(
    ctx: &Ctx<'_>,
    drawing: &Painted,
    palette: &Palette,
    standings: &Standings,
    unsettled: &Unsettled,
    vocabulary: &Vocabulary<'_>,
    page: &HeldPage<'_>,
) -> PaintedPage {
    let painting = Painting::new(
        ctx,
        drawing,
        palette,
        (standings, unsettled),
        vocabulary,
        page,
    );
    let edges = &drawing.bridged.edges;
    let traffic_lines: Vec<TrafficLine<'_>> = edges
        .iter()
        .filter_map(|routed| painting.traffic_line(routed))
        .collect();
    let carded: Vec<(&str, Rect)> = drawing
        .drawing
        .cards
        .iter()
        .map(|node| (node.measured.node.id.as_str(), node.bounds))
        .collect();
    let traffic = paint_traffic(&traffic_lines, &carded, palette);
    let framed: Vec<(&str, Rect)> = drawing
        .drawing
        .containers
        .iter()
        .map(|node| (node.measured.node.id.as_str(), node.bounds))
        .collect();
    let canvas = canvas_for(
        page.drawing.drawing.width,
        page.drawing.drawing.height,
        extent_of(page.drawing, page.standings, unsettled),
        DIAGRAM_MARGIN,
    );
    let painted = painting.layers(&Stacked::of(drawing), &traffic);
    let (inked, labelled) = line_boxes(edges);
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
