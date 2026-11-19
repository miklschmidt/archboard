//! Building a scene: a painter returns runs of items, laid out as layers on
//! lines of their own ([`lines`]) or run together ([`concat()`]), and builds
//! each shape, stroke, group and run of words with the setters here. The
//! scene's types are data; these builders are Painting's own vocabulary.

use crate::geometry::{Curve, Point, Rect, Segment, round_coord};
use crate::measure;
use crate::request::PaletteColor;
use crate::scene::{
    Cap, Colour, Geometry, Group, Item, Join, Paint, PathStep, Pointer, Purpose, Role, Shape,
    Stroke, Subject, Text, Transform,
};

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

impl Shape {
    /// A shape of some purpose and geometry, painted with nothing yet.
    pub(in crate::paint) fn new(purpose: Purpose, geometry: Geometry) -> Self {
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

    /// A box of some purpose, its corners rounded by a radius when it has one.
    pub(in crate::paint) fn rect(purpose: Purpose, rect: Rect, radius: Option<f64>) -> Self {
        Shape::new(purpose, Geometry::Rect { rect, radius })
    }

    /// A path of some purpose.
    pub(in crate::paint) fn path(purpose: Purpose, steps: Vec<PathStep>) -> Self {
        Shape::new(purpose, Geometry::Path { steps })
    }

    /// The shape filled.
    #[must_use]
    pub(in crate::paint) fn filled(mut self, paint: impl Into<Paint>) -> Self {
        self.fill = Some(paint.into());
        self
    }

    /// The shape unfilled.
    #[must_use]
    pub(in crate::paint) fn unfilled(mut self) -> Self {
        self.fill = Some(Paint::None);
        self
    }

    /// The shape stroked.
    #[must_use]
    pub(in crate::paint) fn stroked(mut self, stroke: Stroke) -> Self {
        self.stroke = Some(stroke);
        self
    }

    /// The shape taking the pointer or not.
    #[must_use]
    pub(in crate::paint) fn pointer(mut self, pointer: Pointer) -> Self {
        self.pointer = Some(pointer);
        self
    }
}

impl Stroke {
    /// A stroke in some paint, its width unstated.
    pub(in crate::paint) fn plain(paint: impl Into<Paint>) -> Self {
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

    /// A stroke in some paint, its width stated.
    pub(in crate::paint) fn new(paint: impl Into<Paint>, width: f64) -> Self {
        Stroke {
            width: Some(width),
            ..Stroke::plain(paint)
        }
    }

    /// The stroke with round ends and corners.
    #[must_use]
    pub(in crate::paint) fn rounded(self) -> Self {
        Stroke {
            cap: Some(Cap::Round),
            join: Some(Join::Round),
            ..self
        }
    }

    /// The stroke with its ends drawn one way.
    #[must_use]
    pub(in crate::paint) fn capped(self, cap: Cap) -> Self {
        Stroke {
            cap: Some(cap),
            ..self
        }
    }

    /// The stroke at a strength.
    #[must_use]
    pub(in crate::paint) fn at(self, opacity: f64) -> Self {
        Stroke {
            opacity: Some(opacity),
            ..self
        }
    }

    /// The stroke broken into dashes.
    #[must_use]
    pub(in crate::paint) fn dashed(self, dashes: &[f64]) -> Self {
        Stroke {
            dashes: dashes.to_vec(),
            ..self
        }
    }
}

impl Group {
    /// The group with words for a reader of the picture's file.
    #[must_use]
    pub(in crate::paint) fn titled(mut self, title: Option<String>) -> Self {
        self.title = title;
        self
    }

    /// The group drawing a subject.
    #[must_use]
    pub(in crate::paint) fn drawing(mut self, subject: Subject) -> Self {
        self.subject = Some(subject);
        self
    }

    /// The group moved and scaled.
    #[must_use]
    pub(in crate::paint) fn moved(mut self, transform: Transform) -> Self {
        self.transform = Some(transform);
        self
    }

    /// The group taking the pointer or not.
    #[must_use]
    pub(in crate::paint) fn pointer(mut self, pointer: Pointer) -> Self {
        self.pointer = Some(pointer);
        self
    }

    /// The group standing with some subjects.
    #[must_use]
    pub(in crate::paint) fn standing_with(mut self, members: Vec<String>) -> Self {
        self.members = members;
        self
    }
}

impl Text {
    /// The run moved so its middle across stands on its point.
    #[must_use]
    pub(in crate::paint) fn centred(self) -> Text {
        Text {
            at: Point {
                x: self.at.x - self.width / 2.0,
                ..self.at
            },
            ..self
        }
    }

    /// The run moved so its middle down stands on its point: halfway between
    /// how far its face reaches above the baseline and below it.
    #[must_use]
    pub(in crate::paint) fn central(self) -> Text {
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

impl Colour {
    /// One of the palette's named colours.
    pub(in crate::paint) const fn palette(color: PaletteColor) -> Colour {
        Colour::Palette { color }
    }
}

#[cfg(test)]
mod tests {
    use super::text;
    use crate::drawing::{DiagramFont, FontFamily};
    use crate::geometry::Point;
    use crate::scene::{Colour, Item, Text};

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
