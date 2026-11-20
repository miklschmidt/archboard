//! A Remix Icon, centred inside its type chip. The scene names the icon; each
//! frontend draws it from the icon set the host gave.

use std::collections::BTreeMap;

use crate::paint::build::{GroupBuilder, Items, grouped};
use archboard_geometry::round_coord;
use archboard_scene::request::{NodeAppearance, TypeKind};
use archboard_scene::scene::{Colour, Group, Icon, Item, Role, Transform};

/// The icon drawn for a name the icon set does not have.
pub(super) const FALLBACK_ICON: &str = "RiQuestionLine";

/// The icon a flowchart's flow is drawn with.
pub(super) const FLOW_ICON: &str = "RiFlowChart";

/// Every icon a picture can draw whatever the policy says, which every host
/// gives the painter beside the icons the policy names.
pub(super) const OWN_ICONS: [&str; 2] = [FALLBACK_ICON, FLOW_ICON];

/// The icon a part is drawn with: the icon its kind asks for; else a flow's
/// own icon for a flowchart's flow, and the icon for a name the set does not
/// have for any other kind.
pub(super) fn drawn_icon(appearance: &NodeAppearance) -> &str {
    appearance
        .icon
        .as_deref()
        .unwrap_or(match appearance.type_kind {
            TypeKind::Flow => FLOW_ICON,
            TypeKind::Policy(_) => FALLBACK_ICON,
        })
}

/// A part's look as the scene keeps it, with the icon it is drawn with.
pub(super) fn as_drawn(appearance: &NodeAppearance) -> NodeAppearance {
    NodeAppearance {
        icon: Some(drawn_icon(appearance).to_owned()),
        ..appearance.clone()
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
