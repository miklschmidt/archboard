//! What a picture exported to stand alone carries around its drawing: a title
//! above it (TASK-467) and a legend under it or beside it, or the legend alone
//! (TASK-468). The drawing is moved down whole and the page grows; asked for
//! nothing, the page is the page that was painted.
//!
//! The legend lists what the page's key lists (`render/picture-key.ts`), read
//! from the drawn scene: the marks a comparison puts on what it changed, each
//! node kind, each relationship kind, and the two things a line says beside
//! its kind, each with the picture's own symbol.

use std::collections::{BTreeMap, HashSet};

use crate::attrs;
use crate::geometry::{Point, coord, round_coord};
use crate::js;
use crate::markup::{Markup, group, lines, text_node};
use crate::paint::Ctx;
use crate::paint::design::DIAGRAM_MARGIN;
use crate::paint::fonts::{CARD_NOTE_FONT, CARD_TITLE_FONT, font_attributes};
use crate::paint::legend_entries::{Entry, entries_of, mark_counts};
use crate::paint::legend_symbols::{GLYPH, ROW, symbol_of};
use crate::paint::page::{PaintedPage, moved_atlas};
use crate::paint::palette::Palette;
use crate::request::{ExportFrame, LegendLayout, Standing};
use crate::scene::{Atlas, Item, Role};

const WORD_GAP: f64 = 8.0;
const COUNT_GAP: f64 = 6.0;
const ENTRY_GAP: f64 = 24.0;
const LIST_GAP: f64 = 40.0;
const WORD_SIZE: f64 = 12.0;
const TITLE_SIZE: f64 = 18.0;
const TITLE_LINE: f64 = 24.0;

/// How wide an entry is: its symbol, its words and its count, rounded.
fn width_of(ctx: &Ctx<'_>, entry: &Entry) -> f64 {
    let words = ctx
        .measurer
        .measure(&entry.words, CARD_NOTE_FONT, WORD_SIZE);
    let count = entry.count().map_or(0.0, |count| {
        COUNT_GAP
            + ctx
                .measurer
                .measure(&count.to_string(), CARD_NOTE_FONT, WORD_SIZE)
    });
    round_coord(GLYPH + WORD_GAP + words + count)
}

/// One entry drawn at a point: its symbol, its words and its count.
fn drawn_entry(ctx: &Ctx<'_>, entry: &Entry, x: f64, y: f64, palette: &Palette) -> Markup {
    let words = |at: f64| {
        attrs! { "x": coord(at), "y": coord(y + ROW / 2.0), "dominant-baseline": "central", "font-size": WORD_SIZE }
    };
    let words_x = x + GLYPH + WORD_GAP;
    group(
        Role::LegendEntry,
        None,
        attrs! { "data-legend-entry": entry.keys.as_str() },
        lines(vec![
            symbol_of(entry, palette, x, y),
            text_node(
                words(words_x)
                    .set("fill", palette.foreground)
                    .with(font_attributes(CARD_NOTE_FONT)),
                &entry.words,
            ),
            match entry.count() {
                None => Markup::new(),
                Some(count) => text_node(
                    words(
                        words_x
                            + ctx
                                .measurer
                                .measure(&entry.words, CARD_NOTE_FONT, WORD_SIZE)
                            + COUNT_GAP,
                    )
                    .set("fill", palette.muted)
                    .with(font_attributes(CARD_NOTE_FONT)),
                    &count.to_string(),
                ),
            },
        ]),
    )
}

/// Where each entry stands, in the order its lists hold it, and the size they
/// fill with the margins.
struct Placed {
    at: Vec<Point>,
    width: f64,
    height: f64,
}

/// The entries' places with the size they fill: as wide as the widest row
/// reaches, down to `bottom`, with the margins.
fn extent(ctx: &Ctx<'_>, lists: &[Vec<Entry>], at: Vec<Point>, bottom: f64) -> Placed {
    let right = js::max(
        std::iter::once(DIAGRAM_MARGIN).chain(
            lists
                .iter()
                .flatten()
                .zip(&at)
                .map(|(entry, place)| place.x + width_of(ctx, entry)),
        ),
    );
    Placed {
        at,
        width: round_coord(right + DIAGRAM_MARGIN),
        height: round_coord(bottom + DIAGRAM_MARGIN),
    }
}

/// The entries stood one under another, a short gap between lists.
fn column(ctx: &Ctx<'_>, lists: &[Vec<Entry>]) -> Placed {
    let mut at = Vec::new();
    let mut y = DIAGRAM_MARGIN;
    for (index, list) in lists.iter().enumerate() {
        if index > 0 {
            y += LIST_GAP / 4.0;
        }
        for _ in list {
            at.push(Point {
                x: DIAGRAM_MARGIN,
                y,
            });
            y += ROW;
        }
    }
    extent(ctx, lists, at, y)
}

/// The entries stood in a row that wraps before `wrap_at`, a wider gap between lists.
fn row(ctx: &Ctx<'_>, lists: &[Vec<Entry>], wrap_at: f64) -> Placed {
    let mut at = Vec::new();
    let mut x = DIAGRAM_MARGIN;
    let mut y = DIAGRAM_MARGIN;
    for (index, list) in lists.iter().enumerate() {
        for (order, entry) in list.iter().enumerate() {
            let width = width_of(ctx, entry);
            let gap = if order > 0 {
                ENTRY_GAP
            } else if index > 0 {
                LIST_GAP
            } else {
                0.0
            };
            if !at.is_empty() && x + gap + width > wrap_at - DIAGRAM_MARGIN {
                x = DIAGRAM_MARGIN;
                y += ROW;
            } else {
                x += gap;
            }
            at.push(Point { x, y });
            x += width;
        }
    }
    extent(ctx, lists, at, y + ROW)
}

/// A legend laid out.
struct Legend {
    lists: Vec<Vec<Entry>>,
    laid: Placed,
    layout: LegendLayout,
}

impl Legend {
    /// The legend drawn with its top left corner at a point.
    fn draw(&self, ctx: &Ctx<'_>, x: f64, y: f64, palette: &Palette) -> Markup {
        group(
            Role::Slot,
            None,
            attrs! { "data-slot": "export-legend", "data-layout": self.layout.as_str() },
            lines(
                self.lists
                    .iter()
                    .flatten()
                    .zip(&self.laid.at)
                    .map(|(entry, place)| {
                        drawn_entry(ctx, entry, x + place.x, y + place.y, palette)
                    })
                    .collect(),
            ),
        )
    }
}

/// The legend of a picture laid out: a column for a vertical layout, else a row
/// that wraps at the page's width.
fn legend_of(
    ctx: &Ctx<'_>,
    body: &[Item],
    marks: &[(Standing, &'static str, usize)],
    layout: LegendLayout,
    wrap_at: f64,
) -> Legend {
    let lists = entries_of(body, marks);
    let laid = if layout == LegendLayout::Vertical {
        column(ctx, &lists)
    } else {
        row(ctx, &lists, wrap_at)
    };
    Legend {
        lists,
        laid,
        layout,
    }
}

/// A page with its legend: beside it on the right for a vertical layout, else under it.
fn with_legend(
    ctx: &Ctx<'_>,
    page: PaintedPage,
    legend: &Legend,
    palette: &Palette,
) -> PaintedPage {
    if legend.layout == LegendLayout::Vertical {
        return PaintedPage {
            body: lines(vec![page.body, legend.draw(ctx, page.width, 0.0, palette)]),
            width: round_coord(page.width + legend.laid.width),
            height: js::js_max(page.height, legend.laid.height),
            atlas: page.atlas,
        };
    }
    PaintedPage {
        body: lines(vec![page.body, legend.draw(ctx, 0.0, page.height, palette)]),
        width: js::js_max(page.width, legend.laid.width),
        height: round_coord(page.height + legend.laid.height),
        atlas: page.atlas,
    }
}

/// A page moved down under its title, made wide enough for the title.
fn under_title(ctx: &Ctx<'_>, page: PaintedPage, title: &str, palette: &Palette) -> PaintedPage {
    let words = text_node(
        attrs! {
            "x": DIAGRAM_MARGIN,
            "y": DIAGRAM_MARGIN + TITLE_LINE / 2.0,
            "dominant-baseline": "central",
            "font-size": TITLE_SIZE,
            "fill": palette.foreground,
        }
        .with(font_attributes(CARD_TITLE_FONT)),
        title,
    );
    let band = DIAGRAM_MARGIN + TITLE_LINE;
    PaintedPage {
        body: lines(vec![
            group(
                Role::Slot,
                None,
                attrs! { "data-slot": "export-title" },
                words,
            ),
            group(
                Role::Move,
                None,
                attrs! { "transform": format!("translate(0 {})", js::number(band)) },
                page.body,
            ),
        ]),
        width: js::js_max(
            page.width,
            ctx.measurer
                .measure(title, CARD_TITLE_FONT, TITLE_SIZE)
                .ceil()
                + 2.0 * DIAGRAM_MARGIN,
        ),
        height: band + page.height,
        atlas: moved_atlas(&page.atlas, 0.0, band),
    }
}

/// Whether a key is an array index, which an ECMAScript object lists before
/// its other keys, in ascending order.
fn array_index(key: &str) -> Option<u32> {
    let index: u32 = key.parse().ok()?;
    (index != u32::MAX && index.to_string() == key).then_some(index)
}

/// Every subject a painted drawing placed: what its atlas holds, nodes, then
/// lines, then regions, each once, in the order a host reads its atlas's keys.
pub fn placed_on(atlas: &Atlas) -> Vec<String> {
    let mut placed: Vec<String> = Vec::new();
    let mut seen: HashSet<&str> = HashSet::new();
    for boxes in [&atlas.nodes, &atlas.edges, &atlas.regions] {
        let mut indexed: Vec<(u32, &str)> = boxes
            .0
            .iter()
            .filter_map(|(id, _)| array_index(id).map(|index| (index, id.as_str())))
            .collect();
        indexed.sort_unstable();
        let named = boxes
            .0
            .iter()
            .map(|(id, _)| id.as_str())
            .filter(|id| array_index(id).is_none());
        for id in indexed.into_iter().map(|(_, id)| id).chain(named) {
            if seen.insert(id) {
                placed.push(id.to_owned());
            }
        }
    }
    placed
}

/// A page as an export carries it: with its legend under it or beside it, or
/// its legend alone, under its title when it has one.
pub fn framed_for_export(
    ctx: &Ctx<'_>,
    page: PaintedPage,
    frame: Option<&ExportFrame>,
    standing: Option<&BTreeMap<String, Standing>>,
    plain: bool,
    palette: &Palette,
) -> PaintedPage {
    let Some(frame) = frame else {
        return page;
    };
    let keyed = match frame.legend {
        None => page,
        Some(layout) => {
            let placed = placed_on(&page.atlas);
            let marks = if plain {
                Vec::new()
            } else {
                mark_counts(standing, &placed.iter().map(String::as_str).collect())
            };
            let legend = legend_of(ctx, &page.body, &marks, layout, page.width);
            let shown = if frame.legend_only == Some(true) {
                PaintedPage {
                    body: Markup::new(),
                    width: 0.0,
                    height: 0.0,
                    atlas: Atlas::default(),
                }
            } else {
                page
            };
            with_legend(ctx, shown, &legend, palette)
        }
    };
    match &frame.title {
        None => keyed,
        Some(title) => under_title(ctx, keyed, title, palette),
    }
}

/// The accessible name as the export draws it.
pub fn exported_name(name: &str, frame: Option<&ExportFrame>) -> String {
    let titled = match frame.and_then(|frame| frame.title.as_deref()) {
        None => name.to_owned(),
        Some(title) => format!("{title}. {name}"),
    };
    match frame {
        Some(frame) if frame.legend_only == Some(true) && frame.legend.is_some() => {
            format!("Legend. {titled}")
        }
        _ => titled,
    }
}
