//! The scene: the ordered and positioned list of what a picture is made of
//! (ADR 0059), as typed values a frontend paints without reading SVG or CSS.
//! Each painter turns it into what a frontend shows; the SVG painter
//! (`archboard-svg`) writes it as a document.
//!
//! A scene is items in the order they are drawn: groups ([`Group`]), shapes
//! ([`Shape`]), runs of words, icons and viewports ([`Text`], [`Icon`],
//! [`Viewport`]), definitions ([`Definition`]) and trains of pulses
//! ([`TrafficMark`]). Colours name the page's tokens and the operations that
//! mix them ([`Colour`]); the frontend resolves them in its theme. Every type
//! has one path: `scene::` and its name. The scene holds no interaction state: the
//! light, the recede, the far view, the camera and the flight are each
//! painter's own (ADR 0023).

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use ts_rs::TS;

use crate::drawing::ReadingDirection;

mod colour;
mod definition;
mod group;
mod shape;
mod text;
mod traffic;

pub use colour::{Colour, Paint, Token};
pub use definition::{
    Clip, ClipId, Definition, Gradient, GradientForm, GradientId, Head, HeadInk, Marker, MarkerId,
    Mask, MaskId, Stop,
};
pub use group::{
    EntryKind, Group, LineFacts, Role, ShadowOf, Slot, Subject, SubjectKind, Transform,
};
pub use shape::{Cap, Geometry, Join, PathStep, Pointer, Purpose, Shape, Stroke};
pub use text::{GlyphPlace, Icon, Text, Viewport};
pub use traffic::{
    BeamGradient, BeamPiece, Frame, MaskLayer, Motion, PulseLook, Slide, TrafficMark,
};

/// One thing in a scene's order.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "item", rename_all = "camelCase")]
pub enum Item {
    /// A group, which a painter can light or pick out by its role and subject.
    Group(Group),
    /// A shape.
    Shape(Shape),
    /// A run of words.
    Text(Text),
    /// An icon.
    Icon(Icon),
    /// What is drawn in a box of its own.
    Viewport(Viewport),
    /// What the items after it refer to.
    Definitions {
        /// The definitions, in order.
        definitions: Vec<Definition>,
    },
    /// A train of pulses on a route.
    Traffic(TrafficMark),
    /// A line break between two things, where the document has one.
    Break,
}

/// Every item among some, those inside groups and viewports too: depth first,
/// each one before what it holds. Which items hold items is known here only.
pub fn every(items: &[Item]) -> impl Iterator<Item = &Item> {
    let mut pending: Vec<&Item> = items.iter().rev().collect();
    std::iter::from_fn(move || {
        let item = pending.pop()?;
        match item {
            Item::Group(group) => pending.extend(group.items.iter().rev()),
            Item::Viewport(viewport) => pending.extend(viewport.items.iter().rev()),
            _ => {}
        }
        Some(item)
    })
}

/// Visit a list of items and each list inside it, at any depth: a list is
/// visited before the lists of the items it keeps, so a visit may take items
/// out of its list or put new ones in.
pub fn each_list(items: &mut Vec<Item>, visit: &mut dyn FnMut(&mut Vec<Item>)) {
    visit(items);
    for item in items {
        match item {
            Item::Group(group) => each_list(&mut group.items, visit),
            Item::Viewport(viewport) => each_list(&mut viewport.items, visit),
            _ => {}
        }
    }
}

/// One subject's box in the picture, in the units of the document.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(rename = "DiagramBox")]
pub struct AtlasBox {
    /// Distance from the left edge of the document.
    pub x: f64,
    /// Distance from the top edge of the document.
    pub y: f64,
    /// How wide the subject's box is.
    pub width: f64,
    /// How tall the subject's box is.
    pub height: f64,
}

/// Boxes by subject id, in the order they were drawn.
#[derive(Clone, Debug, Default, PartialEq, TS)]
#[ts(type = "Record<string, DiagramBox>")]
pub struct Boxes(pub Vec<(String, AtlasBox)>);

impl Serialize for Boxes {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_map(self.0.iter().map(|(id, rect)| (id, rect)))
    }
}

impl<'de> Deserialize<'de> for Boxes {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        // A map's order is the order it was written in, which a `Vec` of pairs keeps
        // only when it is read as one: the painter reads the boxes by id, so a sorted
        // map loses nothing it needs.
        let boxes: std::collections::BTreeMap<String, AtlasBox> =
            Deserialize::deserialize(deserializer)?;
        Ok(Boxes(boxes.into_iter().collect()))
    }
}

/// Where every subject landed in the picture.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(rename = "DiagramAtlas")]
pub struct Atlas {
    /// The box of each node, by node id.
    pub nodes: Boxes,
    /// The box of each drawn line, by relationship id.
    pub edges: Boxes,
    /// The box of each group's region, by the region's id.
    pub regions: Boxes,
}

/// A whole picture.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct Scene {
    /// The page's width, in the document's units.
    pub width: f64,
    /// The page's height, in the document's units.
    pub height: f64,
    /// The accessible name.
    pub title: String,
    /// A longer description, when there is one.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub description: Option<String>,
    /// Which way the page reads, when the grammar has a reading direction.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reading: Option<ReadingDirection>,
    /// The page behind everything.
    pub background: Colour,
    /// What the body refers to: arrowheads, gradients, the light of a face.
    pub definitions: Vec<Definition>,
    /// What the page draws, in the order it is drawn.
    pub body: Vec<Item>,
    /// Where every subject landed.
    pub atlas: Atlas,
    /// Every subject the drawing placed, legend and title aside: what a key counts.
    pub placed: Vec<String>,
}

/// A scene with the outlines of the icons it names, which the scene names and
/// does not carry: everything a painter needs to draw it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Painting {
    /// What is drawn.
    pub scene: Scene,
    /// Each icon's SVG path data, by its export name.
    pub icons: std::collections::BTreeMap<String, Vec<String>>,
}

/// A picture written as a document: what the core answers its host.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PaintedDocument {
    /// The whole SVG document.
    pub svg: String,
    /// The page width, in the document's own units.
    pub width: f64,
    /// The page height, in the document's own units.
    pub height: f64,
    /// Where every subject the renderer drew ended up.
    pub atlas: Atlas,
    /// Every subject the drawing placed, by id: what its key counts the marks
    /// of, and what an answer says the picture draws. A legend drawn alone keys
    /// the drawing it leaves out, so these are still that drawing's.
    pub placed: Vec<String>,
    /// Which way an architecture reads (ADR 0032). A sequence reads one way and
    /// says nothing.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reading_direction: Option<ReadingDirection>,
}

#[cfg(test)]
mod tests {
    use super::{Group, Item, Role, Viewport, each_list, every};
    use crate::geometry::Rect;

    fn group(items: Vec<Item>) -> Item {
        Item::Group(Group::new(Role::Marks, items))
    }

    fn viewport(items: Vec<Item>) -> Item {
        let frame = Rect {
            x: 0.0,
            y: 0.0,
            width: 1.0,
            height: 1.0,
        };
        Item::Viewport(Viewport {
            frame,
            view: frame,
            items,
        })
    }

    /// A group holding a viewport that holds a group, then a break, then a break
    /// after the group: `g v g b b b`.
    fn nested() -> Vec<Item> {
        vec![
            group(vec![viewport(vec![group(vec![Item::Break])]), Item::Break]),
            Item::Break,
        ]
    }

    fn name(item: &Item) -> char {
        match item {
            Item::Group(_) => 'g',
            Item::Viewport(_) => 'v',
            _ => 'b',
        }
    }

    #[test]
    fn every_goes_depth_first_through_groups_and_viewports_parents_first() {
        let items = nested();
        assert_eq!(every(&items).map(name).collect::<String>(), "gvgbbb");
    }

    #[test]
    fn each_list_visits_every_list_and_what_a_visit_leaves_in_it() {
        let mut items = nested();
        let mut seen = 0;
        each_list(&mut items, &mut |list| {
            seen += 1;
            list.retain(|item| !matches!(item, Item::Break));
        });
        assert_eq!(seen, 4, "the page's list and the three inside it");
        assert_eq!(every(&items).map(name).collect::<String>(), "gvg");
    }
}
