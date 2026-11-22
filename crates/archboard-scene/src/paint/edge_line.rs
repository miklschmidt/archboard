//! A relationship painted: its route with the arrowhead and halo it is drawn
//! with, its label and warning above all connections, and the shadow its label
//! casts under every line.

use crate::drawing::Emphasis;
use crate::geometry::{Curve, Point, label_anchor_of, reversed};
use crate::paint::Edge;
use crate::paint::appearance::label_look;
use crate::paint::build::{Items, group, grouped, lines, point, route, shape};
use crate::paint::cards::halo;
use crate::paint::heads::{body_short_of, ink_reach, mark_marker};
use crate::paint::palette::Palette;
use crate::paint::ports::{Port, port_inside};
use crate::paint::slab::{Lift, shadow_under, slab, slab_seat, slab_shadow};
use crate::paint::standing::{
    ghost_opacity, standing_palette, standing_swipe, subject, warning_on_line,
};
use crate::paint::styles::{
    Styles, dash_array, drawn_ink, edge_stroke, effect_look, head_of, relationship_ink,
    stroke_width, thinned,
};
use crate::paint::text_runs::paint_text_runs;
use crate::request::{Dash, LineAppearance, Standing};
use crate::route::{Walk, shortened_by};
use crate::scene::{
    Cap, Colour, Definition, Geometry, Group, Head, Item, LineFacts, Marker, MarkerId, MaskId,
    Purpose, Role, Shape, Stroke, SubjectKind,
};
use crate::sizes::PILL_RADIUS;

/// Width added to a connection's unseen stroke, which takes the pointer. Its
/// label wears the selection ring.
const EDGE_HALO_EXTRA: f64 = 5.0;
/// How thick a mutation's imprint on its target's edge is drawn.
const IMPRINT_WIDTH: f64 = 2.0;
/// How far a mutation's imprint reaches along its target's edge to either side
/// of the tip, where the edge has room: a little wider than its wedge.
pub(super) const IMPRINT_REACH: f64 = 7.0;

/// How far back from a route's end its head's ink reaches.
pub(super) fn arrowhead_reach(head: Head) -> f64 {
    ink_reach(head)
}

/// A mark in one ink as a marker for the end of a line of a weight.
pub(super) fn arrowhead_marker(id: MarkerId, head: Head, weight: Emphasis, ink: &Colour) -> Marker {
    mark_marker(id, head, weight, ink)
}

/// The route with its body cut short of its marks: by `end` at its end and by
/// `start` at its start, so a mark that stands clear of the body has its room.
fn body_between(curve: &Curve, start: f64, end: f64) -> Curve {
    let ended = if end > 0.0 {
        shortened_by(curve, end).unwrap_or_else(|| curve.clone())
    } else {
        curve.clone()
    };
    if start > 0.0 {
        shortened_by(&reversed(&ended), start)
            .map(|cut| reversed(&cut))
            .unwrap_or(ended)
    } else {
        ended
    }
}

/// A mutation's imprint: a short bar along its target's edge, centred on the
/// line's tip and across the way the line arrives, reaching `reach` to either
/// side. A viewer that moves draws it fading at both ends with a soft glow;
/// a document draws it flat.
fn imprint(curve: &Curve, reach: f64, ink: &Colour) -> Option<Shape> {
    let walk = Walk::of(curve);
    let end = walk.stand(walk.length());
    (reach > 0.0).then(|| {
        let from = end.turned(0.0, -reach);
        let to = end.turned(0.0, reach);
        Shape::new(
            Purpose::Imprint,
            Geometry::Line {
                from: point(from.x, from.y),
                to: point(to.x, to.y),
            },
        )
        .unfilled()
        .stroked(Stroke::new(ink, IMPRINT_WIDTH).capped(Cap::Butt))
    })
}

/// The subject kind a drawn line is: a flow step drawn on the picture, or a relationship.
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

/// A line's body along its route, stroked and broken by its line type's dashes.
pub(super) fn body(curve: &Curve, dash: Dash, stroke: &Stroke, purpose: Purpose) -> Shape {
    Shape::path(purpose, route(curve))
        .unfilled()
        .stroked(stroke.clone().dashed(dash_array(dash)))
}

/// One final route, its head, its halo and the insides of the ports it runs into.
pub(super) fn paint_edge_line(
    routed: &Edge,
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &LineAppearance,
    mask: Option<&MaskId>,
    step: bool,
    (ports, imprint_reach): (&[(Port, bool)], f64),
) -> Items {
    let edge = &routed.edge;
    let styles = Styles::of(palette);
    let weight = edge.emphasis;
    let width = stroke_width(weight);
    let stroke = edge_stroke(weight, palette, standing, appearance);
    let ink = line_ink(palette, standing, appearance, weight);
    let head = head_of(appearance.arrowhead);
    let look = appearance.effect.map(effect_look);
    let tail = if edge.two_way {
        head
    } else {
        look.and_then(|look| look.tail)
    };
    let path = route(&routed.curve);
    let short = |mark: Option<Head>| mark.map_or(0.0, body_short_of);
    let mut line = body(
        &body_between(&routed.curve, short(tail), short(head)),
        appearance.dash,
        &thinned(&stroke, look.map_or(1.0, |look| look.body)),
        Purpose::Line,
    );
    let mut parts = Vec::new();
    let mut defined = Vec::new();
    let mut marker = |mark: Head| {
        let id = MarkerId::Line {
            head: mark,
            weight,
            ink: ink.clone(),
        };
        if !defined.contains(&id) {
            defined.push(id.clone());
            parts.push(vec![Item::Definitions {
                definitions: vec![Definition::Marker(arrowhead_marker(
                    id.clone(),
                    mark,
                    weight,
                    &ink,
                ))],
            }]);
        }
        id
    };
    line.marker = head.map(&mut marker);
    line.start_marker = tail.map(&mut marker);
    if look.is_some_and(|look| look.imprint) && !step {
        parts.extend(imprint(&routed.curve, imprint_reach, &ink).map(shape));
    }
    parts.push(standing_swipe(&path, width, standing, palette));
    parts.push(shape(
        Shape::path(Purpose::Halo, path)
            .unfilled()
            .stroked(styles.ring(Some(width + EDGE_HALO_EXTRA)).rounded()),
    ));
    let inside = line.stroke.clone().unwrap_or(stroke);
    parts.push(shape(line));
    for (port, well) in ports {
        parts.push(port_inside(port, *well, &inside, width, palette));
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
            let styles = Styles::of(palette);
            let mut parts = vec![
                slab_seat(label.bounds, PILL_RADIUS),
                halo(label.bounds, PILL_RADIUS, &styles, standing),
            ];
            // A removed label's ghost; a label's shadow lies under the lines (`label_shadow`).
            if standing == Some(Standing::Removed) {
                parts.push(slab_shadow(
                    label.bounds,
                    PILL_RADIUS,
                    Lift::Chip,
                    palette,
                    standing,
                ));
            }
            parts.push(slab(
                label.bounds,
                &label_look(palette),
                palette,
                standing,
                None,
            ));
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
        Some(label) => shadow_under(
            &routed.edge.id,
            label.bounds,
            PILL_RADIUS,
            Lift::Chip,
            palette,
            standing,
            None,
        ),
    }
}
