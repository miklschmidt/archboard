//! A line drawn on by the spark at its head, and the card that the spark lands on.
//!
//! A line keeps its spark until it lands, and its arrowhead and ports wait for
//! that moment. The spark then runs both ways round the edge of the card, so a
//! board reads as one current going through its parts.

use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{
    Cap, Colour, Geometry, Group, Item, Paint, Purpose, Role, Shape, Stroke, Token,
};
use kurbo::{ParamCurve as _, ParamCurveArclen as _, ParamCurveNearest as _};

use super::arrive::{Grow, Leave};
use super::circuit::{Span, holder, label_span};
use super::ease::{ease_out, phase};
use super::found::{Form, Found, largest_rect};
use super::line::{end_of, in_flight};
use super::morph::{length, route_of};
use super::phases::Transition;
use super::plan::Mover;
use crate::path::outline_of;

/// How much of a dashed line's drawing it spends fading in.
const DASHED_FADE: f64 = 0.7;

/// The spark at the head of a line being drawn on, in layers: how far each reaches
/// back, how much wider than the line it is, how much of it shows, and how far the
/// line's colour goes toward the text. A pulse goes toward white, which the chalk
/// ground would swallow here (ADR 0027).
const SPARK: [(f64, f64, f64, f64); 3] = [
    (150.0, 7.0, 0.05, 0.25),
    (76.0, 3.0, 0.16, 0.5),
    (26.0, 0.8, 1.0, 0.85),
];

/// Where the spark starts to cool, as a share of its line's drawing.
const SPARK_COOLS_FROM: f64 = 0.82;

/// How long the edge of a card holds the spark that lands on it, as a share of the
/// move.
const RIM_SPAN: f64 = 0.55;

/// How much of a rim's time the spark takes to go round the card.
const RIM_CLOSES: f64 = 0.5;

/// The layers of a rim: how wide each is, and how solid at its brightest.
const RIM: [(f64, f64); 2] = [(5.0, 0.12), (1.5, 0.8)];

/// How far a rim's colour goes toward the text.
const RIM_TOWARD_TEXT: f64 = 0.7;

/// The corners of a rim.
const RIM_CORNER: f64 = 6.0;

/// How far past its card a rim stands.
const RIM_ROOM: f64 = 1.0;

/// How exactly a rim measures its way round a card.
const OUTLINE_ACCURACY: f64 = 0.1;

/// A line that a spark redraws: its old self going, and its new self or its words
/// coming as the spark reaches them.
pub(super) fn redrawn(old: &Found<'_>, new: &Found<'_>, span: Span, phases: Transition) -> Mover {
    let coming = if new.form() == Form::Line {
        Mover::Draw(DrawOn::new(new.group, span, phases.arrowhead_at))
    } else {
        let (start, end) = label_span(span);
        Mover::Grow(Grow::new(new, start, end))
    };
    Mover::Both(
        Box::new(Mover::Leave(Leave::new(old, phases))),
        Box::new(coming),
    )
}

/// A line's colour this far toward the text, or the text itself for a line that
/// is not one colour. The text stands out from the ground on either theme.
fn sparked(paint: &Paint, toward: f64) -> Paint {
    let text = Colour::Token {
        token: Token::DiagramText,
    };
    let lit = match paint {
        Paint::Colour { colour } => Colour::Mix {
            base: Box::new(colour.clone()),
            ink: Box::new(text),
            share: toward,
        },
        _ => text,
    };
    Paint::Colour { colour: lit }
}

/// One layer of the spark at the head of a line.
fn spark(
    shape: &Shape,
    length: f64,
    head: f64,
    (reach, wider, shown, toward): (f64, f64, f64, f64),
) -> Item {
    let mut lit = shape.clone();
    lit.marker = None;
    lit.start_marker = None;
    if let Some(stroke) = &mut lit.stroke {
        let period = reach + length * 2.0;
        stroke.paint = sparked(&stroke.paint, toward);
        stroke.width = Some(stroke.width.unwrap_or(1.0) + wider);
        stroke.opacity = Some(shown);
        stroke.cap = Some(Cap::Round);
        stroke.dashes = vec![reach, length * 2.0];
        stroke.dash_offset = Some((period + reach - head).rem_euclid(period));
    }
    Item::Shape(lit)
}

/// The edge of a card taking the spark that landed on it: the spark runs both ways
/// round from where the line landed, closes on the far side and goes out.
#[derive(Clone, Debug)]
pub(super) struct Rim {
    shape: Shape,
    /// How far along the card's edge the line landed.
    landed: f64,
    /// How long the card's edge is.
    edge: f64,
    start: f64,
}

impl Rim {
    /// Where the rim finishes cooling.
    pub(super) fn end(&self) -> f64 {
        self.start + RIM_SPAN
    }

    /// The rim at a moment of the move: nothing outside its time.
    pub(super) fn at(&self, progress: f64) -> Vec<Item> {
        let lit = phase(progress, self.start, self.start + RIM_SPAN);
        if lit <= 0.0 || lit >= 1.0 {
            return Vec::new();
        }
        let arc = self.edge * ease_out(phase(lit, 0.0, RIM_CLOSES));
        let shown = (1.0 - phase(lit, RIM_CLOSES, 1.0)).powi(2);
        RIM.iter()
            .map(|&(width, solid)| {
                let mut shape = self.shape.clone();
                if let Some(stroke) = &mut shape.stroke {
                    stroke.width = Some(width);
                    stroke.opacity = Some(solid * shown);
                    stroke.dashes = vec![arc, (self.edge - arc).max(0.01)];
                    stroke.dash_offset = Some((arc / 2.0 - self.landed).rem_euclid(self.edge));
                }
                Item::Shape(shape)
            })
            .collect()
    }
}

/// How far along an outline a point stands, and how long the outline is.
fn along_outline(geometry: &Geometry, point: Point) -> (f64, f64) {
    let (outline, _) = outline_of(geometry);
    let point = kurbo::Point::new(point.x, point.y);
    let (mut walked, mut nearest, mut along) = (0.0, f64::INFINITY, 0.0);
    for segment in outline.segments() {
        let near = segment.nearest(point, OUTLINE_ACCURACY);
        if near.distance_sq < nearest {
            nearest = near.distance_sq;
            along = walked + segment.subsegment(0.0..near.t).arclen(OUTLINE_ACCURACY);
        }
        walked += segment.arclen(OUTLINE_ACCURACY);
    }
    (along, walked)
}

/// The paint of the line a group draws.
fn paint_of(group: &Group) -> Option<Paint> {
    group.items.iter().rev().find_map(|item| match item {
        Item::Shape(shape) if route_of(&shape.geometry).is_some() => {
            Some(shape.stroke.as_ref()?.paint.clone())
        }
        _ => None,
    })
}

/// The rims of the cards that a spark lands on: each lights once, with the first
/// line to land there, in that line's colour. A rim goes round a body that a group
/// draws: the atlas's box of a participant's lifeline holds its whole column. It stands
/// with its card, so that it dims with it.
pub(super) fn rims(groups: &[Found<'_>], spans: &[(usize, Span)]) -> Vec<Mover> {
    let bodies: Vec<(Rect, &str)> = groups
        .iter()
        .filter(|group| group.is_card())
        .filter_map(|group| Some((largest_rect(group.group)?, group.id)))
        .collect();
    let cards: Vec<Rect> = bodies.iter().map(|&(card, _)| card).collect();
    let mut first: Vec<Option<(f64, Paint, Point)>> = vec![None; cards.len()];
    for &(at, (_, end)) in spans {
        let group = groups[at].group;
        let landing = end_of(group).map(|(point, _)| point);
        let card = landing.and_then(|point| holder(&cards, point));
        if let (Some(card), Some(point), Some(paint)) = (card, landing, paint_of(group))
            && first[card].as_ref().is_none_or(|(known, ..)| end < *known)
        {
            first[card] = Some((end, paint, point));
        }
    }
    bodies
        .iter()
        .zip(first)
        .filter_map(|(&(card, id), lit)| {
            let (end, paint, point) = lit?;
            let edge = Rect {
                x: card.x - RIM_ROOM,
                y: card.y - RIM_ROOM,
                width: card.width + RIM_ROOM * 2.0,
                height: card.height + RIM_ROOM * 2.0,
            };
            let mut shape = Shape::rect(Purpose::Plate, edge, Some(RIM_CORNER))
                .unfilled()
                .stroked(Stroke::new(sparked(&paint, RIM_TOWARD_TEXT), 1.0));
            shape.members = vec![id.to_owned()];
            let (landed, edge) = along_outline(&shape.geometry, point);
            Some(Mover::Rim(Box::new(Rim {
                shape,
                landed,
                edge,
                start: end,
            })))
        })
        .collect()
}

/// A shape being drawn on, and how long its route is.
#[derive(Clone, Copy, Debug)]
struct Stroked {
    child: usize,
    length: f64,
}

/// The ports of a line, which stand once it has landed.
fn ports_of(group: &Group) -> Vec<Item> {
    group
        .items
        .iter()
        .filter(|item| matches!(item, Item::Group(group) if matches!(group.role, Role::Port)))
        .cloned()
        .collect()
}

/// Draw one route shape, keeping authored dashes and holding back its markers.
fn draw_shape(shape: &mut Shape, length: f64, drawn: f64, arrowhead_at: f64) {
    if let Some(stroke) = &mut shape.stroke {
        if stroke.dashes.is_empty() {
            stroke.dashes = vec![length, length];
            stroke.dash_offset = Some(length * (1.0 - drawn));
        } else {
            let shown = ease_out(phase(drawn, 0.0, DASHED_FADE));
            stroke.opacity = Some(stroke.opacity.unwrap_or(1.0) * shown);
        }
    }
    if drawn < arrowhead_at {
        shape.marker = None;
        shape.start_marker = None;
    }
}

/// A line only the next scene has, drawn on from its start by the spark at its
/// head.
#[derive(Clone, Debug)]
pub(super) struct DrawOn {
    template: Group,
    /// The route shapes, pulled out or faded according to their stroke.
    strokes: Vec<Stroked>,
    /// The shape that the spark runs along.
    head: Option<Stroked>,
    ports: Vec<Item>,
    span: Span,
    arrowhead_at: f64,
}

impl DrawOn {
    /// Prepare to draw a line on between two points of the move.
    ///
    /// A dashed line keeps its dashes: drawing it on means taking its dash away,
    /// so it fades in behind the spark.
    pub(super) fn new(group: &Group, span: Span, arrowhead_at: f64) -> DrawOn {
        let routed = group.items.iter().enumerate().filter_map(|(child, item)| {
            let Item::Shape(shape) = item else {
                return None;
            };
            shape.stroke.as_ref()?;
            let length = length(&route_of(&shape.geometry)?).filter(|length| *length > 0.0)?;
            Some(Stroked { child, length })
        });
        let (mut strokes, mut head) = (Vec::new(), None);
        for stroked in routed {
            head = Some(stroked);
            strokes.push(stroked);
        }
        let mut template = in_flight(group);
        template.mask.clone_from(&group.mask);
        DrawOn {
            template,
            strokes,
            head,
            ports: ports_of(group),
            span,
            arrowhead_at,
        }
    }

    /// Where the line finishes drawing.
    pub(super) fn end(&self) -> f64 {
        self.span.1
    }

    /// The line this far through the move.
    pub(super) fn at(&self, progress: f64) -> Group {
        let drawn = phase(progress, self.span.0, self.span.1);
        let mut group = self.template.clone();
        if drawn >= 1.0 {
            group.items.extend(self.ports.iter().cloned());
            return group;
        }
        if drawn <= 0.0 {
            group.opacity = Some(0.0);
        }
        for &Stroked { child, length } in &self.strokes {
            let Some(Item::Shape(shape)) = group.items.get_mut(child) else {
                continue;
            };
            draw_shape(shape, length, drawn, self.arrowhead_at);
        }
        let cooled = 1.0 - phase(drawn, SPARK_COOLS_FROM, 1.0);
        if let Some(Stroked { child, length }) = self.head
            && let Some(Item::Shape(shape)) = self.template.items.get(child)
        {
            let layers =
                SPARK.map(|(reach, wider, shown, toward)| (reach, wider, shown * cooled, toward));
            group
                .items
                .extend(layers.map(|layer| spark(shape, length, length * drawn, layer)));
        }
        group
    }
}

#[cfg(test)]
mod tests {
    use archboard_scene::geometry::{Point, Rect};
    use archboard_scene::scene::{
        Geometry, Group, Item, Purpose, Role, Shape, Stroke, Subject, SubjectKind, Token,
    };

    use super::super::found::found;
    use super::super::plan::Mover;
    use super::super::testing::{card, line, rect, scene};
    use super::{RIM_CLOSES, RIM_SPAN, Rim, along_outline, rims};

    #[test]
    fn a_line_that_lands_on_a_lifeline_lights_no_rim_round_the_column() {
        let column = rect(0.0, 0.0, 100.0, 400.0);
        let stem = Shape::new(
            Purpose::Line,
            Geometry::Line {
                from: Point { x: 50.0, y: 60.0 },
                to: Point { x: 50.0, y: 400.0 },
            },
        );
        let lifeline = Group::new(Role::Lifeline, vec![Item::Shape(stem)]).drawing(Subject {
            id: "actor".to_owned(),
            kind: SubjectKind::Node,
            standing: None,
        });
        let body = vec![
            Item::Group(lifeline),
            line("m", &[(300.0, 200.0), (50.0, 200.0)]),
        ];
        let board = scene(body, &[("actor", column)]);
        let groups = found(&board);
        assert!(rims(&groups, &[(1, (0.0, 1.0))]).is_empty());
    }

    #[test]
    fn a_rim_stands_with_its_card_and_lights_as_the_line_lands() {
        let body = vec![
            card("c", rect(0.0, 0.0, 100.0, 40.0), &[]),
            line("l", &[(300.0, 20.0), (50.0, 20.0)]),
        ];
        let board = scene(body, &[]);
        let groups = found(&board);
        let lit = rims(&groups, &[(1, (0.0, 0.3))]);
        let [Mover::Rim(rim)] = lit.as_slice() else {
            panic!("one rim")
        };
        assert_eq!(rim.start, 0.3);
        assert_eq!(rim.shape.members, ["c"], "it dims with the card");
    }

    #[test]
    fn a_dashed_line_keeps_its_dashes_and_waits_to_show_its_arrowhead() {
        let Item::Group(mut group) = line("e", &[(0.0, 0.0), (100.0, 0.0)]) else {
            panic!("a line group")
        };
        let Some(Item::Shape(stroke)) = group.items.get_mut(1) else {
            panic!("a stroke")
        };
        stroke.stroke.as_mut().expect("stroked").dashes = vec![4.0, 6.0];
        let draw = super::DrawOn::new(&group, (0.0, 1.0), 0.9);
        let early = draw.at(0.1);
        let Some(Item::Shape(stroke)) = early.items.get(1) else {
            panic!("a stroke")
        };
        assert!(stroke.marker.is_none());
        let ink = stroke.stroke.as_ref().expect("stroked");
        assert_eq!(ink.dashes, [4.0, 6.0]);
        assert!(ink.opacity.is_some_and(|shown| shown > 0.0 && shown < 1.0));
        let landed = draw.at(1.0);
        let Some(Item::Shape(stroke)) = landed.items.get(1) else {
            panic!("a stroke")
        };
        assert!(stroke.marker.is_some());
        assert_eq!(stroke.stroke.as_ref().expect("stroked").opacity, None);
    }

    #[test]
    fn a_rim_opens_from_where_the_line_landed_and_closes_round_the_card() {
        let card = Rect {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 50.0,
        };
        let shape = Shape::rect(Purpose::Plate, card, Some(6.0))
            .unfilled()
            .stroked(Stroke::new(Token::DiagramText, 1.0));
        let (landed, edge) = along_outline(&shape.geometry, Point { x: 100.0, y: 25.0 });
        let start = 0.5;
        let rim = Rim {
            shape,
            landed,
            edge,
            start,
        };
        let dash_at = |share: f64| {
            let items = rim.at(start + RIM_SPAN * share);
            let Some(Item::Shape(shape)) = items.last() else {
                panic!("a rim stands")
            };
            let stroke = shape.stroke.clone().expect("stroked");
            (stroke.dashes[0], stroke.dash_offset.expect("an offset"))
        };
        let (arc, offset) = dash_at(0.1);
        assert!(arc > 0.0 && arc < edge);
        let middle = (arc / 2.0 - offset).rem_euclid(edge);
        assert!((middle - landed).abs() < 1e-6, "it opens both ways");
        assert!((dash_at(RIM_CLOSES).0 - edge).abs() < 1e-6, "it closes");
        assert!(rim.at(start).is_empty(), "not before it lands");
        assert!(rim.at(start + RIM_SPAN).is_empty(), "gone at the end");
    }
}
