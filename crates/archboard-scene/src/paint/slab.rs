//! Depth by thickness. Every part of the picture is a block lit from above: a
//! flat top face with a fine highlight along its top edge and light that falls
//! off down it, a front edge along its foot, and a soft shadow it casts down
//! and to the right. A proposal's standing takes over the outline of the face.
//! A removed block is a flat, see-through ghost in the dashed border of a
//! removal. A part opens with its seat, its box unpainted, which takes the
//! pointer.

use crate::attrs;
use crate::geometry::{Point, Rect, coord};
use crate::js;
use crate::markup::{Attrs, Markup, concat, group, lines, tag, wrap};
use crate::paint::colour::{Share, light_dark, tinted, translucent};
use crate::paint::palette::Palette;
use crate::paint::polygon::{Polygon, inset, intersection, polygon_path, translated};
use crate::paint::shadow::{SHADOW_REACH, shadow_definitions, smooth_shadow};
use crate::paint::standing::{
    MEMBERS_ATTRIBUTE, OUTLINE_WIDTH, PART_ATTRIBUTE, ink_of, outline_dash,
};
use crate::request::Standing;
use crate::scene::Role;

/// How a block looks: its two tones, how thick it is and how round its corners are.
#[derive(Clone, Debug, PartialEq)]
pub struct SlabLook {
    /// Its top face.
    pub face: String,
    /// Its top face before a card's group tinted it, set on a face a group may tint.
    pub ground: Option<String>,
    /// The colour its highlight is mixed from, where its face is a gradient.
    pub lit: Option<String>,
    /// Its front edge.
    pub edge: String,
    /// How tall its front edge shows, inside its box along its foot.
    pub thickness: f64,
    pub radius: f64,
    /// Whether light falls off down its face.
    pub sheen: bool,
}

/// How wide the highlight along the top edge of a face is.
const GLINT_WIDTH: f64 = 1.0;

/// How far the highlight mixes a face toward the glint, on each ground.
const GLINT: Share = Share {
    light: 0.45,
    dark: 0.09,
};

/// The fine highlight along the top edge of a face.
fn glint_of(face: &str, palette: &Palette) -> String {
    tinted(face, Some(palette.slab_glint), GLINT)
}

const SHEEN_ID: &str = "ab-slab-sheen";
const SOFT_SHEEN_ID: &str = "ab-slab-sheen-soft";
const SOFT_SHEEN: f64 = 0.2;

/// Which sort of block casts a shadow.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lift {
    Card,
    Tray,
    Chip,
}

impl Lift {
    fn reach(self) -> f64 {
        match self {
            Lift::Card => SHADOW_REACH,
            Lift::Tray => 0.0,
            Lift::Chip => 2.0,
        }
    }
}

/// The class of the group a card's or a label's shadow is drawn in.
const SHADOW_CLASS: &str = "ab-shadow";

/// How much of a face a removed block's see-through ghost keeps.
const GHOST_FACE: f64 = 0.5;

/// Where a `rect` over a box stands and how big it is.
pub fn boxed(rect: Rect) -> Attrs {
    attrs! {
        "x": coord(rect.x),
        "y": coord(rect.y),
        "width": coord(rect.width),
        "height": coord(rect.height),
    }
}

/// A rounded rect over a box, which takes no pointer unless it says so.
pub fn plate(rect: Rect, radius: f64, paint: Attrs) -> Markup {
    tag(
        "rect",
        boxed(rect)
            .set("rx", coord(radius))
            .set("pointer-events", "none")
            .with(paint),
    )
}

/// A line across a box at one height, which takes no pointer.
pub fn across(rect: Rect, y: f64, paint: Attrs) -> Markup {
    tag(
        "line",
        attrs! {
            "x1": coord(rect.x),
            "y1": coord(y),
            "x2": coord(rect.x + rect.width),
            "y2": coord(y),
            "pointer-events": "none",
        }
        .with(paint),
    )
}

/// A part's seat: its box, unpainted, which takes the pointer for the whole of it.
pub fn slab_seat(rect: Rect, radius: f64) -> Markup {
    plate(
        rect,
        radius,
        attrs! { "fill": "none", "pointer-events": "all" },
    )
}

/// The see-through face a ghost keeps.
pub fn ghost_face(palette: &Palette) -> Attrs {
    attrs! { "fill": palette.slab_face, "fill-opacity": GHOST_FACE }
}

/// The border a standing draws round a face, inside its edge.
fn standing_border(
    face: Rect,
    radius: f64,
    standing: Option<Standing>,
    palette: &Palette,
) -> Markup {
    let (Some(standing), Some(ink)) = (standing, ink_of(standing, palette)) else {
        return Markup::new();
    };
    let half = OUTLINE_WIDTH / 2.0;
    tag(
        "rect",
        attrs! {
            "x": coord(face.x + half),
            "y": coord(face.y + half),
            "width": coord(face.width - OUTLINE_WIDTH),
            "height": coord(face.height - OUTLINE_WIDTH),
            "rx": coord(js::js_max(0.0, radius - half)),
            "fill": "none",
            "stroke": ink,
            "stroke-width": OUTLINE_WIDTH,
            "stroke-dasharray": outline_dash(standing),
            "pointer-events": "none",
        },
    )
}

/// Where a removed block stood.
fn ghost(rect: Rect, radius: f64, palette: &Palette) -> Markup {
    lines(vec![
        plate(rect, radius, ghost_face(palette)),
        standing_border(rect, radius, Some(Standing::Removed), palette),
    ])
}

/// What a block leaves on what it stands on: its shadow, or a removed part's ghost.
pub fn slab_shadow(
    rect: Rect,
    radius: f64,
    lift: Lift,
    palette: &Palette,
    standing: Option<Standing>,
) -> Markup {
    if standing == Some(Standing::Removed) {
        return ghost(rect, radius, palette);
    }
    if lift == Lift::Tray {
        Markup::new()
    } else {
        smooth_shadow(rect, radius, lift.reach())
    }
}

/// A shadow in a group of its own, laid under every block and every line.
pub fn shadow_group(shadow: Markup, member: Option<&str>, part: Option<&str>) -> Markup {
    group(
        Role::Shadow,
        None,
        attrs! {
            "class": SHADOW_CLASS,
            MEMBERS_ATTRIBUTE: member,
            PART_ATTRIBUTE: part,
            "pointer-events": "none",
        },
        shadow,
    )
}

/// The shadow a block casts; a removed block casts none.
pub fn shadow_under(
    member: &str,
    rect: Rect,
    radius: f64,
    lift: Lift,
    palette: &Palette,
    standing: Option<Standing>,
    part: Option<&str>,
) -> Markup {
    if standing == Some(Standing::Removed) {
        return Markup::new();
    }
    shadow_group(
        slab_shadow(rect, radius, lift, palette, None),
        Some(member),
        part,
    )
}

/// A clip as paint refers to it.
fn clipped(cut: Option<&str>) -> Option<String> {
    cut.map(|cut| format!("url(#{cut})"))
}

/// One block, standing in its box; a removed part draws nothing here.
pub fn slab(
    rect: Rect,
    look: &SlabLook,
    palette: &Palette,
    standing: Option<Standing>,
    cut: Option<&str>,
) -> Markup {
    if standing == Some(Standing::Removed) {
        return Markup::new();
    }
    let face = Rect {
        height: rect.height - look.thickness,
        ..rect
    };
    let lit = Rect {
        y: face.y + GLINT_WIDTH,
        height: face.height - GLINT_WIDTH,
        ..face
    };
    lines(vec![
        plate(
            rect,
            look.radius,
            attrs! { "clip-path": clipped(cut), "fill": look.edge.as_str() },
        ),
        plate(
            face,
            look.radius,
            attrs! { "fill": glint_of(&look.face, palette) },
        ),
        plate(lit, look.radius, attrs! { "fill": look.face.as_str() }),
        if look.sheen {
            plate(
                lit,
                look.radius,
                attrs! { "fill": format!("url(#{})", sheen_of(look)) },
            )
        } else {
            Markup::new()
        },
        standing_border(face, look.radius, standing, palette),
    ])
}

/// A shape that is not a box, painted: a polygon that takes no pointer.
pub fn solid(polygon: &[Point], radius: f64, paint: Attrs) -> Markup {
    tag(
        "path",
        attrs! { "d": polygon_path(polygon, radius), "pointer-events": "none" }.with(paint),
    )
}

/// A shape's seat: its outline, unpainted, which takes the pointer.
pub fn solid_seat(polygon: &[Point], radius: f64) -> Markup {
    solid(
        polygon,
        radius,
        attrs! { "fill": "none", "pointer-events": "all" },
    )
}

/// The border a standing draws round the face of a block that is not a box.
fn solid_border(
    face: &[Point],
    radius: f64,
    standing: Option<Standing>,
    palette: &Palette,
) -> Markup {
    let (Some(standing), Some(ink)) = (standing, ink_of(standing, palette)) else {
        return Markup::new();
    };
    let half = OUTLINE_WIDTH / 2.0;
    solid(
        &inset(face, half),
        js::js_max(0.0, radius - half),
        attrs! {
            "fill": "none",
            "stroke": ink,
            "stroke-width": OUTLINE_WIDTH,
            "stroke-dasharray": outline_dash(standing),
        },
    )
}

/// Where a removed block that is not a box stood.
pub fn solid_ghost(polygon: &[Point], radius: f64, palette: &Palette) -> Markup {
    lines(vec![
        solid(polygon, radius, ghost_face(palette)),
        solid_border(polygon, radius, Some(Standing::Removed), palette),
    ])
}

/// A block that is not a box: its body in the tone of its front edge, and its
/// face over that, the body cut by itself lifted by the block's thickness.
pub fn solid_slab(
    body: &[Point],
    look: &SlabLook,
    palette: &Palette,
    standing: Option<Standing>,
) -> Markup {
    if standing == Some(Standing::Removed) {
        return Markup::new();
    }
    let radius = look.radius;
    let face: Polygon = intersection(
        body,
        &translated(
            body,
            Point {
                x: 0.0,
                y: -look.thickness,
            },
        ),
    );
    let lit = intersection(
        &face,
        &translated(
            &face,
            Point {
                x: 0.0,
                y: GLINT_WIDTH,
            },
        ),
    );
    let glint_from = look.lit.as_deref().unwrap_or(&look.face);
    lines(vec![
        solid(body, radius, attrs! { "fill": look.edge.as_str() }),
        solid(
            &face,
            radius,
            attrs! { "fill": glint_of(glint_from, palette) },
        ),
        solid(&lit, radius, attrs! { "fill": look.face.as_str() }),
        if look.sheen {
            solid(
                &lit,
                radius,
                attrs! { "fill": format!("url(#{})", sheen_of(look)) },
            )
        } else {
            Markup::new()
        },
        solid_border(&face, radius, standing, palette),
    ])
}

/// The light that falls off down a face, one gradient in the face's own box.
fn sheen_gradient(id: &str, sheen: &str) -> Markup {
    wrap(
        "linearGradient",
        attrs! { "id": id, "x1": 0.0, "y1": 0.0, "x2": 0.0, "y2": 1.0 },
        concat(vec![
            tag("stop", attrs! { "offset": 0.0, "stop-color": sheen }),
            tag(
                "stop",
                attrs! { "offset": 1.0, "stop-color": sheen, "stop-opacity": 0.0 },
            ),
        ]),
    )
}

/// Which light falls off down a face: a face a group may tint takes the softer one.
fn sheen_of(look: &SlabLook) -> &'static str {
    if look.ground.is_none() {
        SHEEN_ID
    } else {
        SOFT_SHEEN_ID
    }
}

/// The definitions every slab reaches for.
pub fn slab_definitions(palette: &Palette) -> Markup {
    concat(vec![
        shadow_definitions(palette),
        sheen_gradient(SHEEN_ID, palette.slab_sheen),
        sheen_gradient(
            SOFT_SHEEN_ID,
            &light_dark(
                &translucent(palette.slab_glint, SOFT_SHEEN),
                palette.slab_sheen,
            ),
        ),
    ])
}
