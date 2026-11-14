//! The symbol a legend entry stands beside: a comparison's pin, a part kind's
//! chip, a relationship's line and head, and the two things a line says beside
//! its kind, its emphasis and its traffic, each drawn as the picture draws it.

use crate::drawing::Emphasis;
use crate::geometry::{Point, Rect, round_coord};
use crate::paint::appearance::semantic_ink;
use crate::paint::build::{Items, grouped, lines, point, shape};
use crate::paint::design::ICON_CHIP_SIZE;
use crate::paint::design::RAILS;
use crate::paint::edge_line::arrowhead;
use crate::paint::legend::entries::{Applied, Drawn, Entry, Keys};
use crate::paint::palette::Palette;
use crate::paint::standing::standing_pin_at;
use crate::paint::styles::{HEAD_LENGTH, RAIL_GAP, dash_array, drawn_ink, head_of, stroke_width};
use crate::paint::traffic::pulse_look;
use crate::request::{Arrowhead, Dash};
use crate::scene::traffic::pulse_breadth;
use crate::scene::{
    Cap, Colour, Definition, Gradient, GradientForm, GradientId, Group, Head, Icon, Item, PathStep,
    Purpose, Role, Shape, Stop, Stroke, Transform, Viewport,
};

/// The height of one legend row.
pub(super) const ROW: f64 = 28.0;
/// The width of the symbol at the start of a legend row.
pub(super) const GLYPH: f64 = 30.0;
const PULSE_STOPS: [(f64, f64); 6] = [
    (0.0, 0.0),
    (0.35, 0.05),
    (0.6, 0.2),
    (0.78, 0.5),
    (0.9, 1.0),
    (1.0, 0.0),
];
const PULSE_SPAN: f64 = 40.0;
/// A kind's chip in the legend, as the reading panel draws it (`KindChip` in
/// `apps/web`): how round, how thick its edge, how much of the kind's ink its
/// face and its edge carry, and how large its icon.
const LEGEND_CHIP_RADIUS: f64 = 4.0;
const LEGEND_CHIP_EDGE: f64 = 1.0;
const LEGEND_CHIP_FACE: f64 = 0.14;
const LEGEND_CHIP_STROKE: f64 = 0.45;
const LEGEND_ICON_SIZE: f64 = 16.0;
const PULSE_GLOW: f64 = 3.0;

/// A straight run across a symbol's row, from one left edge to another.
fn run_across(from: f64, y: f64, to: f64) -> Vec<PathStep> {
    vec![
        PathStep::Move {
            to: point(from, y + ROW / 2.0),
        },
        PathStep::Across { x: round_coord(to) },
    ]
}

/// A round-capped stroke across a symbol's row, stopping `end` short of its right edge.
fn line_at(x: f64, y: f64, stroke: Stroke, end: f64) -> Items {
    shape(
        Shape::path(Purpose::Sample, run_across(x + 1.0, y, x + GLYPH - end))
            .unfilled()
            .stroked(stroke.capped(Cap::Round)),
    )
}

/// A relationship kind's symbol: a short line in its ink and dash, with the
/// arrowhead its lines end in.
fn relationship_symbol(applied: &Applied, palette: &Palette, x: f64, y: f64) -> Items {
    let (color, dash, ends) = match &applied.drawn {
        Drawn::Line(facts) => (
            facts.appearance.color,
            facts.appearance.dash,
            facts.appearance.arrowhead,
        ),
        Drawn::Part(_) => (None, Dash::Solid, Arrowhead::Filled),
    };
    let named = semantic_ink(color);
    let ink = drawn_ink(
        named.as_ref().unwrap_or(&palette.edge),
        palette,
        Emphasis::Normal,
    );
    let head = HEAD_LENGTH;
    let tip = x + GLYPH - 1.0;
    let shown = head_of(ends);
    let sample = Stroke::new(&ink, stroke_width(Emphasis::Normal)).dashed(dash_array(dash));
    let stop = if shown == Some(Head::Filled) {
        1.0 + head / 2.0
    } else {
        1.0
    };
    let rail = (RAILS - RAIL_GAP) / 2.0;
    let run = if dash == Dash::Mixed {
        let beside = f64::midpoint(RAIL_GAP, rail);
        let stroke = Stroke::new(&ink, rail);
        lines(vec![
            line_at(x, y - beside, stroke.clone(), stop),
            line_at(x, y + beside, stroke, stop),
        ])
    } else {
        line_at(x, y, sample, stop)
    };
    lines(vec![
        run,
        match shown {
            None => Items::new(),
            Some(shown) => vec![Item::Viewport(Viewport {
                frame: Rect {
                    x: round_coord(tip - head),
                    y: round_coord(y + ROW / 2.0 - head / 2.0),
                    width: head,
                    height: head,
                },
                view: Rect {
                    x: 0.0,
                    y: 0.0,
                    width: 10.0,
                    height: 10.0,
                },
                items: shape(arrowhead(shown, &ink)),
            })],
        },
    ])
}

/// A part kind's symbol: the flat chip the reading panel keys a kind with, a
/// face and a hairline edge tinted by the kind's ink, and its icon in that ink.
/// The icon is the one the picture drew, redrawn at the chip's size and ink:
/// a door or a container's header draws the same icon larger and in another ink.
fn kind_symbol(applied: &Applied, palette: &Palette, x: f64, y: f64) -> Items {
    let color = match &applied.drawn {
        Drawn::Part(appearance) => appearance.type_color,
        Drawn::Line(_) => None,
    };
    let ink = semantic_ink(color).unwrap_or_else(|| palette.glyph.clone());
    let left = x + (GLYPH - ICON_CHIP_SIZE) / 2.0;
    let top = y + (ROW - ICON_CHIP_SIZE) / 2.0;
    let mut chip = Shape::rect(
        Purpose::Box,
        Rect {
            x: round_coord(left + LEGEND_CHIP_EDGE / 2.0),
            y: round_coord(top + LEGEND_CHIP_EDGE / 2.0),
            width: ICON_CHIP_SIZE - LEGEND_CHIP_EDGE,
            height: ICON_CHIP_SIZE - LEGEND_CHIP_EDGE,
        },
        Some(LEGEND_CHIP_RADIUS),
    )
    .filled(&ink)
    .stroked(Stroke::new(&ink, LEGEND_CHIP_EDGE).at(LEGEND_CHIP_STROKE));
    chip.fill_opacity = Some(LEGEND_CHIP_FACE);
    let icons = applied.icon.iter().map(|drawn| {
        Item::Icon(Icon {
            name: drawn.name.clone(),
            size: LEGEND_ICON_SIZE,
            ink: ink.clone(),
        })
    });
    let inset = (ICON_CHIP_SIZE - LEGEND_ICON_SIZE) / 2.0;
    let glyph = grouped(
        Group::new(Role::Icon(None), icons.collect()).moved(Transform::translate(
            round_coord(left + inset),
            round_coord(top + inset),
        )),
    );
    let mut symbol = shape(chip);
    symbol.extend(glyph);
    symbol
}

/// A line drawn with more emphasis.
fn emphasis_symbol(palette: &Palette, x: f64, y: f64) -> Items {
    line_at(
        x,
        y,
        Stroke::new(
            drawn_ink(&palette.edge, palette, Emphasis::Hero),
            stroke_width(Emphasis::Hero),
        ),
        1.0,
    )
}

/// A line with a pulse on it, held still.
fn traffic_symbol(palette: &Palette, x: f64, y: f64) -> Items {
    let width = stroke_width(Emphasis::Normal);
    let plain = Stroke::new(drawn_ink(&palette.edge, palette, Emphasis::Normal), width);
    let light: Colour = pulse_look(&palette.edge, width, palette).head;
    let front = x + GLYPH / 2.0 + PULSE_SPAN / 2.0;
    let run = run_across(front - PULSE_SPAN, y, front);
    let gradient = Gradient {
        id: GradientId::LegendPulse,
        form: GradientForm::Linear {
            line: Some((
                Point {
                    x: round_coord(front - PULSE_SPAN),
                    y: 0.0,
                },
                Point {
                    x: round_coord(front),
                    y: 0.0,
                },
            )),
            user_space: true,
        },
        stops: PULSE_STOPS
            .iter()
            .map(|(offset, opacity)| Stop {
                offset: Some(*offset),
                colour: light.clone(),
                opacity: Some(*opacity),
            })
            .collect(),
    };
    let pulse = |breadth: f64| Stroke::new(GradientId::LegendPulse, breadth);
    vec![Item::Viewport(Viewport {
        frame: Rect {
            x: round_coord(x),
            y: round_coord(y),
            width: GLYPH,
            height: ROW,
        },
        view: Rect {
            x: round_coord(x),
            y: round_coord(y),
            width: GLYPH,
            height: ROW,
        },
        items: lines(vec![
            vec![Item::Definitions {
                definitions: vec![Definition::Gradient(gradient)],
            }],
            line_at(x, y, plain, 1.0),
            shape(
                Shape::path(Purpose::Sample, run.clone())
                    .unfilled()
                    .stroked(pulse(pulse_breadth(width) + PULSE_GLOW).at(0.25)),
            ),
            shape(
                Shape::path(Purpose::Sample, run)
                    .unfilled()
                    .stroked(pulse(pulse_breadth(width))),
            ),
        ]),
    })]
}

/// The symbol an entry stands beside.
pub(super) fn symbol_of(entry: &Entry, palette: &Palette, x: f64, y: f64) -> Items {
    match &entry.keys {
        Keys::Mark(standing, _) => {
            standing_pin_at(x + GLYPH / 2.0, y + ROW / 2.0, Some(*standing), palette)
        }
        Keys::Kind(applied) => kind_symbol(applied, palette, x, y),
        Keys::Relationship(applied) => relationship_symbol(applied, palette, x, y),
        Keys::Emphasis => emphasis_symbol(palette, x, y),
        Keys::Traffic => traffic_symbol(palette, x, y),
    }
}
