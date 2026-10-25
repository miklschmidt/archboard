//! What a part draws from far away is a layer of its own, hidden until a viewer
//! shows the far view. A card's kind chip is one group both views share, and
//! each layer's words stand in a group a viewer moves to where the other
//! layer's words stand (TASK-428).

use crate::geometry::round_coord;
use crate::js;
use crate::paint::build::{Items, grouped};
use crate::paint::design::ICON_CHIP_SIZE;
use crate::scene::{Group, Role, Transform};

/// Where a chip stands: its top left corner and its side; or where a block of
/// words starts: the left end of its first baseline and its first line's size.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Place {
    pub x: f64,
    pub y: f64,
    pub size: f64,
}

/// A scale as the picture draws it: to a ten thousandth.
fn written(value: f64) -> f64 {
    js::round(value * 10_000.0) / 10_000.0
}

/// A move and a scale about the origin, rounded as the picture draws them.
fn placed(x: f64, y: f64, scale: f64) -> Transform {
    Transform {
        x: round_coord(x),
        y: round_coord(y),
        scale: Some(scale),
    }
}

/// A card's kind chip as one group that both views share, drawn at its near place.
pub(super) fn shared_chip(chip: Items, near: Place, far: Place) -> Items {
    let near_scale = written(near.size / ICON_CHIP_SIZE);
    let far_scale = written(far.size / ICON_CHIP_SIZE);
    grouped(
        Group::new(
            Role::Chip {
                far: placed(far.x, far.y, far_scale),
            },
            chip,
        )
        .moved(placed(near.x, near.y, near_scale)),
    )
}

/// A layer's words, which a viewer moves to where the other layer's words start.
pub(super) fn moving_words(words: Items, home: Place, away: Place) -> Items {
    let scale = written(away.size / home.size);
    let x = away.x - home.x * scale;
    let y = away.y - home.y * scale;
    grouped(Group::new(
        Role::Words {
            away: placed(x, y, scale),
        },
        words,
    ))
}

/// What a part draws when the picture is seen near.
pub(super) fn near_layer(items: Items) -> Items {
    grouped(Group::new(Role::NearView, items))
}

/// What a part draws only from far away.
pub(super) fn far_layer(items: Items) -> Items {
    grouped(Group::new(Role::FarView, items))
}
