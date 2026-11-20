//! One frame of a stage: its ground, the picture, the picture inside a card, and
//! over them what is left of the last picture.

use archboard_geometry::Rect;
use archboard_scene::scene::Item;
use kurbo::{Affine, RoundedRect, Shape as _};

use super::Stage;
use crate::between::departing;
use crate::canvas::{Canvas, Layer};
use crate::draw::{Inks, draw_ground, draw_items};
use crate::flight::{Arriving, Dive, Ghost, Leaving};
use crate::passage::Plane;
use crate::path::{placed, rect_of};
use crate::presentation::Seen;

impl Stage {
    /// Draw what stands on the stage: its ground, the picture, the picture
    /// inside a card, and over them what is left of the last picture.
    pub(super) fn draw_frame<C: Canvas>(&mut self, canvas: &mut C, now: f64) {
        let Stage {
            shown,
            seen,
            palette,
            marks,
            outlines,
            size,
            arriving,
            leaving,
            ghost,
            behind,
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
        let camera = seen.camera;
        let plane = plane_at(leaving.as_ref(), ghost.as_ref(), now);
        let transform = plane.transform * placed(camera.x, camera.y, Some(camera.scale));
        let fades = dive.as_ref().map(|dive| dive.fades(now));
        let parent = fades.map_or(1.0, |fades| fades.parent) * plane.shown;
        let moved = arriving.as_mut().map(|arriving| arriving.items(now));
        let moved = match leaving.as_ref().filter(|leaving| leaving.axis.is_none()) {
            Some(leaving) => Some(departing(
                moved.unwrap_or_else(|| picture.scene.body.clone()),
                (picture.scene.width, picture.scene.height),
                leaving.progress(now),
            )),
            None => moved,
        };
        let definitions = arriving
            .as_ref()
            .and_then(Arriving::definitions)
            .unwrap_or(&picture.definitions);
        let items = moved.as_deref().unwrap_or(&picture.scene.body);
        let mut inks = Inks {
            palette,
            outlines: &mut *outlines,
            seen,
            marks,
            still: (*settled && moved.is_none()).then_some(*looks),
        };
        faded(canvas, parent, |canvas| {
            draw_items(canvas, items, definitions, transform, &mut inks);
        });
        let plain = Seen {
            camera,
            far: seen.far,
            traffic: seen.traffic,
            ..Seen::default()
        };
        let mut plain_inks = Inks {
            palette,
            outlines,
            seen: &plain,
            marks,
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
        let tray = arriving
            .as_ref()
            .and_then(|arriving| arriving.holder_at(now));
        for ghost in behind.iter().chain(ghost.as_ref()) {
            draw_ghost(canvas, ghost, now, tray, &mut plain_inks);
        }
    }
}

/// Where the picture on the stage stands at a moment: on its way in, then on its way
/// out, when a passage carries it.
fn plane_at(leaving: Option<&Leaving>, ghost: Option<&Ghost>, now: f64) -> Plane {
    let arrived = ghost.and_then(|ghost| ghost.passage(now));
    let left = leaving.and_then(|leaving| leaving.passage(now));
    arrived
        .map(|(axis, place)| axis.arrived(place))
        .or_else(|| left.map(|(axis, place)| axis.left(place)))
        .unwrap_or(Plane::STILL)
}

/// Draw what is left of the last picture over the rest, in its own light and
/// where its passage has taken it, inside the tray that held it if that stays on.
fn draw_ghost<C: Canvas>(
    canvas: &mut C,
    ghost: &Ghost,
    now: f64,
    tray: Option<Rect>,
    inks: &mut Inks<'_>,
) {
    let own = ghost
        .passage(now)
        .map_or(Plane::STILL, |(axis, place)| axis.left(place));
    let held = ghost.held_at(now);
    let place = own.transform
        * held.transform
        * placed(ghost.camera.x, ghost.camera.y, Some(ghost.camera.scale));
    let items = match tray.filter(|_| ghost.axis.is_none()) {
        Some(tray) => ghost.items_inside(now, tray, inks.seen.camera),
        None => ghost.items(now),
    };
    let look = Seen {
        camera: inks.seen.camera,
        far: inks.seen.far,
        traffic: inks.seen.traffic,
        ..ghost.look.clone()
    };
    let mut inks = Inks {
        palette: inks.palette,
        outlines: &mut *inks.outlines,
        seen: &look,
        marks: inks.marks,
        still: None,
    };
    faded(canvas, own.shown * held.shown, |canvas| {
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
    canvas.push(Layer::Over {
        clip: None,
        opacity: opacity_of(opacity),
    });
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

/// Draw the picture inside its card: fitted to the card and clipped to it, in the
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
    canvas.push(Layer::Over {
        clip: Some((&clip, false)),
        opacity: opacity_of(opacity),
    });
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
