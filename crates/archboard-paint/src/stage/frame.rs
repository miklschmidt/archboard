//! One frame of a stage: its ground, the picture, the board inside a card, and
//! over them what is left of the last picture.

use archboard_scene::scene::Item;
use kurbo::{Affine, Shape as _};

use super::Stage;
use crate::between::departure;
use crate::canvas::Canvas;
use crate::draw::{Inks, draw_ground, draw_items};
use crate::flight::{Dive, Flight};
use crate::path::{placed, rect_of};
use crate::presentation::Presentation;

impl Stage {
    /// Draw what stands on the stage: its ground, the picture, the board
    /// inside a card, and over them what is left of the last picture.
    pub(super) fn draw_frame<C: Canvas>(&mut self, canvas: &mut C, now: f64) {
        let Stage {
            shown,
            presentation,
            palette,
            outlines,
            size,
            flight,
            leaving,
            ghost,
            dive,
            ..
        } = self;
        let Some(shown) = shown else {
            return;
        };
        let picture = &shown.picture;
        draw_ground(canvas, &picture.scene, *size, palette);
        let camera = presentation.camera;
        let transform = placed(camera.x, camera.y, Some(camera.scale));
        let fades = dive.as_ref().map(|dive| dive.fades(now));
        let parent = fades.map_or(1.0, |fades| fades.parent);
        if parent < 1.0 {
            canvas.set_transform(Affine::IDENTITY);
            canvas.push(None, opacity_of(parent));
        }
        let mut inks = Inks {
            palette,
            outlines: &mut *outlines,
            presentation,
        };
        let moved: Option<Vec<Item>> = match (&*flight, &*leaving) {
            (Some(flight), _) => Some(flight.items(now)),
            (None, Some(leaving)) => Some(departure(
                &picture.scene,
                &leaving.heading,
                leaving.progress(now),
            )),
            (None, None) => None,
        };
        let definitions = flight
            .as_ref()
            .and_then(Flight::definitions)
            .unwrap_or(&picture.definitions);
        let items = moved.as_deref().unwrap_or(&picture.scene.body);
        draw_items(canvas, items, definitions, transform, &mut inks);
        if parent < 1.0 {
            canvas.pop();
        }
        let plain = Presentation {
            camera,
            far: presentation.far,
            traffic: presentation.traffic,
            ..Presentation::default()
        };
        let mut plain_inks = Inks {
            palette,
            outlines,
            presentation: &plain,
        };
        if let Some((dive, fades)) = dive.as_ref().zip(fades) {
            draw_inset(canvas, dive, fades.inset, transform, &mut plain_inks);
        }
        if let Some(ghost) = ghost {
            let place = placed(ghost.camera.x, ghost.camera.y, Some(ghost.camera.scale));
            let items = ghost.items(now);
            draw_items(
                canvas,
                &items,
                &ghost.picture.definitions,
                place,
                &mut plain_inks,
            );
        }
    }
}

/// An opacity as a canvas takes it.
#[expect(clippy::cast_possible_truncation, reason = "a canvas's opacity is f32")]
fn opacity_of(opacity: f64) -> f32 {
    opacity as f32
}

/// Draw the board inside its card: fitted to the card and clipped to it, in the
/// parent's own coordinates, with no light on it.
fn draw_inset<C: Canvas>(
    canvas: &mut C,
    dive: &Dive,
    opacity: f64,
    transform: Affine,
    inks: &mut Inks<'_>,
) {
    let (frame, scene) = (&dive.frame, &dive.inset.scene);
    let scale = (frame.width / scene.width).min(frame.height / scene.height);
    let x = frame.x + (frame.width - scene.width * scale) / 2.0;
    let y = frame.y + (frame.height - scene.height * scale) / 2.0;
    let clip = rect_of(frame).to_path(0.1);
    canvas.set_transform(transform);
    canvas.push(Some((&clip, false)), opacity_of(opacity));
    draw_ground(canvas, scene, (1e5, 1e5), inks.palette);
    draw_items(
        canvas,
        &scene.body,
        &dive.inset.definitions,
        transform * placed(x, y, Some(scale)),
        inks,
    );
    canvas.pop();
}
