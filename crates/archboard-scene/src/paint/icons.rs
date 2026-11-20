//! A Remix Icon, centred inside its type chip. The scene names the icon; each
//! frontend draws it from the icon set the host gave.

use std::collections::BTreeMap;

use crate::geometry::round_coord;
use crate::paint::build::{Items, grouped};
use crate::scene::{Colour, Group, Icon, Item, Role, Transform};
use crate::sizes::FLOW_KIND;

/// The icon drawn for a name the icon set does not have.
pub(super) const FALLBACK_ICON: &str = "RiQuestionLine";

/// The icon a flowchart's flow is drawn with.
pub(super) const FLOW_ICON: &str = "RiFlowChart";

/// Every icon a picture can draw whatever the policy says, which every host
/// gives the painter beside the icons the policy names.
pub(super) const OWN_ICONS: [&str; 2] = [FALLBACK_ICON, FLOW_ICON];

/// The icon a part of a kind is drawn with: the icon its policy asks for, or
/// the icon for a name the set does not have when it asks for none.
pub fn kind_icon(asked: Option<&str>) -> String {
    asked.unwrap_or(FALLBACK_ICON).to_owned()
}

/// A flowchart's frame, which holds a flow: the kind it is drawn as, and its icon.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FlowLook {
    /// The kind of the frame's node.
    pub kind: &'static str,
    /// The icon on its chip.
    pub icon: &'static str,
}

/// How a flowchart's frame is drawn.
pub const fn flow_look() -> FlowLook {
    FlowLook {
        kind: FLOW_KIND,
        icon: FLOW_ICON,
    }
}

/// Every icon a picture can draw, whatever its policy says.
pub const fn own_icons() -> [&'static str; 2] {
    OWN_ICONS
}

/// The side of the square an icon is drawn into on its chip.
pub(super) const ICON_SIZE: f64 = 18.0;

/// A kind's icon at chip size, centred on a point: the icon the kind asked
/// for when the host has it, else the icon for a name the set does not have.
pub(super) fn glyph_group(
    asked: &str,
    cx: f64,
    cy: f64,
    ink: &Colour,
    icons: &BTreeMap<String, Vec<String>>,
    size: f64,
) -> Items {
    let name = if icons.contains_key(asked) {
        asked
    } else {
        FALLBACK_ICON
    };
    let icon = Icon {
        name: name.to_owned(),
        size,
        ink: ink.clone(),
    };
    grouped(
        Group::new(Role::Icon(Some(asked.to_owned())), vec![Item::Icon(icon)]).moved(
            Transform::translate(round_coord(cx - size / 2.0), round_coord(cy - size / 2.0)),
        ),
    )
}
