//! A shape of a scene: what it is, its geometry, and how it is filled and
//! stroked. Every number is the one the picture is drawn with, rounded where
//! the painter rounds it.

use serde::Serialize;
use ts_rs::TS;

use crate::geometry::{Point, Rect};
use crate::scene::colour::Paint;
use crate::scene::definition::{ClipId, MarkerId};

/// What a shape is to the picture. A painter that only draws reads the
/// geometry and the paint; the SVG painter also writes each sort as the
/// picture has always been written, and a viewer lights the rings.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum Purpose {
    /// A rounded box that states whether it takes the pointer: a part's seat,
    /// the faces and edges of a block, a tray's walls and floor, a ghost.
    Plate,
    /// The border a standing draws round a face, inside its edge.
    Border,
    /// A box: a shadow's patch, a tint over a row, a mask's ground, a frame,
    /// a plate of words.
    Box,
    /// The ring a viewer shows round whatever the person selected; hidden
    /// until then.
    Halo,
    /// A message's line drawn lit, which a viewer shows when the message is
    /// selected; hidden until then.
    LitLine,
    /// The selection ring round a shape that is not a box; hidden until selected.
    Ring,
    /// A stroked or filled line or mark: a route, a glyph, a cutout, a bracket.
    Line,
    /// A swipe laid under a line that stands for something.
    Swipe,
    /// A shape that is not a box, with straight sides and rounded corners: a
    /// flowchart's shape, its shadow's layer, a fragment's tab.
    Outline,
    /// The part of a shape that is not a box that states whether it takes the
    /// pointer: its seat, its faces, its ghost and its border.
    Solid,
    /// A part of a port's inside.
    Port,
    /// A piece of ink a line's mask cuts away where its trunk draws it.
    Cutout,
    /// An arrowhead, drawn in its marker's own ten-unit square.
    Arrowhead,
    /// A line drawn across a box at one height, which takes no pointer.
    Rule,
    /// A legend's sample of a line, or of a pulse and its glow.
    Sample,
}

/// Whether a shape or a group takes the pointer.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Pointer {
    /// It never takes the pointer, which goes to what is under it.
    None,
    /// The whole of it takes the pointer, painted or not.
    All,
}

/// How a stroke's open ends are drawn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Cap {
    /// Cut square at the end.
    Butt,
    /// Rounded past the end by half the stroke's width.
    Round,
}

/// How a stroke's corners are drawn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Join {
    /// Rounded.
    Round,
}

/// One step of a path. Absolute steps go to a point of the picture; relative
/// ones move from where the path stands.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, TS)]
#[serde(tag = "step", rename_all = "camelCase")]
pub enum PathStep {
    /// Start a new piece at a point.
    Move {
        /// Where.
        to: Point,
    },
    /// A straight run to a point.
    Line {
        /// Where it ends.
        to: Point,
    },
    /// A straight run across to a left edge.
    Across {
        /// Where it ends, across.
        x: f64,
    },
    /// A straight run down or up to a height.
    Down {
        /// Where it ends, down.
        y: f64,
    },
    /// A quadratic bend.
    Quad {
        /// Its control point.
        control: Point,
        /// Where it ends.
        to: Point,
    },
    /// A cubic bend.
    Cubic {
        /// The first control point.
        first: Point,
        /// The second control point.
        second: Point,
        /// Where it ends.
        to: Point,
    },
    /// The shorter elliptical arc to a point, its axes along the page's.
    Arc {
        /// Its radius across and down.
        radius: Point,
        /// Whether it turns clockwise on the page.
        clockwise: bool,
        /// Where it ends.
        to: Point,
    },
    /// A straight run across by a distance.
    AcrossBy {
        /// How far, right for more than zero.
        dx: f64,
    },
    /// A straight run down by a distance.
    DownBy {
        /// How far, down for more than zero.
        dy: f64,
    },
    /// The shorter elliptical arc by a distance.
    ArcBy {
        /// Its radius across and down.
        radius: Point,
        /// Whether it turns clockwise on the page.
        clockwise: bool,
        /// How far it reaches, across and down.
        by: Point,
    },
    /// Close the piece with a straight run back to where it started.
    Close,
}

/// Where a shape is.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Geometry {
    /// A box, its corners rounded by a radius when it has one.
    Rect {
        /// The box.
        rect: Rect,
        /// How round its corners are.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        radius: Option<f64>,
    },
    /// A circle round a centre; the origin when it states none.
    Circle {
        /// Its centre.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        centre: Option<Point>,
        /// Its radius.
        radius: f64,
    },
    /// A straight line between two points.
    Line {
        /// Where it starts.
        from: Point,
        /// Where it ends.
        to: Point,
    },
    /// A path of steps.
    Path {
        /// Its steps, in order.
        steps: Vec<PathStep>,
    },
}

/// How a shape's outline is stroked.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Stroke {
    /// What it is stroked with.
    pub paint: Paint,
    /// How thick; one unit when it states none.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub width: Option<f64>,
    /// How solid, from 0 to 1; fully when it states none.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub opacity: Option<f64>,
    /// How its open ends are drawn; cut square when it states none.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cap: Option<Cap>,
    /// How its corners are drawn; mitred when it states none.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub join: Option<Join>,
    /// How it is broken: the lengths of each dash and each gap, in turn; solid when empty.
    pub dashes: Vec<f64>,
    /// How far into its dashes it starts.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub dash_offset: Option<f64>,
}

/// One shape: what it is, where it is, and how it is painted.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Shape {
    /// What it is to the picture.
    pub purpose: Purpose,
    /// Where it is.
    pub geometry: Geometry,
    /// What fills it; black when it states none, as a mask reads it.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub fill: Option<Paint>,
    /// How solid its fill is, from 0 to 1; fully when it states none.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub fill_opacity: Option<f64>,
    /// How its outline is stroked; not at all when it states none.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub stroke: Option<Stroke>,
    /// Whether it takes the pointer; as a painted shape does when it states none.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub pointer: Option<Pointer>,
    /// The clip it is drawn through.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub clip: Option<ClipId>,
    /// The arrowhead at the end of its path, turned to the path's direction there.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub marker: Option<MarkerId>,
    /// The subjects it stands with, which a viewer lights and recedes it with.
    pub members: Vec<String>,
}

impl Shape {
    /// A shape of some purpose and geometry, painted with nothing yet.
    pub fn new(purpose: Purpose, geometry: Geometry) -> Self {
        Shape {
            purpose,
            geometry,
            fill: None,
            fill_opacity: None,
            stroke: None,
            pointer: None,
            clip: None,
            marker: None,
            members: Vec::new(),
        }
    }

    /// A box of some purpose, its corners rounded by a radius when it has one.
    pub fn rect(purpose: Purpose, rect: Rect, radius: Option<f64>) -> Self {
        Shape::new(purpose, Geometry::Rect { rect, radius })
    }

    /// A path of some purpose.
    pub fn path(purpose: Purpose, steps: Vec<PathStep>) -> Self {
        Shape::new(purpose, Geometry::Path { steps })
    }

    /// The shape filled.
    #[must_use]
    pub fn filled(mut self, paint: impl Into<Paint>) -> Self {
        self.fill = Some(paint.into());
        self
    }

    /// The shape unfilled.
    #[must_use]
    pub fn unfilled(mut self) -> Self {
        self.fill = Some(Paint::None);
        self
    }

    /// The shape stroked.
    #[must_use]
    pub fn stroked(mut self, stroke: Stroke) -> Self {
        self.stroke = Some(stroke);
        self
    }

    /// The shape taking the pointer or not.
    #[must_use]
    pub fn pointer(mut self, pointer: Pointer) -> Self {
        self.pointer = Some(pointer);
        self
    }
}

impl Stroke {
    /// A stroke in some paint, its width unstated.
    pub fn plain(paint: impl Into<Paint>) -> Self {
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
    pub fn new(paint: impl Into<Paint>, width: f64) -> Self {
        Stroke {
            width: Some(width),
            ..Stroke::plain(paint)
        }
    }

    /// The stroke with round ends and corners.
    #[must_use]
    pub fn rounded(self) -> Self {
        Stroke {
            cap: Some(Cap::Round),
            join: Some(Join::Round),
            ..self
        }
    }

    /// The stroke with its ends drawn one way.
    #[must_use]
    pub fn capped(self, cap: Cap) -> Self {
        Stroke {
            cap: Some(cap),
            ..self
        }
    }

    /// The stroke at a strength.
    #[must_use]
    pub fn at(self, opacity: f64) -> Self {
        Stroke {
            opacity: Some(opacity),
            ..self
        }
    }

    /// The stroke broken into dashes.
    #[must_use]
    pub fn dashed(self, dashes: &[f64]) -> Self {
        Stroke {
            dashes: dashes.to_vec(),
            ..self
        }
    }
}
