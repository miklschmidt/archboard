//! The colours of a picture in one theme. The SVG writer spells a colour as CSS
//! and lets the page work it out. A painter has no CSS, so this reads the same
//! `theme.css` and does the sums the page does: OKLCH to sRGB, `color-mix` in
//! sRGB, and relative OKLCH.

use std::cell::RefCell;
use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::mem::discriminant;

use archboard_scene::names::word;
use archboard_scene::scene::{Colour, Stop};
use peniko::Color;

/// Every token of both themes, as the shell and the SVG read them.
const THEME_CSS: &str = include_str!("../../../packages/renderer/assets/theme.css");

/// The rule that opens the dark theme in `theme.css`.
const DARK_RULE: &str = ":root[data-theme=\"dark\"]";

/// An sRGB colour with its alpha, each from 0 to 1.
type Rgba = [f64; 4];

/// An OKLCH colour with its alpha.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Oklch {
    lightness: f64,
    chroma: f64,
    hue: f64,
    alpha: f64,
}

/// A theme: light, or dark.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Theme {
    /// The chalk ground.
    Light,
    /// The graphite ground.
    Dark,
}

/// One sRGB channel made linear.
fn to_linear(channel: f64) -> f64 {
    let size = channel.abs();
    let linear = if size <= 0.04045 {
        size / 12.92
    } else {
        ((size + 0.055) / 1.055).powf(2.4)
    };
    linear.copysign(channel)
}

/// One linear channel made sRGB.
fn to_gamma(channel: f64) -> f64 {
    let size = channel.abs();
    let gamma = if size <= 0.003_130_8 {
        12.92 * size
    } else {
        1.055 * size.powf(1.0 / 2.4) - 0.055
    };
    gamma.copysign(channel)
}

/// OKLCH as sRGB, each channel clipped to the gamut as Chromium clips it.
fn to_srgb(colour: Oklch) -> Rgba {
    let (sine, cosine) = colour.hue.to_radians().sin_cos();
    let (a, b) = (colour.chroma * cosine, colour.chroma * sine);
    let long = colour.lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
    let middle = colour.lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
    let short = colour.lightness - 0.089_484_177_5 * a - 1.291_485_548_0 * b;
    let (long, middle, short) = (long.powi(3), middle.powi(3), short.powi(3));
    let red = 4.076_741_662_1 * long - 3.307_711_591_3 * middle + 0.230_969_929_2 * short;
    let green = -1.268_438_004_6 * long + 2.609_757_401_1 * middle - 0.341_319_396_5 * short;
    let blue = -0.004_196_086_3 * long - 0.703_418_614_7 * middle + 1.707_614_701_0 * short;
    [
        to_gamma(red).clamp(0.0, 1.0),
        to_gamma(green).clamp(0.0, 1.0),
        to_gamma(blue).clamp(0.0, 1.0),
        colour.alpha,
    ]
}

/// sRGB as OKLCH.
fn to_oklch(colour: Rgba) -> Oklch {
    let [red, green, blue] = [
        to_linear(colour[0]),
        to_linear(colour[1]),
        to_linear(colour[2]),
    ];
    let long = 0.412_221_470_8 * red + 0.536_332_536_3 * green + 0.051_445_992_9 * blue;
    let middle = 0.211_903_498_2 * red + 0.680_699_545_1 * green + 0.107_396_956_6 * blue;
    let short = 0.088_302_461_9 * red + 0.281_718_837_6 * green + 0.629_978_710_0 * blue;
    let (long, middle, short) = (long.cbrt(), middle.cbrt(), short.cbrt());
    let lightness = 0.210_454_255_3 * long + 0.793_617_785_0 * middle - 0.004_072_046_8 * short;
    let a = 1.977_998_495_1 * long - 2.428_592_205_0 * middle + 0.450_593_709_9 * short;
    let b = 0.025_904_037_1 * long + 0.782_771_766_2 * middle - 0.808_675_766_0 * short;
    Oklch {
        lightness,
        chroma: a.hypot(b),
        hue: b.atan2(a).to_degrees().rem_euclid(360.0),
        alpha: colour[3],
    }
}

/// A number in `theme.css`: a plain number, or a percentage.
fn number_of(text: &str) -> Option<f64> {
    match text.strip_suffix('%') {
        Some(share) => share.parse::<f64>().ok().map(|share| share / 100.0),
        None if text == "none" => Some(0.0),
        None => text.parse().ok(),
    }
}

/// One declaration's `oklch(...)` value.
fn oklch_of(value: &str) -> Option<Oklch> {
    let inner = value.strip_prefix("oklch(")?.strip_suffix(')')?;
    let (numbers, alpha) = inner.split_once('/').unwrap_or((inner, "1"));
    let mut numbers = numbers.split_whitespace().map(number_of);
    Some(Oklch {
        lightness: numbers.next()??,
        chroma: numbers.next()??,
        hue: numbers.next()??,
        alpha: number_of(alpha.trim())?,
    })
}

/// Every `--name: oklch(...)` declaration in a stretch of `theme.css`, each
/// under its name with no dashes in front.
fn declarations(css: &str) -> impl Iterator<Item = (&str, Oklch)> {
    css.lines().filter_map(|line| {
        let (name, value) = line.trim().strip_prefix("--")?.split_once(':')?;
        Some((name, oklch_of(value.trim().trim_end_matches(';'))?))
    })
}

/// Add a colour to a hash.
fn feed<H: Hasher>(colour: &Colour, state: &mut H) {
    discriminant(colour).hash(state);
    let numbers = |values: &[f64], state: &mut H| {
        for value in values {
            value.to_bits().hash(state);
        }
    };
    match colour {
        Colour::Token { token } => token.hash(state),
        Colour::Palette { color } | Colour::Bright { color } => color.hash(state),
        Colour::Black | Colour::White | Colour::Transparent => {}
        Colour::Mix { base, ink, share } => {
            feed(base, state);
            feed(ink, state);
            numbers(&[*share], state);
        }
        Colour::LightDark { light, dark } => {
            feed(light, state);
            feed(dark, state);
        }
        Colour::Tone {
            ink,
            lightness,
            cap,
            chroma,
        } => {
            feed(ink, state);
            numbers(&[*lightness, *cap, *chroma], state);
        }
        Colour::Shifted {
            ink,
            lightness,
            chroma,
        } => {
            feed(ink, state);
            numbers(&[*lightness, *chroma], state);
        }
        Colour::Held { ink, least, most } => {
            feed(ink, state);
            numbers(&[*least, *most], state);
        }
    }
}

/// The tokens of one theme, what its `light-dark()` colours choose, and each
/// colour it has worked out, by the hash of the colour.
#[derive(Clone, Debug)]
pub struct Palette {
    tokens: HashMap<&'static str, Oklch>,
    dark: bool,
    known: RefCell<HashMap<u64, Rgba>>,
}

impl Palette {
    /// The palette of a theme. A token that the dark theme does not declare
    /// keeps its light value, as the cascade keeps it.
    ///
    /// # Panics
    ///
    /// When `theme.css` no longer has its dark rule.
    pub fn of(theme: Theme) -> Palette {
        let (light, dark) = THEME_CSS
            .split_once(DARK_RULE)
            .expect("theme.css has a dark rule");
        let mut tokens: HashMap<_, _> = declarations(light).collect();
        if theme == Theme::Dark {
            tokens.extend(declarations(dark));
        }
        Palette {
            tokens,
            dark: theme == Theme::Dark,
            known: RefCell::new(HashMap::new()),
        }
    }

    /// A declared token, or transparent when a colour names no token.
    fn token(&self, name: &str) -> Oklch {
        self.tokens.get(name).copied().unwrap_or(Oklch {
            lightness: 0.0,
            chroma: 0.0,
            hue: 0.0,
            alpha: 0.0,
        })
    }

    /// A colour as OKLCH, reading a token without a trip through sRGB.
    fn oklch(&self, colour: &Colour) -> Oklch {
        match colour {
            Colour::Token { token } => self.token(word(token)),
            Colour::Palette { color } => self.token(&format!("semantic-{}", word(color))),
            Colour::Bright { color } => self.token(&format!("bright-{}", word(color))),
            other => to_oklch(self.srgb(other)),
        }
    }

    /// A colour as sRGB.
    fn srgb(&self, colour: &Colour) -> Rgba {
        match colour {
            Colour::Token { .. } | Colour::Palette { .. } | Colour::Bright { .. } => {
                to_srgb(self.oklch(colour))
            }
            Colour::Black => [0.0, 0.0, 0.0, 1.0],
            Colour::White => [1.0, 1.0, 1.0, 1.0],
            Colour::Transparent => [0.0; 4],
            Colour::Mix { base, ink, share } => mixed(self.srgb(base), self.srgb(ink), *share),
            Colour::LightDark { light, dark } => self.srgb(if self.dark { dark } else { light }),
            Colour::Tone {
                ink,
                lightness,
                cap,
                chroma,
            } => {
                let from = self.oklch(ink);
                to_srgb(Oklch {
                    lightness: *lightness,
                    chroma: from.chroma.min(*cap) * chroma,
                    ..from
                })
            }
            Colour::Shifted {
                ink,
                lightness,
                chroma,
            } => {
                let from = self.oklch(ink);
                to_srgb(Oklch {
                    lightness: from.lightness + lightness,
                    chroma: from.chroma + chroma,
                    ..from
                })
            }
            Colour::Held { ink, least, most } => {
                let from = self.oklch(ink);
                to_srgb(Oklch {
                    lightness: from.lightness.clamp(*least, *most),
                    ..from
                })
            }
        }
    }

    /// A colour at a share of its own alpha.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "a painter's channels are f32"
    )]
    pub fn colour(&self, colour: &Colour, alpha: f64) -> Color {
        let mut key = DefaultHasher::new();
        feed(colour, &mut key);
        let [red, green, blue, own] = *self
            .known
            .borrow_mut()
            .entry(key.finish())
            .or_insert_with(|| self.srgb(colour));
        Color::new([red as f32, green as f32, blue as f32, (own * alpha) as f32])
    }

    /// A gradient stop's colour at a share of its alpha.
    pub(crate) fn stop(&self, stop: &Stop, alpha: f64) -> Color {
        self.colour(&stop.colour, stop.opacity.unwrap_or(1.0) * alpha)
    }
}

/// `color-mix(in srgb, ink share, base)`: alpha is mixed, and channels are
/// mixed premultiplied, as CSS says.
fn mixed(base: Rgba, ink: Rgba, share: f64) -> Rgba {
    let alpha = base[3] * (1.0 - share) + ink[3] * share;
    if alpha <= 0.0 {
        return [0.0; 4];
    }
    let channel = |index: usize| {
        (base[index] * base[3] * (1.0 - share) + ink[index] * ink[3] * share) / alpha
    };
    [channel(0), channel(1), channel(2), alpha]
}

#[cfg(test)]
mod tests {
    use super::{Oklch, Palette, Theme, mixed, to_oklch, to_srgb};
    use archboard_scene::scene::{Colour, Token};

    #[test]
    fn a_colour_survives_the_trip_through_oklch() {
        let colour = [0.2, 0.5, 0.7, 1.0];
        let back = to_srgb(to_oklch(colour));
        for (one, other) in colour.iter().zip(back) {
            assert!((one - other).abs() < 1e-6);
        }
    }

    #[test]
    fn white_has_full_lightness() {
        let white = to_srgb(Oklch {
            lightness: 1.0,
            chroma: 0.0,
            hue: 0.0,
            alpha: 1.0,
        });
        assert!(
            white[..3]
                .iter()
                .all(|channel| (channel - 1.0).abs() < 1e-6)
        );
    }

    #[test]
    fn a_mix_weighs_each_side_by_its_alpha() {
        let mix = mixed([0.0, 0.0, 0.0, 0.0], [1.0, 1.0, 1.0, 1.0], 0.5);
        assert_eq!(mix, [1.0, 1.0, 1.0, 0.5]);
    }

    #[test]
    fn the_dark_theme_keeps_a_token_it_does_not_declare_and_changes_the_ground() {
        let light = Palette::of(Theme::Light);
        let dark = Palette::of(Theme::Dark);
        let ground = Colour::token(Token::Background);
        assert_ne!(light.colour(&ground, 1.0), dark.colour(&ground, 1.0));
        assert!(dark.colour(&ground, 1.0).components[3] > 0.99);
    }

    #[test]
    fn every_token_has_a_colour_in_both_themes() {
        for theme in [Theme::Light, Theme::Dark] {
            let palette = Palette::of(theme);
            for token in [
                Token::Background,
                Token::SlabFace,
                Token::SlabEdge,
                Token::TrayFloor,
                Token::Border,
                Token::DiagramText,
                Token::DiagramEdge,
                Token::DiagramSelection,
                Token::Primary,
            ] {
                let colour = palette.colour(&Colour::token(token), 1.0);
                assert!(colour.components[3] > 0.0, "{token:?} has no colour");
            }
        }
    }
}
