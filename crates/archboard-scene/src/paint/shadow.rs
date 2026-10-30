//! The soft shadow a block casts: nine patches of shared gradients for a box,
//! stacked layers for a shape that is not one. No filter, mask or blur.

use crate::geometry::{Point, Rect, round_coord};
use crate::js;
use crate::paint::build::{Items, grouped, lines, shape};
use crate::paint::colour::{light_dark, translucent};
use crate::paint::design::CARD_RADIUS;
use crate::paint::palette::Palette;
use crate::paint::polygon::{inset, polygon_path, translated};
use crate::scene::{
    Colour, Definition, Gradient, GradientForm, GradientId, Group, Pointer, Purpose, Role, Shape,
    Stop,
};

/// The farthest a card's shadow reaches below its foot.
pub const SHADOW_REACH: f64 = 12.0;
/// Shared gradient samples.
const FALLOFF: [f64; 5] = [1.0, 0.82, 0.52, 0.16, 0.0];

/// The shadow's ink on each ground, lighter on the light ground.
fn shadow_ink(palette: &Palette, share: f64) -> Colour {
    light_dark(
        &translucent(&palette.slab_shadow, 0.65 * share),
        &translucent(&palette.slab_shadow, share),
    )
}

/// How many layers the shadow of a shape that is not a box is stacked of.
const LAYERS: usize = 8;
const SPREAD_GROW: f64 = 0.35;
const SPREAD_X: f64 = 0.15;
const SPREAD_Y: f64 = 0.75;

/// How strong the shadow of a box is at a place along its fall.
fn falloff_at(position: f64) -> f64 {
    let scaled = js::js_min(js::js_max(position, 0.0), 1.0) * (FALLOFF.len() - 1) as f64;
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "a whole index from 0 to the falloff's last step, as the clamps make it"
    )]
    let low = js::js_min(scaled.floor(), (FALLOFF.len() - 2) as f64) as usize;
    FALLOFF[low] + (FALLOFF[low + 1] - FALLOFF[low]) * (scaled - low as f64)
}

/// Marks that take no pointer, together.
fn marks(items: Items) -> Items {
    grouped(Group::new(Role::Marks, items).pointer(Pointer::None))
}

/// The shadow of a shape that is not a box: the shape grown and moved down in
/// even steps, the farthest layer first.
pub(super) fn polygon_shadow(
    polygon: &[Point],
    radius: f64,
    reach: f64,
    palette: &Palette,
) -> Items {
    let step = reach / LAYERS as f64;
    let bands: Vec<f64> = (0..LAYERS)
        .map(|band| falloff_at((CARD_RADIUS + (band as f64 + 0.5) * step) / (CARD_RADIUS + reach)))
        .collect();
    let mut layers: Vec<Items> = bands
        .iter()
        .enumerate()
        .map(|(band, strength)| {
            let next = bands.get(band + 1).copied().unwrap_or(0.0);
            let share = 1.0 - (1.0 - strength) / (1.0 - next);
            let distance = (band as f64 + 1.0) * step;
            let grown = inset(polygon, -distance * SPREAD_GROW);
            let away = Point {
                x: distance * SPREAD_X,
                y: distance * SPREAD_Y,
            };
            shape(
                Shape::path(
                    Purpose::Outline,
                    polygon_path(&translated(&grown, away), radius + distance * SPREAD_GROW),
                )
                .filled(shadow_ink(palette, share)),
            )
        })
        .collect();
    layers.reverse();
    marks(lines(layers))
}

/// Nine adjoining patches of one rounded shadow, with matching values at every seam.
pub(super) fn smooth_shadow(rect: Rect, radius: f64, reach: f64) -> Items {
    let x = rect.x - 0.5;
    let y = rect.y - 0.5;
    let width = rect.width + reach + 0.5;
    let height = rect.height + reach + 0.5;
    let r = js::min([radius + reach, width / 2.0, height / 2.0]);
    let xs = [x, x + r, x + width - r];
    let ys = [y, y + r, y + height - r];
    let widths = [r, width - 2.0 * r, r];
    let heights = [r, height - 2.0 * r, r];
    let mut patches = Vec::new();
    for (row, top) in (0u8..).zip(ys) {
        for (column, left) in (0u8..).zip(xs) {
            patches.push(shape(
                Shape::rect(
                    Purpose::Box,
                    Rect {
                        x: round_coord(left),
                        y: round_coord(top),
                        width: round_coord(widths[usize::from(column)]),
                        height: round_coord(heights[usize::from(row)]),
                    },
                    None,
                )
                .filled(GradientId::Shadow { row, column }),
            ));
        }
    }
    marks(lines(patches))
}

/// Shared side, corner and centre paints for all shadow sizes.
pub(super) fn shadow_definitions(palette: &Palette) -> Vec<Definition> {
    let ink = shadow_ink(palette, 1.0);
    let stops = || {
        FALLOFF
            .iter()
            .enumerate()
            .map(|(index, opacity)| Stop {
                offset: Some(index as f64 / (FALLOFF.len() - 1) as f64),
                colour: ink.clone(),
                opacity: Some(*opacity),
            })
            .collect::<Vec<_>>()
    };
    let corners = [
        (0, 0, 1.0, 1.0),
        (0, 2, 0.0, 1.0),
        (2, 0, 1.0, 0.0),
        (2, 2, 0.0, 0.0),
    ];
    let sides = [
        (0, 1, 0.0, 1.0, 0.0, 0.0),
        (1, 0, 1.0, 0.0, 0.0, 0.0),
        (1, 2, 0.0, 0.0, 1.0, 0.0),
        (2, 1, 0.0, 0.0, 0.0, 1.0),
    ];
    let mut definitions: Vec<Definition> = corners
        .iter()
        .map(|&(row, column, x, y)| {
            Definition::Gradient(Gradient {
                id: GradientId::Shadow { row, column },
                form: GradientForm::Radial {
                    centre: Point { x, y },
                    radius: 1.0,
                },
                stops: stops(),
            })
        })
        .collect();
    definitions.extend(sides.iter().map(|&(row, column, x1, y1, x2, y2)| {
        Definition::Gradient(Gradient {
            id: GradientId::Shadow { row, column },
            form: GradientForm::Linear {
                line: Some((Point { x: x1, y: y1 }, Point { x: x2, y: y2 })),
                user_space: false,
            },
            stops: stops(),
        })
    }));
    definitions.push(Definition::Gradient(Gradient {
        id: GradientId::Shadow { row: 1, column: 1 },
        form: GradientForm::Linear {
            line: None,
            user_space: false,
        },
        stops: vec![Stop {
            offset: None,
            colour: ink,
            opacity: None,
        }],
    }));
    definitions
}
