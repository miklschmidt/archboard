//! A picture's words as the core shaped them (ADR 0057): each glyph a
//! document draws defined once, as a path in the units of its face, and each
//! run of words written twice over. Its glyphs draw it, so the picture needs
//! no font. Its words, in no ink and stretched over the glyphs, are what a
//! search finds, a copy takes and a screen reader reads.

use std::collections::BTreeSet;

use archboard_scene::js;
use archboard_scene::scene::{Item, Text};
use archboard_text::{Face, Segment, outline};

use crate::colour::css;
use crate::xml::{Attributes, close, coord, empty, escape_xml, open};

/// The glyphs some items draw, each by its face and its id in the face.
#[derive(Debug, Default)]
pub(crate) struct Glyphs(BTreeSet<(Face, u32)>);

impl Glyphs {
    /// The glyphs some items draw, in groups and boxes of their own too.
    pub(crate) fn of(items: &[Item]) -> Glyphs {
        let mut glyphs = Glyphs::default();
        glyphs.walk(items);
        glyphs
    }

    fn walk(&mut self, items: &[Item]) {
        for item in items {
            match item {
                Item::Text(text) => {
                    self.0
                        .extend(text.glyphs.iter().map(|glyph| (glyph.face, glyph.id)));
                }
                Item::Group(group) => self.walk(&group.items),
                Item::Viewport(viewport) => self.walk(&viewport.items),
                Item::Shape(_)
                | Item::Icon(_)
                | Item::Definitions { .. }
                | Item::Traffic(_)
                | Item::Break => {}
            }
        }
    }

    /// Each glyph that draws anything, as a path.
    pub(crate) fn write_definitions(&self, out: &mut String) {
        for &(face, glyph) in &self.0 {
            let steps = outline(face, glyph);
            if steps.is_empty() {
                continue;
            }
            let mut path = Attributes::new();
            path.set("id", glyph_id(face, glyph))
                .set("d", path_data(&steps));
            empty("path", &path, out);
        }
    }
}

/// A glyph's id: its face and its id in the face. The same glyph has the same
/// id and the same path in every picture, so two pictures on one page that
/// define it agree.
fn glyph_id(face: Face, glyph: u32) -> String {
    let code = match face {
        Face::SansRegular => "s4",
        Face::SansMedium => "s5",
        Face::MonoRegular => "m4",
        Face::MonoMedium => "m5",
        Face::GreekRegular => "n4",
        Face::GreekMedium => "n5",
        Face::Symbols => "y4",
        Face::Math => "x4",
    };
    format!("g{code}-{glyph}")
}

/// An outline as path data, in the units of its face.
fn path_data(steps: &[Segment]) -> String {
    let mut data = String::new();
    let mut put = |command: char, numbers: &[f64]| {
        data.push(command);
        for (index, number) in numbers.iter().enumerate() {
            if index > 0 && *number >= 0.0 {
                data.push(' ');
            }
            data.push_str(&js::number(*number));
        }
    };
    for step in steps {
        match *step {
            Segment::Move(x, y) => put('M', &[x, y]),
            Segment::Line(x, y) => put('L', &[x, y]),
            Segment::Quad(cx, cy, x, y) => put('Q', &[cx, cy, x, y]),
            Segment::Cubic(cx0, cy0, cx1, cy1, x, y) => put('C', &[cx0, cy0, cx1, cy1, x, y]),
            Segment::Close => put('Z', &[]),
        }
    }
    data
}

/// A run of words: its glyphs, then its words over them in no ink.
pub(crate) fn write_text(text: &Text, out: &mut String) {
    let drawn: Vec<_> = text
        .glyphs
        .iter()
        .filter(|glyph| !outline(glyph.face, glyph.id).is_empty())
        .collect();
    if !drawn.is_empty() {
        let scale = text.size / f64::from(text.units_per_em);
        let mut run = Attributes::new();
        run.set(
            "transform",
            format!(
                "translate({} {}) scale({})",
                coord(text.at.x),
                coord(text.at.y),
                js::number(scale)
            ),
        )
        .set("fill", css(&text.fill))
        .set("aria-hidden", "true");
        open("g", &run, out);
        for glyph in drawn {
            let mut used = Attributes::new();
            used.set("href", format!("#{}", glyph_id(glyph.face, glyph.id)))
                .set("x", f64::from(glyph.x))
                .maybe("y", (glyph.y != 0).then_some(f64::from(glyph.y)));
            empty("use", &used, out);
        }
        close("g", out);
    }
    let mut words = Attributes::new();
    words
        .maybe("xml:space", keeps_spaces(&text.words).then_some("preserve"))
        .set("x", coord(text.at.x))
        .set("y", coord(text.at.y))
        .set("font-size", text.size)
        .maybe("textLength", (text.width > 0.0).then(|| coord(text.width)))
        .maybe(
            "lengthAdjust",
            (text.width > 0.0).then_some("spacingAndGlyphs"),
        )
        .set("fill", "transparent");
    open("text", &words, out);
    escape_xml(&text.words, out);
    close("text", out);
}

/// Whether words hold spaces a document would otherwise fold: at either end,
/// or two together.
fn keeps_spaces(words: &str) -> bool {
    words.starts_with(' ') || words.ends_with(' ') || words.contains("  ")
}
