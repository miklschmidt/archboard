//! A scene's definitions, found by what refers to them. A definition can stand
//! anywhere in a scene, so a scene's body is read for them once.

use std::collections::HashMap;

use archboard_scene::scene::{
    Clip, Definition, Gradient, GradientForm, GradientId, Item, Marker, MarkerId, Mask, Scene,
};
use kurbo::Affine;
use peniko::{ColorStop, Extend, InterpolationAlphaSpace};

use crate::canvas::Ink;
use crate::palette::Palette;

/// Everything a scene's shapes refer to.
#[derive(Clone, Debug, Default)]
pub(crate) struct Definitions {
    gradients: Vec<Gradient>,
    markers: Vec<Marker>,
    masks: HashMap<String, Mask>,
    clips: HashMap<String, Clip>,
}

impl Definitions {
    /// The definitions of a scene.
    pub(crate) fn of(scene: &Scene) -> Definitions {
        let mut found = Definitions::default();
        found.take(&scene.definitions);
        found.read(&scene.body);
        found
    }

    /// The definitions of a list.
    pub(crate) fn listed(definitions: &[Definition]) -> Definitions {
        let mut found = Definitions::default();
        found.take(definitions);
        found
    }

    /// Keep some definitions. A later one of an id replaces an earlier one.
    fn take(&mut self, definitions: &[Definition]) {
        for definition in definitions {
            match definition {
                Definition::Gradient(gradient) => {
                    self.gradients.retain(|known| known.id != gradient.id);
                    self.gradients.push(gradient.clone());
                }
                Definition::Marker(marker) => {
                    self.markers.retain(|known| known.id != marker.id);
                    self.markers.push(marker.clone());
                }
                Definition::Mask(mask) => {
                    self.masks.insert(mask.id.line.clone(), mask.clone());
                }
                Definition::Clip(clip) => {
                    self.clips.insert(clip.id.card.clone(), clip.clone());
                }
            }
        }
    }

    /// Find the definitions that stand among some items.
    fn read(&mut self, items: &[Item]) {
        for item in items {
            match item {
                Item::Definitions { definitions } => self.take(definitions),
                Item::Group(group) => self.read(&group.items),
                Item::Viewport(viewport) => self.read(&viewport.items),
                _ => {}
            }
        }
    }

    /// The mask of a line.
    pub(crate) fn mask(&self, line: &str) -> Option<&Mask> {
        self.masks.get(line)
    }

    /// The clip of a card.
    pub(crate) fn clip(&self, card: &str) -> Option<&Clip> {
        self.clips.get(card)
    }

    /// A marker by its id.
    pub(crate) fn marker(&self, id: &MarkerId) -> Option<&Marker> {
        self.markers.iter().find(|marker| marker.id == *id)
    }

    /// A gradient as an ink for a shape in a box, at a share of its alpha.
    pub(crate) fn gradient(
        &self,
        id: GradientId,
        palette: &Palette,
        alpha: f64,
        bounds: kurbo::Rect,
    ) -> Option<Ink> {
        let gradient = self.gradients.iter().find(|known| known.id == id)?;
        let own_box = Affine::translate(bounds.origin().to_vec2())
            * Affine::scale_non_uniform(bounds.width(), bounds.height());
        let (mut drawn, transform) = match gradient.form {
            GradientForm::Linear { line, user_space } => {
                let (from, to) = line.map_or(((0.0, 0.0), (1.0, 0.0)), |(from, to)| {
                    ((from.x, from.y), (to.x, to.y))
                });
                (
                    peniko::Gradient::new_linear(from, to),
                    if user_space {
                        Affine::IDENTITY
                    } else {
                        own_box
                    },
                )
            }
            GradientForm::Radial { centre, radius } => {
                #[expect(clippy::cast_possible_truncation, reason = "a radius is f32 in peniko")]
                let radius = radius as f32;
                (
                    peniko::Gradient::new_radial((centre.x, centre.y), radius),
                    own_box,
                )
            }
        };
        let stops: Vec<ColorStop> = gradient
            .stops
            .iter()
            .map(|stop| {
                #[expect(
                    clippy::cast_possible_truncation,
                    reason = "an offset is f32 in peniko"
                )]
                let offset = stop.offset.unwrap_or(0.0) as f32;
                ColorStop {
                    offset,
                    color: palette.stop(stop, alpha).into(),
                }
            })
            .collect();
        drawn.stops = stops.as_slice().into();
        drawn.extend = Extend::Pad;
        drawn.interpolation_alpha_space = InterpolationAlphaSpace::Unpremultiplied;
        Some(Ink::Gradient(drawn, transform))
    }
}
