//! The SVG painter (ADR 0059): a scene written as one standalone SVG document,
//! its words drawn as the glyphs the core shaped, so it needs no font, with
//! the stylesheet that carries what a viewer toggles, and with every train of
//! pulses drawn as a beam of light.
//!
//! Its colours are the page's tokens. A document that stands alone carries the
//! value of every token it names on its root, for one theme or for both.

mod colour;
mod definitions;
mod glyphs;
mod groups;
mod key;
mod legs;
mod path;
mod pulse;
mod shapes;
mod write;
mod xml;

#[cfg(test)]
mod tests;

use std::collections::{BTreeMap, BTreeSet};

pub use key::{AppliedAppearance, PictureKey, appearances};

use archboard_scene::request::{DocumentRequest, StandaloneTheme};
use archboard_scene::scene::{Colour, Item, Scene, Token};
use colour::css;
use definitions::{Names, write_definitions};
use glyphs::Glyphs;
use groups::{
    AWAY_PLACE, CHIP_CLASS, FAR_CLASS, FAR_PLACE, HEAD_SHADE_CLASS, MEMBERS_ATTRIBUTE, NEAR_CLASS,
    NEAR_PLACE, TRAFFIC_ATTRIBUTE, WORDS_CLASS,
};
use pulse::PULSE_CLASS;
use shapes::HALO_CLASS;
use write::Writer;
use xml::{Attributes, coord, empty, escape_xml};

/// Why a document could not be written.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentError(pub String);

impl std::fmt::Display for DocumentError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

const FAR_VIEW_CLASS: &str = "is-far";
/// How every part of a swap between the near and the far view moves.
const SWAP_EASE: &str = "cubic-bezier(.4,0,.2,1)";
/// How a picture swaps its cards' near and far views (TASK-428).
fn far_view_rules(swap_ms: f64) -> Vec<String> {
    let ms = archboard_scene::js::number(swap_ms);
    let fade = format!("opacity {ms}ms {SWAP_EASE}");
    let shown = format!("opacity:1;visibility:visible;transition:{fade},visibility 0s");
    let hidden =
        format!("opacity:0;visibility:hidden;transition:{fade},visibility 0s linear {ms}ms");
    let movement = format!("transition:transform {ms}ms {SWAP_EASE}");
    let far = format!(".{FAR_VIEW_CLASS}");
    vec![
        format!(".{FAR_CLASS}{{display:inline;{hidden}}}"),
        format!(".{NEAR_CLASS}{{{shown}}}"),
        format!("{far} .{FAR_CLASS}{{{shown}}}"),
        format!("{far} .{NEAR_CLASS}{{{hidden}}}"),
        format!(".{CHIP_CLASS}{{transform:var({NEAR_PLACE});{movement}}}"),
        format!("{far} .{CHIP_CLASS}{{transform:var({FAR_PLACE})}}"),
        format!(".{WORDS_CLASS}{{{movement}}}"),
        format!(
            ".{FAR_CLASS}>.{WORDS_CLASS},{far} .{NEAR_CLASS}>.{WORDS_CLASS}{{transform:var({AWAY_PLACE})}}"
        ),
        format!("{far} .{FAR_CLASS}>.{WORDS_CLASS}{{transform:none}}"),
        format!(
            "@media(prefers-reduced-motion:reduce){{.{FAR_CLASS},.{NEAR_CLASS},{far} .{FAR_CLASS},{far} .{NEAR_CLASS},.{CHIP_CLASS},.{WORDS_CLASS}{{transition:none}}}}"
        ),
    ]
}

/// The document's stylesheet: the cursor, the selection ring, the far view,
/// the veil, and less motion for a reader who asked for it.
fn stylesheet(document: &DocumentRequest) -> String {
    let mut rules = vec![
        "[data-semantic-kind]{cursor:pointer}".to_owned(),
        format!(".{HALO_CLASS}{{opacity:0}}"),
        format!(
            ".is-selected .{HALO_CLASS}{{opacity:1;stroke:{}}}",
            css(&Token::DiagramSelection.into())
        ),
        ".is-selected[mask]{mask:none}".to_owned(),
        format!(".is-stuck>.{HEAD_SHADE_CLASS}{{visibility:visible}}"),
    ];
    rules.extend(far_view_rules(document.far_view_swap_ms));
    rules.push(format!(
        ".is-veiled [data-semantic-id],.is-veiled [{TRAFFIC_ATTRIBUTE}],.is-veiled [{MEMBERS_ATTRIBUTE}]{{opacity:.28}}"
    ));
    rules.push(".is-veiled .is-lit,.is-veiled .is-lit [data-semantic-id]{opacity:1}".to_owned());
    rules.push(format!(
        "@media(prefers-reduced-motion:reduce){{.{PULSE_CLASS}{{display:none}}}}"
    ));
    format!("<style>{}</style>", rules.concat())
}

/// Whether a character may stand in a custom property's name: `[\w-]`.
fn name_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_' || character == '-'
}

/// The theme properties referenced by the writer's CSS, excluding its three
/// movement properties. XML escapes quotes and tag delimiters in author
/// text, so only the writer's own style delimiters match here.
fn properties_of(document: &str) -> BTreeSet<&str> {
    let sheets = document
        .split("<style>")
        .skip(1)
        .filter_map(|rest| rest.split_once("</style>").map(|(style, _)| style));
    let attributes = document
        .split(" style=\"")
        .skip(1)
        .filter_map(|rest| rest.split_once('"').map(|(style, _)| style));
    sheets
        .chain(attributes)
        .flat_map(|style| style.split("var(").skip(1))
        .filter_map(|rest| rest.split_once(')').map(|(name, _)| name))
        .filter(|name| {
            name.strip_prefix("--")
                .is_some_and(|name| !name.is_empty() && name.chars().all(name_character))
        })
        .filter(|name| ![NEAR_PLACE, FAR_PLACE, AWAY_PLACE].contains(name))
        .collect()
}

/// One token's value in a document that stands alone.
fn token_value(
    document: &DocumentRequest,
    theme: StandaloneTheme,
    name: &str,
) -> Result<String, DocumentError> {
    let colors = document.theme_colors.as_ref().ok_or_else(|| {
        DocumentError(
            "This renderer host has no theme colours: it draws pictures for its own page, which take the page's colours. Ask the Archboard server for a picture in a theme."
                .to_owned(),
        )
    })?;
    let color = |theme: StandaloneTheme| {
        let (table, word) = match theme {
            StandaloneTheme::Dark => (&colors.dark, "dark"),
            _ => (&colors.light, "light"),
        };
        table.get(name).cloned().ok_or_else(|| {
            DocumentError(format!("Missing {word} theme color {name}. Define it in packages/renderer/assets/theme.css."))
        })
    };
    if theme != StandaloneTheme::Auto {
        return color(theme);
    }
    let light = color(StandaloneTheme::Light)?;
    let dark = color(StandaloneTheme::Dark)?;
    Ok(if light == dark {
        light
    } else {
        format!("light-dark({light}, {dark})")
    })
}

/// What a document that stands alone declares on its root: its colour scheme,
/// and the value of every token it names, in name order.
fn standing_alone(
    document: &DocumentRequest,
    theme: StandaloneTheme,
    painted: &str,
) -> Result<String, DocumentError> {
    let names = properties_of(painted);
    let scheme = match theme {
        StandaloneTheme::Auto => "light dark",
        StandaloneTheme::Light => "light",
        StandaloneTheme::Dark => "dark",
    };
    let mut declarations = vec![format!("color-scheme:{scheme}")];
    for name in names {
        declarations.push(format!("{name}:{}", token_value(document, theme, name)?));
    }
    Ok(declarations.join(";"))
}

/// A scene written as one standalone SVG document, its icons drawn from the
/// host's icon set: each icon's path data by its export name.
///
/// # Errors
///
/// A document that stands alone in a theme the request holds no colour for.
pub fn document(
    scene: &Scene,
    document: &DocumentRequest,
    icons: &BTreeMap<String, Vec<String>>,
) -> Result<String, DocumentError> {
    let names = Names::of(scene);
    let writer = Writer {
        names: &names,
        icons,
    };
    let mut painted = stylesheet(document);
    painted.push('\n');
    painted.push_str("<defs>");
    write_definitions(&scene.definitions, &names, &mut painted);
    Glyphs::of(&scene.body).write_definitions(&mut painted);
    painted.push_str("</defs>\n");
    let mut ground = Attributes::new();
    ground
        .set("x", 0.0)
        .set("y", 0.0)
        .set("width", coord(scene.width))
        .set("height", coord(scene.height))
        .set("fill", css(&scene.background));
    empty("rect", &ground, &mut painted);
    let mut body = String::new();
    writer.items(&scene.body, &mut body);
    if !body.is_empty() {
        painted.push('\n');
        painted.push_str(&body);
    }
    let width = coord(scene.width);
    let height = coord(scene.height);
    let mut out = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {width} {height}\" width=\"{width}\" height=\"{height}\" role=\"img\" aria-label=\""
    );
    escape_xml(&scene.title, &mut out);
    out.push('"');
    if scene.reading.is_some() {
        out.push_str(" data-reading-direction=\"down\"");
    }
    if let Some(theme) = document.theme {
        out.push_str(" style=\"");
        escape_xml(&standing_alone(document, theme, &painted)?, &mut out);
        out.push('"');
    }
    out.push('>');
    if let Some(description) = &scene.description {
        out.push_str("\n<desc>");
        escape_xml(description, &mut out);
        out.push_str("</desc>");
    }
    out.push('\n');
    out.push_str(&painted);
    out.push_str("\n</svg>");
    Ok(out)
}

/// Marks that refer to no definition but their own glyphs, written as SVG
/// markup: what a viewer draws beside a picture, as the picture draws it.
pub fn markup(items: &[Item]) -> String {
    let names = Names::default();
    let icons = BTreeMap::new();
    let mut out = String::new();
    let glyphs = Glyphs::of(items);
    let mut defined = String::new();
    glyphs.write_definitions(&mut defined);
    if !defined.is_empty() {
        out.push_str("<defs>");
        out.push_str(&defined);
        out.push_str("</defs>");
    }
    Writer {
        names: &names,
        icons: &icons,
    }
    .items(items, &mut out);
    out
}

/// A colour as the document spells it in CSS.
pub fn colour(colour: &Colour) -> String {
    css(colour)
}
