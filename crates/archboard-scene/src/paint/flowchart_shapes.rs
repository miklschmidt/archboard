//! The shapes a flowchart draws that are not boxes (ADR 0053): a decision's
//! diamond, a loop's hexagon, and the rounded terminals where a flow starts and
//! ends, each a block of the gold of a primary action.

use std::collections::BTreeMap;
use std::f64::consts::PI;

use crate::attrs;
use crate::drawing::Node;
use crate::geometry::{Point, Rect, coord};
use crate::js;
use crate::markup::{Markup, concat, group, lines, tag, text_node, wrap};
use crate::paint::architecture::Shapes;
use crate::paint::cards::{HALO_INSET, HALO_WIDTH};
use crate::paint::design::CARD_THICKNESS;
use crate::paint::fonts::{PILL_FONT, font_attributes};
use crate::paint::palette::{Palette, token};
use crate::paint::polygon::{Polygon, inset, polygon_path};
use crate::paint::shadow::{SHADOW_REACH, polygon_shadow};
use crate::paint::slab::{SlabLook, shadow_group, solid_ghost, solid_seat, solid_slab};
use crate::paint::standing::{OUTLINE_WIDTH, standing_pin_at, subject, warning_on_line};
use crate::paint::styles::Styles;
use crate::request::{FlowchartShape, ShapedCard, Standing};
use crate::scene::{Role, SubjectKind};

const SHAPE_TEXT_SIZE: f64 = 11.0;
const SHAPE_TEXT_LINE: f64 = 14.0;
const GOLD_FACE_ID: &str = "ab-flow-gold";
const CORNER: f64 = 5.0;
const END_SIDES: u32 = 16;

fn terminal_outline(rect: Rect) -> Polygon {
    let r = rect.height / 2.0;
    let end = |centre: f64, from: f64| -> Vec<Point> {
        (0..=END_SIDES)
            .map(|step| {
                let angle = from + (PI * f64::from(step)) / f64::from(END_SIDES);
                Point {
                    x: centre + r * libm::cos(angle),
                    y: rect.y + r + r * libm::sin(angle),
                }
            })
            .collect()
    };
    let mut outline = end(rect.x + rect.width - r, -PI / 2.0);
    outline.extend(end(rect.x + r, PI / 2.0));
    outline
}

fn outline_of(shape: FlowchartShape, rect: Rect) -> Polygon {
    let Rect {
        x,
        y,
        width,
        height,
    } = rect;
    let middle = y + height / 2.0;
    match shape {
        FlowchartShape::Decision => {
            let centre = x + width / 2.0;
            vec![
                Point { x: centre, y },
                Point {
                    x: x + width,
                    y: middle,
                },
                Point {
                    x: centre,
                    y: y + height,
                },
                Point { x, y: middle },
            ]
        }
        FlowchartShape::Loop => {
            let cut = height / 2.0;
            vec![
                Point { x: x + cut, y },
                Point {
                    x: x + width - cut,
                    y,
                },
                Point {
                    x: x + width,
                    y: middle,
                },
                Point {
                    x: x + width - cut,
                    y: y + height,
                },
                Point {
                    x: x + cut,
                    y: y + height,
                },
                Point { x, y: middle },
            ]
        }
        FlowchartShape::Start | FlowchartShape::End => terminal_outline(rect),
    }
}

fn look_of(shape: FlowchartShape) -> SlabLook {
    SlabLook {
        face: format!("url(#{GOLD_FACE_ID})"),
        ground: None,
        lit: Some(token("--primary-top")),
        edge: token("--primary-edge"),
        thickness: CARD_THICKNESS,
        radius: if shape.is_terminal() { 0.0 } else { CORNER },
        sheen: false,
    }
}

/// The gradient a shape's face is painted with, for the flowchart's definitions.
pub fn flowchart_definitions() -> Markup {
    wrap(
        "defs",
        attrs! {},
        wrap(
            "linearGradient",
            attrs! { "id": GOLD_FACE_ID, "x1": 0.0, "y1": 0.0, "x2": 0.0, "y2": 1.0 },
            concat(vec![
                tag(
                    "stop",
                    attrs! { "offset": 0.0, "stop-color": token("--primary-top") },
                ),
                tag(
                    "stop",
                    attrs! { "offset": 1.0, "stop-color": token("--primary-bottom") },
                ),
            ]),
        ),
    )
}

fn centred_words(rect: Rect, words: &[String], fill: &str) -> Markup {
    let top = rect.y + (rect.height - CARD_THICKNESS) / 2.0
        - (words.len() as f64 * SHAPE_TEXT_LINE) / 2.0;
    concat(
        words
            .iter()
            .enumerate()
            .map(|(index, text)| {
                text_node(
                    attrs! {
                        "x": coord(rect.x + rect.width / 2.0),
                        "y": coord(top + (index as f64 + 0.78) * SHAPE_TEXT_LINE),
                        "text-anchor": "middle",
                        "font-size": SHAPE_TEXT_SIZE,
                    }
                    .with(font_attributes(PILL_FONT))
                    .set("fill", fill),
                    text,
                )
            })
            .collect(),
    )
}

fn side_near(outline: &[Point], corner: Point) -> Point {
    let count = outline.len();
    let middles: Vec<Point> = (0..count)
        .map(|index| {
            let from = outline[index];
            let to = outline[(index + 1) % count];
            Point {
                x: f64::midpoint(from.x, to.x),
                y: f64::midpoint(from.y, to.y),
            }
        })
        .collect();
    middles.iter().skip(1).fold(middles[0], |nearest, middle| {
        if js::hypot(middle.x - corner.x, middle.y - corner.y)
            < js::hypot(nearest.x - corner.x, nearest.y - corner.y)
        {
            *middle
        } else {
            nearest
        }
    })
}

fn ring(outline: &[Point], radius: f64, standing: Option<Standing>, palette: &Palette) -> Markup {
    let by = if standing == Some(Standing::Removed) {
        OUTLINE_WIDTH / 2.0
    } else {
        -HALO_INSET
    };
    tag(
        "path",
        attrs! {
            "class": "ab-halo",
            "d": polygon_path(&inset(outline, by), js::js_max(0.0, radius - by)),
            "stroke-width": HALO_WIDTH,
        }
        .with(Styles::of(palette).halo()),
    )
}

/// The painter of a flowchart's shapes.
#[derive(Debug)]
pub struct FlowchartShapes<'a> {
    pub shapes: &'a BTreeMap<String, ShapedCard>,
    pub palette: &'a Palette,
}

impl Shapes for FlowchartShapes<'_> {
    fn has(&self, id: &str) -> bool {
        self.shapes.contains_key(id)
    }

    fn shadow(&self, card: &Node, standing: Option<Standing>) -> Markup {
        let shaped = &self.shapes[&card.measured.node.id];
        if standing == Some(Standing::Removed) {
            return Markup::new();
        }
        let look = look_of(shaped.shape);
        let cast = polygon_shadow(
            &outline_of(shaped.shape, card.bounds),
            look.radius,
            SHADOW_REACH,
            self.palette,
        );
        let is_step = !shaped.shape.is_terminal();
        shadow_group(
            cast,
            is_step.then_some(card.measured.node.id.as_str()),
            None,
        )
    }

    fn paint(&self, card: &Node, standing: Option<Standing>, unsettled: bool) -> Markup {
        let shaped = &self.shapes[&card.measured.node.id];
        let look = look_of(shaped.shape);
        let palette = self.palette;
        let rect = card.bounds;
        let outline = outline_of(shaped.shape, rect);
        if shaped.shape.is_terminal() {
            return group(
                Role::Shape,
                None,
                attrs! {},
                lines(vec![
                    solid_slab(&outline, &look, palette, None),
                    centred_words(rect, &shaped.words, &token("--primary-foreground")),
                ]),
            );
        }
        let pin = side_near(
            &outline,
            Point {
                x: rect.x,
                y: rect.y,
            },
        );
        let warning = side_near(
            &outline,
            Point {
                x: rect.x + rect.width,
                y: rect.y,
            },
        );
        let ink = if standing == Some(Standing::Removed) {
            palette.muted.to_owned()
        } else {
            token("--primary-foreground")
        };
        group(
            Role::Shape,
            Some(subject(SubjectKind::Step, &card.measured.node.id, standing)),
            attrs! {},
            lines(vec![
                solid_seat(&outline, look.radius),
                if standing == Some(Standing::Removed) {
                    solid_ghost(&outline, look.radius, palette)
                } else {
                    Markup::new()
                },
                ring(&outline, look.radius, standing, palette),
                solid_slab(&outline, &look, palette, standing),
                centred_words(rect, &shaped.words, &ink),
                standing_pin_at(pin.x, pin.y, standing, palette),
                warning_on_line(Some(warning), unsettled, palette),
            ]),
        )
    }
}
