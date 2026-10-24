//! Building a scene, and writing its elements as SVG markup.
//!
//! A painter builds a scene the way the TypeScript painter built markup:
//! fragments joined with line breaks ([`lines`]) or run together, attributes
//! set in order, a later setting of a name replacing the earlier value where
//! it stood. The writer writes paint (`fill`, `stroke`, `stop-color`) as one
//! `style` where the first of it stood, because a colour here is a CSS
//! expression of the page's tokens and only CSS is sure to resolve it.

use crate::js;
use crate::scene::{Element, Group, Item, Role, Subject, SubjectKind, TrafficMark, Value};

/// What a painter returns: some things in order, possibly none.
pub type Markup = Vec<Item>;

/// An attribute's value, or none to leave it out.
pub trait IntoAttr {
    fn into_attr(self) -> Option<Value>;
}

impl IntoAttr for f64 {
    fn into_attr(self) -> Option<Value> {
        Some(Value::Number(self))
    }
}

impl IntoAttr for i32 {
    fn into_attr(self) -> Option<Value> {
        Some(Value::Number(f64::from(self)))
    }
}

impl IntoAttr for &str {
    fn into_attr(self) -> Option<Value> {
        Some(Value::Text(self.to_owned()))
    }
}

impl IntoAttr for String {
    fn into_attr(self) -> Option<Value> {
        Some(Value::Text(self))
    }
}

impl IntoAttr for &String {
    fn into_attr(self) -> Option<Value> {
        Some(Value::Text(self.clone()))
    }
}

impl IntoAttr for Value {
    fn into_attr(self) -> Option<Value> {
        Some(self)
    }
}

impl<T: IntoAttr> IntoAttr for Option<T> {
    fn into_attr(self) -> Option<Value> {
        self.and_then(IntoAttr::into_attr)
    }
}

/// An element's attributes, in the order they will be written. A name set
/// again keeps its place and takes the new value; a value of none keeps its
/// place and is left out.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Attrs(Vec<(&'static str, Option<Value>)>);

impl Attrs {
    /// No attributes.
    pub fn new() -> Self {
        Attrs(Vec::new())
    }

    /// One attribute set.
    #[must_use]
    pub fn set(mut self, name: &'static str, value: impl IntoAttr) -> Self {
        let value = value.into_attr();
        match self.0.iter_mut().find(|(held, _)| *held == name) {
            Some(entry) => entry.1 = value,
            None => self.0.push((name, value)),
        }
        self
    }

    /// Every attribute of another set, as a spread sets them.
    #[must_use]
    pub fn with(mut self, other: Attrs) -> Self {
        for (name, value) in other.0 {
            self = self.set(name, value);
        }
        self
    }

    /// The value of one attribute, if it is set.
    pub fn get(&self, name: &str) -> Option<&Value> {
        self.0
            .iter()
            .find(|(held, _)| *held == name)
            .and_then(|(_, value)| value.as_ref())
    }

    /// The attributes that are written, in order.
    pub fn finish(self) -> Vec<(&'static str, Value)> {
        self.0
            .into_iter()
            .filter_map(|(name, value)| value.map(|value| (name, value)))
            .collect()
    }
}

/// Attributes from name and value pairs, in order.
#[macro_export]
macro_rules! attrs {
    ($($name:tt : $value:expr),* $(,)?) => {
        $crate::markup::Attrs::new()$(.set($name, $value))*
    };
}

/// A self-closing element.
pub fn tag(name: &'static str, attrs: Attrs) -> Markup {
    vec![Item::Element(Element {
        name,
        attrs: attrs.finish(),
        children: Vec::new(),
        empty: true,
    })]
}

/// An element with children.
pub fn wrap(name: &'static str, attrs: Attrs, children: Markup) -> Markup {
    vec![Item::Element(Element {
        name,
        attrs: attrs.finish(),
        children,
        empty: false,
    })]
}

/// A group: its role, the subject it draws, its other attributes and its parts.
pub fn group(role: Role, subject: Option<Subject>, attrs: Attrs, children: Markup) -> Markup {
    vec![Item::Group(Group {
        role,
        subject,
        attrs: attrs.finish(),
        children,
    })]
}

/// A text element.
pub fn text_node(attrs: Attrs, content: &str) -> Markup {
    wrap(
        "text",
        attrs,
        vec![Item::Text {
            text: content.to_owned(),
        }],
    )
}

/// Fragments joined with line breaks, the ones that hold nothing left out.
pub fn lines(fragments: Vec<Markup>) -> Markup {
    let mut joined = Vec::new();
    for fragment in fragments
        .into_iter()
        .filter(|fragment| !fragment.is_empty())
    {
        if !joined.is_empty() {
            joined.push(Item::Break);
        }
        joined.extend(fragment);
    }
    joined
}

/// Fragments run together.
pub fn concat(fragments: Vec<Markup>) -> Markup {
    fragments.into_iter().flatten().collect()
}

/// Characters XML has no spelling for, which are left out: most control
/// characters and the two non-characters at the end of the basic plane.
pub fn forbidden(character: char) -> bool {
    matches!(
        character,
        '\u{0}'..='\u{8}' | '\u{B}' | '\u{C}' | '\u{E}'..='\u{1F}' | '\u{FFFE}' | '\u{FFFF}'
    )
}

/// Text made safe for a text node or a double-quoted attribute value.
pub fn escape_xml(value: &str, out: &mut String) {
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

/// A value as `String(value)` spells it.
pub fn spelt(value: &Value) -> String {
    match value {
        Value::Number(number) => js::number(*number),
        Value::Text(text) => text.clone(),
    }
}

/// Whether an attribute is paint, written as CSS.
fn is_paint(name: &str) -> bool {
    matches!(name, "fill" | "stroke" | "stop-color")
}

/// A subject's attributes, as its group carries them first.
fn subject_pairs(subject: &Subject) -> Vec<(&'static str, Value)> {
    let mut pairs = vec![(
        "data-semantic-kind",
        Value::Text(subject.kind.as_str().to_owned()),
    )];
    let id = if subject.kind == SubjectKind::GroupRegion {
        "data-group"
    } else {
        "data-semantic-id"
    };
    pairs.push((id, Value::Text(subject.id.clone())));
    if let Some(standing) = subject.standing {
        pairs.push((
            "data-semantic-standing",
            Value::Text(standing.as_str().to_owned()),
        ));
    }
    pairs
}

/// Attributes as they are written into a tag, each with its leading space.
fn write_attributes(pairs: &[(&'static str, Value)], out: &mut String) {
    let first_paint = pairs.iter().position(|(name, _)| is_paint(name));
    for (index, (name, value)) in pairs.iter().enumerate() {
        if Some(index) == first_paint {
            let paint: Vec<String> = pairs
                .iter()
                .filter(|(held, _)| is_paint(held))
                .map(|(held, value)| format!("{held}:{}", spelt(value)))
                .collect();
            out.push_str(" style=\"");
            escape_xml(&paint.join(";"), out);
            out.push('"');
        } else if !is_paint(name) {
            out.push(' ');
            out.push_str(name);
            out.push_str("=\"");
            escape_xml(&spelt(value), out);
            out.push('"');
        }
    }
}

/// Writes things as markup; traffic is handed to a writer that knows how to draw it.
pub fn write_items(items: &[Item], out: &mut String, traffic: &dyn Fn(&TrafficMark, &mut String)) {
    for item in items {
        write_item(item, out, traffic);
    }
}

/// Writes one thing as markup.
fn write_item(item: &Item, out: &mut String, traffic: &dyn Fn(&TrafficMark, &mut String)) {
    match item {
        Item::Group(group) => {
            out.push_str("<g");
            let mut pairs = group
                .subject
                .as_ref()
                .map(subject_pairs)
                .unwrap_or_default();
            pairs.extend(group.attrs.iter().cloned());
            write_attributes(&pairs, out);
            out.push('>');
            write_items(&group.children, out, traffic);
            out.push_str("</g>");
        }
        Item::Element(element) => {
            out.push('<');
            out.push_str(element.name);
            write_attributes(&element.attrs, out);
            if element.empty {
                out.push_str("/>");
            } else {
                out.push('>');
                write_items(&element.children, out, traffic);
                out.push_str("</");
                out.push_str(element.name);
                out.push('>');
            }
        }
        Item::Text { text } => escape_xml(text, out),
        Item::Break => out.push('\n'),
        Item::Traffic(mark) => traffic(mark, out),
    }
}

/// Things written as markup, where no traffic can be among them.
pub fn markup_of(items: &[Item]) -> String {
    let mut out = String::new();
    write_items(items, &mut out, &|_, _| {});
    out
}

/// An id that is the same for the same markup in every place the renderer
/// runs: two 32-bit FNV-1a hashes with different offsets over its UTF-16 code
/// units, and its length, as 20 hex digits.
pub fn content_id(body: &str) -> String {
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

/// Seven characters of FNV-1a over some markup's UTF-16 code units, in base 36.
pub fn short_hash(markup: &str) -> String {
    let mut state: u32 = 0x811c_9dc5;
    for code in markup.encode_utf16() {
        state = (state ^ u32::from(code)).wrapping_mul(0x0100_0193);
    }
    js::pad_start(&js::radix(state, 36), 7, '0')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_paint_as_one_style_where_it_first_stood() {
        let markup = tag(
            "rect",
            attrs! { "x": 1.5, "fill": "red", "rx": Option::<f64>::None, "stroke": "blue", "y": 2.0 },
        );
        assert_eq!(
            markup_of(&markup),
            r#"<rect x="1.5" style="fill:red;stroke:blue" y="2"/>"#
        );
    }

    #[test]
    fn keeps_the_place_of_an_attribute_set_again() {
        let attributes = attrs! { "a": 1.0, "b": 2.0 }.with(attrs! { "c": 3.0, "a": "x" });
        assert_eq!(
            markup_of(&tag("p", attributes)),
            r#"<p a="x" b="2" c="3"/>"#
        );
    }

    #[test]
    fn escapes_and_drops_what_xml_cannot_hold() {
        let markup = text_node(attrs! {}, "a<b & \"c\"\u{1}");
        assert_eq!(
            markup_of(&markup),
            "<text>a&lt;b &amp; &quot;c&quot;</text>"
        );
    }

    #[test]
    fn joins_lines_skipping_empty_fragments() {
        let joined = lines(vec![tag("a", attrs! {}), Vec::new(), tag("b", attrs! {})]);
        assert_eq!(markup_of(&joined), "<a/>\n<b/>");
    }
}
