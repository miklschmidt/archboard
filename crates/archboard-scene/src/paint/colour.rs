//! Mixing the renderer's colours, which are CSS expressions of the page's
//! tokens: the mix is written for CSS to resolve, so the one picture takes
//! whichever theme the page it is shown on is in.

use crate::js;

/// A share, as a CSS percentage, rounded well past what a colour channel shows.
fn percent(share: f64) -> String {
    format!("{}%", js::fixed_number(share * 100.0, 4))
}

/// A colour part way from one colour to another, mixed in sRGB: either end
/// itself at 0 and 1, `color-mix()` between.
pub fn mixed(from: &str, to: &str, amount: f64) -> String {
    if amount <= 0.0 {
        return from.to_owned();
    }
    if amount >= 1.0 {
        return to.to_owned();
    }
    format!("color-mix(in srgb, {to} {}, {from})", percent(amount))
}

/// One tone of an ink: how light it is in OKLCH, and how much of the ink's chroma it keeps.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ToneStep {
    pub lightness: f64,
    pub chroma: f64,
    /// The most of the ink's chroma it counts.
    pub cap: f64,
}

/// How much of an ink's chroma a tone counts.
pub const CHROMA_CAP: f64 = 0.12;

impl ToneStep {
    /// A tone that counts the usual share of the ink's chroma.
    pub const fn new(lightness: f64, chroma: f64) -> Self {
        ToneStep { lightness, chroma, cap: CHROMA_CAP }
    }
}

/// A tone of an ink on the light ground and on the dark one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Tone {
    pub light: ToneStep,
    pub dark: ToneStep,
}

/// One tone of an ink: the ink's own hue, at a lightness of its own and a share
/// of the ink's chroma, written as a relative OKLCH colour for CSS to resolve.
fn tone(ink: &str, step: ToneStep) -> String {
    format!(
        "oklch(from {ink} {} calc(min(c, {}) * {}) h)",
        js::number(step.lightness),
        js::number(step.cap),
        js::number(step.chroma)
    )
}

/// A surface in an ink's colour, a tone of it on each ground.
pub fn toned(ink: &str, steps: Tone) -> String {
    light_dark(&tone(ink, steps.light), &tone(ink, steps.dark))
}

/// A colour in an ink: a tone of it on the light ground, a share of it over a base on the dark one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Inked {
    pub light: ToneStep,
    pub dark: f64,
}

/// A surface in an ink's colour: a tone of the ink on the light ground, the
/// ink mixed into a base on the dark ground.
pub fn inked_over(base: &str, ink: &str, inked: Inked) -> String {
    light_dark(&tone(ink, inked.light), &mixed(base, ink, inked.dark))
}

/// How light an ink may be on the light ground, and a tone of it on the dark one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Held {
    pub least: f64,
    pub most: f64,
    pub dark: ToneStep,
}

/// An ink at its full colour: on the light ground the ink itself with its
/// lightness held between two bounds, on the dark ground a tone of it.
pub fn held_tone(ink: &str, held: Held) -> String {
    light_dark(
        &format!(
            "oklch(from {ink} clamp({}, l, {}) c h)",
            js::number(held.least),
            js::number(held.most)
        ),
        &tone(ink, held.dark),
    )
}

/// A colour at a share of its strength, the rest see-through.
pub fn translucent(colour: &str, share: f64) -> String {
    mixed("transparent", colour, share)
}

/// One colour on a light page and another on a dark one.
pub fn light_dark(light: &str, dark: &str) -> String {
    format!("light-dark({light}, {dark})")
}

/// A colour spelt so it can be part of an element's id: every character an id
/// cannot hold written as its code.
pub fn colour_id(colour: &str) -> String {
    let mut spelt = String::new();
    for character in colour.chars() {
        if character.is_ascii_alphanumeric() || character == '-' {
            spelt.push(character);
        } else {
            spelt.push('_');
            spelt.push_str(&js::pad_start(&format!("{:x}", u32::from(character)), 2, '0'));
        }
    }
    spelt
}

/// A share of a colour mixed into another, on the light ground and on the dark one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Share {
    pub light: f64,
    pub dark: f64,
}

impl Share {
    /// The same share on both grounds.
    pub const fn both(share: f64) -> Self {
        Share { light: share, dark: share }
    }
}

/// A colour tinted by an ink, as much as each ground asks for.
pub fn tinted(base: &str, ink: Option<&str>, share: Share) -> String {
    let Some(ink) = ink else {
        return base.to_owned();
    };
    let light = mixed(base, ink, share.light);
    if share.light == share.dark {
        light
    } else {
        light_dark(&light, &mixed(base, ink, share.dark))
    }
}
