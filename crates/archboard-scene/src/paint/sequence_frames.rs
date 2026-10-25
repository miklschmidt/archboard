//! The frames of a sequence painted: the frame around one flow with its name
//! and summary, and each decision's or loop's fragment with its operator tab,
//! its guards and its dividers.

use crate::attrs;
use crate::geometry::{Rect, coord};
use crate::markup::{Markup, group, lines, tag, text_node};
use crate::paint::Ctx;
use crate::paint::appearance::tray_look;
use crate::paint::cards::{halo, header_anchor, paint_header};
use crate::paint::design::{
    BAND_RADIUS, CARD_THICKNESS, FRAME_GUARD_HEIGHT, FRAME_HEAD_HEIGHT, FRAME_PAD,
    FRAME_TAB_PADDING, PILL_TEXT_SIZE,
};
use crate::paint::far_card::{Words, paint_heading_views};
use crate::paint::fonts::{PILL_FONT, font_attributes};
use crate::paint::palette::Palette;
use crate::paint::sequence_messages::PILL_BASELINE;
use crate::paint::slab::{Lift, boxed, slab_seat, slab_shadow};
use crate::paint::standing::{
    PIN_INSET, ghost_opacity, standing_palette, standing_pin, standing_pin_at, subject,
    warning_badge,
};
use crate::paint::styles::{Styles, full_line_colour};
use crate::paint::tray::tray;
use crate::request::{SequenceFlow, SequenceFrame, Standing};
use crate::scene::{Role, SubjectKind};

const MARK_SPACING: f64 = 24.0;
const FRAGMENT_RADIUS: f64 = 3.0;
const TAB_CUT: f64 = 5.0;
const DIVIDER_DASH: &str = "4 3";

/// The frame around one flow, with the flow's name and summary on it.
pub(super) fn paint_frame(
    ctx: &Ctx<'_>,
    layout: &SequenceFlow,
    palette: &Palette,
    standing: Option<Standing>,
    unsettled: bool,
) -> Markup {
    let styles = Styles::of(palette);
    let frame = layout.frame;
    let header = layout.header;
    let ghosted = (standing == Some(Standing::Removed)).then_some(Standing::Removed);
    let look = tray_look(layout.slab, palette, 0.0);
    let plate = Rect {
        y: layout.slab.y,
        height: layout.slab.height - CARD_THICKNESS,
        ..header
    };
    let flow = &layout.flow;
    group(
        Role::Frame,
        Some(subject(SubjectKind::Flow, &flow.id, standing)),
        attrs! {},
        lines(vec![
            slab_seat(frame, BAND_RADIUS),
            slab_shadow(frame, BAND_RADIUS, Lift::Tray, palette, ghosted),
            halo(frame, BAND_RADIUS, &styles, ghosted),
            tray(frame, &look, palette, ghosted),
            paint_heading_views(
                ctx,
                &flow.name,
                flow.summary.as_deref(),
                plate,
                palette,
                Words {
                    markup: paint_header(ctx, header, &flow.name, flow.summary.as_deref(), &styles),
                    anchor: header_anchor(header),
                },
            ),
            standing_pin(frame, standing, palette),
            warning_badge(frame, unsettled, palette),
        ]),
    )
}

/// The tab a decision's or loop's operator stands in.
fn tab_path(frame: &SequenceFrame, ink: &str, face: &str) -> Markup {
    let Rect {
        x,
        y,
        width,
        height,
    } = frame.tab;
    let d = format!(
        "M {} {} H {} V {} L {} {} H {} Z",
        coord(x),
        coord(y),
        coord(x + width),
        coord(y + height - TAB_CUT),
        coord(x + width - TAB_CUT),
        coord(y + height),
        coord(x)
    );
    tag(
        "path",
        attrs! { "d": d, "fill": face, "stroke": ink, "stroke-width": 1.0 },
    )
}

/// The words of one row of a frame, left aligned at a height.
fn row_words(x: f64, top: f64, height: f64, text: &str, fill: &str) -> Markup {
    text_node(
        attrs! { "x": coord(x), "y": coord(top + height * PILL_BASELINE) }
            .with(font_attributes(PILL_FONT))
            .set("font-size", PILL_TEXT_SIZE)
            .set("fill", fill),
        text,
    )
}

/// Each alternative's label at the start of its operand, and its dashed divider.
fn paint_guards(frame: &SequenceFrame, ink: &str, words: &str) -> Markup {
    let rect = frame.bounds;
    lines(
        frame
            .guards
            .iter()
            .map(|guard| {
                lines(vec![
                    match guard.divider {
                        None => Markup::new(),
                        Some(divider) => tag(
                            "line",
                            attrs! {
                                "x1": coord(rect.x),
                                "y1": coord(divider),
                                "x2": coord(rect.x + rect.width),
                                "y2": coord(divider),
                                "stroke": ink,
                                "stroke-width": 1.0,
                                "stroke-dasharray": DIVIDER_DASH,
                            },
                        ),
                    },
                    row_words(
                        rect.x + FRAME_PAD,
                        guard.top,
                        FRAME_GUARD_HEIGHT,
                        &format!("[{}]", guard.label),
                        words,
                    ),
                ])
            })
            .collect(),
    )
}

/// One decision's or loop's frame.
pub(super) fn paint_fragment(
    frame: &SequenceFrame,
    palette: &Palette,
    standing: Option<Standing>,
    unsettled: bool,
) -> Markup {
    let rect = frame.bounds;
    let tab = frame.tab;
    let ink = full_line_colour(palette, standing);
    let words = standing_palette(palette, standing).pill_text;
    let outline = boxed(rect).set("rx", FRAGMENT_RADIUS);
    let mark_x = rect.x + rect.width - PIN_INSET;
    let operator = match frame.operator {
        crate::request::FrameOperator::Alt => "alt",
        crate::request::FrameOperator::Loop => "loop",
    };
    group(
        Role::Fragment,
        Some(subject(SubjectKind::Step, &frame.step.id, standing)),
        attrs! { "opacity": ghost_opacity(standing) },
        lines(vec![
            tag(
                "rect",
                outline
                    .clone()
                    .set("fill", "none")
                    .set("stroke", ink)
                    .set("stroke-width", 1.0),
            ),
            tag(
                "rect",
                attrs! { "class": "ab-halo" }
                    .with(outline)
                    .set("stroke-width", 2.0)
                    .with(Styles::of(palette).halo()),
            ),
            tab_path(frame, ink, palette.pill),
            row_words(
                tab.x + FRAME_TAB_PADDING,
                tab.y,
                FRAME_HEAD_HEIGHT,
                operator,
                words,
            ),
            row_words(
                tab.x + tab.width + FRAME_TAB_PADDING,
                tab.y,
                FRAME_HEAD_HEIGHT,
                &frame.words,
                words,
            ),
            paint_guards(frame, ink, words),
            standing_pin_at(mark_x, rect.y + PIN_INSET, standing, palette),
            warning_badge(
                Rect {
                    width: rect.width - MARK_SPACING,
                    ..rect
                },
                unsettled,
                palette,
            ),
        ]),
    )
}
