//! A scene's items written as SVG markup, in the order they are drawn: each
//! group with its attributes, each shape and run of words as its element,
//! each icon from the host's icon set, and each train of pulses as a beam.

use std::collections::BTreeMap;

use archboard_scene::scene::{Icon, Item, Viewport};

use crate::colour::css;
use crate::definitions::{Names, write_definitions};
use crate::glyphs::write_text;
use crate::groups::group_attributes;
use crate::path::Spelling;
use crate::pulse::write_traffic;
use crate::shapes::write_shape;
use crate::xml::{Attributes, close, open};

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
            Item::Icon(icon) => write_icon(icon, self.icons, out),
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

/// An icon, drawn from the host's icon set in its own 24-unit square.
pub(crate) fn write_icon(icon: &Icon, icons: &BTreeMap<String, Vec<String>>, out: &mut String) {
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
    for d in icons.get(&icon.name).map(Vec::as_slice).unwrap_or_default() {
        let mut path = Attributes::new();
        path.set("d", d.as_str());
        open("path", &path, out);
        close("path", out);
    }
    close("svg", out);
}
