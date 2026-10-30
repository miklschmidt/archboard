//! A message sequence painted: the frame, then the marks on the rows a
//! comparison says moved, then activation and label shadows, then columns and
//! their head cards, then the messages crossing them, and last the words of
//! every message. The layer order is load-bearing. Pulses share one clock.

use crate::geometry::{Rect, canvas_for, union};
use crate::paint::Ctx;
use crate::paint::appearance::{card_look, semantic_ink};
use crate::paint::build::{Items, group, grouped, lines, point, shape};
use crate::paint::cards::paint_card;
use crate::paint::colour::{Share, light_dark, mixed, tinted};
use crate::paint::design::{ACTIVATION_HALF_WIDTH, DIAGRAM_MARGIN, PILL_RADIUS, SLAB_RADIUS};
use crate::paint::page::{PaintedPage, atlas_boxes, shifted};
use crate::paint::palette::Palette;
use crate::paint::sequence_frames::{paint_fragment, paint_frame};
use crate::paint::sequence_messages::{
    Crossing, exchange_clock, paint_step, paint_step_words, row_tint, step_ride,
};
use crate::paint::shadow::SHADOW_REACH;
use crate::paint::slab::{Lift, SlabLook, boxed, ghost_face, shadow_under, slab};
use crate::paint::standing::{
    PIN_INSET, Standings, Unsettled, ghost_opacity, marked_box, standing_pin_at, subject,
};
use crate::paint::styles::Styles;
use crate::paint::tray::floor_of;
use crate::request::{
    NodeAppearance, SequenceColumn, SequenceDrawing, SequenceFlow, SequencePicture, Standing,
};
use crate::scene::{
    Atlas, Colour, Geometry, Group, Pointer, Purpose, Role, ShadowOf, Shape, Stroke, SubjectKind,
};

const ACTIVATION_RADIUS: f64 = 3.0;
const BAR_THICKNESS: f64 = 2.5;
const LIFELINE_DASH: [f64; 2] = [3.0, 5.0];
const LIFELINE_DASH_OFFSET: f64 = SHADOW_REACH + 1.0 - 6.0;
const HEAD_REACH: f64 = 64.0;
const LIT_LIFELINE_WIDTH: f64 = 1.5;
const BAR_SHADE: f64 = 0.4;
const NEUTRAL_BAR: Share = Share {
    light: 0.5,
    dark: 0.25,
};
const NEUTRAL_BAR_EDGE: Share = Share {
    light: 0.18,
    dark: 0.5,
};

/// How a message of a flow is marked: by its own standing, unless its whole flow was added or removed.
fn marked_within(flow: Option<Standing>, own: Option<Standing>) -> Option<Standing> {
    if own.is_some() && matches!(flow, Some(Standing::Added | Standing::Removed)) {
        Some(Standing::Unchanged)
    } else {
        own
    }
}

/// The marks of every message of one flow that moved: its band and its pin.
fn paint_row_marks(
    layout: &SequenceFlow,
    palette: &Palette,
    mark_of: &dyn Fn(&str) -> Option<Standing>,
) -> Items {
    let frame = layout.frame;
    let rows: Vec<Rect> = layout.steps.iter().map(|placed| placed.bounds).collect();
    lines(
        layout
            .steps
            .iter()
            .enumerate()
            .map(|(index, placed)| {
                let standing = mark_of(&placed.step.id);
                let row = rows[index];
                let top = row.y;
                let bottom = rows
                    .get(index + 1)
                    .map_or(row.y + row.height, |next| next.y);
                let middle = row.y + placed.pitch / 2.0;
                let tint = row_tint(
                    Rect {
                        x: frame.x,
                        y: top,
                        width: frame.width,
                        height: bottom - top,
                    },
                    standing,
                    palette,
                );
                if tint.is_empty() {
                    return Items::new();
                }
                grouped(
                    Group::new(
                        Role::RowMark,
                        lines(vec![
                            tint,
                            standing_pin_at(frame.x + PIN_INSET, middle, standing, palette),
                        ]),
                    )
                    .standing_with(vec![placed.step.id.clone()])
                    .pointer(Pointer::None),
                )
            })
            .collect(),
    )
}

/// A participant's activation bar: a slim slab of the participant itself.
fn bar_look(appearance: &NodeAppearance, palette: &Palette) -> SlabLook {
    let shape =
        |face: Colour, edge: Colour| SlabLook::plain(face, edge, BAR_THICKNESS, ACTIVATION_RADIUS);
    if semantic_ink(appearance.body_color).is_none() {
        let face = tinted(&palette.slab_face, Some(&palette.muted), NEUTRAL_BAR);
        let edge = light_dark(
            &mixed(&face, &palette.foreground, NEUTRAL_BAR_EDGE.light),
            &mixed(&face, &palette.slab_deep, NEUTRAL_BAR_EDGE.dark),
        );
        return shape(face, edge);
    }
    let card = card_look(appearance.body_color, palette);
    shape(
        light_dark(&mixed(&card.lit, &card.edge, BAR_SHADE), &card.lit),
        card.edge,
    )
}

/// A column's bars, reaching their corner radius past the call and the reply.
fn activation_boxes(column: &SequenceColumn) -> Vec<Rect> {
    column
        .activations
        .iter()
        .map(|bar| Rect {
            x: column.centre_x - ACTIVATION_HALF_WIDTH,
            y: bar.top - ACTIVATION_RADIUS,
            width: ACTIVATION_HALF_WIDTH * 2.0,
            height: bar.bottom - bar.top + ACTIVATION_RADIUS * 2.0,
        })
        .collect()
}

/// A participant's activation shadows, laid under every column and message.
fn paint_column_shadows(
    column: &SequenceColumn,
    palette: &Palette,
    standing: Option<Standing>,
) -> Items {
    lines(
        activation_boxes(column)
            .into_iter()
            .map(|bar| {
                shadow_under(
                    &column.card.node.id,
                    bar,
                    ACTIVATION_RADIUS,
                    Lift::Chip,
                    palette,
                    standing,
                    Some(ShadowOf::Activation),
                )
            })
            .collect(),
    )
}

/// One participant's column of time: the lifeline under its card, and its bars.
fn paint_column(
    column: &SequenceColumn,
    layout: &SequenceFlow,
    palette: &Palette,
    appearance: &NodeAppearance,
    standing: Option<Standing>,
) -> Items {
    let styles = Styles::of(palette);
    let lifeline = Shape::new(
        Purpose::Line,
        Geometry::Line {
            from: point(column.centre_x, column.lifeline_top),
            to: point(column.centre_x, layout.lifeline_bottom),
        },
    )
    .stroked(Stroke {
        dash_offset: Some(LIFELINE_DASH_OFFSET),
        ..Stroke::new(&palette.edge, 1.0).dashed(&LIFELINE_DASH)
    });
    let bars = activation_boxes(column);
    let look = bar_look(appearance, palette);
    let mut parts = vec![
        shape(lifeline.clone()),
        shape(Shape {
            purpose: Purpose::Halo,
            ..styles.halo(Shape {
                stroke: lifeline.stroke.map(|stroke| Stroke {
                    width: Some(LIT_LIFELINE_WIDTH),
                    ..stroke
                }),
                ..lifeline
            })
        }),
    ];
    parts.extend(
        bars.iter()
            .map(|bar| slab(*bar, &look, palette, None, None)),
    );
    parts.extend(bars.iter().map(|bar| {
        shape(styles.halo(Shape::rect(
            Purpose::Halo,
            boxed(*bar),
            Some(ACTIVATION_RADIUS),
        )))
    }));
    vec![crate::scene::Item::Group(Group {
        opacity: ghost_opacity(standing),
        ..Group::new(Role::Lifeline, lines(parts)).drawing(subject(
            SubjectKind::Node,
            &column.card.node.id,
            standing,
        ))
    })]
}

/// The frame's own face behind a flow's head of cards, shown while a viewer moves the head.
fn head_shade(layout: &SequenceFlow, standing: Option<Standing>, palette: &Palette) -> Items {
    let Some(first) = layout.columns.first() else {
        return Items::new();
    };
    let card = first.card.bounds;
    let floor = floor_of(layout.frame);
    let plate = Shape::rect(
        Purpose::Box,
        boxed(Rect {
            x: floor.x,
            y: card.y - HEAD_REACH,
            width: floor.width,
            height: card.height + HEAD_REACH + SHADOW_REACH,
        }),
        None,
    );
    let face = if standing == Some(Standing::Removed) {
        ghost_face(plate.clone(), palette)
    } else {
        plate.clone().filled(&palette.tray_floor)
    };
    grouped(Group::new(
        Role::HeadShade,
        lines(vec![
            shape(plate.filled(&palette.background)),
            grouped(
                Group::new(Role::Marks, shape(face)).standing_with(vec![layout.flow.id.clone()]),
            ),
        ]),
    ))
}

/// The appearance of a participant.
fn appearance_of<'a>(picture: &'a SequencePicture, id: &str) -> &'a NodeAppearance {
    picture
        .appearances
        .get(id)
        .unwrap_or_else(|| panic!("no appearance for {id}"))
}

/// The row of a flow's participant cards over its shade, the cards' shadows under them.
fn flow_head(
    ctx: &Ctx<'_>,
    picture: &SequencePicture,
    layout: &SequenceFlow,
    palette: &Palette,
    (standings, unsettled): (&Standings, &Unsettled),
) -> Items {
    let mut head = vec![head_shade(layout, standings.of(&layout.flow.id), palette)];
    head.extend(layout.columns.iter().map(|column| {
        let card = &column.card;
        shadow_under(
            &card.node.id,
            card.bounds,
            SLAB_RADIUS,
            Lift::Card,
            palette,
            standings.of(&card.node.id),
            None,
        )
    }));
    head.extend(layout.columns.iter().map(|column| {
        let id = &column.card.node.id;
        paint_card(
            ctx,
            &column.card,
            palette,
            standings.of(id),
            unsettled.of(id),
            appearance_of(picture, id),
        )
    }));
    grouped(Group::new(
        Role::FlowHead(layout.flow.id.clone()),
        lines(head),
    ))
}

/// One flow, painted: everything it draws, and the words that go above every flow's runs.
fn paint_flow(
    ctx: &Ctx<'_>,
    picture: &SequencePicture,
    layout: &SequenceFlow,
    palette: &Palette,
    standings: &Standings,
    unsettled: &Unsettled,
    crossing: &Crossing,
) -> (Items, Items) {
    let flow_standing = standings.of(&layout.flow.id);
    let mark_of = |id: &str| marked_within(flow_standing, standings.of(id));
    let mut body = vec![
        paint_frame(
            layout,
            palette,
            flow_standing,
            unsettled.of(&layout.flow.id),
        ),
        paint_row_marks(layout, palette, &mark_of),
    ];
    body.extend(
        layout.columns.iter().map(|column| {
            paint_column_shadows(column, palette, standings.of(&column.card.node.id))
        }),
    );
    body.extend(layout.steps.iter().map(|placed| {
        shadow_under(
            &placed.step.id,
            placed.label_box,
            PILL_RADIUS,
            Lift::Chip,
            palette,
            standings.of(&placed.step.id),
            Some(ShadowOf::Label),
        )
    }));
    body.extend(layout.columns.iter().map(|column| {
        let id = &column.card.node.id;
        paint_column(
            column,
            layout,
            palette,
            appearance_of(picture, id),
            standings.of(id),
        )
    }));
    body.push(flow_head(
        ctx,
        picture,
        layout,
        palette,
        (standings, unsettled),
    ));
    body.extend(layout.frames.iter().rev().map(|frame| {
        paint_fragment(
            frame,
            palette,
            mark_of(&frame.step.id),
            unsettled.of(&frame.step.id),
        )
    }));
    body.push(group(
        Role::Messages,
        None,
        lines(
            layout
                .steps
                .iter()
                .map(|placed| {
                    paint_step(
                        placed,
                        palette,
                        standings.of(&placed.step.id),
                        mark_of(&placed.step.id),
                        crossing,
                    )
                })
                .collect(),
        ),
    ));
    let words = lines(
        layout
            .steps
            .iter()
            .map(|placed| {
                let id = &placed.step.id;
                paint_step_words(
                    placed,
                    palette,
                    standings.of(id),
                    mark_of(id),
                    unsettled.of(id),
                )
            })
            .collect(),
    );
    (lines(body), words)
}

/// One variant's flows, painted as a stack of message sequences.
pub(super) fn paint_sequence(
    ctx: &Ctx<'_>,
    picture: &SequencePicture,
    palette: &Palette,
    standings: &Standings,
    unsettled: &Unsettled,
    page_standings: &Standings,
) -> PaintedPage {
    let laid: &SequenceDrawing = &picture.laid;
    let layout = picture.shown.as_ref().unwrap_or(laid);
    let lengths: Vec<f64> = laid
        .flows
        .iter()
        .flat_map(|flow| &flow.steps)
        .flat_map(|placed| {
            let length = step_ride(placed).map_or(0.0, |(_, length)| length);
            std::iter::repeat_n(length, placed.slot.count as usize)
        })
        .collect();
    let crossing = exchange_clock(&lengths, &picture.clock);
    let painted: Vec<(Items, Items)> = layout
        .flows
        .iter()
        .map(|flow| paint_flow(ctx, picture, flow, palette, standings, unsettled, &crossing))
        .collect();
    let mut columns: Vec<(&str, Rect)> = Vec::new();
    let mut steps: Vec<(&str, Rect)> = Vec::new();
    let mut frames: Vec<(&str, Rect)> = Vec::new();
    for flow in &layout.flows {
        for column in &flow.columns {
            let card = column.card.bounds;
            columns.push((
                column.card.node.id.as_str(),
                Rect {
                    x: card.x,
                    y: card.y,
                    width: card.width,
                    height: flow.lifeline_bottom - card.y,
                },
            ));
        }
        for placed in &flow.steps {
            steps.push((placed.step.id.as_str(), placed.bounds));
        }
        for frame in &flow.frames {
            steps.push((frame.step.id.as_str(), frame.bounds));
        }
        frames.push((flow.flow.id.as_str(), flow.frame));
    }
    let marked: Vec<Rect> = laid
        .flows
        .iter()
        .map(|flow| {
            marked_box(
                flow.frame,
                page_standings.of(&flow.flow.id),
                unsettled.of(&flow.flow.id),
            )
        })
        .collect();
    let canvas = canvas_for(laid.width, laid.height, union(marked), DIAGRAM_MARGIN);
    let mut parts: Vec<Items> = Vec::new();
    let mut words: Vec<Items> = Vec::new();
    for (body, said) in painted {
        parts.push(body);
        words.push(said);
    }
    parts.extend(words);
    PaintedPage {
        width: canvas.width,
        height: canvas.height,
        body: shifted(&canvas, lines(parts)),
        atlas: Atlas {
            nodes: atlas_boxes(&columns, &canvas),
            edges: atlas_boxes(&steps, &canvas),
            regions: atlas_boxes(&frames, &canvas),
        },
    }
}
