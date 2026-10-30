//! Mixing the picture's colours: each a value of the scene the frontend
//! resolves in its theme, so one picture takes whichever theme it is shown in.

use crate::scene::Colour;

/// A colour part way from one colour to another, mixed in sRGB: either end
/// itself at 0 and 1, a mix between.
pub(super) fn mixed(from: &Colour, to: &Colour, amount: f64) -> Colour {
    if amount <= 0.0 {
        return from.clone();
    }
    if amount >= 1.0 {
        return to.clone();
    }
    Colour::Mix {
        base: Box::new(from.clone()),
        ink: Box::new(to.clone()),
        share: amount,
    }
}

/// One tone of an ink: how light it is in OKLCH, and how much of the ink's chroma it keeps.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct ToneStep {
    /// How light the tone is, in OKLCH lightness.
    pub lightness: f64,
    /// The share of the ink's chroma it keeps, up to `cap`.
    pub chroma: f64,
    /// The most of the ink's chroma it counts.
    pub cap: f64,
}

/// How much of an ink's chroma a tone counts.
const CHROMA_CAP: f64 = 0.12;

impl ToneStep {
    /// A tone that counts the usual share of the ink's chroma.
    pub(super) const fn new(lightness: f64, chroma: f64) -> Self {
        ToneStep {
            lightness,
            chroma,
            cap: CHROMA_CAP,
        }
    }
}

/// A tone of an ink on the light ground and on the dark one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Tone {
    /// The tone on the light ground.
    pub light: ToneStep,
    /// The tone on the dark ground.
    pub dark: ToneStep,
}

/// One tone of an ink: the ink's own hue, at a lightness of its own and a share
/// of the ink's chroma.
fn tone(ink: &Colour, step: ToneStep) -> Colour {
    Colour::Tone {
        ink: Box::new(ink.clone()),
        lightness: step.lightness,
        cap: step.cap,
        chroma: step.chroma,
    }
}

/// A surface in an ink's colour, a tone of it on each ground.
pub(super) fn toned(ink: &Colour, steps: Tone) -> Colour {
    light_dark(&tone(ink, steps.light), &tone(ink, steps.dark))
}

/// A colour in an ink: a tone of it on the light ground, a share of it over a base on the dark one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Inked {
    /// The tone of the ink on the light ground.
    pub light: ToneStep,
    /// How much of the ink is mixed into the base on the dark ground, from 0 to 1.
    pub dark: f64,
}

/// A surface in an ink's colour: a tone of the ink on the light ground, the
/// ink mixed into a base on the dark ground.
pub(super) fn inked_over(base: &Colour, ink: &Colour, inked: Inked) -> Colour {
    light_dark(&tone(ink, inked.light), &mixed(base, ink, inked.dark))
}

/// How light an ink may be on the light ground, and a tone of it on the dark one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Held {
    /// The least lightness the ink keeps on the light ground.
    pub least: f64,
    /// The most lightness the ink keeps on the light ground.
    pub most: f64,
    /// The tone of the ink on the dark ground.
    pub dark: ToneStep,
}

/// An ink at its full colour: on the light ground the ink itself with its
/// lightness held between two bounds, on the dark ground a tone of it.
pub(super) fn held_tone(ink: &Colour, held: Held) -> Colour {
    light_dark(
        &Colour::Held {
            ink: Box::new(ink.clone()),
            least: held.least,
            most: held.most,
        },
        &tone(ink, held.dark),
    )
}

/// A colour at a share of its strength, the rest see-through.
pub(super) fn translucent(colour: &Colour, share: f64) -> Colour {
    mixed(&Colour::Transparent, colour, share)
}

/// One colour on a light page and another on a dark one.
pub(super) fn light_dark(light: &Colour, dark: &Colour) -> Colour {
    Colour::LightDark {
        light: Box::new(light.clone()),
        dark: Box::new(dark.clone()),
    }
}

/// A share of a colour mixed into another, on the light ground and on the dark one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Share {
    /// The share mixed in on the light ground, from 0 to 1.
    pub light: f64,
    /// The share mixed in on the dark ground, from 0 to 1.
    pub dark: f64,
}

/// A colour tinted by an ink, as much as each ground asks for.
pub(super) fn tinted(base: &Colour, ink: Option<&Colour>, share: Share) -> Colour {
    let Some(ink) = ink else {
        return base.clone();
    };
    let light = mixed(base, ink, share.light);
    if share.light == share.dark {
        light
    } else {
        light_dark(&light, &mixed(base, ink, share.dark))
    }
}
