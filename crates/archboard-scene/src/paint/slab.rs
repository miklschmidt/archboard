//! Depth by thickness. Every part of the picture is a block lit from above: a
//! flat top face with a fine highlight along its top edge and light that falls
//! off down it, a front edge along its foot, and a soft shadow it casts down
//! and to the right. A proposal's standing takes over the outline of the face.
//! A removed block is a flat, see-through ghost in the dashed border of a
//! removal. A part opens with its seat, its box unpainted, which takes the
//! pointer.

use crate::geometry::{Point, Rect, round_coord};
use crate::js;
use crate::paint::build::{Items, grouped, lines, shape};
use crate::paint::colour::{Share, light_dark, tinted, translucent};
use crate::paint::palette::Palette;
use crate::paint::polygon::{Polygon, inset, intersection, polygon_path, translated};
use crate::paint::shadow::{SHADOW_REACH, shadow_definitions, smooth_shadow};
use crate::paint::standing::{OUTLINE_WIDTH, ink_of, outline_dash};
use crate::request::Standing;
use crate::scene::{
    ClipId, Colour, Definition, Geometry, Gradient, GradientForm, GradientId, Group, Paint,
    Pointer, Purpose, Role, ShadowOf, Shape, Stop, Stroke,
};

/// How a block looks: its two tones, how thick it is and how round its corners are.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct SlabLook {
    /// Its top face.
    pub face: Paint,
    /// Whether its face is one a group may tint.
    pub tintable: bool,
    /// The colour its highlight is mixed from: its face's own colour, unless its face is a gradient.
    pub lit: Colour,
    /// Its front edge.
    pub edge: Colour,
    /// How tall its front edge shows, inside its box along its foot.
    pub thickness: f64,
    /// How round its corners are, in diagram units.
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
fn glint_of(face: &Colour, palette: &Palette) -> Colour {
    tinted(face, Some(&palette.slab_glint), GLINT)
}

const SOFT_SHEEN: f64 = 0.2;

/// Which sort of block casts a shadow.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Lift {
    /// A card or a header slab, which casts the full shadow.
    Card,
    /// A container's tray, which casts none.
    Tray,
    /// A type chip, which casts a short shadow.
    Chip,
}

impl Lift {
    /// How far the block's shadow reaches below it.
    fn reach(self) -> f64 {
        match self {
            Lift::Card => SHADOW_REACH,
            Lift::Tray => 0.0,
            Lift::Chip => 2.0,
        }
    }
}

/// How much of a face a removed block's see-through ghost keeps.
const GHOST_FACE: f64 = 0.5;

/// A box, rounded as it is drawn.
pub(super) fn boxed(rect: Rect) -> Rect {
    Rect {
        x: round_coord(rect.x),
        y: round_coord(rect.y),
        width: round_coord(rect.width),
        height: round_coord(rect.height),
    }
}

/// A rounded rect over a box, which takes no pointer unless it says so.
pub(super) fn plate(rect: Rect, radius: f64) -> Shape {
    Shape::rect(Purpose::Plate, boxed(rect), Some(round_coord(radius))).pointer(Pointer::None)
}

/// A line across a box at one height, which takes no pointer.
pub(super) fn across(rect: Rect, y: f64, stroke: Stroke) -> Items {
    shape(
        Shape::new(
            Purpose::Rule,
            Geometry::Line {
                from: Point {
                    x: round_coord(rect.x),
                    y: round_coord(y),
                },
                to: Point {
                    x: round_coord(rect.x + rect.width),
                    y: round_coord(y),
                },
            },
        )
        .pointer(Pointer::None)
        .stroked(stroke),
    )
}

/// A part's seat: its box, unpainted, which takes the pointer for the whole of it.
pub(super) fn slab_seat(rect: Rect, radius: f64) -> Items {
    shape(seat(plate(rect, radius)))
}

/// A shape as a seat: unpainted, taking the pointer for the whole of it.
fn seat(shape: Shape) -> Shape {
    shape.unfilled().pointer(Pointer::All)
}

/// A shape painted as a ghost's see-through face.
pub(super) fn ghost_face(shape: Shape, palette: &Palette) -> Shape {
    Shape {
        fill_opacity: Some(GHOST_FACE),
        ..shape.filled(&palette.slab_face)
    }
}

/// The border a standing draws round a face, inside its edge.
fn standing_border(
    face: Rect,
    radius: f64,
    standing: Option<Standing>,
    palette: &Palette,
) -> Items {
    let (Some(standing), Some(ink)) = (standing, ink_of(standing, palette)) else {
        return Items::new();
    };
    let half = OUTLINE_WIDTH / 2.0;
    shape(
        Shape::rect(
            Purpose::Border,
            boxed(Rect {
                x: face.x + half,
                y: face.y + half,
                width: face.width - OUTLINE_WIDTH,
                height: face.height - OUTLINE_WIDTH,
            }),
            Some(round_coord(js::js_max(0.0, radius - half))),
        )
        .unfilled()
        .stroked(Stroke::new(ink, OUTLINE_WIDTH).dashed(outline_dash(standing)))
        .pointer(Pointer::None),
    )
}

/// Where a removed block stood.
fn ghost(rect: Rect, radius: f64, palette: &Palette) -> Items {
    lines(vec![
        shape(ghost_face(plate(rect, radius), palette)),
        standing_border(rect, radius, Some(Standing::Removed), palette),
    ])
}

/// What a block leaves on what it stands on: its shadow, or a removed part's ghost.
pub(super) fn slab_shadow(
    rect: Rect,
    radius: f64,
    lift: Lift,
    palette: &Palette,
    standing: Option<Standing>,
) -> Items {
    if standing == Some(Standing::Removed) {
        return ghost(rect, radius, palette);
    }
    if lift == Lift::Tray {
        Items::new()
    } else {
        smooth_shadow(rect, radius, lift.reach())
    }
}

/// A shadow in a group of its own, laid under every block and every line.
pub(super) fn shadow_group(shadow: Items, member: Option<&str>, part: Option<ShadowOf>) -> Items {
    grouped(
        Group::new(Role::Shadow(part), shadow)
            .standing_with(member.map(str::to_owned).into_iter().collect())
            .pointer(Pointer::None),
    )
}

/// The shadow a block casts; a removed block casts none.
pub(super) fn shadow_under(
    member: &str,
    rect: Rect,
    radius: f64,
    lift: Lift,
    palette: &Palette,
    standing: Option<Standing>,
    part: Option<ShadowOf>,
) -> Items {
    if standing == Some(Standing::Removed) {
        return Items::new();
    }
    shadow_group(
        slab_shadow(rect, radius, lift, palette, None),
        Some(member),
        part,
    )
}

/// The light that falls off down a face.
fn sheen_of(look: &SlabLook) -> GradientId {
    if look.tintable {
        GradientId::SoftSheen
    } else {
        GradientId::Sheen
    }
}

/// One block, standing in its box; a removed part draws nothing here.
pub(super) fn slab(
    rect: Rect,
    look: &SlabLook,
    palette: &Palette,
    standing: Option<Standing>,
    cut: Option<&ClipId>,
) -> Items {
    if standing == Some(Standing::Removed) {
        return Items::new();
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
        shape(Shape {
            clip: cut.cloned(),
            ..plate(rect, look.radius).filled(&look.edge)
        }),
        shape(plate(face, look.radius).filled(glint_of(&look.lit, palette))),
        shape(plate(lit, look.radius).filled(look.face.clone())),
        if look.sheen {
            shape(plate(lit, look.radius).filled(sheen_of(look)))
        } else {
            Items::new()
        },
        standing_border(face, look.radius, standing, palette),
    ])
}

/// A shape that is not a box, painted: a polygon that takes no pointer.
pub(super) fn solid(polygon: &[Point], radius: f64) -> Shape {
    Shape::path(Purpose::Solid, polygon_path(polygon, radius)).pointer(Pointer::None)
}

/// A shape's seat: its outline, unpainted, which takes the pointer.
pub(super) fn solid_seat(polygon: &[Point], radius: f64) -> Items {
    shape(seat(solid(polygon, radius)))
}

/// The border a standing draws round the face of a block that is not a box.
fn solid_border(
    face: &[Point],
    radius: f64,
    standing: Option<Standing>,
    palette: &Palette,
) -> Items {
    let (Some(standing), Some(ink)) = (standing, ink_of(standing, palette)) else {
        return Items::new();
    };
    let half = OUTLINE_WIDTH / 2.0;
    shape(
        solid(&inset(face, half), js::js_max(0.0, radius - half))
            .unfilled()
            .stroked(Stroke::new(ink, OUTLINE_WIDTH).dashed(outline_dash(standing))),
    )
}

/// Where a removed block that is not a box stood.
pub(super) fn solid_ghost(polygon: &[Point], radius: f64, palette: &Palette) -> Items {
    lines(vec![
        shape(ghost_face(solid(polygon, radius), palette)),
        solid_border(polygon, radius, Some(Standing::Removed), palette),
    ])
}

/// A block that is not a box: its body in the tone of its front edge, and its
/// face over that, the body cut by itself lifted by the block's thickness.
pub(super) fn solid_slab(
    body: &[Point],
    look: &SlabLook,
    palette: &Palette,
    standing: Option<Standing>,
) -> Items {
    if standing == Some(Standing::Removed) {
        return Items::new();
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
    lines(vec![
        shape(solid(body, radius).filled(&look.edge)),
        shape(solid(&face, radius).filled(glint_of(&look.lit, palette))),
        shape(solid(&lit, radius).filled(look.face.clone())),
        if look.sheen {
            shape(solid(&lit, radius).filled(sheen_of(look)))
        } else {
            Items::new()
        },
        solid_border(&face, radius, standing, palette),
    ])
}

/// The light that falls off down a face, one gradient in the face's own box.
fn sheen_gradient(id: GradientId, sheen: &Colour) -> Definition {
    Definition::Gradient(Gradient {
        id,
        form: GradientForm::Linear {
            line: Some((Point { x: 0.0, y: 0.0 }, Point { x: 0.0, y: 1.0 })),
            user_space: false,
        },
        stops: vec![
            Stop {
                offset: Some(0.0),
                colour: sheen.clone(),
                opacity: None,
            },
            Stop {
                offset: Some(1.0),
                colour: sheen.clone(),
                opacity: Some(0.0),
            },
        ],
    })
}

/// The definitions every slab reaches for.
pub(super) fn slab_definitions(palette: &Palette) -> Vec<Definition> {
    let mut definitions = shadow_definitions(palette);
    definitions.push(sheen_gradient(GradientId::Sheen, &palette.slab_sheen));
    definitions.push(sheen_gradient(
        GradientId::SoftSheen,
        &light_dark(
            &translucent(&palette.slab_glint, SOFT_SHEEN),
            &palette.slab_sheen,
        ),
    ));
    definitions
}

impl SlabLook {
    /// A block whose face is one colour, which its highlight is mixed from.
    pub(super) fn plain(face: Colour, edge: Colour, thickness: f64, radius: f64) -> Self {
        SlabLook {
            face: Paint::from(&face),
            tintable: false,
            lit: face,
            edge,
            thickness,
            radius,
            sheen: false,
        }
    }
}
