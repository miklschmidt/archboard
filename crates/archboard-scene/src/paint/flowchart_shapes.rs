//! The shapes a flowchart draws that are not boxes (ADR 0053): a decision's
//! diamond, a loop's hexagon, and the rounded terminals where a flow starts and
//! ends, each a block of the gold of a primary action; and the markers at the
//! ends of a jump (ADR 0073), each jump in an ink of its own.

use std::collections::BTreeMap;
use std::f64::consts::PI;

use crate::drawing::Node;
use crate::geometry::{Point, Rect};
use crate::js;
use crate::paint::build::{Items, concat, group, lines, point, shape, text};
use crate::paint::cards::{HALO_INSET, HALO_WIDTH};
use crate::paint::design::{
    CARD_THICKNESS, JUMP_FONT, JUMP_TEXT_SIZE, PILL_FONT, SHAPE_TEXT_LINE, SHAPE_TEXT_SIZE,
};
use crate::paint::palette::Palette;
use crate::paint::polygon::{Polygon, inset, polygon_path};
use crate::paint::shadow::{SHADOW_REACH, polygon_shadow};
use crate::paint::slab::{SlabLook, shadow_group, solid_ghost, solid_seat, solid_slab};
use crate::paint::standing::{OUTLINE_WIDTH, standing_pin_at, subject, warning_on_line};
use crate::paint::styles::Styles;
use crate::request::{FlowchartShape, JumpEnd, PaletteColor, ShapedCard, Standing};
use crate::scene::{
    Colour, Definition, Gradient, GradientForm, GradientId, Paint, Purpose, Role, Shape, Stop,
    SubjectKind, Text, Token,
};

const CORNER: f64 = 5.0;
const END_SIDES: u32 = 16;
/// How round a jump tag's corners are.
const TAG_CORNER: f64 = 3.0;
/// How far along a jump tag its sides run, as a share of its length, before
/// they meet in its point.
const TAG_SHOULDER: f64 = 0.55;
/// How much darker a jump marker's front edge is than its face, in OKLCH lightness.
const JUMP_EDGE: f64 = -0.12;
/// How far below a capital's middle its baseline stands, as a share of its
/// size: half the height of an Onest capital.
const CAP_MIDDLE: f64 = 0.36;

/// A terminal's outline: a box with a half circle at each end, each half drawn in `END_SIDES` steps.
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

/// A jump out's outline: a tag whose point is the way its line went on.
fn tag_outline(end: JumpEnd, rect: Rect) -> Polygon {
    let Rect {
        x,
        y,
        width,
        height,
    } = rect;
    let at = |x, y| Point { x, y };
    if end == JumpEnd::OutRight {
        let shoulder = x + width * TAG_SHOULDER;
        return vec![
            at(x, y),
            at(shoulder, y),
            at(x + width, y + height / 2.0),
            at(shoulder, y + height),
            at(x, y + height),
        ];
    }
    let shoulder = y + height * TAG_SHOULDER;
    vec![
        at(x, y),
        at(x + width, y),
        at(x + width, shoulder),
        at(x + width / 2.0, y + height),
        at(x, shoulder),
    ]
}

/// A shape's outline in its box: a diamond for a decision, a hexagon for a loop,
/// a rounded pill for a start or an end, a tag for a jump out and a disc for a
/// jump in.
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
        FlowchartShape::Start
        | FlowchartShape::End
        | FlowchartShape::Jump {
            end: JumpEnd::In, ..
        } => terminal_outline(rect),
        FlowchartShape::Jump { end, .. } => tag_outline(end, rect),
    }
}

/// The face of each jump in turn, and the ink of the letter on it: black on
/// the light theme and white on the dark one, then rose, lime, orange and
/// indigo. Lime and orange take their bright values on the light theme too.
fn jump_inks(number: u32) -> (Colour, Colour) {
    let themed = |light: Colour, dark: Colour| Colour::LightDark {
        light: Box::new(light),
        dark: Box::new(dark),
    };
    let bright = |color| themed(Colour::Bright { color }, Colour::palette(color));
    match number % 5 {
        0 => (
            themed(Colour::Black, Colour::White),
            themed(Colour::White, Colour::Black),
        ),
        1 => (Colour::palette(PaletteColor::Rose), Colour::White),
        2 => (bright(PaletteColor::Lime), Colour::Black),
        3 => (bright(PaletteColor::Orange), Colour::Black),
        _ => (Colour::palette(PaletteColor::Indigo), Colour::White),
    }
}

/// How a shape's slab looks: a gold face with the primary edge, its corners
/// rounded but for a terminal's, whose outline is already round; a jump's in
/// the ink of its jump, a tag's corners rounded less.
fn look_of(shape: FlowchartShape) -> SlabLook {
    let gold = SlabLook {
        face: Paint::from(GradientId::FlowGold),
        soft: false,
        lit: Token::PrimaryTop.into(),
        edge: Token::PrimaryEdge.into(),
        thickness: CARD_THICKNESS,
        radius: CORNER,
        sheen: false,
    };
    match shape {
        FlowchartShape::Decision | FlowchartShape::Loop => gold,
        FlowchartShape::Start | FlowchartShape::End => SlabLook {
            radius: 0.0,
            ..gold
        },
        FlowchartShape::Jump { end, number } => {
            let (face, _) = jump_inks(number);
            SlabLook {
                face: Paint::from(face.clone()),
                lit: face.clone(),
                edge: Colour::Shifted {
                    ink: Box::new(face),
                    lightness: JUMP_EDGE,
                    chroma: 0.0,
                },
                radius: if end == JumpEnd::In { 0.0 } else { TAG_CORNER },
                ..gold
            }
        }
    }
}

/// A jump's letter, centred on the body of its marker: a disc's face above
/// its front edge, a tag's square part and a third of its point.
fn jump_letter(end: JumpEnd, rect: Rect, words: &[String], fill: &Colour) -> Items {
    let point_share = (1.0 - TAG_SHOULDER) / 3.0;
    let (centre, body) = match end {
        JumpEnd::OutDown => (
            rect.x + rect.width / 2.0,
            rect.height * (TAG_SHOULDER + point_share),
        ),
        JumpEnd::OutRight => (
            rect.x + rect.width * (TAG_SHOULDER + point_share) / 2.0,
            rect.height - CARD_THICKNESS,
        ),
        JumpEnd::In => (rect.x + rect.width / 2.0, rect.height - CARD_THICKNESS),
    };
    let baseline = rect.y + body / 2.0 + JUMP_TEXT_SIZE * CAP_MIDDLE;
    concat(
        words
            .iter()
            .map(|letter| {
                text(
                    Text::set(
                        point(centre, baseline),
                        JUMP_FONT,
                        JUMP_TEXT_SIZE,
                        fill.clone(),
                        letter,
                    )
                    .centred(),
                )
            })
            .collect(),
    )
}

/// One stop of the gold.
fn gold(offset: f64, token: Token) -> Stop {
    Stop {
        offset: Some(offset),
        colour: token.into(),
        opacity: None,
    }
}

/// The gradient a shape's face is painted with, for the flowchart's definitions.
pub(super) fn flowchart_definitions() -> Vec<Definition> {
    vec![Definition::Gradient(Gradient {
        id: GradientId::FlowGold,
        form: GradientForm::Linear {
            line: Some((Point { x: 0.0, y: 0.0 }, Point { x: 0.0, y: 1.0 })),
            user_space: false,
        },
        stops: vec![
            gold(0.0, Token::PrimaryTop),
            gold(1.0, Token::PrimaryBottom),
        ],
    })]
}

/// A shape's lines of words, centred on its face above its front edge.
fn centred_words(rect: Rect, words: &[String], fill: &Colour) -> Items {
    let top = rect.y + (rect.height - CARD_THICKNESS) / 2.0
        - (words.len() as f64 * SHAPE_TEXT_LINE) / 2.0;
    concat(
        words
            .iter()
            .enumerate()
            .map(|(index, line)| {
                text(
                    Text::set(
                        point(
                            rect.x + rect.width / 2.0,
                            top + (index as f64 + 0.78) * SHAPE_TEXT_LINE,
                        ),
                        PILL_FONT,
                        SHAPE_TEXT_SIZE,
                        fill.clone(),
                        line,
                    )
                    .centred(),
                )
            })
            .collect(),
    )
}

/// The middle of the outline's side nearest a corner, the first such side on a tie.
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

/// The selection ring round an outline: outside it, or inside it on a removed shape.
pub(super) fn ring(
    outline: &[Point],
    radius: f64,
    standing: Option<Standing>,
    palette: &Palette,
) -> Items {
    let by = if standing == Some(Standing::Removed) {
        OUTLINE_WIDTH / 2.0
    } else {
        -HALO_INSET
    };
    shape(
        Shape::path(
            Purpose::Ring,
            polygon_path(&inset(outline, by), js::js_max(0.0, radius - by)),
        )
        .unfilled()
        .stroked(Styles::of(palette).ring(Some(HALO_WIDTH))),
    )
}

/// The painter of a flowchart's shapes.
#[derive(Debug)]
pub(super) struct FlowchartShapes<'a> {
    /// The cards drawn as shapes of their own, by id.
    pub shapes: &'a BTreeMap<String, ShapedCard>,
    /// The palette the shapes are inked from.
    pub palette: &'a Palette,
}

impl FlowchartShapes<'_> {
    /// Whether a card is drawn as one of these shapes.
    pub(super) fn has(&self, id: &str) -> bool {
        self.shapes.contains_key(id)
    }

    /// The shadow under a card drawn as its shape.
    pub(super) fn shadow(&self, card: &Node, standing: Option<Standing>) -> Items {
        let shaped = &self.shapes[&card.measured.node.id];
        if standing == Some(Standing::Removed) {
            return Items::new();
        }
        let look = look_of(shaped.shape);
        let cast = polygon_shadow(
            &outline_of(shaped.shape, card.bounds),
            look.radius,
            SHADOW_REACH,
            self.palette,
        );
        shadow_group(
            cast,
            shaped
                .shape
                .is_step()
                .then_some(card.measured.node.id.as_str()),
            None,
        )
    }

    /// A card drawn as its shape, with how it stands against the variant it came from.
    pub(super) fn paint(&self, card: &Node, standing: Option<Standing>, unsettled: bool) -> Items {
        let shaped = &self.shapes[&card.measured.node.id];
        let look = look_of(shaped.shape);
        let palette = self.palette;
        let rect = card.bounds;
        let outline = outline_of(shaped.shape, rect);
        let foreground = Colour::from(Token::PrimaryForeground);
        if !shaped.shape.is_step() {
            let words = match shaped.shape {
                FlowchartShape::Jump { end, number } => {
                    jump_letter(end, rect, &shaped.words, &jump_inks(number).1)
                }
                _ => centred_words(rect, &shaped.words, &foreground),
            };
            return group(
                Role::Shape,
                None,
                lines(vec![solid_slab(&outline, &look, palette, None), words]),
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
            palette.muted.clone()
        } else {
            foreground
        };
        group(
            Role::Shape,
            Some(subject(SubjectKind::Step, &card.measured.node.id, standing)),
            lines(vec![
                solid_seat(&outline, look.radius),
                if standing == Some(Standing::Removed) {
                    solid_ghost(&outline, look.radius, palette)
                } else {
                    Items::new()
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
