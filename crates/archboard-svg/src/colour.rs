//! A scene's colours spelt as CSS: a token as the custom property the page
//! defines, a named colour as its `--semantic-` property, and each operation
//! as the CSS function that computes it, so the browser resolves every colour
//! in the theme the document is shown in.

use archboard_scene::js;
use archboard_scene::names::word;
use archboard_scene::scene::{Colour, Paint};

use crate::definitions::gradient_id;

/// A share as a CSS percentage, to four places.
fn percent(share: f64) -> String {
    format!("{}%", js::fixed_number(share * 100.0, 4))
}

/// A colour as CSS.
pub(crate) fn css(colour: &Colour) -> String {
    match colour {
        Colour::Token { token } => format!("var(--{})", word(token)),
        Colour::Palette { color } => format!("var(--semantic-{})", word(color)),
        Colour::Black => "black".to_owned(),
        Colour::White => "white".to_owned(),
        Colour::Transparent => "transparent".to_owned(),
        Colour::Mix { base, ink, share } => format!(
            "color-mix(in srgb, {} {}, {})",
            css(ink),
            percent(*share),
            css(base)
        ),
        Colour::LightDark { light, dark } => format!("light-dark({}, {})", css(light), css(dark)),
        Colour::Tone {
            ink,
            lightness,
            cap,
            chroma,
        } => format!(
            "oklch(from {} {} calc(min(c, {}) * {}) h)",
            css(ink),
            js::number(*lightness),
            js::number(*cap),
            js::number(*chroma)
        ),
        Colour::Held { ink, least, most } => format!(
            "oklch(from {} clamp({}, l, {}) c h)",
            css(ink),
            js::number(*least),
            js::number(*most)
        ),
    }
}

/// What fills or strokes a shape, as CSS.
pub(crate) fn paint(paint: &Paint) -> String {
    match paint {
        Paint::None => "none".to_owned(),
        Paint::Colour { colour } => css(colour),
        Paint::Gradient { id } => format!("url(#{})", gradient_id(*id)),
    }
}

/// A colour as it can stand in an id: letters, digits and hyphens kept, every
/// other character as an underscore and its code in hex.
pub(crate) fn colour_id(colour: &Colour) -> String {
    let mut spelt = String::new();
    for character in css(colour).chars() {
        if character.is_ascii_alphanumeric() || character == '-' {
            spelt.push(character);
        } else {
            spelt.push('_');
            spelt.push_str(&js::pad_start(
                &format!("{:x}", u32::from(character)),
                2,
                '0',
            ));
        }
    }
    spelt
}
