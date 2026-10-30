//! Writing XML: an element's attributes in the order they are set, paint
//! written as one `style`, text made safe, and the id a definition takes from
//! what it holds.

use archboard_scene::geometry::round_coord;
use archboard_scene::js;

/// A value as an attribute spells it.
pub(crate) trait Spelt {
    /// The value as it is written.
    fn spelt(self) -> String;
}

impl Spelt for f64 {
    fn spelt(self) -> String {
        js::number(self)
    }
}

impl Spelt for &str {
    fn spelt(self) -> String {
        self.to_owned()
    }
}

impl Spelt for String {
    fn spelt(self) -> String {
        self
    }
}

/// A coordinate as the picture writes it: to a hundredth.
pub(crate) fn coord(value: f64) -> String {
    js::number(round_coord(value))
}

/// Whether an attribute is paint, written as CSS.
fn is_paint(name: &str) -> bool {
    matches!(name, "fill" | "stroke" | "stop-color")
}

/// An element's attributes, in the order they are written.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct Attributes(Vec<(&'static str, String)>);

impl Attributes {
    /// No attributes.
    pub(crate) fn new() -> Self {
        Attributes(Vec::new())
    }

    /// One attribute set.
    pub(crate) fn set(&mut self, name: &'static str, value: impl Spelt) -> &mut Self {
        self.0.push((name, value.spelt()));
        self
    }

    /// One attribute set, when it has a value.
    pub(crate) fn maybe(&mut self, name: &'static str, value: Option<impl Spelt>) -> &mut Self {
        if let Some(value) = value {
            self.set(name, value);
        }
        self
    }

    /// The attributes as they are written into a tag, each with its leading
    /// space; paint written as one `style` where the first of it stands,
    /// because a colour is a CSS expression of the page's tokens and only CSS
    /// is sure to resolve it.
    pub(crate) fn write(&self, out: &mut String) {
        let first_paint = self.0.iter().position(|(name, _)| is_paint(name));
        for (index, (name, value)) in self.0.iter().enumerate() {
            if Some(index) == first_paint {
                let paint: Vec<String> = self
                    .0
                    .iter()
                    .filter(|(held, _)| is_paint(held))
                    .map(|(held, value)| format!("{held}:{value}"))
                    .collect();
                out.push_str(" style=\"");
                escape_xml(&paint.join(";"), out);
                out.push('"');
            } else if !is_paint(name) {
                out.push(' ');
                out.push_str(name);
                out.push_str("=\"");
                escape_xml(value, out);
                out.push('"');
            }
        }
    }
}

/// A self-closing element.
pub(crate) fn empty(name: &str, attributes: &Attributes, out: &mut String) {
    out.push('<');
    out.push_str(name);
    attributes.write(out);
    out.push_str("/>");
}

/// An element's opening tag.
pub(crate) fn open(name: &str, attributes: &Attributes, out: &mut String) {
    out.push('<');
    out.push_str(name);
    attributes.write(out);
    out.push('>');
}

/// An element's closing tag.
pub(crate) fn close(name: &str, out: &mut String) {
    out.push_str("</");
    out.push_str(name);
    out.push('>');
}

/// Characters XML has no spelling for, which are left out: most control
/// characters and the two non-characters at the end of the basic plane.
fn forbidden(character: char) -> bool {
    matches!(
        character,
        '\u{0}'..='\u{8}' | '\u{B}' | '\u{C}' | '\u{E}'..='\u{1F}' | '\u{FFFE}' | '\u{FFFF}'
    )
}

/// Text made safe for a text node or a double-quoted attribute value.
pub(crate) fn escape_xml(value: &str, out: &mut String) {
    for character in value.chars() {
        match character {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            other if forbidden(other) => {}
            other => out.push(other),
        }
    }
}

/// An id that is the same for the same markup in every place the renderer
/// runs: two 32-bit FNV-1a hashes with different offsets over its UTF-16 code
/// units, and its length, as 20 hex digits.
pub(crate) fn content_id(body: &str) -> String {
    let mut one: u32 = 0x811c_9dc5;
    let mut other: u32 = 0x0100_0193;
    let mut length: u32 = 0;
    for code in body.encode_utf16() {
        one = (one ^ u32::from(code)).wrapping_mul(0x0100_0193);
        other = (other ^ u32::from(code)).wrapping_mul(0x811c_9dc5);
        length = length.wrapping_add(1);
    }
    let spelt = js::pad_start(&js::radix(length, 16), 4, '0');
    format!(
        "{}{}{}",
        js::pad_start(&js::radix(one, 16), 8, '0'),
        js::pad_start(&js::radix(other, 16), 8, '0'),
        &spelt[spelt.len() - 4..]
    )
}

#[cfg(test)]
mod tests {
    use super::{Attributes, empty, escape_xml};

    #[test]
    fn writes_paint_as_one_style_where_it_first_stood() {
        let mut attributes = Attributes::new();
        attributes
            .set("x", 1.5)
            .set("fill", "red")
            .maybe("rx", None::<f64>)
            .set("stroke", "blue")
            .set("y", 2.0);
        let mut out = String::new();
        empty("rect", &attributes, &mut out);
        assert_eq!(out, r#"<rect x="1.5" style="fill:red;stroke:blue" y="2"/>"#);
    }

    #[test]
    fn escapes_and_drops_what_xml_cannot_hold() {
        let mut out = String::new();
        escape_xml("a<b & \"c\"\u{1}", &mut out);
        assert_eq!(out, "a&lt;b &amp; &quot;c&quot;");
    }
}
