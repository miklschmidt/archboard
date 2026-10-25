//! What a document defines once and refers to by id: arrowheads, gradients,
//! the masks that hide where lines cross and the clips that ports cut. A
//! scene names each by what it is for; the document spells that name as an
//! id, a mask's and a clip's from what it holds, so the same definition has
//! the same id in every place the renderer runs.

use std::collections::HashMap;

use archboard_scene::names::word;
use archboard_scene::scene::{
    Clip, ClipId, Definition, Gradient, GradientForm, GradientId, HeadInk, Item, Marker, MarkerId,
    Mask, MaskId, Scene, Stop,
};

use crate::colour::{colour_id, css};
use crate::path::{Spelling, path_data};
use crate::shapes::write_shape;
use crate::xml::{Attributes, close, content_id, empty, open};

/// The ids a document spells its definitions with.
#[derive(Debug, Default)]
pub(crate) struct Names {
    /// Each line's mask, by the relationship it masks.
    masks: HashMap<String, String>,
    /// Each card's clip, by the card.
    clips: HashMap<String, String>,
}

impl Names {
    /// The ids of every mask and clip a scene defines.
    pub(crate) fn of(scene: &Scene) -> Names {
        let mut names = Names::default();
        names.take(&scene.definitions);
        names.walk(&scene.body);
        names
    }

    /// The masks and clips among some definitions.
    fn take(&mut self, definitions: &[Definition]) {
        for definition in definitions {
            match definition {
                Definition::Mask(mask) => {
                    let id = format!("crossing-{}", content_id(&mask_body(mask)));
                    self.masks.insert(mask.id.line.clone(), id);
                }
                Definition::Clip(clip) => {
                    let id = format!("ab-port-{}", content_id(&clip_outline(clip)));
                    self.clips.insert(clip.id.card.clone(), id);
                }
                Definition::Marker(_) | Definition::Gradient(_) => {}
            }
        }
    }

    /// The masks and clips defined among some items.
    fn walk(&mut self, items: &[Item]) {
        for item in items {
            match item {
                Item::Definitions { definitions } => self.take(definitions),
                Item::Group(group) => self.walk(&group.items),
                Item::Viewport(viewport) => self.walk(&viewport.items),
                Item::Shape(_) | Item::Text(_) | Item::Icon(_) | Item::Traffic(_) | Item::Break => {
                }
            }
        }
    }

    /// A line's mask's id.
    ///
    /// # Panics
    ///
    /// When the scene refers to a mask it does not define, which its painter never does.
    pub(crate) fn mask(&self, id: &MaskId) -> &str {
        self.masks
            .get(&id.line)
            .expect("a scene defines every mask it refers to")
    }

    /// A card's clip's id.
    ///
    /// # Panics
    ///
    /// When the scene refers to a clip it does not define, which its painter never does.
    pub(crate) fn clip(&self, id: &ClipId) -> &str {
        self.clips
            .get(&id.card)
            .expect("a scene defines every clip it refers to")
    }
}

/// A gradient's id.
pub(crate) fn gradient_id(id: GradientId) -> String {
    match id {
        GradientId::Shadow { row, column } => format!("ab-shadow-{row}{column}"),
        GradientId::Sheen => "ab-slab-sheen".to_owned(),
        GradientId::SoftSheen => "ab-slab-sheen-soft".to_owned(),
        GradientId::PortWell => "ab-port-well".to_owned(),
        GradientId::PortFade => "ab-port-fade".to_owned(),
        GradientId::FlowGold => "ab-flow-gold".to_owned(),
        GradientId::LegendPulse => "export-legend-pulse".to_owned(),
    }
}

/// An arrowhead's id.
pub(crate) fn marker_id(id: &MarkerId) -> String {
    match id {
        MarkerId::Shared { head, weight, ink } => {
            let suffix = match ink {
                HeadInk::Neutral => String::new(),
                other => format!("-{}", word(other)),
            };
            format!("ah-{}-{}{suffix}", word(head), word(weight))
        }
        MarkerId::Line { head, weight, ink } => format!(
            "edge-head-{}-{}-{}",
            word(head),
            word(weight),
            colour_id(ink)
        ),
    }
}

/// What a mask is drawn of, as markup.
fn mask_body(mask: &Mask) -> String {
    let names = Names::default();
    let mut body = String::new();
    for shape in &mask.shapes {
        write_shape(shape, &names, Spelling::Route, &mut body);
    }
    body
}

/// A clip's outline, as markup.
fn clip_outline(clip: &Clip) -> String {
    let mut attributes = Attributes::new();
    attributes
        .set("d", path_data(&clip.outline, Spelling::Tight))
        .set("clip-rule", "evenodd");
    let mut out = String::new();
    empty("path", &attributes, &mut out);
    out
}

/// A gradient's stop.
fn write_stop(stop: &Stop, out: &mut String) {
    let mut attributes = Attributes::new();
    attributes
        .maybe("offset", stop.offset)
        .set("stop-color", css(&stop.colour))
        .maybe("stop-opacity", stop.opacity);
    empty("stop", &attributes, out);
}

/// Where a gradient runs, as its attributes spell it: a soft shadow's
/// patch states its radius first, a line in the picture's own units its two
/// x first.
fn form(gradient: &Gradient, attributes: &mut Attributes) -> &'static str {
    match gradient.form {
        GradientForm::Radial { centre, radius } => {
            if matches!(gradient.id, GradientId::Shadow { .. }) {
                attributes
                    .set("r", radius)
                    .set("cx", centre.x)
                    .set("cy", centre.y);
            } else {
                attributes
                    .set("cx", centre.x)
                    .set("cy", centre.y)
                    .set("r", radius);
            }
            "radialGradient"
        }
        GradientForm::Linear {
            line: None,
            user_space,
        } => {
            if user_space {
                attributes.set("gradientUnits", "userSpaceOnUse");
            }
            "linearGradient"
        }
        GradientForm::Linear {
            line: Some((from, to)),
            user_space: true,
        } => {
            attributes
                .set("gradientUnits", "userSpaceOnUse")
                .set("x1", from.x)
                .set("x2", to.x)
                .set("y1", from.y)
                .set("y2", to.y);
            "linearGradient"
        }
        GradientForm::Linear {
            line: Some((from, to)),
            user_space: false,
        } => {
            attributes
                .set("x1", from.x)
                .set("y1", from.y)
                .set("x2", to.x)
                .set("y2", to.y);
            "linearGradient"
        }
    }
}

/// A gradient.
fn write_gradient(gradient: &Gradient, out: &mut String) {
    let mut attributes = Attributes::new();
    attributes.set("id", gradient_id(gradient.id));
    let name = form(gradient, &mut attributes);
    open(name, &attributes, out);
    for stop in &gradient.stops {
        write_stop(stop, out);
    }
    close(name, out);
}

/// An arrowhead's marker.
fn write_marker(marker: &Marker, names: &Names, out: &mut String) {
    let view = archboard_scene::js::number(marker.view);
    let mut attributes = Attributes::new();
    attributes
        .set("id", marker_id(&marker.id))
        .set("viewBox", format!("0 0 {view} {view}"))
        .set("refX", marker.reference.x)
        .set("refY", marker.reference.y)
        .set("markerWidth", marker.size)
        .set("markerHeight", marker.size)
        .set("orient", "auto-start-reverse");
    open("marker", &attributes, out);
    for shape in &marker.shapes {
        write_shape(shape, names, Spelling::Marker, out);
    }
    close("marker", out);
}

/// A line's mask.
fn write_mask(mask: &Mask, names: &Names, out: &mut String) {
    let mut attributes = Attributes::new();
    attributes
        .set("id", names.mask(&mask.id))
        .set("maskUnits", "userSpaceOnUse")
        .set("maskContentUnits", "userSpaceOnUse")
        .set("x", mask.bounds.x)
        .set("y", mask.bounds.y)
        .set("width", mask.bounds.width)
        .set("height", mask.bounds.height);
    open("mask", &attributes, out);
    out.push_str(&mask_body(mask));
    close("mask", out);
}

/// A card's clip.
fn write_clip(clip: &Clip, names: &Names, out: &mut String) {
    let mut attributes = Attributes::new();
    attributes
        .set("id", names.clip(&clip.id))
        .set("clipPathUnits", "objectBoundingBox");
    open("clipPath", &attributes, out);
    out.push_str(&clip_outline(clip));
    close("clipPath", out);
}

/// Whether two definitions in a row stand on lines of their own: the soft
/// shadow's patches do, as they always have.
fn on_own_lines(before: &Definition, after: &Definition) -> bool {
    let shadow = |definition: &Definition| {
        matches!(
            definition,
            Definition::Gradient(Gradient {
                id: GradientId::Shadow { .. },
                ..
            })
        )
    };
    shadow(before) && shadow(after)
}

/// Some definitions, in order.
pub(crate) fn write_definitions(definitions: &[Definition], names: &Names, out: &mut String) {
    for (index, definition) in definitions.iter().enumerate() {
        if index > 0 && on_own_lines(&definitions[index - 1], definition) {
            out.push('\n');
        }
        match definition {
            Definition::Marker(marker) => write_marker(marker, names, out),
            Definition::Gradient(gradient) => write_gradient(gradient, out),
            Definition::Mask(mask) => write_mask(mask, names, out),
            Definition::Clip(clip) => write_clip(clip, names, out),
        }
    }
}
