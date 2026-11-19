//! What the painter's tests share: a painting of a plain white page, and the
//! shapes, strokes and groups the tests draw on it, built from the scene's types.

use std::collections::BTreeMap;

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{
    Atlas, Colour, Geometry, Group, Item, Paint, Painting, PathStep, Purpose, Role, Scene, Shape,
    Stroke, Subject,
};

/// A 400 by 400 white page that draws this body and has no icons.
pub(crate) fn painting(body: Vec<Item>) -> Painting {
    Painting {
        scene: Scene {
            width: 400.0,
            height: 400.0,
            title: String::new(),
            description: None,
            reading: None,
            background: Colour::White,
            definitions: Vec::new(),
            body,
            atlas: Atlas::default(),
            placed: Vec::new(),
        },
        icons: BTreeMap::new(),
    }
}

/// A shape of some purpose and geometry, painted with nothing.
pub(crate) fn shape(purpose: Purpose, geometry: Geometry) -> Shape {
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

/// A box of some purpose, its corners rounded by a radius when it has one, painted with nothing.
pub(crate) fn boxed(purpose: Purpose, rect: Rect, radius: Option<f64>) -> Shape {
    shape(purpose, Geometry::Rect { rect, radius })
}

/// A box of some purpose, its corners square, filled with some paint.
pub(crate) fn filled(purpose: Purpose, rect: Rect, paint: impl Into<Paint>) -> Shape {
    Shape {
        fill: Some(paint.into()),
        ..boxed(purpose, rect, None)
    }
}

/// A route of some purpose drawn as a stroke alone.
pub(crate) fn traced(purpose: Purpose, steps: Vec<PathStep>, stroke: Stroke) -> Shape {
    Shape {
        fill: Some(Paint::None),
        stroke: Some(stroke),
        ..shape(purpose, Geometry::Path { steps })
    }
}

/// A stroke of some paint and width, its ends and corners as the painter's default.
pub(crate) fn stroke(paint: impl Into<Paint>, width: f64) -> Stroke {
    Stroke {
        paint: paint.into(),
        width: Some(width),
        opacity: None,
        cap: None,
        join: None,
        dashes: Vec::new(),
        dash_offset: None,
    }
}

/// A group of some role that draws a subject.
pub(crate) fn subject_group(role: Role, items: Vec<Item>, subject: Subject) -> Group {
    Group {
        subject: Some(subject),
        ..Group::new(role, items)
    }
}
