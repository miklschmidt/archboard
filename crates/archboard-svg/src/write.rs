//! A scene's items written as SVG markup, in the order they are drawn: each
//! group with its attributes, each shape and run of words as its element,
//! each icon from the host's icon set, and each train of pulses as a beam.

use std::collections::BTreeMap;

use archboard_scene::drawing::{DiagramFont, FontFamily};
use archboard_scene::names::word;
use archboard_scene::scene::{Icon, Item, Setting, Text, Viewport};

use crate::colour::css;
use crate::definitions::{Names, write_definitions};
use crate::groups::group_attributes;
use crate::path::Spelling;
use crate::pulse::write_traffic;
use crate::shapes::write_shape;
use crate::xml::{Attributes, close, escape_xml, open};

/// The family stack a document names for its sans faces, its registered family first.
pub(crate) const SANS_STACK: &str =
    "\"Archboard Diagram Sans\", ui-sans-serif, system-ui, sans-serif";
/// The family stack a document names for its monospace faces.
const MONO_STACK: &str = "\"Archboard Diagram Mono\", ui-monospace, monospace";

/// The family stack a face is named by.
fn stack_of(font: DiagramFont) -> &'static str {
    match font.family {
        FontFamily::Sans => SANS_STACK,
        FontFamily::Mono => MONO_STACK,
    }
}

/// What a scene's items are written with: the ids of its definitions and
/// the host's icons.
pub(crate) struct Writer<'a> {
    pub names: &'a Names,
    /// Each icon's path data, by its export name.
    pub icons: &'a BTreeMap<String, Vec<String>>,
}

impl Writer<'_> {
    /// Some items, in order.
    pub(crate) fn items(&self, items: &[Item], out: &mut String) {
        for item in items {
            self.item(item, out);
        }
    }

    /// One item.
    fn item(&self, item: &Item, out: &mut String) {
        match item {
            Item::Group(group) => {
                open("g", &group_attributes(group, self.names), out);
                self.items(&group.items, out);
                close("g", out);
            }
            Item::Shape(shape) => write_shape(shape, self.names, Spelling::Compact, out),
            Item::Text(text) => write_text(text, out),
            Item::Icon(icon) => self.icon(icon, out),
            Item::Viewport(viewport) => self.viewport(viewport, out),
            Item::Definitions { definitions } => {
                out.push_str("<defs>");
                write_definitions(definitions, self.names, out);
                out.push_str("</defs>");
            }
            Item::Traffic(mark) => write_traffic(mark, out),
            Item::Break => out.push('\n'),
        }
    }

    /// An icon, drawn from the host's icon set in its own 24-unit square.
    fn icon(&self, icon: &Icon, out: &mut String) {
        let side = icon.size;
        let mut attributes = Attributes::new();
        attributes
            .set("viewBox", "0 0 24 24")
            .set("xmlns", "http://www.w3.org/2000/svg")
            .set("width", side)
            .set("height", side)
            .set("fill", css(&icon.ink))
            .set("aria-hidden", "true")
            .set("class", "remixicon ");
        open("svg", &attributes, out);
        for d in self
            .icons
            .get(&icon.name)
            .map(Vec::as_slice)
            .unwrap_or_default()
        {
            let mut path = Attributes::new();
            path.set("d", d.as_str());
            open("path", &path, out);
            close("path", out);
        }
        close("svg", out);
    }

    /// What is drawn in a box of its own.
    fn viewport(&self, viewport: &Viewport, out: &mut String) {
        let view = viewport.view;
        let mut attributes = Attributes::new();
        attributes
            .set("x", viewport.frame.x)
            .set("y", viewport.frame.y)
            .set("width", viewport.frame.width)
            .set("height", viewport.frame.height)
            .set(
                "viewBox",
                crate::shapes::listed(&[view.x, view.y, view.width, view.height]),
            );
        open("svg", &attributes, out);
        self.items(&viewport.items, out);
        close("svg", out);
    }
}

/// A run of words, its attributes in the order its setting has always written them.
fn write_text(text: &Text, out: &mut String) {
    let mut attributes = Attributes::new();
    let fill = css(&text.fill);
    let family = stack_of(text.font);
    let weight = f64::from(text.font.weight);
    let spaces = text.keeps_spaces.then_some("preserve");
    let anchor = text.anchor.map(|anchor| word(&anchor));
    let baseline = text.baseline.map(|baseline| word(&baseline));
    match text.setting {
        Setting::Run => {
            attributes
                .maybe("xml:space", spaces)
                .set("x", text.at.x)
                .set("y", text.at.y)
                .set("fill", fill)
                .set("font-family", family)
                .set("font-weight", weight)
                .set("font-size", text.size);
        }
        Setting::Caption => {
            attributes
                .maybe("xml:space", spaces)
                .set("x", text.at.x)
                .set("y", text.at.y)
                .maybe("text-anchor", anchor)
                .maybe("dominant-baseline", baseline)
                .set("font-size", text.size)
                .set("fill", fill)
                .set("font-family", family)
                .set("font-weight", weight);
        }
        Setting::Centred => {
            attributes
                .set("x", text.at.x)
                .set("y", text.at.y)
                .maybe("text-anchor", anchor)
                .set("font-size", text.size)
                .set("font-family", family)
                .set("font-weight", weight)
                .set("fill", fill);
        }
        Setting::Row => {
            attributes
                .set("x", text.at.x)
                .set("y", text.at.y)
                .set("font-family", family)
                .set("font-weight", weight)
                .set("font-size", text.size)
                .set("fill", fill);
        }
    }
    open("text", &attributes, out);
    escape_xml(&text.words, out);
    close("text", out);
}
