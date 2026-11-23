//! A shape written as an SVG element. What a shape is decides the element
//! and the order of its attributes, as the picture has always written it, so
//! the same scene is the same bytes.

use archboard_scene::names::word;
use archboard_scene::scene::{Geometry, MarkerId, Purpose, Shape};

use crate::css::paint;
use crate::definitions::{Names, marker_id};
use crate::path::{Spelling, path_data};
use crate::xml::{Attributes, Spelt, empty};

/// The class of everything a viewer shows only round what is selected.
pub(crate) const HALO_CLASS: &str = "ab-halo";

/// What SVG draws where an attribute is absent. A scene states every value, and
/// a stated value that equals its attribute's initial one is not written: the
/// reader draws the same without it. The stylesheet's selectors on a written
/// value (`path[stroke-width="…"]`) must not name an initial one.
const INITIAL: [(&str, &str); 7] = [
    ("fill-opacity", "1"),
    ("stroke-width", "1"),
    ("stroke-opacity", "1"),
    ("stroke-linecap", "butt"),
    ("stroke-linejoin", "miter"),
    ("stroke-dashoffset", "0"),
    ("opacity", "1"),
];

/// An attribute set to a value the scene states, unless that is the initial one.
pub(crate) fn stated<'a>(
    out: &'a mut Attributes,
    name: &'static str,
    value: impl Spelt,
) -> &'a mut Attributes {
    let value = value.spelt();
    if INITIAL
        .iter()
        .any(|(attribute, initial)| *attribute == name && *initial == value)
    {
        return out;
    }
    out.set(name, value)
}

/// One attribute a shape can carry.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Key {
    Class,
    Place,
    Marker,
    Fill,
    FillOpacity,
    Stroke,
    Width,
    Opacity,
    Cap,
    Join,
    Dash,
    Offset,
    Pointer,
    Clip,
    Members,
}

use Key::{
    Cap, Class, Clip, Dash, Fill, FillOpacity, Join, Marker, Members, Offset, Opacity, Place,
    Pointer, Stroke, Width,
};

/// The order a shape's attributes are written in, by its geometry and what it is.
fn template(shape: &Shape) -> &'static [Key] {
    match (&shape.geometry, shape.purpose) {
        (Geometry::Rect { .. }, Purpose::Halo) => &[Class, Place, Width, Fill, Stroke],
        (Geometry::Rect { .. }, Purpose::Plate) => &[Place, Pointer, Clip, Fill, FillOpacity],
        (Geometry::Rect { .. }, Purpose::Border) => &[Place, Fill, Stroke, Width, Dash, Pointer],
        (Geometry::Rect { .. }, _) => &[Place, Fill, Stroke, Opacity, Width, Dash, FillOpacity],
        (Geometry::Circle { .. }, _) => &[Place, Fill, Stroke, Width, Opacity, Members],
        (Geometry::Line { .. }, Purpose::Halo) => {
            &[Class, Place, Stroke, Fill, Width, Dash, Offset]
        }
        (Geometry::Line { .. }, _) => &[
            Place, Pointer, Fill, Stroke, Opacity, Width, Cap, Join, Dash, Offset,
        ],
        (Geometry::Path { .. }, Purpose::Halo | Purpose::Ring) => {
            &[Class, Place, Width, Opacity, Cap, Join, Fill, Stroke]
        }
        (Geometry::Path { .. }, Purpose::LitLine) => {
            &[Class, Place, Marker, Fill, Stroke, Width, Cap, Join, Dash]
        }
        (Geometry::Path { .. }, Purpose::Solid) => {
            &[Place, Pointer, Fill, Stroke, Width, Dash, FillOpacity]
        }
        (Geometry::Path { .. }, Purpose::Outline) => &[Place, Fill, Stroke, Width],
        (Geometry::Path { .. }, Purpose::Port) => &[Place, Fill, Pointer],
        (Geometry::Path { .. }, Purpose::Cutout) => &[Place, Width, Cap, Fill, Stroke],
        (Geometry::Path { .. }, Purpose::Sample) => {
            &[Place, Fill, Cap, Stroke, Opacity, Width, Dash]
        }
        (Geometry::Path { .. }, _) => &[
            Place, Marker, Fill, Stroke, Width, Opacity, Cap, Join, Dash, Members,
        ],
    }
}

/// How a path of some purpose is spelt; an arrowhead as the place it is drawn in asks.
fn spelling_of(purpose: Purpose, arrowhead: Spelling) -> Spelling {
    match purpose {
        Purpose::Arrowhead => arrowhead,
        Purpose::Ring | Purpose::Solid | Purpose::Outline => Spelling::Spaced,
        Purpose::Port => Spelling::Tight,
        Purpose::Sample => Spelling::Compact,
        Purpose::Plate
        | Purpose::Border
        | Purpose::Box
        | Purpose::Halo
        | Purpose::LitLine
        | Purpose::Line
        | Purpose::Imprint
        | Purpose::Swipe
        | Purpose::Cutout
        | Purpose::Rule => Spelling::Route,
    }
}

/// The attributes that say where a shape is.
fn place(shape: &Shape, arrowhead: Spelling, out: &mut Attributes) {
    match &shape.geometry {
        Geometry::Rect { rect, radius } => {
            out.set("x", rect.x)
                .set("y", rect.y)
                .set("width", rect.width)
                .set("height", rect.height)
                .maybe("rx", *radius);
        }
        Geometry::Circle { centre, radius } => {
            if let Some(centre) = centre {
                out.set("cx", centre.x).set("cy", centre.y);
            }
            out.set("r", *radius);
        }
        Geometry::Line { from, to } => {
            out.set("x1", from.x)
                .set("y1", from.y)
                .set("x2", to.x)
                .set("y2", to.y);
        }
        Geometry::Path { steps } => {
            out.set("d", path_data(steps, spelling_of(shape.purpose, arrowhead)));
        }
    }
}

/// Some numbers as a list, a space between each.
pub(crate) fn listed(numbers: &[f64]) -> String {
    numbers
        .iter()
        .map(|number| archboard_scene::js::number(*number))
        .collect::<Vec<_>>()
        .join(" ")
}

/// One attribute of a shape, when the shape has it.
fn key(shape: &Shape, key: Key, names: &Names, arrowhead: Spelling, out: &mut Attributes) {
    let stroke = shape.stroke.as_ref();
    match key {
        Class => {
            out.set("class", HALO_CLASS);
        }
        Place => place(shape, arrowhead, out),
        Marker => {
            let url = |id: &MarkerId| format!("url(#{})", marker_id(id));
            out.maybe("marker-start", shape.start_marker.as_ref().map(url));
            out.maybe("marker-end", shape.marker.as_ref().map(url));
        }
        Fill => {
            out.maybe("fill", shape.fill.as_ref().map(paint));
        }
        FillOpacity => {
            out.maybe("fill-opacity", shape.fill_opacity);
        }
        Stroke => {
            out.maybe("stroke", stroke.map(|stroke| paint(&stroke.paint)));
        }
        Width => {
            if let Some(stroke) = stroke {
                stated(out, "stroke-width", stroke.width);
            }
        }
        Opacity => {
            if let Some(stroke) = stroke {
                stated(out, "stroke-opacity", stroke.opacity);
            }
        }
        Cap => {
            if let Some(stroke) = stroke {
                stated(out, "stroke-linecap", word(&stroke.cap));
            }
        }
        Join => {
            if let Some(stroke) = stroke {
                stated(out, "stroke-linejoin", word(&stroke.join));
            }
        }
        Dash => {
            out.maybe(
                "stroke-dasharray",
                stroke
                    .filter(|stroke| !stroke.dashes.is_empty())
                    .map(|stroke| listed(&stroke.dashes)),
            );
        }
        Offset => {
            if let Some(stroke) = stroke {
                stated(out, "stroke-dashoffset", stroke.dash_offset);
            }
        }
        Pointer => {
            out.maybe(
                "pointer-events",
                shape.pointer.map(|pointer| word(&pointer)),
            );
        }
        Clip => {
            out.maybe(
                "clip-path",
                shape
                    .clip
                    .as_ref()
                    .map(|id| format!("url(#{})", names.clip(id))),
            );
        }
        Members => {
            out.maybe(
                "data-members",
                (!shape.members.is_empty()).then(|| shape.members.join(" ")),
            );
        }
    }
}

/// Every attribute a shape can carry, in the order a shape no template
/// expects it of writes it.
const EVERY: [Key; 15] = [
    Class,
    Place,
    Marker,
    Fill,
    FillOpacity,
    Stroke,
    Width,
    Opacity,
    Cap,
    Join,
    Dash,
    Offset,
    Pointer,
    Clip,
    Members,
];

/// A shape as an element, an arrowhead spelt as the place it is drawn in asks.
pub(crate) fn write_shape(shape: &Shape, names: &Names, arrowhead: Spelling, out: &mut String) {
    let order = template(shape);
    let mut attributes = Attributes::new();
    for one in order {
        key(shape, *one, names, arrowhead, &mut attributes);
    }
    // Whatever the template does not expect is still written, last, so a
    // painter's new property is seen in the bytes, never lost.
    for one in EVERY
        .iter()
        .filter(|one| !order.contains(one) && **one != Class)
    {
        key(shape, *one, names, arrowhead, &mut attributes);
    }
    let name = match shape.geometry {
        Geometry::Rect { .. } => "rect",
        Geometry::Circle { .. } => "circle",
        Geometry::Line { .. } => "line",
        Geometry::Path { .. } => "path",
    };
    empty(name, &attributes, out);
}

#[cfg(test)]
mod tests {
    use archboard_scene::paint::design::far_line_widths;

    use super::stated;
    use crate::xml::Attributes;

    #[test]
    fn a_far_view_rule_names_only_widths_that_are_written() {
        for (near, _) in far_line_widths() {
            let mut out = Attributes::new();
            stated(&mut out, "stroke-width", near);
            let mut written = String::new();
            out.write(&mut written);
            assert!(
                written.contains("stroke-width"),
                "a line of width {near} would be written without it, and the far view's rule would miss it"
            );
        }
    }
}
