//! The bright finish of a door and of a group's tag: one recipe. On the dark theme
//! a colour is bright under dark ink. On the light theme it stands at one deeper
//! lightness under white ink tinted with its hue, so every colour holds that ink.
//! Every step from a colour is in OKLCH, so that a hue never turns to brown.

use std::collections::BTreeSet;

use crate::geometry::Point;
use crate::paint::colour::light_dark;
use crate::request::PaletteColor;
use crate::scene::{Colour, Definition, Gradient, GradientForm, GradientId, Stop, Token};

/// The ink on a finish: the deep tone of its hue.
const INK: (f64, f64) = (0.2, 0.03);

/// The steps from a bright colour on the dark theme, in OKLCH lightness and chroma.
const TOP: (f64, f64) = (0.02, 0.02);
const BOTTOM: (f64, f64) = (-0.06, 0.03);
const EDGE: (f64, f64) = (-0.26, -0.02);
const RULE: (f64, f64) = (-0.24, 0.0);

/// The tones of a colour on the light theme, each a lightness and a chroma cap.
const LIGHT_TOP: (f64, f64) = (0.66, 0.2);
const LIGHT_BOTTOM: (f64, f64) = (0.58, 0.2);
const LIGHT_EDGE: (f64, f64) = (0.46, 0.17);
const LIGHT_INK: (f64, f64) = (0.985, 0.018);
const LIGHT_RULE: (f64, f64) = (0.82, 0.11);

/// How far down a neutral face falls, in OKLCH lightness and chroma.
const NEUTRAL_BOTTOM: (f64, f64) = (-0.05, 0.0);

/// The colours of a finish.
pub(super) struct Finish {
    pub top: Colour,
    pub bottom: Colour,
    pub rim: Colour,
    pub ink: Colour,
    /// The rule that parts a door's arrow from its control.
    pub rule: Colour,
}

/// One step from a bright colour.
fn step(bright: &Colour, (lightness, chroma): (f64, f64)) -> Colour {
    Colour::Shifted {
        ink: Box::new(bright.clone()),
        lightness,
        chroma,
    }
}

/// One tone of a bright colour.
fn tone(bright: &Colour, (lightness, cap): (f64, f64)) -> Colour {
    Colour::Tone {
        ink: Box::new(bright.clone()),
        lightness,
        cap,
        chroma: 1.0,
    }
}

/// The finish of one colour. With no colour it stands in a card's own tone: such
/// a part claims no kin, and gold stays with what is chosen.
pub(super) fn finish_of(color: Option<PaletteColor>) -> Finish {
    let Some(color) = color else {
        return Finish {
            top: Token::SlabFace.into(),
            bottom: step(&Token::SlabFace.into(), NEUTRAL_BOTTOM),
            rim: Token::SlabEdge.into(),
            ink: Token::DiagramText.into(),
            rule: Token::Border.into(),
        };
    };
    let bright = Colour::Bright { color };
    Finish {
        top: light_dark(&tone(&bright, LIGHT_TOP), &step(&bright, TOP)),
        bottom: light_dark(&tone(&bright, LIGHT_BOTTOM), &step(&bright, BOTTOM)),
        rim: light_dark(&tone(&bright, LIGHT_EDGE), &step(&bright, EDGE)),
        ink: light_dark(&tone(&bright, LIGHT_INK), &tone(&bright, INK)),
        rule: light_dark(&tone(&bright, LIGHT_RULE), &step(&bright, RULE)),
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

#[cfg(test)]
mod tests {
    use super::finish_of;
    use crate::scene::{Colour, Token};

    #[test]
    fn a_door_with_no_colour_stands_in_a_cards_tone_and_takes_no_gold() {
        let finish = finish_of(None);
        assert_eq!(finish.top, Colour::from(Token::SlabFace));
        assert_eq!(finish.ink, Colour::from(Token::DiagramText));
    }
}
