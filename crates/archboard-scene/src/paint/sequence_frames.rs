//! The frames of a sequence painted: the frame around one flow with its name
//! and summary, and each decision's or loop's fragment with its operator tab,
//! its guards and its dividers.

use crate::geometry::{Rect, round_coord};
use crate::js::js_min;
use crate::names::word;
use crate::paint::appearance::tray_look;
use crate::paint::build::{Items, group, lines, point, shape, text};
use crate::paint::cards::{header_anchor, header_width, paint_header};
use crate::paint::design::{
    BAND_RADIUS, FRAME_GUARD_HEIGHT, FRAME_HEAD_HEIGHT, FRAME_PAD, FRAME_TAB_PADDING, TAB_PADDING,
};
use crate::paint::far_card::{Words, heading_runs, paint_heading_views};
use crate::paint::far_view::{far_layer, near_layer};
use crate::paint::palette::Palette;
use crate::paint::sequence_messages::PILL_BASELINE;
use crate::paint::slab::{boxed, slab_seat};
use crate::paint::standing::{
    PIN_INSET, ghost_opacity, standing_palette, standing_pin, standing_pin_at, subject,
    warning_badge,
};
use crate::paint::styles::{Styles, full_line_colour};
use crate::paint::tray::{Well, tab_view, well_body};
use crate::request::{SequenceFlow, SequenceFrame, Standing};
use crate::scene::{
    Colour, Geometry, Group, Item, PathStep, Purpose, Role, Shape, Stroke, SubjectKind,
};

const MARK_SPACING: f64 = 24.0;
const FRAGMENT_RADIUS: f64 = 3.0;
const TAB_CUT: f64 = 5.0;
const DIVIDER_DASH: [f64; 2] = [4.0, 3.0];

/// The frame around one flow, with the flow's name and summary in its tab.
pub(super) fn paint_frame(
    layout: &SequenceFlow,
    palette: &Palette,
    standing: Option<Standing>,
    unsettled: bool,
) -> Items {
    let styles = Styles::of(palette);
    let (frame, header, flow) = (layout.frame, layout.header, &layout.flow);
    let summary = flow.summary.as_deref();
    let (far_runs, far_width) = heading_runs(&flow.name, summary, layout.tab);
    let well = |width: f64| Well {
        frame,
        tab: Rect {
            width: js_min(width, layout.tab.width),
            ..layout.tab
        },
    };
    let near = well(header_width(header, &flow.name, summary) + 2.0 * TAB_PADDING);
    let far = well(far_width);
    let look = tray_look(palette, 0.0);
    // A flow's other standings show on its pin, not round its frame.
    let ghosted = standing.filter(|one| *one == Standing::Removed);
    let view = |well: &Well| tab_view(well, &look, palette, ghosted);
    group(
        Role::Frame(None),
        Some(subject(SubjectKind::Flow, &flow.id, standing)),
        lines(vec![
            slab_seat(near.body(), BAND_RADIUS),
            well_body(&near, &look, palette, ghosted),
            near_layer(view(&near)),
            far_layer(view(&far)),
            paint_heading_views(
                &far_runs,
                far.tab,
                palette,
                Words {
                    items: paint_header(header, &flow.name, summary, &styles),
                    anchor: header_anchor(header),
                },
            ),
            standing_pin(frame, standing, palette),
            warning_badge(frame, unsettled, palette),
        ]),
    )
}

/// The tab a decision's or loop's operator stands in.
fn tab_path(frame: &SequenceFrame, ink: &Colour, face: &Colour) -> Items {
    let Rect {
        x,
        y,
        width,
        height,
    } = frame.tab;
    let steps = vec![
        PathStep::Move { to: point(x, y) },
        PathStep::Across {
            x: round_coord(x + width),
        },
        PathStep::Down {
            y: round_coord(y + height - TAB_CUT),
        },
        PathStep::Line {
            to: point(x + width - TAB_CUT, y + height),
        },
        PathStep::Across { x: round_coord(x) },
        PathStep::Close,
    ];
    shape(
        Shape::path(Purpose::Outline, steps)
            .filled(face)
            .stroked(Stroke::new(ink, 1.0)),
    )
}

/// The words of one row of a frame, left aligned at a height.
fn row_words(x: f64, top: f64, height: f64, words: &str, palette: &Palette) -> Items {
    text(
        Styles::of(palette)
            .pill_text()
            .set(point(x, top + height * PILL_BASELINE), words),
    )
}

/// Each alternative's label at the start of its operand, and its dashed divider.
fn paint_guards(frame: &SequenceFrame, ink: &Colour, words: &Palette) -> Items {
    let rect = frame.bounds;
    lines(
        frame
            .guards
            .iter()
            .map(|guard| {
                lines(vec![
                    match guard.divider {
                        None => Items::new(),
                        Some(divider) => shape(
                            Shape::new(
                                Purpose::Line,
                                Geometry::Line {
                                    from: point(rect.x, divider),
                                    to: point(rect.x + rect.width, divider),
                                },
                            )
                            .stroked(Stroke::new(ink, 1.0).dashed(&DIVIDER_DASH)),
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
) -> Items {
    let rect = frame.bounds;
    let tab = frame.tab;
    let ink = full_line_colour(palette, standing);
    let words = standing_palette(palette, standing);
    let outline = Shape::rect(Purpose::Box, boxed(rect), Some(FRAGMENT_RADIUS));
    let mark_x = rect.x + rect.width - PIN_INSET;
    vec![Item::Group(Group {
        opacity: ghost_opacity(standing),
        ..Group::new(
            Role::Fragment,
            lines(vec![
                shape(outline.clone().unfilled().stroked(Stroke::new(ink, 1.0))),
                shape(Shape {
                    purpose: Purpose::Halo,
                    ..outline
                        .unfilled()
                        .stroked(Styles::of(palette).ring(Some(2.0)))
                }),
                tab_path(frame, ink, &palette.pill),
                row_words(
                    tab.x + FRAME_TAB_PADDING,
                    tab.y,
                    FRAME_HEAD_HEIGHT,
                    word(&frame.operator),
                    &words,
                ),
                row_words(
                    tab.x + tab.width + FRAME_TAB_PADDING,
                    tab.y,
                    FRAME_HEAD_HEIGHT,
                    &frame.words,
                    &words,
                ),
                paint_guards(frame, ink, &words),
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
        .drawing(subject(SubjectKind::Step, &frame.step.id, standing))
    })]
}
