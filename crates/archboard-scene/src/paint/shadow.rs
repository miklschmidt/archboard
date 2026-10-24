//! The soft shadow a block casts: nine patches of shared gradients for a box,
//! stacked layers for a shape that is not one. No filter, mask or blur.

use crate::attrs;
use crate::geometry::{Point, Rect, coord};
use crate::js;
use crate::markup::{Markup, concat, group, lines, tag, wrap};
use crate::paint::colour::{light_dark, translucent};
use crate::paint::design::CARD_RADIUS;
use crate::paint::palette::Palette;
use crate::paint::polygon::{inset, polygon_path, translated};
use crate::scene::Role;

/// The farthest a card's shadow reaches below its foot.
pub const SHADOW_REACH: f64 = 12.0;
/// Shared gradient samples.
const FALLOFF: [f64; 5] = [1.0, 0.82, 0.52, 0.16, 0.0];

/// The shadow's ink on each ground, lighter on the light ground.
fn shadow_ink(palette: &Palette, share: f64) -> String {
    light_dark(
        &translucent(palette.slab_shadow, 0.65 * share),
        &translucent(palette.slab_shadow, share),
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
    let low = js::js_min(scaled.floor(), (FALLOFF.len() - 2) as f64) as usize;
    FALLOFF[low] + (FALLOFF[low + 1] - FALLOFF[low]) * (scaled - low as f64)
}

/// The shadow of a shape that is not a box: the shape grown and moved down in
/// even steps, the farthest layer first.
pub fn polygon_shadow(polygon: &[Point], radius: f64, reach: f64, palette: &Palette) -> Markup {
    let step = reach / LAYERS as f64;
    let bands: Vec<f64> = (0..LAYERS)
        .map(|band| falloff_at((CARD_RADIUS + (band as f64 + 0.5) * step) / (CARD_RADIUS + reach)))
        .collect();
    let mut layers: Vec<Markup> = bands
        .iter()
        .enumerate()
        .map(|(band, strength)| {
            let next = bands.get(band + 1).copied().unwrap_or(0.0);
            let share = 1.0 - (1.0 - strength) / (1.0 - next);
            let distance = (band as f64 + 1.0) * step;
            let grown = inset(polygon, -distance * SPREAD_GROW);
            let away = Point { x: distance * SPREAD_X, y: distance * SPREAD_Y };
            tag(
                "path",
                attrs! {
                    "d": polygon_path(&translated(&grown, away), radius + distance * SPREAD_GROW),
                    "fill": shadow_ink(palette, share),
                },
            )
        })
        .collect();
    layers.reverse();
    group(Role::Marks, None, attrs! { "pointer-events": "none" }, lines(layers))
}

/// Nine adjoining patches of one rounded shadow, with matching values at every seam.
pub fn smooth_shadow(rect: Rect, radius: f64, reach: f64) -> Markup {
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
    for (row, top) in ys.iter().enumerate() {
        for (column, left) in xs.iter().enumerate() {
            patches.push(tag(
                "rect",
                attrs! {
                    "x": coord(*left),
                    "y": coord(*top),
                    "width": coord(widths[column]),
                    "height": coord(heights[row]),
                    "fill": format!("url(#ab-shadow-{row}{column})"),
                },
            ));
        }
    }
    group(Role::Marks, None, attrs! { "pointer-events": "none" }, lines(patches))
}

/// Shared side, corner and centre paints for all shadow sizes.
pub fn shadow_definitions(palette: &Palette) -> Markup {
    let ink = shadow_ink(palette, 1.0);
    let stops = || {
        concat(
            FALLOFF
                .iter()
                .enumerate()
                .map(|(index, opacity)| {
                    tag(
                        "stop",
                        attrs! {
                            "offset": index as f64 / (FALLOFF.len() - 1) as f64,
                            "stop-color": ink.as_str(),
                            "stop-opacity": *opacity,
                        },
                    )
                })
                .collect(),
        )
    };
    let corners = [("00", 1.0, 1.0), ("02", 0.0, 1.0), ("20", 1.0, 0.0), ("22", 0.0, 0.0)];
    let sides = [
        ("01", 0.0, 1.0, 0.0, 0.0),
        ("10", 1.0, 0.0, 0.0, 0.0),
        ("12", 0.0, 0.0, 1.0, 0.0),
        ("21", 0.0, 0.0, 0.0, 1.0),
    ];
    let mut definitions: Vec<Markup> = corners
        .iter()
        .map(|(id, cx, cy)| {
            wrap(
                "radialGradient",
                attrs! { "id": format!("ab-shadow-{id}"), "r": 1.0, "cx": *cx, "cy": *cy },
                stops(),
            )
        })
        .collect();
    definitions.extend(sides.iter().map(|(id, x1, y1, x2, y2)| {
        wrap(
            "linearGradient",
            attrs! { "id": format!("ab-shadow-{id}"), "x1": *x1, "y1": *y1, "x2": *x2, "y2": *y2 },
            stops(),
        )
    }));
    definitions.push(wrap(
        "linearGradient",
        attrs! { "id": "ab-shadow-11" },
        tag("stop", attrs! { "stop-color": ink.as_str() }),
    ));
    lines(definitions)
}
