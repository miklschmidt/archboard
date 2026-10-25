//! A Remix Icon, centred inside its type chip. The scene names the icon; each
//! frontend draws it from the icon set the host gave.

use std::collections::BTreeMap;

use crate::geometry::round_coord;
use crate::paint::build::{Items, grouped};
use crate::scene::{Colour, Group, Icon, Item, Role, Transform};

/// The icon drawn for a name the icon set does not have.
pub const FALLBACK_ICON: &str = "RiQuestionLine";

/// The icon a flowchart's flow is drawn with.
pub const FLOW_ICON: &str = "RiFlowChart";

/// Every icon a picture can draw whatever the policy says, which every host
/// gives the painter beside the icons the policy names.
pub const OWN_ICONS: [&str; 2] = [FALLBACK_ICON, FLOW_ICON];

/// The side of the square an icon is drawn into on its chip.
const ICON_SIZE: f64 = 18.0;

/// The move that centres an icon on a point.
pub(super) fn centred_on(cx: f64, cy: f64) -> Transform {
    Transform::translate(
        round_coord(cx - ICON_SIZE / 2.0),
        round_coord(cy - ICON_SIZE / 2.0),
    )
}

/// A kind's icon at chip size, centred on a point: the icon the kind asked
/// for when the host has it, else the icon for a name the set does not have.
pub(super) fn glyph_group(
    asked: &str,
    cx: f64,
    cy: f64,
    ink: &Colour,
    icons: &BTreeMap<String, Vec<String>>,
) -> Items {
    let name = if icons.contains_key(asked) {
        asked
    } else {
        FALLBACK_ICON
    };
    let icon = Icon {
        name: name.to_owned(),
        size: ICON_SIZE,
        ink: ink.clone(),
    };
    grouped(
        Group::new(Role::Icon(Some(asked.to_owned())), vec![Item::Icon(icon)])
            .moved(centred_on(cx, cy)),
    )
}
