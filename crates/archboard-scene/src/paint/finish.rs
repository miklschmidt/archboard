//! The bright finish of a door and of a group's tag: one recipe. A colour takes
//! its dark value on both themes, and every step from it is in OKLCH, so that a
//! hue never turns to brown.

use std::collections::BTreeSet;

use crate::geometry::Point;
use crate::request::PaletteColor;
use crate::scene::{Colour, Definition, Gradient, GradientForm, GradientId, Stop, Token};

/// The ink on a finish: the deep tone of its hue.
const INK_LIGHTNESS: f64 = 0.2;
const INK_CHROMA: f64 = 0.03;

/// The steps from a bright colour, in OKLCH lightness and chroma.
const TOP: (f64, f64) = (0.02, 0.02);
const BOTTOM: (f64, f64) = (-0.06, 0.03);
const EDGE: (f64, f64) = (-0.26, -0.02);

/// The colours of a finish.
pub(super) struct Finish {
    pub top: Colour,
    pub bottom: Colour,
    pub rim: Colour,
    pub ink: Colour,
}

/// One step from a bright colour.
fn step(bright: &Colour, (lightness, chroma): (f64, f64)) -> Colour {
    Colour::Shifted {
        ink: Box::new(bright.clone()),
        lightness,
        chroma,
    }
}

/// The finish of one colour. With no colour it is the primary action's own.
pub(super) fn finish_of(color: Option<PaletteColor>) -> Finish {
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

/// The gradient of a face in one colour.
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

/// The gradients a picture reaches for, each colour once.
pub(super) fn finish_definitions(
    colours: impl Iterator<Item = Option<PaletteColor>>,
) -> Vec<Definition> {
    let colours: BTreeSet<Option<PaletteColor>> = colours.collect();
    colours.into_iter().map(gradient).collect()
}
