//! A relationship painted: its route with the arrowhead and halo it is drawn
//! with, its label and warning above all connections, and the shadow its label
//! casts under every line.

use crate::drawing::{Edge, Emphasis};
use crate::geometry::{Point, label_anchor_of, round_coord};
use crate::paint::appearance::label_look;
use crate::paint::build::{Items, group, grouped, lines, route, shape};
use crate::paint::design::PILL_RADIUS;
use crate::paint::palette::Palette;
use crate::paint::ports::{Port, port_inside};
use crate::paint::slab::{Lift, shadow_under, slab, slab_seat, slab_shadow};
use crate::paint::standing::{
    ghost_opacity, standing_palette, standing_swipe, subject, warning_on_line,
};
use crate::paint::styles::{
    HEAD_LENGTH, Styles, drawn_ink, edge_stroke, head_of, head_ref_x, head_widths,
    relationship_ink, stroke_width,
};
use crate::paint::text_runs::paint_text_runs;
use crate::request::{LineAppearance, Standing};
use crate::scene::{
    Colour, Definition, Group, Head, Item, LineFacts, Marker, MarkerId, MaskId, PathStep, Purpose,
    Role, Shape, Stroke, SubjectKind,
};

/// Width added to a connection's invisible selection halo.
const EDGE_HALO_EXTRA: f64 = 5.0;
/// An arrowhead's drawing: a square this many marker units wide.
const MARKER_BOX: f64 = 10.0;
/// How thick the open head's arms are drawn, in marker units.
pub(super) const OPEN_ARM: f64 = 1.7;

/// How far back from a route's end its arrowhead's ink reaches.
pub(super) fn arrowhead_reach(head: Head) -> f64 {
    let back = match head {
        Head::Open => 2.0 - OPEN_ARM / 2.0,
        Head::Filled => 0.0,
    };
    ((head_ref_x(head) - back) * HEAD_LENGTH) / MARKER_BOX
}

/// A point of an arrowhead's square.
const fn at(x: f64, y: f64) -> Point {
    Point { x, y }
}

/// The outline of an arrowhead in its ten-unit square: closed for a filled
/// head, two arms for an open one.
pub(super) fn head_outline(head: Head) -> Vec<PathStep> {
    match head {
        Head::Filled => vec![
            PathStep::Move { to: at(0.0, 0.0) },
            PathStep::Line { to: at(10.0, 5.0) },
            PathStep::Line { to: at(0.0, 10.0) },
            PathStep::Close,
        ],
        Head::Open => vec![
            PathStep::Move { to: at(2.0, 1.0) },
            PathStep::Line { to: at(10.0, 5.0) },
            PathStep::Line { to: at(2.0, 9.0) },
        ],
    }
}

/// An arrowhead in one ink, drawn in its marker's ten-unit square.
pub(super) fn arrowhead(head: Head, ink: &Colour) -> Shape {
    let outline = Shape::path(Purpose::Arrowhead, head_outline(head));
    match head {
        Head::Filled => outline.filled(ink),
        Head::Open => outline
            .unfilled()
            .stroked(Stroke::new(ink, OPEN_ARM).rounded()),
    }
}

/// An arrowhead marker in one ink, sized in widths of its line's stroke.
pub(super) fn arrowhead_marker(id: MarkerId, head: Head, weight: Emphasis, ink: &Colour) -> Marker {
    Marker {
        id,
        view: MARKER_BOX,
        reference: at(head_ref_x(head), MARKER_BOX / 2.0),
        size: round_coord(head_widths(weight)),
        shapes: vec![arrowhead(head, ink)],
    }
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
) -> Colour {
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
    mask: Option<&MaskId>,
    step: bool,
    ports: &[(Port, bool)],
) -> Items {
    let edge = &routed.edge;
    let styles = Styles::of(palette);
    let weight = edge.emphasis;
    let width = stroke_width(weight);
    let stroke = edge_stroke(weight, palette, standing, appearance);
    let ink = line_ink(palette, standing, appearance, weight);
    let head = head_of(appearance.arrowhead);
    let path = route(&routed.curve);
    let mut line = Shape::path(Purpose::Line, path.clone())
        .unfilled()
        .stroked(stroke.clone());
    let mut parts = Vec::new();
    if let Some(head) = head {
        let id = MarkerId::Line {
            head,
            weight,
            ink: ink.clone(),
        };
        line.marker = Some(id.clone());
        parts.push(vec![Item::Definitions {
            definitions: vec![Definition::Marker(arrowhead_marker(id, head, weight, &ink))],
        }]);
    }
    parts.push(standing_swipe(&path, width, standing, palette));
    parts.push(shape(
        Shape::path(Purpose::Halo, path)
            .unfilled()
            .stroked(styles.ring(Some(width + EDGE_HALO_EXTRA)).rounded()),
    ));
    parts.push(shape(line));
    for (port, well) in ports {
        parts.push(port_inside(port, *well, &stroke, width, palette));
    }
    grouped(Group {
        opacity: ghost_opacity(standing),
        mask: mask.cloned(),
        ..Group::new(
            Role::Line(Some(Box::new(LineFacts {
                appearance: appearance.clone(),
                kind: edge.kind.clone(),
            }))),
            lines(parts),
        )
        .drawing(subject(line_kind(step), &edge.id, standing))
    })
}

/// A relationship's label and warning, above all connections.
pub(super) fn paint_edge_words(
    routed: &Edge,
    palette: &Palette,
    standing: Option<Standing>,
    unsettled: bool,
    step: bool,
) -> Items {
    let at = match &routed.label {
        None => label_anchor_of(&routed.curve),
        Some(label) => Point {
            x: label.bounds.x,
            y: label.bounds.y + label.bounds.height / 2.0,
        },
    };
    let badge = warning_on_line(Some(at), unsettled, palette);
    let pill = match &routed.label {
        None => Items::new(),
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
        return Items::new();
    }
    group(
        Role::Label,
        Some(subject(line_kind(step), &routed.edge.id, standing)),
        lines(vec![pill, badge]),
    )
}

/// The shadow a relationship's label casts, under every line.
pub(super) fn label_shadow(routed: &Edge, palette: &Palette, standing: Option<Standing>) -> Items {
    match &routed.label {
        None => Items::new(),
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
