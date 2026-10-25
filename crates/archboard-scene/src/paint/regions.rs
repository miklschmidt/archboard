//! Group regions (TASK-347): the cards one group places inside one container,
//! gathered inside a frame of the group's colour with the group's name on a tab
//! in its corner (TASK-419). The tab keeps clear of the routes that cross its
//! row, and from far away grows only as far as the nearest route.

use crate::attrs;
use crate::drawing::{DrawingRegion, TextRun};
use crate::geometry::{Curve, Rect, Segment, coord, segment_start};
use crate::js;
use crate::markup::{Markup, concat, group, lines, tag};
use crate::paint::Ctx;
use crate::paint::appearance::semantic_ink;
use crate::paint::colour::{Held, Tone, ToneStep, held_tone, toned};
use crate::paint::design::BAND_RADIUS;
use crate::paint::far_view::{far_layer, near_layer};
use crate::paint::palette::{Palette, token};
use crate::paint::standing::{MEMBERS_ATTRIBUTE, subject};
use crate::paint::text_runs::paint_text_runs;
use crate::request::PaletteColor;
use crate::scene::{Role, SubjectKind};

const DARK_CORNER: ToneStep = ToneStep::new(0.765, 0.95);

/// The lightness of a group's full colour on the light ground, by colour.
#[expect(
    clippy::match_same_arms,
    reason = "a table of one row per colour: two colours that share a value do so by chance"
)]
fn light_corner(color: PaletteColor) -> f64 {
    match color {
        PaletteColor::Red => 0.68,
        PaletteColor::Orange => 0.66,
        PaletteColor::Amber => 0.655,
        PaletteColor::Lime => 0.64,
        PaletteColor::Green | PaletteColor::Emerald => 0.635,
        PaletteColor::Teal | PaletteColor::Cyan => 0.64,
        PaletteColor::Sky => 0.645,
        PaletteColor::Blue => 0.66,
        PaletteColor::Indigo | PaletteColor::Violet | PaletteColor::Purple => 0.685,
        PaletteColor::Fuchsia => 0.68,
        PaletteColor::Pink => 0.665,
        PaletteColor::Rose => 0.68,
        PaletteColor::Yellow => 0.635,
    }
}

const FRAME: Tone = Tone {
    light: ToneStep::new(0.78, 0.875),
    dark: ToneStep::new(0.47, 0.6),
};
const WORDS: Tone = Tone {
    light: ToneStep::new(0.98, 0.15),
    dark: ToneStep::new(0.16, 0.2),
};
const FRAME_WIDTH: f64 = 3.0;
const BRACKET_WIDTH: f64 = 6.0;
const ARM: f64 = 28.0;
const TAB_RADIUS: f64 = 8.0;
const FAR_CAPTION_SHARE: f64 = 0.62;
const ROUTE_ROOM: f64 = 8.0;

/// A group's colours: its corners', its tab's, its frame's, and the words on its tab.
struct GroupColours {
    corner: String,
    tab: String,
    frame: String,
    words: String,
}

/// Which of the region's top corners a tab stands in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Corner {
    Start,
    End,
}

/// Where a route crosses a caption's row, from its leftmost ink to its rightmost.
struct Crossing {
    left: f64,
    right: f64,
}

fn tab_path(rect: Rect, corner: Corner) -> String {
    let Rect {
        x,
        y,
        width,
        height,
    } = rect;
    let shared = js::min([BAND_RADIUS, width / 2.0, height / 2.0]);
    let own = js::min([TAB_RADIUS, width / 2.0, height / 2.0]);
    let foot = y + height;
    let at = |inward: f64| {
        coord(if corner == Corner::Start {
            x + inward
        } else {
            x + width - inward
        })
    };
    let sweep = i32::from(corner == Corner::Start);
    [
        format!("M{},{}", at(0.0), coord(foot)),
        format!("V{}", coord(y + shared)),
        format!(
            "A{},{} 0 0 {sweep} {},{}",
            coord(shared),
            coord(shared),
            at(shared),
            coord(y)
        ),
        format!("H{}", at(width)),
        format!("V{}", coord(foot - own)),
        format!(
            "A{},{} 0 0 {sweep} {},{}",
            coord(own),
            coord(own),
            at(width - own),
            coord(foot)
        ),
        "Z".to_owned(),
    ]
    .join(" ")
}

/// Where a tab for some words stands, and how far right of where they were measured its words stand.
fn tab_box(region: &DrawingRegion, run: &TextRun, corner: Corner, grown: f64) -> (Rect, f64) {
    let rect = region.bounds;
    let caption = region.caption.bounds;
    let margin = caption.x + run.x - rect.x;
    let width = js::js_min(rect.width, margin * (1.0 + grown) + run.width);
    let x = if corner == Corner::Start {
        rect.x
    } else {
        rect.x + rect.width - width
    };
    (
        Rect {
            x,
            y: rect.y,
            width,
            height: caption.y + caption.height - rect.y,
        },
        x - rect.x,
    )
}

fn group_colours(color: Option<PaletteColor>, palette: &Palette) -> GroupColours {
    let ink = semantic_ink(color).unwrap_or_else(|| palette.muted.to_owned());
    let lightness = color.map_or(0.635, light_corner);
    let corner = held_tone(
        &ink,
        Held {
            least: lightness,
            most: lightness,
            dark: DARK_CORNER,
        },
    );
    let frame = toned(&ink, FRAME);
    if color == Some(PaletteColor::Yellow) {
        GroupColours {
            corner: ink,
            tab: token("--primary"),
            frame,
            words: token("--primary-foreground"),
        }
    } else {
        GroupColours {
            tab: corner.clone(),
            corner,
            frame,
            words: toned(&ink, WORDS),
        }
    }
}

fn caption_tab(
    region: &DrawingRegion,
    run: &TextRun,
    corner: Corner,
    grown: f64,
    colours: &GroupColours,
    palette: &Palette,
) -> Markup {
    let (rect, shift) = tab_box(region, run, corner, grown);
    let caption = region.caption.bounds;
    lines(vec![
        tag(
            "path",
            attrs! { "d": tab_path(rect, corner), "fill": colours.tab.as_str() },
        ),
        paint_text_runs(
            std::slice::from_ref(run),
            Rect {
                x: caption.x + shift,
                ..caption
            },
            palette,
            Some(&colours.words),
        ),
    ])
}

fn outline(rect: Rect, width: f64, ink: &str) -> Markup {
    let inset = width / 2.0;
    tag(
        "rect",
        attrs! {
            "x": coord(rect.x + inset),
            "y": coord(rect.y + inset),
            "width": coord(rect.width - width),
            "height": coord(rect.height - width),
            "rx": coord(BAND_RADIUS - inset),
            "fill": "none",
            "stroke": ink,
            "stroke-width": width,
        },
    )
}

fn brackets(rect: Rect, ink: &str) -> Markup {
    let inset = BRACKET_WIDTH / 2.0;
    let radius = BAND_RADIUS - inset;
    let left = rect.x + inset;
    let right = rect.x + rect.width - inset;
    let top = rect.y + inset;
    let bottom = rect.y + rect.height - inset;
    let corners = [
        (left, top, 1.0, 1.0),
        (right, top, -1.0, 1.0),
        (right, bottom, -1.0, -1.0),
        (left, bottom, 1.0, -1.0),
    ];
    lines(
        corners
            .iter()
            .map(|(x, y, across, down)| {
                let sweep = i32::from(across * down > 0.0);
                let start = format!("{},{}", coord(*x), coord(y + down * ARM));
                let arc_from = format!("{},{}", coord(*x), coord(y + down * radius));
                let arc_to = format!("{},{}", coord(x + across * radius), coord(*y));
                let end = format!("{},{}", coord(x + across * ARM), coord(*y));
                tag(
                    "path",
                    attrs! {
                        "d": format!(
                            "M{start} L{arc_from} A{},{} 0 0 {sweep} {arc_to} L{end}",
                            coord(radius),
                            coord(radius)
                        ),
                        "fill": "none",
                        "stroke": ink,
                        "stroke-width": BRACKET_WIDTH,
                    },
                )
            })
            .collect(),
    )
}

fn crossings_of(region: &DrawingRegion, routes: &[&Curve]) -> Vec<Crossing> {
    let top = region.bounds.y;
    let bottom = region.caption.bounds.y + region.caption.bounds.height;
    let mut crossings = Vec::new();
    for curve in routes {
        for (index, segment) in curve.segments.iter().enumerate() {
            let mut points = vec![segment_start(curve, index), segment.to()];
            if let Segment::Cubic { first, second, .. } = segment {
                points.push(*first);
                points.push(*second);
            }
            if js::min(points.iter().map(|point| point.y)) >= bottom
                || js::max(points.iter().map(|point| point.y)) <= top
            {
                continue;
            }
            crossings.push(Crossing {
                left: js::min(points.iter().map(|point| point.x)),
                right: js::max(points.iter().map(|point| point.x)),
            });
        }
    }
    crossings
}

fn clear_of(rect: Rect, crossings: &[Crossing]) -> bool {
    crossings.iter().all(|crossing| {
        crossing.right < rect.x - ROUTE_ROOM || crossing.left > rect.x + rect.width + ROUTE_ROOM
    })
}

fn corner_of(region: &DrawingRegion, run: &TextRun, crossings: &[Crossing]) -> Corner {
    let blocked = |corner| !clear_of(tab_box(region, run, corner, 1.0).0, crossings);
    if blocked(Corner::Start) && !blocked(Corner::End) {
        Corner::End
    } else {
        Corner::Start
    }
}

fn far_room(region: &DrawingRegion, run: &TextRun, corner: Corner, crossings: &[Crossing]) -> f64 {
    let rect = region.bounds;
    let near = tab_box(region, run, corner, 1.0).0;
    if corner == Corner::Start {
        let words = near.x + near.width;
        let stops = crossings
            .iter()
            .filter(|crossing| crossing.left > words)
            .map(|crossing| crossing.left - ROUTE_ROOM);
        return js::min(std::iter::once(rect.x + rect.width).chain(stops)) - rect.x;
    }
    let stops = crossings
        .iter()
        .filter(|crossing| crossing.right < near.x)
        .map(|crossing| crossing.right + ROUTE_ROOM);
    rect.x + rect.width - js::max(std::iter::once(rect.x).chain(stops))
}

/// The caption's run as it is set from far away: as large as `far_size`, the
/// caption's height and the `room` along the region's top edge let it be.
fn far_run(
    ctx: &Ctx<'_>,
    region: &DrawingRegion,
    run: &TextRun,
    far_size: f64,
    room: f64,
) -> TextRun {
    let rect = region.bounds;
    let caption = region.caption.bounds;
    let margin = caption.x + run.x - rect.x;
    let size = js::js_max(
        run.font_size,
        js::min([
            far_size,
            caption.height * FAR_CAPTION_SHARE,
            (run.font_size * (room - margin)) / js::js_max(1.0, margin + run.width),
        ]),
    );
    TextRun {
        font_size: size,
        width: ctx.measurer.measure(&run.text, run.font, size),
        y: caption.height / 2.0 + size * 0.35,
        ..run.clone()
    }
}

/// One group's region: its frame and its corner brackets, and its caption on its tab, near and far.
pub(super) fn paint_region(
    ctx: &Ctx<'_>,
    region: &DrawingRegion,
    palette: &Palette,
    color: Option<PaletteColor>,
    far_size: f64,
    routes: &[&Curve],
) -> Markup {
    let colours = group_colours(color, palette);
    let near = region.caption.measured.runs.first();
    let crossings = crossings_of(region, routes);
    let corner = near.map_or(Corner::Start, |run| corner_of(region, run, &crossings));
    let rect = region.bounds;
    group(
        Role::Region,
        Some(subject(SubjectKind::GroupRegion, &region.group, None)),
        attrs! { MEMBERS_ATTRIBUTE: region.members.join(" "), "pointer-events": "none" },
        lines(vec![
            tag(
                "rect",
                attrs! {
                    "x": coord(rect.x),
                    "y": coord(rect.y),
                    "width": coord(rect.width),
                    "height": coord(rect.height),
                    "rx": BAND_RADIUS,
                    "fill": "none",
                },
            ),
            outline(rect, FRAME_WIDTH, &colours.frame),
            brackets(rect, &colours.corner),
            match near {
                None => Markup::new(),
                Some(run) => {
                    let room = far_room(region, run, corner, &crossings);
                    let far = far_run(ctx, region, run, far_size, room);
                    let grown = far.font_size / run.font_size;
                    concat(vec![
                        near_layer(caption_tab(region, run, corner, 1.0, &colours, palette)),
                        far_layer(caption_tab(region, &far, corner, grown, &colours, palette)),
                    ])
                }
            },
        ]),
    )
}
