//! The SVG painter (ADR 0057): a scene written as one standalone SVG document,
//! with the stylesheet that registers the faces the picture was measured in and
//! carries what a viewer toggles, and with every train of pulses drawn as a
//! beam of light.
//!
//! Its colours are the page's tokens. A document that stands alone carries the
//! value of every token it names on its root, for one theme or for both.

mod pulse;

use std::collections::BTreeSet;

use archboard_scene::attrs;
use archboard_scene::geometry::coord;
use archboard_scene::markup::{escape_xml, tag, write_items};
use archboard_scene::paint::colour::light_dark;
use archboard_scene::paint::fonts::{FACES, FONT_URL_PREFIX, SANS_STACK};
use archboard_scene::paint::palette::PALETTE;
use archboard_scene::request::{DocumentRequest, FontSource, StandaloneTheme};
use archboard_scene::scene::{Item, Scene};

pub use pulse::PULSE_CLASS;

/// Why a document could not be written.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentError(pub String);

impl std::fmt::Display for DocumentError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

const NEAR_CLASS: &str = "ab-near";
const FAR_CLASS: &str = "ab-far";
const FAR_VIEW_CLASS: &str = "is-far";
const CHIP_CLASS: &str = "ab-chip";
const WORDS_CLASS: &str = "ab-words";
const NEAR_PLACE: &str = "--near";
const FAR_PLACE: &str = "--far";
const AWAY_PLACE: &str = "--away";
const HEAD_SHADE_CLASS: &str = "ab-head-shade";
const TRAFFIC_ATTRIBUTE: &str = "data-traffic";
const MEMBERS_ATTRIBUTE: &str = "data-members";
/// How every part of a swap between the near and the far view moves.
const SWAP_EASE: &str = "cubic-bezier(.4,0,.2,1)";

/// Some things written as markup, traffic drawn as beams of light.
pub fn write(items: &[Item], out: &mut String) {
    write_items(items, out, &pulse::write_traffic);
}

/// Where one face's bytes come from.
fn face_source(file: &str, document: &DocumentRequest) -> Result<String, DocumentError> {
    if document.fonts == FontSource::Embedded {
        let data = document
            .font_data
            .as_ref()
            .and_then(|data| data.get(file))
            .ok_or_else(|| DocumentError(format!("The host gave no bytes for the diagram font {file}.")))?;
        return Ok(format!("url(\"data:font/ttf;base64,{data}\") format(\"truetype\")"));
    }
    Ok(format!("url(\"{FONT_URL_PREFIX}/{file}\") format(\"truetype\")"))
}

/// The `@font-face` rules the document registers its own type with.
fn face_rules(document: &DocumentRequest) -> Result<String, DocumentError> {
    let mut rules = String::new();
    for face in &FACES {
        rules.push_str(&format!(
            "@font-face{{font-family:\"{}\";font-style:normal;font-weight:{};src:{}}}",
            face.css_family,
            face.weight,
            face_source(face.file, document)?
        ));
    }
    Ok(rules)
}

/// How a picture swaps its cards' near and far views (TASK-428).
fn far_view_rules(swap_ms: f64) -> Vec<String> {
    let ms = archboard_scene::js::number(swap_ms);
    let fade = format!("opacity {ms}ms {SWAP_EASE}");
    let shown = format!("opacity:1;visibility:visible;transition:{fade},visibility 0s");
    let hidden = format!("opacity:0;visibility:hidden;transition:{fade},visibility 0s linear {ms}ms");
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
        format!(".{FAR_CLASS}>.{WORDS_CLASS},{far} .{NEAR_CLASS}>.{WORDS_CLASS}{{transform:var({AWAY_PLACE})}}"),
        format!("{far} .{FAR_CLASS}>.{WORDS_CLASS}{{transform:none}}"),
        format!(
            "@media(prefers-reduced-motion:reduce){{.{FAR_CLASS},.{NEAR_CLASS},{far} .{FAR_CLASS},{far} .{NEAR_CLASS},.{CHIP_CLASS},.{WORDS_CLASS}{{transition:none}}}}"
        ),
    ]
}

/// The document's stylesheet: the faces, the cursor, the selection ring, the
/// far view, the veil, and less motion for a reader who asked for it.
fn stylesheet(document: &DocumentRequest) -> Result<String, DocumentError> {
    let mut rules = vec![
        face_rules(document)?,
        "svg,text{font-synthesis:none}".to_owned(),
        "[data-semantic-kind]{cursor:pointer}".to_owned(),
        ".ab-halo{opacity:0}".to_owned(),
        format!(".is-selected .ab-halo{{opacity:1;stroke:{}}}", PALETTE.selection),
        ".is-selected[mask]{mask:none}".to_owned(),
        format!(".is-stuck>.{HEAD_SHADE_CLASS}{{visibility:visible}}"),
    ];
    rules.extend(far_view_rules(document.far_view_swap_ms));
    rules.push(format!(
        ".is-veiled [data-semantic-id],.is-veiled [{TRAFFIC_ATTRIBUTE}],.is-veiled [{MEMBERS_ATTRIBUTE}]{{opacity:.28}}"
    ));
    rules.push(".is-veiled .is-lit,.is-veiled .is-lit [data-semantic-id]{opacity:1}".to_owned());
    rules.push(format!("@media(prefers-reduced-motion:reduce){{.{PULSE_CLASS}{{display:none}}}}"));
    Ok(format!("<style>{}</style>", rules.concat()))
}

/// Whether a character may stand in a custom property's name: `[\w-]`.
fn name_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_' || character == '-'
}

/// The custom properties a document names: each `var(--name)` it refers to,
/// and each `--name:` it sets itself after a quote or a semicolon.
fn properties_of(document: &str) -> (Vec<&str>, Vec<&str>) {
    let mut references = Vec::new();
    let mut own = Vec::new();
    let bytes = document.as_bytes();
    let name_at = |start: usize| {
        let length = document[start..].find(|character: char| !name_character(character)).unwrap_or(document.len() - start);
        &document[start..start + length]
    };
    let mut at = 0;
    while let Some(found) = document[at..].find("var(--") {
        let start = at + found + 4;
        let name = name_at(start + 2);
        let end = start + 2 + name.len();
        if !name.is_empty() && document[end..].starts_with(')') {
            references.push(&document[start..end]);
        }
        at = start;
    }
    for (index, byte) in bytes.iter().enumerate() {
        if (*byte == b'"' || *byte == b';') && document[index + 1..].starts_with("--") {
            let name = name_at(index + 3);
            let end = index + 3 + name.len();
            if !name.is_empty() && document[end..].starts_with(':') {
                own.push(&document[index + 1..end]);
            }
        }
    }
    (references, own)
}

/// One token's value in a document that stands alone.
fn token_value(document: &DocumentRequest, theme: StandaloneTheme, name: &str) -> Result<String, DocumentError> {
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
    Ok(if light == dark { light } else { light_dark(&light, &dark) })
}

/// What a document that stands alone declares on its root: its colour scheme,
/// and the value of every token it names, in name order.
fn standing_alone(document: &DocumentRequest, theme: StandaloneTheme, painted: &str) -> Result<String, DocumentError> {
    let (references, own) = properties_of(painted);
    let own: BTreeSet<&str> = [NEAR_PLACE, FAR_PLACE, AWAY_PLACE].into_iter().chain(own).collect();
    let names: BTreeSet<&str> = references.into_iter().filter(|name| !own.contains(name)).collect();
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

/// A scene written as one standalone SVG document.
pub fn document(scene: &Scene, document: &DocumentRequest) -> Result<String, DocumentError> {
    let mut painted = stylesheet(document)?;
    painted.push('\n');
    painted.push_str("<defs>");
    write(&scene.definitions, &mut painted);
    painted.push_str("</defs>\n");
    write(
        &tag(
            "rect",
            attrs! {
                "x": 0.0,
                "y": 0.0,
                "width": coord(scene.width),
                "height": coord(scene.height),
                "fill": scene.background.as_str(),
            },
        ),
        &mut painted,
    );
    let mut body = String::new();
    write(&scene.body, &mut body);
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
    out.push_str("\" font-family=\"");
    escape_xml(SANS_STACK, &mut out);
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
