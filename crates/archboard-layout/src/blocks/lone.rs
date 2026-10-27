//! A card or container alone in its group's region (ADR 0038, amended
//! 2026-09-27). Such a region gathers nothing, so the blocks lay it out as the
//! node itself, with a box grown by the region's inset and caption band:
//! placement and routing see one obstacle where the board without the region
//! saw one. A caption wider than the node widens the region, not the node,
//! which stands in its middle. Once drawn, the node is put back inside that
//! box and the region drawn round it; a line that stopped on the region's wall
//! is carried on to the card's face.

use crate::constants::{ARCHITECTURE_HEADER_PADDING, REGION_INSET};
use crate::ecma::{abs, js_max, js_min, number_of, sorted_by};
use crate::geometry::{Point, Rect};
use crate::graph::{GROUP_CAPTIONS, Node, PLACING_GROUP, semantic_order};
use crate::placed::FrameRow;
use crate::track::containers::FrameShape;
use crate::track::scene::Map;

use super::headers::{Header, steps_of};
use super::laid::{CAPTION_INSET, Insets, Size};

/// How far a line carried to a card's side keeps from the card's corners.
const CORNER_ROOM: f64 = 8.0;
/// How far a line crossing a caption band keeps from the caption's words: as
/// far as there is room for, best first.
const WORDS_ROOMS: [f64; 3] = [12.0, 8.0, 4.0];
/// How far a caption's words stand in from its box (measurement's caption padding).
const WORDS_INSET: f64 = 12.0;
/// How near a point on a wall must be to stand on it.
const ON_WALL: f64 = 0.5;

/// A node alone in its group's region: the group, its caption's size, and
/// how the region stands round the node when its caption widens it.
#[derive(Clone, Debug)]
pub(crate) struct Lone {
    pub group: String,
    pub caption: Size,
    /// A card's width: a caption wider than the card widens the region round it, not the card.
    pub width: Option<f64>,
    /// How far a container a block lays out stands in from each side of its
    /// region, once laid out narrower than its caption.
    pub room: Option<f64>,
}

/// Where a line stops at a node alone in its region: that region's box and the node's.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Stop {
    pub region: Rect,
    pub card: Rect,
}

/// A card as a block lays it out: its size and its peers.
#[derive(Clone, Debug)]
pub(crate) struct Card {
    pub width: f64,
    pub height: f64,
    /// What interchangeable cards share, when the card has any: kind and responsibility.
    pub peers: Option<String>,
}

/// A measured card as the blocks keep it.
fn card_of(node: &Node) -> Card {
    let peers = node.option("archboard.order-group");
    let own = crate::ecma::number(semantic_order(node.layout_options.as_ref()));
    Card {
        width: node.w(),
        height: node.h(),
        peers: peers.filter(|&peers| peers != own).map(str::to_owned),
    }
}

/// Each placing group's caption size, as measurement wrote it on the root.
///
/// # Errors
///
/// When the sizes are not the JSON measurement writes.
pub(crate) fn captions_of(graph: &Node) -> Result<Map<String, Size>, String> {
    let rows: Vec<(String, f64, f64)> =
        serde_json::from_str(graph.option(GROUP_CAPTIONS).unwrap_or("[]"))
            .map_err(|error| format!("{GROUP_CAPTIONS} is unreadable: {error}"))?;
    Ok(rows
        .into_iter()
        .map(|(id, width, height)| (id, Size { width, height }))
        .collect())
}

/// The group a node is gathered with into a region: its placing group, unless
/// no sibling shares that group with it. Such a node is laid out as its region
/// instead, and gathered with none; it is added to `lone`.
pub(crate) fn placing_group(
    lone: &mut Map<String, Lone>,
    captions: &Map<String, Size>,
    node: &Node,
    siblings: &[&Node],
) -> Option<String> {
    let group = node.option(PLACING_GROUP)?;
    if !alone_in(node, siblings) {
        return Some(group.to_owned());
    }
    lone.insert(
        node.id.clone(),
        lone_of(node, group, captions.get(group).copied()),
    );
    None
}

/// A node's region round it alone.
fn lone_of(node: &Node, group: &str, caption: Option<Size>) -> Lone {
    Lone {
        group: group.to_owned(),
        caption: caption.unwrap_or(Size {
            width: 1.0,
            height: 1.0,
        }),
        width: if node.has_children() {
            None
        } else {
            Some(node.w())
        },
        room: None,
    }
}

/// Whether a node is alone among its siblings in its placing group.
fn alone_in(node: &Node, siblings: &[&Node]) -> bool {
    let group = node.option(PLACING_GROUP);
    group.is_some()
        && !siblings
            .iter()
            .any(|&one| !std::ptr::eq(one, node) && one.option(PLACING_GROUP) == group)
}

/// The band above the node that holds the region's caption: its tab, which
/// reaches the caption's foot, and the region's inset under it.
pub(crate) fn band_of(lone: &Lone) -> f64 {
    CAPTION_INSET + lone.caption.height + REGION_INSET
}

/// How wide a region's caption needs it: the caption and its inset on each side.
pub(crate) fn caption_width(lone: &Lone) -> f64 {
    lone.caption.width + 2.0 * CAPTION_INSET
}

/// How much taller a region round one node stands than the node: its caption
/// band above and its inset below.
pub(crate) fn grown_by(lone: &Lone) -> f64 {
    band_of(lone) + REGION_INSET
}

/// A container a block lays out alone in its region, laid out once as that
/// region, when its caption needs the region wider: the region then keeps the
/// container as wide as it was laid out and stands it in the middle, as it
/// does a card. Nothing when the caption fits.
pub(crate) fn widened(lone: &Lone, width: f64) -> Option<Lone> {
    let short = caption_width(lone) - width;
    (short > 0.0).then(|| Lone {
        room: Some(REGION_INSET + short / 2.0),
        ..lone.clone()
    })
}

/// How wide a container is in a block of some width: the block's width, or
/// alone in its region, the width it stands at inside the region.
pub(crate) fn frame_width(lone: Option<&Lone>, width: f64) -> f64 {
    lone.map_or(width, |lone| width - 2.0 * side_room(width, lone))
}

/// The room a container alone in its region keeps around what it holds: the
/// region's room round the container more on its sides, and its inset more
/// below. The caption band stands in its header.
pub(crate) fn grown_insets(insets: Insets, lone: Option<&Lone>) -> Insets {
    lone.map_or(insets, |lone| Insets {
        side: insets.side + room_of(lone),
        bottom: insets.bottom + REGION_INSET,
        ..insets
    })
}

/// A container's header: its title row, and the caption band above it when
/// it is alone in its region.
///
/// # Errors
///
/// When its measured header sizes are unreadable.
pub(crate) fn frame_header(node: &Node, band: f64) -> Result<Header, String> {
    let header = number_of(node.option("archboard.header.size").unwrap_or("0"));
    Ok(Header {
        width: node.w(),
        height: js_max(1.0, header) + band,
        steps: steps_of(node, band)?,
    })
}

/// A card as the blocks lay it out: grown into the box its region takes when
/// it is alone in one.
pub(crate) fn card_as(node: &Node, lone: Option<&Lone>) -> Card {
    let card = card_of(node);
    let Some(lone) = lone else {
        return card;
    };
    Card {
        width: js_max(card.width + 2.0 * REGION_INSET, caption_width(lone)),
        height: card.height + band_of(lone) + REGION_INSET,
        ..card
    }
}

/// The card's or container's own box inside the box its region took.
pub(crate) fn card_in(region: Rect, lone: &Lone) -> Rect {
    let side = side_room(region.width, lone);
    Rect {
        x: region.x + side,
        y: region.y + band_of(lone),
        width: region.width - 2.0 * side,
        height: region.height - band_of(lone) - REGION_INSET,
    }
}

/// How far in from each side of the box its region took a card or container stands.
pub(crate) fn side_room(width: f64, lone: &Lone) -> f64 {
    match lone.width {
        None => room_of(lone),
        Some(own) => js_max(REGION_INSET, (width - own) / 2.0),
    }
}

/// How far in from each side of its region a container stands.
pub(crate) fn room_of(lone: &Lone) -> f64 {
    lone.room.unwrap_or(REGION_INSET)
}

/// What a container's title's centre, height and words are, as its title row reads them.
pub(crate) struct Head<'a> {
    pub width: f64,
    pub centre: f64,
    pub height: f64,
    pub words: f64,
    pub steps: Option<&'a [Size]>,
}

/// The title row a container drawn inline gives the track scene, and the room
/// it keeps below what it holds. Alone in its region, the scene reads it as
/// the region.
pub(crate) fn title_row(bounds: Rect, head: &Head<'_>, lone: Option<&Lone>) -> FrameRow {
    FrameRow {
        title: [
            bounds.x,
            head.centre - head.height / 2.0,
            head.width + 2.0 * lone.map_or(0.0, room_of),
            head.height,
            head.words + 2.0 * lone.map_or(0.0, room_of),
        ],
        steps: head.steps.map(|steps| {
            steps
                .iter()
                .map(|step| (step.width - ARCHITECTURE_HEADER_PADDING, step.height))
                .collect()
        }),
        above: lone.map_or(0.0, band_of),
        below: lone.map(|_| REGION_INSET),
        wide: lone.map(caption_width),
    }
}

/// A container drawn inline, laid out as the region it is alone in: its own
/// box inside the box the scene fitted round what it holds.
pub(crate) fn frame_shape(shape: FrameShape, lone: Option<&Lone>) -> FrameShape {
    match lone {
        None => shape,
        Some(lone) => FrameShape {
            bx: card_in(shape.bx, lone),
            ..shape
        },
    }
}

/// How wide a block drawing a container inline lays its title row out.
pub(crate) fn title_width(header: &Header, lone: Option<&Lone>, inset: f64) -> f64 {
    match lone {
        None => header.width,
        Some(lone) => js_max(header.width, caption_width(lone) - 2.0 * inset),
    }
}

/// Whether two coordinates are one wall's.
fn on_wall(one: f64, other: f64) -> bool {
    abs(one - other) < ON_WALL
}

/// The points that carry a line from where it stops on a region's side wall
/// to its card's side, level, stepping clear of the caption band and the
/// corners when it stopped beside them.
fn carried_level(end: Point, x: f64, card: Rect) -> Vec<Point> {
    let y = js_min(
        js_max(end.y, card.y + CORNER_ROOM),
        card.y + card.height - CORNER_ROOM,
    );
    if on_wall(y, end.y) {
        return vec![Point { x, y }];
    }
    let step = f64::midpoint(end.x, x);
    vec![
        Point { x: step, y: end.y },
        Point { x: step, y },
        Point { x, y },
    ]
}

/// The points that carry a line from where it stops on a region's wall to its
/// card's face: straight on through a top or bottom wall, level through a side.
fn carried(end: Point, stop: &Stop) -> Vec<Point> {
    let Stop { region, card } = *stop;
    if on_wall(end.y, region.y) {
        return vec![Point {
            x: end.x,
            y: card.y,
        }];
    }
    if on_wall(end.y, region.y + region.height) {
        return vec![Point {
            x: end.x,
            y: card.y + card.height,
        }];
    }
    if on_wall(end.x, region.x) {
        return carried_level(end, card.x, card);
    }
    if on_wall(end.x, region.x + region.width) {
        return carried_level(end, card.x + card.width, card);
    }
    Vec::new()
}

/// A line carried on to the face of every card alone in its region it stops at.
pub(crate) fn carried_line(
    points: &[Point],
    source: Option<&Stop>,
    target: Option<&Stop>,
) -> Vec<Point> {
    let mut line = Vec::with_capacity(points.len() + 6);
    if let Some(source) = source {
        let mut before = carried(points[0], source);
        before.reverse();
        line.extend(before);
    }
    line.extend_from_slice(points);
    if let Some(target) = target {
        line.extend(carried(
            *points.last().expect("a line's last point"),
            target,
        ));
    }
    line
}

/// The columns where lines cross a region's caption band.
fn crossing_band(region: Rect, band: f64, lines: &[&[Point]]) -> Vec<f64> {
    lines
        .iter()
        .flat_map(|points| {
            points.windows(2).filter_map(move |pair| {
                let (previous, point) = (pair[0], pair[1]);
                let spans = js_min(previous.y, point.y) < region.y + band
                    && js_max(previous.y, point.y) > region.y;
                let within = point.x > region.x && point.x < region.x + region.width;
                (on_wall(previous.x, point.x) && spans && within).then_some(point.x)
            })
        })
        .collect()
}

/// Where a caption's words stand clear of some lines by some room: the
/// leftmost such place in its band, at the band's corner or just past a line.
fn clear_of(band: (f64, f64), width: f64, crossing: &[f64], room: f64) -> Option<f64> {
    let (first, last) = band;
    let mut places = vec![first];
    places.extend(crossing.iter().map(|line| line + room - WORDS_INSET));
    places.push(last);
    let places: Vec<f64> = places
        .into_iter()
        .filter(|&x| x >= first && x <= last)
        .collect();
    sorted_by(&places, |one, other| one - other)
        .into_iter()
        .find(|&at| {
            crossing.iter().all(|&line| {
                line <= at + WORDS_INSET - room || line >= at + width - WORDS_INSET + room
            })
        })
}

/// Where a region round one card or container puts its caption: in the
/// band's top-left corner as every region does, unless a line into the node
/// crosses the band there; then as far left as the words stand clear of
/// every line.
pub(crate) fn caption_in(region: Rect, lone: &Lone, lines: &[&[Point]]) -> Rect {
    let Size { width, height } = lone.caption;
    let crossing = crossing_band(region, band_of(lone), lines);
    let band = (
        region.x + CAPTION_INSET,
        region.x + region.width - CAPTION_INSET - width,
    );
    let x = WORDS_ROOMS
        .iter()
        .find_map(|&room| clear_of(band, width, &crossing, room));
    Rect {
        x: x.unwrap_or(band.0),
        y: region.y + CAPTION_INSET,
        width,
        height,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lone() -> Lone {
        Lone {
            group: "g".to_owned(),
            caption: Size {
                width: 60.0,
                height: 12.0,
            },
            width: Some(100.0),
            room: None,
        }
    }

    #[test]
    fn a_card_stands_in_the_middle_of_a_region_its_caption_widens() {
        let region = Rect {
            x: 0.0,
            y: 0.0,
            width: 160.0,
            height: 100.0,
        };
        let card = card_in(region, &lone());
        assert_eq!(
            card,
            Rect {
                x: 30.0,
                y: 30.0,
                width: 100.0,
                height: 56.0
            }
        );
    }

    #[test]
    fn a_line_stopped_on_the_region_top_runs_on_to_the_card() {
        let stop = Stop {
            region: Rect {
                x: 0.0,
                y: 0.0,
                width: 160.0,
                height: 100.0,
            },
            card: Rect {
                x: 30.0,
                y: 30.0,
                width: 100.0,
                height: 56.0,
            },
        };
        let line = carried_line(
            &[Point { x: 50.0, y: -40.0 }, Point { x: 50.0, y: 0.0 }],
            None,
            Some(&stop),
        );
        assert_eq!(line.last(), Some(&Point { x: 50.0, y: 30.0 }));
    }

    #[test]
    fn a_caption_moves_clear_of_a_line_through_its_corner() {
        let region = Rect {
            x: 0.0,
            y: 0.0,
            width: 200.0,
            height: 100.0,
        };
        let line = [
            Point { x: 20.0, y: -40.0 },
            Point { x: 20.0, y: 0.0 },
            Point { x: 20.0, y: 20.0 },
        ];
        let caption = caption_in(region, &lone(), &[&line]);
        assert!(caption.x + WORDS_INSET > 20.0);
    }

    // A region round one card captions its band where no line into the card
    // crosses the caption's words: at the band's left corner, else in the
    // first gap between the lines wide enough for the words.

    const BANDED: Rect = Rect {
        x: 100.0,
        y: 100.0,
        width: 368.0,
        height: 152.0,
    };

    fn captioned() -> Lone {
        Lone {
            group: "child".to_owned(),
            caption: Size {
                width: 134.0,
                height: 42.0,
            },
            width: None,
            room: None,
        }
    }

    /// A line dropping through the region's caption band into its card.
    fn dropping(x: f64) -> [Point; 2] {
        [Point { x, y: 0.0 }, Point { x, y: 150.0 }]
    }

    #[test]
    fn a_caption_stands_in_its_band_s_corner_where_no_line_crosses_it() {
        let caption = caption_in(BANDED, &captioned(), &[&dropping(400.0)]);
        assert_eq!(caption.x, 104.0);
    }

    // Taken from a dogfood view: lines into Codex session dropped through both
    // ends of its region's band, and the caption stood over the left one.
    #[test]
    fn a_caption_stands_between_lines_at_both_ends_of_its_band() {
        let lines = [dropping(130.0), dropping(440.0)];
        let caption = caption_in(BANDED, &captioned(), &[&lines[0], &lines[1]]);
        for [top, _] in lines {
            let strikes =
                top.x > caption.x + WORDS_INSET && top.x < caption.x + caption.width - WORDS_INSET;
            assert!(!strikes, "{}", top.x);
        }
    }
}
