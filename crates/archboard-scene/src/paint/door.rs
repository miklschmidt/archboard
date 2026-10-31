//! A door: a module outside the open frame, drawn as a bright button. It takes
//! the finish of a primary action in its group's colour, or its kind's when it
//! has no group, and that colour stays bright on both themes. Its icon shows its
//! kind. The arrow at its right end says where the door lies in the tree from the
//! open module. This is the one place a door's look lives.

use std::collections::BTreeSet;

use crate::drawing::{DoorWay, Node, TextRun};
use crate::geometry::{Point, Rect, round_coord};
use crate::measure::{DOOR_FAR, tab_runs};
use crate::paint::Ctx;
use crate::paint::build::{Items, concat, grouped, lines, shape};
use crate::paint::cards::halo;
use crate::paint::design::{
    DOOR_ARROW_INSET, DOOR_FAR_ICON, DOOR_HEIGHT, DOOR_ICON, DOOR_PADDING, DOOR_RADIUS,
    ICON_CHIP_SIZE,
};
use crate::paint::far_card::{Part, words_in};
use crate::paint::far_view::{Place, far_layer, moving_words, near_layer, shared_chip};
use crate::paint::icons::glyph_group;
use crate::paint::palette::Palette;
use crate::paint::slab::{
    Lift, across, boxed, shadow_under, slab_seat, slab_shadow, standing_border,
};
use crate::paint::standing::{standing_palette, standing_pin, subject, warning_badge};
use crate::paint::styles::Styles;
use crate::request::{NodeAppearance, PaletteColor, Standing};
use crate::scene::{
    Cap, Colour, Definition, Gradient, GradientForm, GradientId, Group, Paint, PathStep, Pointer,
    Purpose, Role, Shape, Stop, Stroke, Token, Transform,
};

/// How heavy a door's rim is.
const RIM: f64 = 1.0;
/// How far inside the rim a door's highlight and its foot line run.
const LINE_INSET: f64 = 1.2;
/// How strong the highlight along a door's top is.
const HIGHLIGHT: f64 = 0.55;
/// How strong the dark line along a door's foot is.
const FOOT: f64 = 0.22;
/// How heavy a door's arrow is.
const ARROW_WIDTH: f64 = 1.7;
/// How much larger a door's arrow stands from far away.
const FAR_ARROW: f64 = 1.25;

/// The ink of a door: the deep tone of its hue.
const INK_LIGHTNESS: f64 = 0.2;
const INK_CHROMA: f64 = 0.03;

/// The steps from a door's bright colour, in OKLCH lightness and chroma.
const TOP: (f64, f64) = (0.02, 0.02);
const BOTTOM: (f64, f64) = (-0.06, 0.03);
const EDGE: (f64, f64) = (-0.26, -0.02);

/// The colours of a door's finish.
struct Finish {
    top: Colour,
    bottom: Colour,
    rim: Colour,
    ink: Colour,
}

/// A door's colour: its group's if it has one, or else its kind's.
fn colour_of(appearance: &NodeAppearance) -> Option<PaletteColor> {
    appearance.body_color.or(appearance.type_color)
}

/// One step from a bright colour, in OKLCH, so that a hue never turns to brown.
fn step(bright: &Colour, (lightness, chroma): (f64, f64)) -> Colour {
    Colour::Shifted {
        ink: Box::new(bright.clone()),
        lightness,
        chroma,
    }
}

/// The finish of a door of one colour. With no colour it is the primary action's own.
fn finish_of(color: Option<PaletteColor>) -> Finish {
    let Some(color) = color else {
        return Finish {
            top: Token::PrimaryTop.into(),
            bottom: Token::PrimaryBottom.into(),
            rim: Token::PrimaryEdge.into(),
            ink: Token::PrimaryForeground.into(),
        };
    };
    let bright = Colour::Bright { color };
    Finish {
        top: step(&bright, TOP),
        bottom: step(&bright, BOTTOM),
        rim: step(&bright, EDGE),
        ink: Colour::Tone {
            ink: Box::new(bright),
            lightness: INK_LIGHTNESS,
            cap: INK_CHROMA,
            chroma: 1.0,
        },
    }
}

/// The gradient of a door's face in one colour.
fn gradient(color: Option<PaletteColor>) -> Definition {
    let finish = finish_of(color);
    let stop = |offset: f64, colour: Colour| Stop {
        offset: Some(offset),
        colour,
        opacity: None,
    };
    Definition::Gradient(Gradient {
        id: GradientId::Door { color },
        form: GradientForm::Linear {
            line: Some((Point { x: 0.0, y: 0.0 }, Point { x: 0.0, y: 1.0 })),
            user_space: false,
        },
        stops: vec![stop(0.0, finish.top), stop(1.0, finish.bottom)],
    })
}

/// The gradients a picture's doors reach for, each colour once.
pub(super) fn door_definitions<'a>(
    doors: impl Iterator<Item = &'a NodeAppearance>,
) -> Vec<Definition> {
    let colours: BTreeSet<Option<PaletteColor>> = doors.map(colour_of).collect();
    colours.into_iter().map(gradient).collect()
}

/// What a door looks like: a face in its colour's gradient, with a rim, a fine
/// highlight along its top and a dark line along its foot.
fn button(rect: Rect, color: Option<PaletteColor>, finish: &Finish) -> Items {
    let inner = Rect {
        x: rect.x + DOOR_RADIUS,
        width: rect.width - 2.0 * DOOR_RADIUS,
        ..rect
    };
    lines(vec![
        shape(
            Shape::rect(Purpose::Plate, boxed(rect), Some(DOOR_RADIUS))
                .pointer(Pointer::None)
                .filled(Paint::Gradient {
                    id: GradientId::Door { color },
                })
                .stroked(Stroke::new(&finish.rim, RIM)),
        ),
        across(
            inner,
            rect.y + LINE_INSET,
            Stroke::new(&Colour::White, RIM).at(HIGHLIGHT),
        ),
        across(
            inner,
            rect.y + rect.height - LINE_INSET,
            Stroke::new(&Colour::Black, RIM).at(FOOT),
        ),
    ])
}

/// The arrow of a door, about the origin: which way the door lies in the tree.
fn arrow_steps(way: DoorWay) -> Vec<PathStep> {
    let turned = |x: f64, y: f64| match way {
        DoorWay::Up => Point { x, y },
        DoorWay::Across => Point { x: -y, y: x },
        DoorWay::Down => Point { x, y: -y },
    };
    vec![
        PathStep::Move {
            to: turned(0.0, 6.0),
        },
        PathStep::Line {
            to: turned(0.0, -6.0),
        },
        PathStep::Move {
            to: turned(-4.5, -1.5),
        },
        PathStep::Line {
            to: turned(0.0, -6.0),
        },
        PathStep::Line {
            to: turned(4.5, -1.5),
        },
    ]
}

/// A door's arrow at the right end of its box.
fn arrow(rect: Rect, way: DoorWay, ink: &Colour, scale: f64) -> Items {
    grouped(
        Group::new(
            Role::DoorArrow,
            shape(
                Shape::path(Purpose::Line, arrow_steps(way))
                    .unfilled()
                    .stroked(Stroke::new(ink, ARROW_WIDTH).rounded().capped(Cap::Round)),
            ),
        )
        .pointer(Pointer::None)
        .moved(Transform {
            x: round_coord(rect.x + rect.width - DOOR_ARROW_INSET),
            y: round_coord(rect.y + rect.height / 2.0),
            scale: (scale != 1.0).then(|| round_coord(scale)),
        }),
    )
}

/// What a door draws near and far: its icon both views share, its name and its arrow.
fn views(
    ctx: &Ctx<'_>,
    runs: (&[TextRun], &[TextRun]),
    rect: Rect,
    (way, ink): (DoorWay, &Colour),
    appearance: &NodeAppearance,
    palette: &Palette,
) -> Items {
    let inked = Palette {
        foreground: ink.clone(),
        muted: ink.clone(),
        ..palette.clone()
    };
    let near = words_in(runs.0, rect, &inked);
    let far = words_in(runs.1, rect, &inked);
    let place = |size: f64| Place {
        x: rect.x + DOOR_PADDING,
        y: rect.y + (DOOR_HEIGHT - size) / 2.0,
        size,
    };
    let middle = ICON_CHIP_SIZE / 2.0;
    lines(vec![
        shared_chip(
            glyph_group(
                &appearance.icon,
                middle,
                middle,
                ink,
                ctx.icons,
                ICON_CHIP_SIZE,
            ),
            place(DOOR_ICON),
            place(DOOR_FAR_ICON),
        ),
        near_layer(concat(vec![
            moving_words(near.items, near.anchor, far.anchor),
            arrow(rect, way, ink, 1.0),
        ])),
        far_layer(concat(vec![
            moving_words(far.items, far.anchor, near.anchor),
            arrow(rect, way, ink, FAR_ARROW),
        ])),
    ])
}

/// The shadow that seats a door.
pub(super) fn door_shadow(
    id: &str,
    rect: Rect,
    palette: &Palette,
    standing: Option<Standing>,
) -> Items {
    shadow_under(id, rect, DOOR_RADIUS, Lift::Chip, palette, standing, None)
}

/// One door, with its seat, its ring, its face, its words and its standing's marks.
pub(super) fn paint_door(
    ctx: &Ctx<'_>,
    placed: &Node,
    way: DoorWay,
    part: &Part<'_>,
    palette: &Palette,
) -> Items {
    let Part {
        rect,
        standing,
        appearance,
        ..
    } = *part;
    let color = colour_of(appearance);
    let finish = finish_of(color);
    let removed = standing == Some(Standing::Removed);
    let ink = if removed {
        standing_palette(palette, standing).foreground
    } else {
        finish.ink.clone()
    };
    let far = tab_runs(DOOR_FAR, &part.node.name, None);
    let drawn = if removed {
        slab_shadow(rect, DOOR_RADIUS, Lift::Card, palette, standing)
    } else {
        lines(vec![
            button(rect, color, &finish),
            standing_border(rect, DOOR_RADIUS, standing, palette),
        ])
    };
    grouped(
        Group::new(
            Role::Card(Box::new(appearance.clone())),
            lines(vec![
                slab_seat(rect, DOOR_RADIUS),
                halo(rect, DOOR_RADIUS, &Styles::of(palette), standing),
                drawn,
                views(
                    ctx,
                    (&placed.measured.runs, &far),
                    rect,
                    (way, &ink),
                    appearance,
                    palette,
                ),
                standing_pin(rect, standing, palette),
                warning_badge(rect, part.unsettled, palette),
            ]),
        )
        .drawing(subject(part.kind, &part.node.id, standing)),
    )
}
