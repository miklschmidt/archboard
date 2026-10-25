//! A Remix Icon, drawn as its own component renders it. The host supplies each
//! icon's path data; the painter writes the markup.

use std::collections::BTreeMap;

use crate::attrs;
use crate::geometry::coord;
use crate::markup::{Markup, concat, group, wrap};
use crate::scene::Role;

/// The icon drawn for a name the icon set does not have.
pub const FALLBACK_ICON: &str = "RiQuestionLine";

/// One icon at chip size, as `@remixicon/react` renders it.
fn icon_markup(paths: &[String], ink: &str) -> Markup {
    wrap(
        "svg",
        attrs! {
            "viewBox": "0 0 24 24",
            "xmlns": "http://www.w3.org/2000/svg",
            "width": 18.0,
            "height": 18.0,
            "fill": ink,
            "aria-hidden": "true",
            "class": "remixicon ",
        },
        concat(
            paths
                .iter()
                .map(|d| wrap("path", attrs! { "d": d }, Markup::new()))
                .collect(),
        ),
    )
}

/// A configured icon, centred inside its type chip.
pub fn glyph_group(
    icon: &str,
    cx: f64,
    cy: f64,
    ink: &str,
    icons: &BTreeMap<String, Vec<String>>,
) -> Markup {
    let paths = icons
        .get(icon)
        .or_else(|| icons.get(FALLBACK_ICON))
        .map(Vec::as_slice)
        .unwrap_or_default();
    group(
        Role::Icon,
        None,
        attrs! {
            "transform": format!("translate({},{})", coord(cx - 9.0), coord(cy - 9.0)),
            "data-type-icon": icon,
        },
        icon_markup(paths, ink),
    )
}
