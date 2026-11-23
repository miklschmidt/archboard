//! A relationship painted: its route with the arrowhead and halo it is drawn
//! with, its label and warning above all connections, and the shadow its label
//! casts under every line.

use crate::drawing::Emphasis;
use crate::geometry::{Curve, Point, label_anchor_of, reversed};
use crate::paint::Edge;
use crate::paint::appearance::label_look;
use crate::paint::build::{Items, group, grouped, lines, point, route, shape};
use crate::paint::cards::halo;
use crate::paint::colour::{light_dark, translucent};
use crate::paint::heads::{
    ECHELON, IMPRINT_GLOW, IMPRINT_WIDTH, body_short_of, ink_reach, mark_marker,
};
use crate::paint::palette::Palette;
use crate::paint::ports::{Port, at_port, port_inside};
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
use crate::route::{Walk, route_length, shortened_by};
use crate::scene::{
    Cap, Colour, Definition, Geometry, Group, Head, Item, LineFacts, Marker, MarkerId, MaskId,
    PathStep, Purpose, Role, Shape, Stroke, SubjectKind,
};
use crate::sizes::PILL_RADIUS;

/// Width added to a connection's unseen stroke, which takes the pointer. Its
/// label wears the selection ring.
const EDGE_HALO_EXTRA: f64 = 5.0;

/// How far back from a route's end its head's ink reaches.
pub(super) fn arrowhead_reach(head: Head) -> f64 {
    ink_reach(head)
}

/// A mark in one ink as a marker for the end of a line of a weight.
pub(super) fn arrowhead_marker(id: MarkerId, head: Head, ink: &Colour) -> Marker {
    mark_marker(id, head, ink)
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

/// A mutation's imprint: a bar along its target's edge, across the way the
/// line arrives, centred on the line's tip and reaching `reach` to either
/// side. It lies just in front of the edge, the card drawn over the line, so
/// the whole of its width shows, on a glow in its ink. A viewer that moves
/// draws it fading at both ends; a document draws it flat.
fn imprint(curve: &Curve, reach: f64, ink: &Colour) -> Vec<Shape> {
    if reach <= 0.0 {
        return Vec::new();
    }
    let walk = Walk::of(curve);
    let end = walk.stand(walk.length());
    let from = end.turned(-IMPRINT_WIDTH / 2.0, -reach);
    let to = end.turned(-IMPRINT_WIDTH / 2.0, reach);
    let along = |purpose: Purpose, stroke: Stroke| {
        Shape::new(
            purpose,
            Geometry::Line {
                from: point(from.x, from.y),
                to: point(to.x, to.y),
            },
        )
        .unfilled()
        .stroked(stroke)
    };
    let (breadth, light, dark) = IMPRINT_GLOW;
    let glow = light_dark(&translucent(ink, light), &translucent(ink, dark));
    vec![
        along(
            Purpose::Glow,
            Stroke::new(&glow, breadth).capped(Cap::Round),
        ),
        along(
            Purpose::Imprint,
            Stroke::new(ink, IMPRINT_WIDTH).capped(Cap::Butt),
        ),
    ]
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

/// How far back from its end a line stands the mark there: a strand in echelon a mark's
/// length, every other line not at all.
fn set_back(routed: &Edge, mark: Option<Head>) -> f64 {
    if routed.echelon && mark.is_some() {
        ECHELON
    } else {
        0.0
    }
}

/// The bare runs a strand in echelon draws from each mark it sets back on to the end of its
/// route.
fn stubs(
    routed: &Edge,
    (tail, head): (Option<Head>, Option<Head>),
    dash: Dash,
    stroke: &Stroke,
) -> Vec<Items> {
    let length = route_length(&routed.curve);
    [(false, tail), (true, head)]
        .into_iter()
        .map(|(end, mark)| (end, mark, set_back(routed, mark)))
        .filter(|&(_, _, back)| back > 0.0 && length > back)
        .map(|(end, mark, back)| {
            // The caller's ring holds at its centre; the bare run meets its outside.
            let back = if mark == Some(Head::Ring) {
                back - body_short_of(Head::Ring)
            } else {
                back
            };
            let (start, stop) = if end {
                (length - back, 0.0)
            } else {
                (0.0, length - back)
            };
            shape(body(
                &body_between(&routed.curve, start, stop),
                dash,
                stroke,
                Purpose::Line,
            ))
        })
        .collect()
}

/// The standing swipe also leaves a gap where the caller's ring sits in a bare run.
fn swipe_around_ring(routed: &Edge, tail: Option<Head>) -> Option<Vec<PathStep>> {
    if tail != Some(Head::Ring) || !routed.echelon {
        return None;
    }
    let reach = body_short_of(Head::Ring);
    let length = route_length(&routed.curve);
    if length <= ECHELON + reach {
        return None;
    }
    let mut path = route(&body_between(
        &routed.curve,
        0.0,
        length - (ECHELON - reach),
    ));
    path.extend(route(&body_between(&routed.curve, ECHELON + reach, 0.0)));
    Some(path)
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
    let short = |mark: Option<Head>| mark.map_or(0.0, body_short_of) + set_back(routed, mark);
    let thin = thinned(&stroke, look.map_or(1.0, |look| look.body));
    let mut line = body(
        &body_between(&routed.curve, short(tail), short(head)),
        appearance.dash,
        &thin,
        Purpose::Line,
    );
    let mut parts = stubs(routed, (tail, head), appearance.dash, &thin);
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
                definitions: vec![Definition::Marker(arrowhead_marker(id.clone(), mark, &ink))],
            }]);
        }
        id
    };
    line.marker = head.map(&mut marker);
    line.start_marker = tail.map(&mut marker);
    if look.is_some_and(|look| look.imprint) && !step {
        parts.extend(
            imprint(&routed.curve, imprint_reach, &ink)
                .into_iter()
                .map(shape),
        );
    }
    let ring_swipe = standing.and_then(|_| swipe_around_ring(routed, tail));
    parts.push(standing_swipe(
        ring_swipe.as_deref().unwrap_or(&path),
        width,
        standing,
        palette,
    ));
    parts.push(shape(
        Shape::path(Purpose::Halo, path)
            .unfilled()
            .stroked(styles.ring(Some(width + EDGE_HALO_EXTRA)).rounded()),
    ));
    let inside = line.stroke.clone().unwrap_or(stroke);
    parts.push(shape(line));
    for (port, well) in ports {
        // The ink inside a port would run through the centre of the caller's ring.
        let caller_ring = tail == Some(Head::Ring) && at_port(routed.curve.from, port);
        parts.push(port_inside(
            port,
            *well,
            (!caller_ring).then_some(&inside),
            width,
            palette,
        ));
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::Segment;
    use crate::request::{Arrowhead, LineEffect};

    fn strand(echelon: bool) -> Edge {
        Edge {
            echelon,
            edge: crate::drawing::EdgeFacts {
                id: "strand".to_owned(),
                from: "a".to_owned(),
                to: "b".to_owned(),
                kind: "sync".to_owned(),
                effect: None,
                emphasis: Emphasis::Normal,
                traffic: None,
                two_way: false,
            },
            curve: Curve {
                from: Point { x: 0.0, y: 0.0 },
                segments: vec![Segment::Line {
                    to: Point { x: 200.0, y: 0.0 },
                }],
            },
            label: None,
        }
    }

    #[test]
    fn a_strand_in_echelon_sets_its_mark_back_and_runs_on_bare_to_its_end() {
        let marks = (None, Some(Head::Wedge));
        let stroke = Stroke::new(Colour::Black, 1.5);
        assert_eq!(set_back(&strand(true), marks.1), ECHELON);
        assert_eq!(set_back(&strand(true), marks.0), 0.0);
        assert_eq!(stubs(&strand(true), marks, Dash::Solid, &stroke).len(), 1);
        assert_eq!(set_back(&strand(false), marks.1), 0.0);
        assert_eq!(stubs(&strand(false), marks, Dash::Solid, &stroke).len(), 0);
    }

    #[test]
    fn a_strands_bare_run_leaves_its_caller_ring_hollow() {
        let runs = stubs(
            &strand(true),
            (Some(Head::Ring), Some(Head::Eye)),
            Dash::Solid,
            &Stroke::new(Colour::Black, 2.4),
        );
        let [
            Item::Shape(Shape {
                geometry: Geometry::Path { steps },
                ..
            }),
        ] = runs[0].as_slice()
        else {
            panic!("the caller's bare run is a path");
        };
        assert_eq!(
            steps.last(),
            Some(&PathStep::Line {
                to: point(ECHELON - crate::paint::heads::ring_reach(), 0.0),
            }),
        );
    }

    #[test]
    fn a_compared_strand_keeps_its_caller_ring_hollow() {
        let painted = paint_edge_line(
            &strand(true),
            &Palette::of_page(),
            Some(Standing::Added),
            &LineAppearance {
                name: "Sync".to_owned(),
                color: None,
                dash: Dash::Solid,
                arrowhead: Arrowhead::Eye,
                effect: Some(LineEffect::Query),
            },
            None,
            false,
            (&[], 0.0),
        );
        let [Item::Group(line)] = painted.as_slice() else {
            panic!("the strand is a group");
        };
        let steps = line.items.iter().find_map(|item| match item {
            Item::Shape(Shape {
                purpose: Purpose::Swipe,
                geometry: Geometry::Path { steps },
                ..
            }) => Some(steps.as_slice()),
            _ => None,
        });
        let Some(
            [
                _,
                PathStep::Line { to: before },
                PathStep::Move { to: after },
                _,
            ],
        ) = steps
        else {
            panic!("the standing swipe has a gap at the caller ring");
        };
        let reach = crate::paint::heads::ring_reach();
        assert!(before.x <= ECHELON - reach + 0.01);
        assert!(after.x >= ECHELON + reach - 0.01);
    }
}
