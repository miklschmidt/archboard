//! Building a scene: a painter returns runs of items, laid out as layers on
//! lines of their own ([`lines`]) or run together ([`concat()`]), and builds
//! each shape, stroke, group and run of words with the setters here. The
//! scene's types are data; these builders are Painting's own vocabulary.

use archboard_geometry::{Curve, Point, Rect, Segment, round_coord};
use archboard_scene::drawing::DiagramFont;
use archboard_scene::request::PaletteColor;
use archboard_scene::scene::{
    Cap, Colour, Geometry, GlyphPlace, Group, Item, Join, Paint, PathStep, Pointer, Purpose, Role,
    Shape, Stroke, Subject, Text, Transform,
};

use crate::measure;

/// What a painter returns: some items in order, possibly none.
pub(super) type Items = Vec<Item>;

/// Runs of items, each on lines of its own, the ones that hold nothing left out.
pub(super) fn lines(fragments: Vec<Items>) -> Items {
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

/// Runs of items run together.
pub(super) fn concat(fragments: Vec<Items>) -> Items {
    fragments.into_iter().flatten().collect()
}

/// One shape, as a run of items.
pub(super) fn shape(shape: Shape) -> Items {
    vec![Item::Shape(shape)]
}

/// One run of words, with its final baseline rounded after alignment.
pub(super) fn text(mut text: Text) -> Items {
    text.at = point(text.at.x, text.at.y);
    vec![Item::Text(text)]
}

/// One group, as a run of items.
pub(super) fn grouped(group: Group) -> Items {
    vec![Item::Group(group)]
}

/// A group of some role and subject holding some items, as a run of items.
pub(super) fn group(role: Role, subject: Option<Subject>, items: Items) -> Items {
    grouped(Group {
        subject,
        ..Group::new(role, items)
    })
}

/// A point, rounded as it is drawn.
pub(super) fn point(x: f64, y: f64) -> Point {
    Point {
        x: round_coord(x),
        y: round_coord(y),
    }
}

/// A route as the steps of a path, its points rounded as they are drawn.
pub(super) fn route(curve: &Curve) -> Vec<PathStep> {
    let mut steps = vec![PathStep::Move {
        to: point(curve.from.x, curve.from.y),
    }];
    steps.extend(curve.segments.iter().map(|segment| match segment {
        Segment::Line { to } => PathStep::Line {
            to: point(to.x, to.y),
        },
        Segment::Cubic { first, second, to } => PathStep::Cubic {
            first: point(first.x, first.y),
            second: point(second.x, second.y),
            to: point(to.x, to.y),
        },
    }));
    steps
}

/// How a painter builds a shape.
pub(super) trait ShapeBuilder {
    /// A shape of some purpose and geometry, painted with nothing yet.
    fn new(purpose: Purpose, geometry: Geometry) -> Self;
    /// A box of some purpose, its corners rounded by a radius when it has one.
    fn rect(purpose: Purpose, rect: Rect, radius: Option<f64>) -> Self;
    /// A path of some purpose.
    fn path(purpose: Purpose, steps: Vec<PathStep>) -> Self;
    /// The shape filled.
    #[must_use]
    fn filled(self, paint: impl Into<Paint>) -> Self;
    /// The shape unfilled.
    #[must_use]
    fn unfilled(self) -> Self;
    /// The shape stroked.
    #[must_use]
    fn stroked(self, stroke: Stroke) -> Self;
    /// The shape taking the pointer or not.
    #[must_use]
    fn pointer(self, pointer: Pointer) -> Self;
}

impl ShapeBuilder for Shape {
    fn new(purpose: Purpose, geometry: Geometry) -> Self {
        Shape {
            purpose,
            geometry,
            fill: None,
            fill_opacity: None,
            stroke: None,
            pointer: None,
            clip: None,
            marker: None,
            start_marker: None,
            members: Vec::new(),
        }
    }

    fn rect(purpose: Purpose, rect: Rect, radius: Option<f64>) -> Self {
        Self::new(purpose, Geometry::Rect { rect, radius })
    }

    fn path(purpose: Purpose, steps: Vec<PathStep>) -> Self {
        Self::new(purpose, Geometry::Path { steps })
    }

    fn filled(mut self, paint: impl Into<Paint>) -> Self {
        self.fill = Some(paint.into());
        self
    }

    fn unfilled(mut self) -> Self {
        self.fill = Some(Paint::None);
        self
    }

    fn stroked(mut self, stroke: Stroke) -> Self {
        self.stroke = Some(stroke);
        self
    }

    fn pointer(mut self, pointer: Pointer) -> Self {
        self.pointer = Some(pointer);
        self
    }
}

/// How a painter builds a stroke.
pub(super) trait StrokeBuilder {
    /// A stroke in some paint, its width unstated.
    fn plain(paint: impl Into<Paint>) -> Self;
    /// A stroke in some paint, its width stated.
    fn new(paint: impl Into<Paint>, width: f64) -> Self;
    /// The stroke with round ends and corners.
    #[must_use]
    fn rounded(self) -> Self;
    /// The stroke with its ends drawn one way.
    #[must_use]
    fn capped(self, cap: Cap) -> Self;
    /// The stroke at a strength.
    #[must_use]
    fn at(self, opacity: f64) -> Self;
    /// The stroke broken into dashes.
    #[must_use]
    fn dashed(self, dashes: &[f64]) -> Self;
}

impl StrokeBuilder for Stroke {
    fn plain(paint: impl Into<Paint>) -> Self {
        Stroke {
            paint: paint.into(),
            width: None,
            opacity: None,
            cap: None,
            join: None,
            dashes: Vec::new(),
            dash_offset: None,
        }
    }

    fn new(paint: impl Into<Paint>, width: f64) -> Self {
        Stroke {
            width: Some(width),
            ..Self::plain(paint)
        }
    }

    fn rounded(self) -> Self {
        Stroke {
            cap: Some(Cap::Round),
            join: Some(Join::Round),
            ..self
        }
    }

    fn capped(self, cap: Cap) -> Self {
        Stroke {
            cap: Some(cap),
            ..self
        }
    }

    fn at(self, opacity: f64) -> Self {
        Stroke {
            opacity: Some(opacity),
            ..self
        }
    }

    fn dashed(self, dashes: &[f64]) -> Self {
        Stroke {
            dashes: dashes.to_vec(),
            ..self
        }
    }
}

/// How a painter builds a group.
pub(super) trait GroupBuilder {
    /// The group with words for a reader of the picture's file.
    #[must_use]
    fn titled(self, title: Option<String>) -> Self;
    /// The group drawing a subject.
    #[must_use]
    fn drawing(self, subject: Subject) -> Self;
    /// The group moved and scaled.
    #[must_use]
    fn moved(self, transform: Transform) -> Self;
    /// The group taking the pointer or not.
    #[must_use]
    fn pointer(self, pointer: Pointer) -> Self;
    /// The group standing with some subjects.
    #[must_use]
    fn standing_with(self, members: Vec<String>) -> Self;
}

impl GroupBuilder for Group {
    fn titled(mut self, title: Option<String>) -> Self {
        self.title = title;
        self
    }

    fn drawing(mut self, subject: Subject) -> Self {
        self.subject = Some(subject);
        self
    }

    fn moved(mut self, transform: Transform) -> Self {
        self.transform = Some(transform);
        self
    }

    fn pointer(mut self, pointer: Pointer) -> Self {
        self.pointer = Some(pointer);
        self
    }

    fn standing_with(mut self, members: Vec<String>) -> Self {
        self.members = members;
        self
    }
}

/// How a painter sets and places a run of words.
pub(super) trait TextBuilder {
    /// Words shaped in a face at a size, their baseline starting at a point.
    fn set(at: Point, font: DiagramFont, size: f64, fill: Colour, words: &str) -> Self;
    /// The run moved so its middle across stands on its point.
    #[must_use]
    fn centred(self) -> Self;
    /// The run moved so its middle down stands on its point: halfway between
    /// how far its face reaches above the baseline and below it.
    #[must_use]
    fn central(self) -> Self;
}

impl TextBuilder for Text {
    fn set(at: Point, font: DiagramFont, size: f64, fill: Colour, words: &str) -> Self {
        let face = measure::face(font);
        let shaped = archboard_text::shape(face, words);
        Text {
            at,
            font,
            size,
            fill,
            width: measure::width(words, font, size),
            units_per_em: face.units_per_em(),
            glyphs: shaped
                .glyphs
                .iter()
                .map(|glyph| GlyphPlace {
                    face: glyph.face,
                    id: glyph.id,
                    x: glyph.x,
                    y: glyph.y,
                })
                .collect(),
            words: words.to_owned(),
        }
    }

    fn centred(self) -> Self {
        Text {
            at: Point {
                x: self.at.x - self.width / 2.0,
                ..self.at
            },
            ..self
        }
    }

    fn central(self) -> Self {
        let extent = measure::face(self.font).extent();
        let rise =
            (extent.ascent - extent.descent) / 2.0 * self.size / f64::from(extent.units_per_em);
        Text {
            at: Point {
                y: self.at.y + rise,
                ..self.at
            },
            ..self
        }
    }
}

/// How a painter names a colour.
pub(super) trait ColourBuilder {
    /// One of the palette's named colours.
    fn palette(color: PaletteColor) -> Self;
}

impl ColourBuilder for Colour {
    fn palette(color: PaletteColor) -> Self {
        Colour::Palette { color }
    }
}

#[cfg(test)]
mod tests {
    use super::{TextBuilder, text};
    use archboard_geometry::Point;
    use archboard_scene::drawing::{DiagramFont, FontFamily};
    use archboard_scene::scene::{Colour, Item, Text};

    #[test]
    fn centred_text_reaches_the_scene_at_its_final_coordinates() {
        let words = Text {
            width: 3.33,
            ..Text::set(
                Point {
                    x: 10.01,
                    y: 20.125,
                },
                DiagramFont {
                    family: FontFamily::Sans,
                    weight: 400,
                },
                12.0,
                Colour::Black,
                "a",
            )
        }
        .centred();
        let items = text(words);
        let Item::Text(run) = &items[0] else {
            panic!("words are a text item")
        };
        assert_eq!(run.at, Point { x: 8.34, y: 20.13 });
    }
}
