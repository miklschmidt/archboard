//! One frame of a stage: its ground, the picture, the board inside a card, and
//! over them what is left of the last picture.

use archboard_scene::scene::Item;
use kurbo::{Affine, RoundedRect, Shape as _};

use super::Stage;
use crate::between::departure;
use crate::canvas::Canvas;
use crate::draw::{Inks, draw_ground, draw_items};
use crate::flight::{Dive, Flight, Ghost, Leaving};
use crate::passage::Plane;
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
            settled,
            looks,
            ..
        } = self;
        let Some(shown) = shown else {
            return;
        };
        let picture = &shown.picture;
        draw_ground(canvas, &picture.scene, *size, palette);
        let camera = presentation.camera;
        let plane = plane_at(leaving.as_ref(), ghost.as_ref(), now);
        let transform = plane.transform * placed(camera.x, camera.y, Some(camera.scale));
        let fades = dive.as_ref().map(|dive| dive.fades(now));
        let parent = fades.map_or(1.0, |fades| fades.parent) * plane.shown;
        let moved: Option<Vec<Item>> = match (flight.as_mut(), &*leaving) {
            (Some(flight), _) => Some(flight.items(now)),
            (None, Some(leaving)) if leaving.axis.is_none() => {
                Some(departure(&picture.scene, leaving.progress(now)))
            }
            _ => None,
        };
        let definitions = flight
            .as_ref()
            .and_then(Flight::definitions)
            .unwrap_or(&picture.definitions);
        let items = moved.as_deref().unwrap_or(&picture.scene.body);
        let mut inks = Inks {
            palette,
            outlines: &mut *outlines,
            presentation,
            still: (*settled && moved.is_none()).then_some(*looks),
        };
        faded(canvas, parent, |canvas| {
            draw_items(canvas, items, definitions, transform, &mut inks);
        });
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
            still: None,
        };
        if let Some((dive, fades)) = dive.as_ref().zip(fades) {
            let items = dive.inset_at(now);
            draw_inset(
                canvas,
                dive,
                &items,
                fades.inset,
                transform,
                &mut plain_inks,
            );
        }
        if let Some(ghost) = ghost {
            draw_ghost(canvas, ghost, now, plain_inks);
        }
    }
}

/// Where the board on the stage stands at a moment: on its way out, or on its way
/// in, when a passage carries it.
fn plane_at(leaving: Option<&Leaving>, ghost: Option<&Ghost>, now: f64) -> Plane {
    let left = leaving.and_then(|leaving| leaving.passage(now));
    let arrived = ghost.and_then(|ghost| ghost.passage(now));
    left.map(|(axis, place)| axis.left(place))
        .or_else(|| arrived.map(|(axis, place)| axis.arrived(place)))
        .unwrap_or(Plane::STILL)
}

/// Draw what is left of the last picture over the rest, in its own light and
/// where its passage has taken it.
fn draw_ghost<C: Canvas>(canvas: &mut C, ghost: &Ghost, now: f64, inks: Inks<'_>) {
    let own = ghost
        .passage(now)
        .map_or(Plane::STILL, |(axis, place)| axis.left(place));
    let place = own.transform
        * ghost.held.transform
        * placed(ghost.camera.x, ghost.camera.y, Some(ghost.camera.scale));
    let items = ghost.items(now);
    let look = Presentation {
        camera: inks.presentation.camera,
        far: inks.presentation.far,
        traffic: inks.presentation.traffic,
        ..ghost.look.clone()
    };
    let mut inks = Inks {
        presentation: &look,
        ..inks
    };
    faded(canvas, own.shown * ghost.held.shown, |canvas| {
        draw_items(canvas, &items, &ghost.picture.definitions, place, &mut inks);
    });
}

/// Draw something as one layer at an opacity.
fn faded<C: Canvas>(canvas: &mut C, opacity: f64, draw: impl FnOnce(&mut C)) {
    if opacity >= 1.0 {
        draw(canvas);
        return;
    }
    canvas.set_transform(Affine::IDENTITY);
    canvas.push(None, opacity_of(opacity));
    draw(canvas);
    canvas.pop();
}

/// The corners of the window a card opens into, in the picture's units.
const CARD_CORNER: f64 = 8.0;

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
    items: &[Item],
    opacity: f64,
    transform: Affine,
    inks: &mut Inks<'_>,
) {
    let (frame, scene) = (&dive.frame, &dive.inset.scene);
    let scale = (frame.width / scene.width).min(frame.height / scene.height);
    let x = frame.x + (frame.width - scene.width * scale) / 2.0;
    let y = frame.y + (frame.height - scene.height * scale) / 2.0;
    let clip = rect_of(dive.card_box.as_ref().unwrap_or(frame));
    let clip = RoundedRect::from_rect(clip, CARD_CORNER).to_path(0.1);
    canvas.set_transform(transform);
    canvas.push(Some((&clip, false)), opacity_of(opacity));
    draw_ground(canvas, scene, (1e5, 1e5), inks.palette);
    draw_items(
        canvas,
        items,
        &dive.inset.definitions,
        transform * placed(x, y, Some(scale)),
        inks,
    );
    canvas.pop();
}
