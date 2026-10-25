//! The selection ring every subject carries, the card a part is drawn as in
//! either grammar, and the cards and frame headings of a message sequence.

use crate::attrs;
use crate::geometry::{Rect, coord};
use crate::markup::{Markup, group, lines, tag, text_node};
use crate::paint::Ctx;
use crate::paint::appearance::{appearance_attributes, card_look};
use crate::paint::design::{
    ARCHITECTURE_NOTE_GAP, CARD_PADDING_X, ICON_CHIP_GAP, ICON_CHIP_SIZE, NOTE_SIZE,
    PART_NOTE_SIZE, PART_TITLE_LINE, PART_TITLE_SIZE, SLAB_RADIUS,
};
use crate::paint::far_card::{NearCard, Part, Words, paint_card_views};
use crate::paint::far_view::Place;
use crate::paint::fonts::{CARD_NOTE_FONT, CARD_TITLE_FONT};
use crate::paint::palette::Palette;
use crate::paint::slab::{Lift, slab, slab_seat, slab_shadow};
use crate::paint::standing::{
    OUTLINE_WIDTH, standing_palette, standing_pin, subject, warning_badge,
};
use crate::paint::styles::Styles;
use crate::request::{NodeAppearance, SequenceCard, Standing};
use crate::scene::{Role, SubjectKind};

/// How far outside its subject a selection ring sits.
pub(super) const HALO_INSET: f64 = 3.0;
pub(super) const HALO_WIDTH: f64 = 2.0;

/// Where a card's name sits when it carries a responsibility under it.
const TITLE_BASELINE_WITH_NOTE: f64 = 23.0;
const NOTE_BASELINE: f64 = 39.0;
/// How far below a baseline the same text's optical centre is.
const OPTICAL_CENTRE: f64 = 0.34;

/// The ring a viewer turns on to show what is selected; round a removed part
/// it is drawn over the dashed footprint the part left.
pub(super) fn halo(
    rect: Rect,
    radius: f64,
    styles: &Styles<'_>,
    standing: Option<Standing>,
) -> Markup {
    let inset = if standing == Some(Standing::Removed) {
        -OUTLINE_WIDTH / 2.0
    } else {
        HALO_INSET
    };
    tag(
        "rect",
        attrs! {
            "class": "ab-halo",
            "x": coord(rect.x - inset),
            "y": coord(rect.y - inset),
            "width": coord(rect.width + inset * 2.0),
            "height": coord(rect.height + inset * 2.0),
            "rx": coord(radius + inset),
            "stroke-width": HALO_WIDTH,
        }
        .with(styles.halo()),
    )
}

/// One participant's card in a sequence.
pub(super) fn paint_card(
    ctx: &Ctx<'_>,
    placed: &SequenceCard,
    palette: &Palette,
    standing: Option<Standing>,
    unsettled: bool,
    appearance: &NodeAppearance,
) -> Markup {
    let words = standing_palette(palette, standing);
    let styles = Styles::of(&words);
    let rect = placed.bounds;
    let title_size = placed.title_size;
    let text_x = rect.x + CARD_PADDING_X + ICON_CHIP_SIZE + ICON_CHIP_GAP;
    let has_note = !placed.notes.is_empty();
    let title_y = if has_note {
        rect.y + TITLE_BASELINE_WITH_NOTE
    } else {
        rect.y + rect.height / 2.0 + title_size * OPTICAL_CENTRE
    };
    let title = text_node(
        attrs! { "x": coord(text_x), "y": coord(title_y), "font-size": title_size }
            .with(styles.title()),
        &ctx.measurer.truncate(
            &placed.node.name,
            CARD_TITLE_FONT,
            title_size,
            placed.title_room,
        ),
    );
    let note = lines(
        placed
            .notes
            .iter()
            .map(|run| {
                text_node(
                    attrs! {
                        "xml:space": "preserve",
                        "x": coord(text_x),
                        "y": coord(rect.y + NOTE_BASELINE - NOTE_SIZE + run.y),
                    }
                    .with(styles.note()),
                    &run.text,
                )
            })
            .collect(),
    );
    let chip_y = if has_note {
        rect.y + CARD_PADDING_X
    } else {
        rect.y + (rect.height - ICON_CHIP_SIZE) / 2.0
    };
    let part = Part {
        kind: SubjectKind::Node,
        node: &placed.node,
        rect,
        appearance,
        standing,
        unsettled,
    };
    let near = NearCard {
        chip_x: rect.x + CARD_PADDING_X,
        chip_y,
        words: Words {
            markup: lines(vec![title, note]),
            anchor: Place {
                x: text_x,
                y: title_y,
                size: title_size,
            },
        },
    };
    paint_slab_card(ctx, &part, palette, None, near)
}

/// A part drawn as a card, in either grammar: its seat, its halo, its slab
/// (cut through by its ports, if it has any), its near and far views, and
/// its standing's pin and warning.
pub(super) fn paint_slab_card(
    ctx: &Ctx<'_>,
    part: &Part<'_>,
    palette: &Palette,
    cut: Option<&str>,
    near: NearCard,
) -> Markup {
    let Part { rect, standing, .. } = *part;
    group(
        Role::Card,
        subject(part.kind, &part.node.id, standing),
        appearance_attributes(part.appearance),
        lines(vec![
            slab_seat(rect, SLAB_RADIUS),
            if standing == Some(Standing::Removed) {
                slab_shadow(rect, SLAB_RADIUS, Lift::Card, palette, standing)
            } else {
                Markup::new()
            },
            halo(rect, SLAB_RADIUS, &Styles::of(palette), standing),
            slab(
                rect,
                &card_look(part.appearance.body_color, palette),
                palette,
                standing,
                cut,
            ),
            paint_card_views(ctx, part, palette, near),
            standing_pin(rect, standing, palette),
            warning_badge(rect, part.unsettled, palette),
        ]),
    )
}

/// A flow's title block, printed on its frame's header slab.
pub(super) fn paint_header(
    ctx: &Ctx<'_>,
    header: Rect,
    name: &str,
    responsibility: Option<&str>,
    styles: &Styles<'_>,
) -> Markup {
    let name_baseline = header_anchor(header).y;
    let note_baseline = header.y + PART_TITLE_LINE + ARCHITECTURE_NOTE_GAP + PART_NOTE_SIZE;
    lines(vec![
        text_node(
            attrs! { "x": coord(header.x), "y": coord(name_baseline) }.with(styles.header_name()),
            &ctx.measurer
                .truncate(name, CARD_TITLE_FONT, PART_TITLE_SIZE, header.width),
        ),
        match responsibility {
            None => Markup::new(),
            Some(responsibility) => text_node(
                attrs! { "x": coord(header.x), "y": coord(note_baseline) }
                    .with(styles.header_note()),
                &ctx.measurer.truncate(
                    responsibility,
                    CARD_NOTE_FONT,
                    PART_NOTE_SIZE,
                    header.width,
                ),
            ),
        },
    ])
}

/// Where a flow's title block starts: the left end of its name's baseline.
pub(super) fn header_anchor(header: Rect) -> Place {
    Place {
        x: header.x,
        y: header.y + PART_TITLE_SIZE,
        size: PART_TITLE_SIZE,
    }
}
