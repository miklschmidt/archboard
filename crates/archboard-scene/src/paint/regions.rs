//! Group regions (TASK-347): the cards one group places inside one container,
//! gathered inside a frame of the group's colour with the group's name on a tab
//! in its corner (TASK-419). The tab keeps clear of the routes that cross its
//! row, and from far away grows only as far as the nearest route.

use std::borrow::Cow;

use crate::drawing::{DrawingRegion, TextRun};
use crate::geometry::{Curve, Point, Rect, Segment, round_coord, segment_start};
use crate::js;
use crate::measure;
use crate::paint::appearance::semantic_ink;
use crate::paint::build::{Items, concat, grouped, lines, point, shape};
use crate::paint::colour::{Held, Tone, ToneStep, held_tone, toned};
use crate::paint::design::BAND_RADIUS;
use crate::paint::far_view::{far_layer, near_layer};
use crate::paint::palette::Palette;
use crate::paint::slab::boxed;
use crate::paint::standing::subject;
use crate::paint::text_runs::paint_text_runs;
use crate::request::PaletteColor;
use crate::scene::{
    Colour, Group, PathStep, Pointer, Purpose, Role, Shape, Stroke, SubjectKind, Token,
};

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
    corner: Colour,
    tab: Colour,
    frame: Colour,
    words: Colour,
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

/// A caption tab's outline in a top corner of its region: round as the region
/// is at the region's corner, and round by a radius of its own at its inner foot.
fn tab_path(rect: Rect, corner: Corner) -> Vec<PathStep> {
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
        round_coord(if corner == Corner::Start {
            x + inward
        } else {
            x + width - inward
        })
    };
    let clockwise = corner == Corner::Start;
    vec![
        PathStep::Move {
            to: Point {
                x: at(0.0),
                y: round_coord(foot),
            },
        },
        PathStep::Down {
            y: round_coord(y + shared),
        },
        PathStep::Arc {
            radius: point(shared, shared),
            clockwise,
            to: Point {
                x: at(shared),
                y: round_coord(y),
            },
        },
        PathStep::Across { x: at(width) },
        PathStep::Down {
            y: round_coord(foot - own),
        },
        PathStep::Arc {
            radius: point(own, own),
            clockwise,
            to: Point {
                x: at(width - own),
                y: round_coord(foot),
            },
        },
        PathStep::Close,
    ]
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

/// The colours of a group's region, from its colour or the muted ink for none.
/// A yellow group takes the primary colours for its tab and words.
fn group_colours(color: Option<PaletteColor>, palette: &Palette) -> GroupColours {
    let ink = semantic_ink(color).unwrap_or_else(|| palette.muted.clone());
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
            tab: Token::Primary.into(),
            frame,
            words: Token::PrimaryForeground.into(),
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

/// A caption's tab in a corner of its region, with the caption's words on it.
fn caption_tab(
    region: &DrawingRegion,
    run: &TextRun,
    corner: Corner,
    grown: f64,
    colours: &GroupColours,
    palette: &Palette,
) -> Items {
    let (rect, shift) = tab_box(region, run, corner, grown);
    let caption = region.caption.bounds;
    lines(vec![
        shape(Shape::path(Purpose::Line, tab_path(rect, corner)).filled(&colours.tab)),
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

/// A rounded outline drawn inside the edge of a box, `width` thick.
fn outline(rect: Rect, width: f64, ink: &Colour) -> Items {
    let inset = width / 2.0;
    shape(
        Shape::rect(
            Purpose::Box,
            boxed(Rect {
                x: rect.x + inset,
                y: rect.y + inset,
                width: rect.width - width,
                height: rect.height - width,
            }),
            Some(round_coord(BAND_RADIUS - inset)),
        )
        .unfilled()
        .stroked(Stroke::new(ink, width)),
    )
}

/// An arm at each corner of a box, bent round the corner, in place of a whole outline.
fn brackets(rect: Rect, ink: &Colour) -> Items {
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
                let steps = vec![
                    PathStep::Move {
                        to: point(*x, y + down * ARM),
                    },
                    PathStep::Line {
                        to: point(*x, y + down * radius),
                    },
                    PathStep::Arc {
                        radius: point(radius, radius),
                        clockwise: across * down > 0.0,
                        to: point(x + across * radius, *y),
                    },
                    PathStep::Line {
                        to: point(x + across * ARM, *y),
                    },
                ];
                shape(
                    Shape::path(Purpose::Line, steps)
                        .unfilled()
                        .stroked(Stroke::new(ink, BRACKET_WIDTH)),
                )
            })
            .collect(),
    )
}

/// The stretches of the routes that cross the region's caption row, each by its
/// leftmost and rightmost points, a cubic's control points included.
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

/// Whether every crossing keeps the route room from either side of a box.
fn clear_of(rect: Rect, crossings: &[Crossing]) -> bool {
    crossings.iter().all(|crossing| {
        crossing.right < rect.x - ROUTE_ROOM || crossing.left > rect.x + rect.width + ROUTE_ROOM
    })
}

/// The corner a caption's tab stands in: the start, unless a route crosses it
/// there and none would at the end.
fn corner_of(region: &DrawingRegion, run: &TextRun, crossings: &[Crossing]) -> Corner {
    let blocked = |corner| !clear_of(tab_box(region, run, corner, 1.0).0, crossings);
    if blocked(Corner::Start) && !blocked(Corner::End) {
        Corner::End
    } else {
        Corner::Start
    }
}

/// The room along the region's top edge that a caption in a corner can grow
/// into before it meets a route crossing that edge.
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
fn far_run(region: &DrawingRegion, run: &TextRun, far_size: f64, room: f64) -> TextRun {
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
        width: measure::width(&run.text, run.font, size),
        y: caption.height / 2.0 + size * 0.35,
        ..run.clone()
    }
}

/// One group's region: its frame and its corner brackets, and its caption on its tab, near and far.
pub(super) fn paint_region(
    region: &DrawingRegion,
    palette: &Palette,
    color: Option<PaletteColor>,
    far_size: f64,
    routes: &[&Curve],
) -> Items {
    let colours = group_colours(color, palette);
    let near = region.caption.measured.runs.first();
    let crossings = crossings_of(region, routes);
    let corner = near.map_or(Corner::Start, |run| corner_of(region, run, &crossings));
    // A lone region's layout can place its caption between incoming routes.
    // Its background must stay there too, rather than stretch back over a line.
    let caption_region =
        if near.is_some_and(|run| !clear_of(tab_box(region, run, corner, 1.0).0, &crossings)) {
            let mut caption_region = region.clone();
            let run = near.expect("a blocked caption has words");
            let left = region.caption.bounds.x + run.x;
            let right = left + run.width;
            let low = js::max(
                std::iter::once(region.bounds.x).chain(
                    crossings
                        .iter()
                        .filter(|crossing| crossing.right <= left)
                        .map(|crossing| f64::midpoint(crossing.right, left)),
                ),
            );
            let high = js::min(
                std::iter::once(region.bounds.x + region.bounds.width).chain(
                    crossings
                        .iter()
                        .filter(|crossing| crossing.left >= right)
                        .map(|crossing| f64::midpoint(crossing.left, right)),
                ),
            );
            caption_region.bounds.x = low;
            caption_region.bounds.width = high - low;
            Cow::Owned(caption_region)
        } else {
            Cow::Borrowed(region)
        };
    let rect = region.bounds;
    grouped(
        Group::new(
            Role::Region,
            lines(vec![
                shape(Shape::rect(Purpose::Box, boxed(rect), Some(BAND_RADIUS)).unfilled()),
                outline(rect, FRAME_WIDTH, &colours.frame),
                brackets(rect, &colours.corner),
                match near {
                    None => Items::new(),
                    Some(run) => {
                        let room = far_room(&caption_region, run, corner, &crossings);
                        let far = far_run(&caption_region, run, far_size, room);
                        let grown = far.font_size / run.font_size;
                        concat(vec![
                            near_layer(caption_tab(
                                &caption_region,
                                run,
                                corner,
                                1.0,
                                &colours,
                                palette,
                            )),
                            far_layer(caption_tab(
                                &caption_region,
                                &far,
                                corner,
                                grown,
                                &colours,
                                palette,
                            )),
                        ])
                    }
                },
            ]),
        )
        .drawing(subject(SubjectKind::GroupRegion, &region.group, None))
        .standing_with(region.members.clone())
        .pointer(Pointer::None),
    )
}
