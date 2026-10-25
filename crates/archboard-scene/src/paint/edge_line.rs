//! A relationship painted: its route with the arrowhead and halo it is drawn
//! with, its label and warning above all connections, and the shadow its label
//! casts under every line.

use crate::attrs;
use crate::drawing::{Edge, Emphasis};
use crate::geometry::{coord, label_anchor_of};
use crate::markup::{Markup, group, lines, tag, wrap};
use crate::paint::appearance::label_look;
use crate::paint::colour::colour_id;
use crate::paint::design::PILL_RADIUS;
use crate::paint::palette::Palette;
use crate::paint::ports::{Port, port_inside};
use crate::paint::slab::{Lift, shadow_under, slab, slab_seat, slab_shadow};
use crate::paint::standing::{
    PART_ATTRIBUTE, ghost_opacity, standing_palette, standing_swipe, subject, warning_on_line,
};
use crate::paint::styles::{
    HEAD_LENGTH, Head, Styles, drawn_ink, edge_attributes, head_ref_x, head_widths,
    relationship_ink, stroke_width,
};
use crate::paint::text_runs::paint_text_runs;
use crate::request::{LineAppearance, PaletteColor, Standing};
use crate::scene::{Role, SubjectKind};

/// Width added to a connection's invisible selection halo.
const EDGE_HALO_EXTRA: f64 = 5.0;
/// An arrowhead's drawing: a square this many marker units wide.
const MARKER_BOX: f64 = 10.0;
/// How thick the open head's arms are drawn, in marker units.
const OPEN_ARM: f64 = 1.7;

/// How far back from a route's end its arrowhead's ink reaches.
pub(super) fn arrowhead_reach(head: Head) -> f64 {
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
pub(super) fn line_ink(
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
pub(super) fn paint_edge_line(
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
pub(super) fn paint_edge_words(
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
pub(super) fn label_shadow(routed: &Edge, palette: &Palette, standing: Option<Standing>) -> Markup {
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
