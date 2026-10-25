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
use crate::drawing::Emphasis;
use crate::geometry::{Point, Rect, coord, round_coord};
use crate::js;
use crate::markup::{Attrs, Markup, group, lines, spelt, tag, text_node, wrap};
use crate::paint::Ctx;
use crate::paint::appearance::{chip_tile, semantic_ink};
use crate::paint::design::{CHIP_THICKNESS, DIAGRAM_MARGIN, ICON_CHIP_SIZE};
use crate::paint::fonts::{CARD_NOTE_FONT, CARD_TITLE_FONT, font_attributes};
use crate::paint::page::{PaintedPage, moved_atlas};
use crate::paint::palette::Palette;
use crate::paint::standing::standing_pin_at;
use crate::paint::styles::{HEAD_LENGTH, dash_array, drawn_ink, stroke_width};
use crate::paint::traffic::pulse_look;
use crate::request::{Dash, ExportFrame, LegendLayout, PaletteColor, Standing};
use crate::scene::{Atlas, Item, Role, SubjectKind};

const ROW: f64 = 28.0;
const GLYPH: f64 = 30.0;
const WORD_GAP: f64 = 8.0;
const COUNT_GAP: f64 = 6.0;
const ENTRY_GAP: f64 = 24.0;
const LIST_GAP: f64 = 40.0;
const WORD_SIZE: f64 = 12.0;
const PULSE_STOPS: [(f64, f64); 6] = [
    (0.0, 0.0),
    (0.35, 0.05),
    (0.6, 0.2),
    (0.78, 0.5),
    (0.9, 1.0),
    (1.0, 0.0),
];
const PULSE_SPAN: f64 = 40.0;
const PULSE_GLOW: f64 = 3.0;
const TITLE_SIZE: f64 = 18.0;
const TITLE_LINE: f64 = 24.0;

/// What a picture draws a subject as, read back from the drawn scene.
#[derive(Clone, Debug)]
struct Applied {
    type_name: String,
    type_kind: String,
    icon: Option<Item>,
    depiction: String,
    type_color: String,
    line_color: String,
    dash: String,
    arrowhead: String,
}

impl Applied {
    /// What two subjects share when one sample keys them both.
    fn sample_key(&self) -> (Option<&Item>, [&str; 6]) {
        (
            self.icon.as_ref(),
            [
                &self.type_kind,
                &self.type_name,
                &self.type_color,
                &self.line_color,
                &self.dash,
                &self.arrowhead,
            ],
        )
    }
}

/// A value as a reader of the written document reads it back: without the
/// characters XML cannot hold.
fn read_back(spelt: &str) -> String {
    spelt
        .chars()
        .filter(|character| !crate::markup::forbidden(*character))
        .collect()
}

/// One open element as the scene is walked: whether it holds an icon, and the subject it drew.
struct Open {
    icon: bool,
    subject: Option<usize>,
}

/// Every subject the scene draws with an appearance, and the icon markup inside it.
fn picture_appearances(body: &[Item]) -> Vec<(String, Applied)> {
    struct Walk {
        open: Vec<Open>,
        met: Vec<(String, Applied)>,
    }
    fn visit(walk: &mut Walk, item: &Item) {
        let (name, subject, pairs, children, empty) = match item {
            Item::Group(group) => (
                "g",
                group.subject.as_ref(),
                &group.attrs,
                &group.children,
                false,
            ),
            Item::Element(element) => (
                element.name,
                None,
                &element.attrs,
                &element.children,
                element.empty,
            ),
            _ => return,
        };
        // A group's region is written with its group's id, not a subject id,
        // so the page's key never reads it.
        let id = subject
            .filter(|subject| subject.kind != SubjectKind::GroupRegion)
            .map(|subject| read_back(&subject.id));
        let read = |wanted: &str| {
            pairs
                .iter()
                .find(|(held, _)| *held == wanted)
                .map(|(_, value)| read_back(&spelt(value)))
        };
        let subject = match (id, read("data-type-name")) {
            (Some(id), Some(type_name)) => {
                walk.met.push((
                    id,
                    Applied {
                        type_name,
                        type_kind: read("data-type-kind").unwrap_or_default(),
                        icon: None,

                        depiction: read("data-depiction").unwrap_or_default(),
                        type_color: read("data-type-color").unwrap_or_else(|| "neutral".to_owned()),
                        line_color: read("data-line-color").unwrap_or_else(|| "neutral".to_owned()),
                        dash: read("data-line-dash").unwrap_or_else(|| "solid".to_owned()),
                        arrowhead: read("data-arrowhead").unwrap_or_else(|| "filled".to_owned()),
                    },
                ));
                Some(walk.met.len() - 1)
            }
            _ => None,
        };
        if empty {
            return;
        }
        walk.open.push(Open {
            icon: read("data-type-icon").is_some(),
            subject,
        });
        for child in children {
            visit(walk, child);
        }
        walk.open.pop();
        if name == "svg" && walk.open.last().is_some_and(|parent| parent.icon) {
            for open in &walk.open {
                if let Some(at) = open.subject
                    && walk.met[at].1.icon.is_none()
                {
                    walk.met[at].1.icon = Some(item.clone());
                }
            }
        }
    }
    let mut walk = Walk {
        open: Vec::new(),
        met: Vec::new(),
    };
    for item in body {
        visit(&mut walk, item);
    }
    // One entry per subject, where it was first met, with what it was last drawn as.
    let mut appearances: Vec<(String, Applied)> = Vec::new();
    for (id, applied) in walk.met {
        match appearances.iter_mut().find(|(held, _)| *held == id) {
            Some(entry) => entry.1 = applied,
            None => appearances.push((id, applied)),
        }
    }
    appearances
}

/// One sample of each distinct appearance, where it was first met, as it was last met.
fn distinct_samples(appearances: Vec<Applied>) -> Vec<Applied> {
    let mut samples: Vec<Applied> = Vec::new();
    for applied in appearances {
        match samples
            .iter_mut()
            .find(|held| held.sample_key() == applied.sample_key())
        {
            Some(entry) => *entry = applied,
            None => samples.push(applied),
        }
    }
    samples
}

/// What one legend entry keys, with what its symbol is drawn from.
enum Keys {
    /// A comparison's mark, and how many placed subjects carry it.
    Mark(Standing, usize),
    Kind(Applied),
    Relationship(Applied),
    Emphasis,
    Traffic,
}

impl Keys {
    fn as_str(&self) -> &'static str {
        match self {
            Keys::Mark(..) => "mark",
            Keys::Kind(_) => "kind",
            Keys::Relationship(_) => "relationship",
            Keys::Emphasis => "emphasis",
            Keys::Traffic => "traffic",
        }
    }
}

/// One entry: what it keys, and its words.
struct Entry {
    keys: Keys,
    words: String,
}

impl Entry {
    /// The count beside the entry's words: a mark's.
    fn count(&self) -> Option<usize> {
        match self.keys {
            Keys::Mark(_, count) => Some(count),
            _ => None,
        }
    }
}

fn line_at(x: f64, y: f64, attributes: Attrs, end: f64) -> Markup {
    tag(
        "path",
        attrs! {
            "d": format!("M{} {}H{}", coord(x + 1.0), coord(y + ROW / 2.0), coord(x + GLYPH - end)),
            "fill": "none",
            "stroke-linecap": "round",
        }
        .with(attributes),
    )
}

fn dash_of(word: &str) -> Option<&'static str> {
    match word {
        "dashed" => dash_array(Dash::Dashed),
        "dotted" => dash_array(Dash::Dotted),
        _ => None,
    }
}

fn relationship_symbol(applied: &Applied, palette: &Palette, x: f64, y: f64) -> Markup {
    let named = semantic_ink(PaletteColor::named(&applied.line_color));
    let ink = drawn_ink(
        named.as_deref().unwrap_or(palette.edge),
        palette,
        Emphasis::Normal,
    );
    let head = HEAD_LENGTH;
    let filled = applied.arrowhead == "filled";
    let headed = filled || applied.arrowhead == "open";
    let tip = x + GLYPH - 1.0;
    let shape = if filled {
        tag(
            "path",
            attrs! { "d": "M0 0L10 5L0 10Z", "fill": ink.as_str() },
        )
    } else {
        tag(
            "path",
            attrs! {
                "d": "M2 1L10 5L2 9",
                "fill": "none",
                "stroke": ink.as_str(),
                "stroke-width": 1.7,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
            },
        )
    };
    lines(vec![
        line_at(
            x,
            y,
            attrs! {
                "stroke": ink.as_str(),
                "stroke-width": stroke_width(Emphasis::Normal),
                "stroke-dasharray": dash_of(&applied.dash),
            },
            if filled { 1.0 + head / 2.0 } else { 1.0 },
        ),
        if headed {
            wrap(
                "svg",
                attrs! {
                    "x": coord(tip - head),
                    "y": coord(y + ROW / 2.0 - head / 2.0),
                    "width": head,
                    "height": head,
                    "viewBox": "0 0 10 10",
                },
                shape,
            )
        } else {
            Markup::new()
        },
    ])
}

fn kind_symbol(applied: &Applied, palette: &Palette, x: f64, y: f64) -> Markup {
    let named = semantic_ink(PaletteColor::named(&applied.type_color));
    let ink = named.unwrap_or_else(|| palette.glyph.to_owned());
    let rect = Rect {
        x: x + (GLYPH - ICON_CHIP_SIZE) / 2.0,
        y: y + (ROW - ICON_CHIP_SIZE) / 2.0,
        width: ICON_CHIP_SIZE,
        height: ICON_CHIP_SIZE,
    };
    let glyph = group(
        Role::Icon,
        None,
        attrs! {
            "transform": format!(
                "translate({},{})",
                coord(rect.x + ICON_CHIP_SIZE / 2.0 - 9.0),
                coord(rect.y + (ICON_CHIP_SIZE - CHIP_THICKNESS) / 2.0 - 9.0)
            ),
        },
        applied.icon.iter().cloned().collect(),
    );
    let mut symbol = chip_tile(rect, &ink, palette);
    symbol.extend(glyph);
    symbol
}

/// A line drawn with more emphasis.
fn emphasis_symbol(palette: &Palette, x: f64, y: f64) -> Markup {
    line_at(
        x,
        y,
        attrs! {
            "stroke": drawn_ink(palette.edge, palette, Emphasis::Hero),
            "stroke-width": stroke_width(Emphasis::Hero),
        },
        1.0,
    )
}

/// A line with a pulse on it, held still.
fn traffic_symbol(palette: &Palette, x: f64, y: f64) -> Markup {
    let plain = attrs! {
        "stroke": drawn_ink(palette.edge, palette, Emphasis::Normal),
        "stroke-width": stroke_width(Emphasis::Normal),
    };
    let light = pulse_look(palette.edge, stroke_width(Emphasis::Normal), palette).head;
    let front = x + GLYPH / 2.0 + PULSE_SPAN / 2.0;
    let run = format!(
        "M{} {}H{}",
        coord(front - PULSE_SPAN),
        coord(y + ROW / 2.0),
        coord(front)
    );
    let gradient = wrap(
        "linearGradient",
        attrs! {
            "id": "export-legend-pulse",
            "gradientUnits": "userSpaceOnUse",
            "x1": coord(front - PULSE_SPAN),
            "x2": coord(front),
            "y1": 0.0,
            "y2": 0.0,
        },
        PULSE_STOPS
            .iter()
            .flat_map(|(offset, opacity)| {
                tag("stop", attrs! { "offset": *offset, "stop-color": light.as_str(), "stop-opacity": *opacity })
            })
            .collect(),
    );
    wrap(
        "svg",
        attrs! {
            "x": coord(x),
            "y": coord(y),
            "width": GLYPH,
            "height": ROW,
            "viewBox": format!("{} {} {} {}", coord(x), coord(y), js::number(GLYPH), js::number(ROW)),
        },
        lines(vec![
            wrap("defs", attrs! {}, gradient),
            line_at(x, y, plain, 1.0),
            tag(
                "path",
                attrs! {
                    "d": run.as_str(),
                    "fill": "none",
                    "stroke": "url(#export-legend-pulse)",
                    "stroke-opacity": 0.25,
                    "stroke-width": stroke_width(Emphasis::Normal) + 0.6 + PULSE_GLOW,
                },
            ),
            tag(
                "path",
                attrs! {
                    "d": run.as_str(),
                    "fill": "none",
                    "stroke": "url(#export-legend-pulse)",
                    "stroke-width": stroke_width(Emphasis::Normal) + 0.6,
                },
            ),
        ]),
    )
}

fn symbol_of(entry: &Entry, palette: &Palette, x: f64, y: f64) -> Markup {
    match &entry.keys {
        Keys::Mark(standing, _) => {
            standing_pin_at(x + GLYPH / 2.0, y + ROW / 2.0, Some(*standing), palette)
        }
        Keys::Kind(applied) => kind_symbol(applied, palette, x, y),
        Keys::Relationship(applied) => relationship_symbol(applied, palette, x, y),
        Keys::Emphasis => emphasis_symbol(palette, x, y),
        Keys::Traffic => traffic_symbol(palette, x, y),
    }
}

/// How many placed subjects carry each mark, in the key's order; none that no subject carries.
fn mark_counts(
    standing: Option<&BTreeMap<String, Standing>>,
    placed: &HashSet<&str>,
) -> Vec<(Standing, &'static str, usize)> {
    let values: Vec<Standing> = standing
        .map(|stated| {
            stated
                .iter()
                .filter(|(id, _)| placed.contains(id.as_str()))
                .map(|(_, standing)| *standing)
                .collect()
        })
        .unwrap_or_default();
    [
        (Standing::Added, "Added"),
        (Standing::Changed, "Changed"),
        (Standing::Removed, "Removed"),
    ]
    .into_iter()
    .map(|(standing, word)| {
        (
            standing,
            word,
            values.iter().filter(|one| **one == standing).count(),
        )
    })
    .filter(|(_, _, count)| *count > 0)
    .collect()
}

fn entries_of(body: &[Item], marks: &[(Standing, &'static str, usize)]) -> Vec<Vec<Entry>> {
    let appearances: Vec<Applied> = picture_appearances(body)
        .into_iter()
        .map(|(_, applied)| applied)
        .collect();
    let kinds = distinct_samples(
        appearances
            .iter()
            .filter(|one| !one.depiction.is_empty())
            .cloned()
            .collect(),
    );
    let relationships = distinct_samples(
        appearances
            .into_iter()
            .filter(|one| one.depiction.is_empty())
            .collect(),
    );
    let mut lists = vec![
        marks
            .iter()
            .map(|(standing, word, count)| Entry {
                keys: Keys::Mark(*standing, *count),
                words: (*word).to_owned(),
            })
            .collect::<Vec<_>>(),
        kinds
            .into_iter()
            .map(|applied| Entry {
                words: applied.type_name.clone(),
                keys: Keys::Kind(applied),
            })
            .collect(),
    ];
    let mut lined: Vec<Entry> = Vec::new();
    let any = !relationships.is_empty();
    for applied in relationships {
        lined.push(Entry {
            words: applied.type_name.clone(),
            keys: Keys::Relationship(applied),
        });
    }
    if any {
        lined.push(Entry {
            keys: Keys::Emphasis,
            words: "More emphasis".to_owned(),
        });
        lined.push(Entry {
            keys: Keys::Traffic,
            words: "Illustrated traffic".to_owned(),
        });
    }
    lists.push(lined);
    lists.retain(|list| !list.is_empty());
    lists
}

fn width_of(ctx: &Ctx, entry: &Entry) -> f64 {
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

fn drawn_entry(ctx: &Ctx, entry: &Entry, x: f64, y: f64, palette: &Palette) -> Markup {
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

fn extent(ctx: &Ctx, lists: &[Vec<Entry>], at: Vec<Point>, bottom: f64) -> Placed {
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

fn column(ctx: &Ctx, lists: &[Vec<Entry>]) -> Placed {
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

fn row(ctx: &Ctx, lists: &[Vec<Entry>], wrap_at: f64) -> Placed {
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
    fn draw(&self, ctx: &Ctx, x: f64, y: f64, palette: &Palette) -> Markup {
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

fn legend_of(
    ctx: &Ctx,
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

fn with_legend(ctx: &Ctx, page: PaintedPage, legend: &Legend, palette: &Palette) -> PaintedPage {
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

fn under_title(ctx: &Ctx, page: PaintedPage, title: &str, palette: &Palette) -> PaintedPage {
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
    ctx: &Ctx,
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
