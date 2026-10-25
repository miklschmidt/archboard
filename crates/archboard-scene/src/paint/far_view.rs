//! What a part draws from far away is a layer of its own, hidden until a viewer
//! puts the far class on the picture. A card's kind chip is one element both
//! views share, and each layer's words stand in a group the stylesheet moves to
//! where the other layer's words stand (TASK-428).

use crate::attrs;
use crate::geometry::coord;
use crate::js;
use crate::markup::{Markup, group};
use crate::paint::design::ICON_CHIP_SIZE;
use crate::scene::Role;

const NEAR_CLASS: &str = "ab-near";
const FAR_CLASS: &str = "ab-far";
const CHIP_CLASS: &str = "ab-chip";
const WORDS_CLASS: &str = "ab-words";
const NEAR_PLACE: &str = "--near";
const FAR_PLACE: &str = "--far";
const AWAY_PLACE: &str = "--away";

/// Where a chip stands: its top left corner and its side; or where a block of
/// words starts: the left end of its first baseline and its first line's size.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Place {
    pub x: f64,
    pub y: f64,
    pub size: f64,
}

/// A scale as the document writes it: to a ten thousandth.
fn written(value: f64) -> f64 {
    js::round(value * 10_000.0) / 10_000.0
}

/// A move and a scale about the origin, as an attribute (no unit) or a stylesheet ("px") writes it.
fn placed(x: f64, y: f64, scale: f64, unit: &str) -> String {
    format!(
        "translate({}{unit},{}{unit}) scale({})",
        coord(x),
        coord(y),
        js::number(scale)
    )
}

/// A card's kind chip as one element that both views share, drawn at its near place.
pub(super) fn shared_chip(chip: Markup, near: Place, far: Place) -> Markup {
    let near_scale = written(near.size / ICON_CHIP_SIZE);
    let far_scale = written(far.size / ICON_CHIP_SIZE);
    group(
        Role::Chip,
        None,
        attrs! {
            "class": CHIP_CLASS,
            "transform": placed(near.x, near.y, near_scale, ""),
            "style": format!(
                "{NEAR_PLACE}:{};{FAR_PLACE}:{}",
                placed(near.x, near.y, near_scale, "px"),
                placed(far.x, far.y, far_scale, "px"),
            ),
        },
        chip,
    )
}

/// A layer's words, which the stylesheet moves to where the other layer's words start.
pub(super) fn moving_words(words: Markup, home: Place, away: Place) -> Markup {
    let scale = written(away.size / home.size);
    let x = away.x - home.x * scale;
    let y = away.y - home.y * scale;
    group(
        Role::Words,
        None,
        attrs! { "class": WORDS_CLASS, "style": format!("{AWAY_PLACE}:{}", placed(x, y, scale, "px")) },
        words,
    )
}

/// What a part draws when the picture is seen near.
pub(super) fn near_layer(markup: Markup) -> Markup {
    group(Role::NearView, None, attrs! { "class": NEAR_CLASS }, markup)
}

/// What a part draws only from far away, hidden by its own attribute.
pub(super) fn far_layer(markup: Markup) -> Markup {
    group(
        Role::FarView,
        None,
        attrs! { "class": FAR_CLASS, "display": "none" },
        markup,
    )
}
