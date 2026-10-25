//! A message sequence painted: the frame, then the marks on the rows a
//! comparison says moved, then activation and label shadows, then columns and
//! their head cards, then the messages crossing them, and last the words of
//! every message. The layer order is load-bearing. Pulses share one clock.

use crate::attrs;
use crate::drawing::Emphasis;
use crate::geometry::{Curve, Point, Rect, Segment, canvas_for, coord, curve_through, union};
use crate::js;
use crate::markup::{Attrs, Markup, concat, group, lines, tag, text_node};
use crate::paint::Ctx;
use crate::paint::appearance::{card_look, label_look, semantic_ink, tray_look};
use crate::paint::cards::{halo, header_anchor, paint_card, paint_header};
use crate::paint::colour::{Share, light_dark, mixed, tinted};
use crate::paint::design::{
    ACTIVATION_HALF_WIDTH, BAND_RADIUS, CARD_THICKNESS, DIAGRAM_MARGIN, FRAME_GUARD_HEIGHT,
    FRAME_HEAD_HEIGHT, FRAME_PAD, FRAME_TAB_PADDING, MESSAGE_LINE_STEP, PILL_HEIGHT, PILL_RADIUS,
    PILL_TEXT_SIZE, SELF_LOOP_CORNER, SELF_LOOP_DROP, SELF_LOOP_REACH, SLAB_RADIUS,
    STEP_NOTE_PADDING_X, STEP_NOTE_PADDING_Y,
};
use crate::paint::far_card::{Words, paint_heading_views};
use crate::paint::fonts::{PILL_FONT, font_attributes};
use crate::paint::page::{PaintedPage, atlas_boxes, shifted};
use crate::paint::palette::Palette;
use crate::paint::relay::PULSE_PACE;
use crate::paint::shadow::SHADOW_REACH;
use crate::paint::slab::{
    Lift, SlabLook, boxed, ghost_face, shadow_under, slab, slab_seat, slab_shadow,
};
use crate::paint::standing::{
    HEAD_ATTRIBUTE, MEMBERS_ATTRIBUTE, PART_ATTRIBUTE, PIN_INSET, Standings, Unsettled,
    ghost_opacity, ink_of, marked_box, standing_palette, standing_pin, standing_pin_at, subject,
    warning_badge, warning_on_line,
};
use crate::paint::styles::{
    Head, LIT_HEAD, Styles, full_line_colour, head_base, head_reach, line_colour, marker_for,
    stroke_width,
};
use crate::paint::traffic::pulse_look;
use crate::paint::tray::{floor_of, tray};
use crate::request::{
    MessageKind, NodeAppearance, SequenceClock, SequenceColumn, SequenceDrawing, SequenceFlow,
    SequenceFrame, SequencePicture, SequenceStep, Standing,
};
use crate::scene::{Atlas, Item, Motion, Role, SubjectKind, TrafficMark};

const STEP_WEIGHT: Emphasis = Emphasis::Normal;
const STEP_HALO_EXTRA: f64 = 5.0;
const STEP_HALO_OPACITY: f64 = 0.3;
const LIT_TRACE_EXTRA: f64 = 0.5;
const ACTIVATION_RADIUS: f64 = 3.0;
const BAR_THICKNESS: f64 = 2.5;
const LIFELINE_DASH: &str = "3 5";
const LIFELINE_DASH_OFFSET: f64 = SHADOW_REACH + 1.0 - 6.0;
const HEAD_REACH: f64 = 64.0;
const HEAD_SHADE_CLASS: &str = "ab-head-shade";
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
const FRAGMENT_RADIUS: f64 = 3.0;
const TAB_CUT: f64 = 5.0;
const DIVIDER_DASH: &str = "4 3";
const MARK_SPACING: f64 = 24.0;
const ROW_TINT: f64 = 0.08;
const LIT_RULE_WIDTH: f64 = 1.25;
/// Where the baseline of a line of pill words stands in its row, as a share of the row.
const PILL_BASELINE: f64 = 0.68;
/// The longest a pulse is: the room a clock leaves after its last pulse has left.
const PULSE_LENGTH: f64 = 3.0 + 12.0 + 56.0 + 2.0;
/// The air between the base of an arrowhead and the pulse that sinks into it.
const AIR: f64 = 1.0;

/// The arrowhead a message of each kind ends in.
///
/// A deliberate deviation from strict UML 2, which draws replies with an open
/// head as well: here the open head is the one mark of "nobody is waiting on
/// this". The dash already says "this is an answer", so an open-headed reply
/// would put the asynchronous signature on every reply.
fn step_head(kind: MessageKind) -> Head {
    match kind {
        MessageKind::Async => Head::Open,
        MessageKind::Sync | MessageKind::Return | MessageKind::Myself => Head::Filled,
    }
}

/// How far short of the bar or lifeline it arrives at a message's line stops:
/// exactly the reach of its head, so the tip touches what it points at. Every
/// message is drawn at one weight: a flow's steps carry no emphasis.
pub fn arrow_standoff(kind: MessageKind) -> f64 {
    head_reach(step_head(kind))
}

/// What sort of message each kind is, said in dashes: only the reply is dashed.
fn step_dash(kind: MessageKind) -> Option<&'static str> {
    (kind == MessageKind::Return).then_some("5 4")
}

/// How one message's line is stroked.
fn step_attributes(kind: MessageKind, palette: &Palette, standing: Option<Standing>) -> Attrs {
    attrs! {
        "fill": "none",
        "stroke": line_colour(palette, standing),
        "stroke-width": stroke_width(STEP_WEIGHT),
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-dasharray": step_dash(kind),
    }
}

/// The path a self-message takes: out to the right, down, and back.
fn self_path(placed: &SequenceStep) -> String {
    let corner = js::number(SELF_LOOP_CORNER);
    format!(
        "M{},{} h{} a{corner},{corner} 0 0 1 {corner},{corner} v{} a{corner},{corner} 0 0 1 -{corner},{corner} h-{}",
        coord(placed.start),
        coord(placed.y),
        coord(SELF_LOOP_REACH),
        coord(SELF_LOOP_DROP),
        coord(SELF_LOOP_REACH - arrow_standoff(MessageKind::Myself)),
    )
}

/// The path one message's line takes.
fn step_path(placed: &SequenceStep) -> String {
    if placed.travel == 0 {
        return self_path(placed);
    }
    format!(
        "M{},{} L{},{}",
        coord(placed.start),
        coord(placed.y),
        coord(placed.end),
        coord(placed.y)
    )
}

/// The part of one message's line its pulses ride, and how long it is.
fn step_ride(placed: &SequenceStep) -> Option<(Curve, f64)> {
    let kind = placed.step.kind;
    let cut = head_base(step_head(kind)) + AIR;
    if placed.travel == 0 {
        if SELF_LOOP_REACH - arrow_standoff(kind) - cut <= 0.0 {
            return None;
        }
        let x = placed.start;
        let right = x + SELF_LOOP_REACH + SELF_LOOP_CORNER;
        let low = placed.y + SELF_LOOP_DROP + 2.0 * SELF_LOOP_CORNER;
        let curve = curve_through(
            &[
                Point { x, y: placed.y },
                Point {
                    x: right,
                    y: placed.y,
                },
                Point { x: right, y: low },
                Point {
                    x: x + arrow_standoff(kind) + cut,
                    y: low,
                },
            ],
            false,
        );
        let length = crate::route::route_length(&curve);
        return Some((curve, length));
    }
    let direction = f64::from(placed.travel);
    let length = (placed.end - placed.start) * direction - cut;
    if length <= 0.0 {
        return None;
    }
    Some((
        Curve {
            from: Point {
                x: placed.start,
                y: placed.y,
            },
            segments: vec![Segment::Line {
                to: Point {
                    x: placed.start + direction * length,
                    y: placed.y,
                },
            }],
        },
        length,
    ))
}

/// The drawing's shared clock.
struct Crossing {
    cycle: f64,
    speed: f64,
    starts: Vec<f64>,
}

/// The clock for a drawing whose turns cross lines of some lengths, in order.
fn exchange_clock(lengths: &[f64], clock: &SequenceClock) -> Crossing {
    let distance = lengths.iter().fold(0.0, |sum, length| sum + length) + PULSE_LENGTH;
    let speed = js::js_max(
        clock.traffic_speed * PULSE_PACE,
        distance / (clock.cycle_cap_ms / 1000.0),
    );
    let mut along = 0.0;
    let starts = lengths
        .iter()
        .map(|length| {
            let start = along / speed;
            along += length;
            start
        })
        .collect();
    Crossing {
        cycle: distance / speed,
        speed,
        starts,
    }
}

/// The pulses one message sends, each waiting its own turn on the shared clock.
fn timed_crossings(
    placed: &SequenceStep,
    ride: &Curve,
    palette: &Palette,
    crossing: &Crossing,
    mark: Option<Standing>,
) -> Markup {
    let look = pulse_look(
        full_line_colour(palette, mark),
        stroke_width(STEP_WEIGHT),
        palette,
    );
    lines(
        (0..placed.slot.count)
            .map(|index| {
                let start = crossing
                    .starts
                    .get((placed.slot.start + index) as usize)
                    .copied()
                    .unwrap_or(0.0);
                vec![Item::Traffic(TrafficMark {
                    look: look.clone(),
                    route: ride.clone(),
                    motion: Motion::Turn {
                        speed: crossing.speed,
                        cycle: crossing.cycle,
                        start,
                    },
                })]
            })
            .collect(),
    )
}

/// How a message of a flow is marked: by its own standing, unless its whole flow was added or removed.
fn marked_within(flow: Option<Standing>, own: Option<Standing>) -> Option<Standing> {
    if own.is_some() && matches!(flow, Some(Standing::Added | Standing::Removed)) {
        Some(Standing::Unchanged)
    } else {
        own
    }
}

/// A standing's tint over a box.
fn row_tint(rect: Rect, standing: Option<Standing>, palette: &Palette) -> Markup {
    let Some(ink) = ink_of(standing, palette) else {
        return Markup::new();
    };
    tag(
        "rect",
        boxed(rect).set("fill", ink).set("fill-opacity", ROW_TINT),
    )
}

/// The marks of every message of one flow that moved: its band and its pin.
fn paint_row_marks(
    layout: &SequenceFlow,
    palette: &Palette,
    mark_of: &dyn Fn(&str) -> Option<Standing>,
) -> Markup {
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
                    return Markup::new();
                }
                group(
                    Role::RowMark,
                    None,
                    attrs! { MEMBERS_ATTRIBUTE: placed.step.id.as_str(), "pointer-events": "none" },
                    lines(vec![
                        tint,
                        standing_pin_at(frame.x + PIN_INSET, middle, standing, palette),
                    ]),
                )
            })
            .collect(),
    )
}

/// A participant's activation bar: a slim slab of the participant itself.
fn bar_look(appearance: &NodeAppearance, palette: &Palette) -> SlabLook {
    let shape = |face: String, edge: String| SlabLook {
        face,
        ground: None,
        lit: None,
        edge,
        thickness: BAR_THICKNESS,
        radius: ACTIVATION_RADIUS,
        sheen: false,
    };
    if semantic_ink(appearance.body_color).is_none() {
        let face = tinted(palette.slab_face, Some(palette.muted), NEUTRAL_BAR);
        let edge = light_dark(
            &mixed(&face, palette.foreground, NEUTRAL_BAR_EDGE.light),
            &mixed(&face, palette.slab_deep, NEUTRAL_BAR_EDGE.dark),
        );
        return shape(face, edge);
    }
    let card = card_look(appearance.body_color, palette);
    shape(
        light_dark(&mixed(&card.face, &card.edge, BAR_SHADE), &card.face),
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
) -> Markup {
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
                    Some("activation"),
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
) -> Markup {
    let styles = Styles::of(palette);
    let lifeline = attrs! {
        "x1": coord(column.centre_x),
        "y1": coord(column.lifeline_top),
        "x2": coord(column.centre_x),
        "y2": coord(layout.lifeline_bottom),
        "stroke": palette.edge,
        "stroke-width": 1.0,
        "stroke-dasharray": LIFELINE_DASH,
        "stroke-dashoffset": LIFELINE_DASH_OFFSET,
    };
    let bars = activation_boxes(column);
    let look = bar_look(appearance, palette);
    let mut parts = vec![
        tag("line", lifeline.clone()),
        tag(
            "line",
            attrs! { "class": "ab-halo" }
                .with(lifeline)
                .with(styles.halo())
                .set("stroke-width", LIT_LIFELINE_WIDTH),
        ),
    ];
    parts.extend(
        bars.iter()
            .map(|bar| slab(*bar, &look, palette, None, None)),
    );
    parts.extend(bars.iter().map(|bar| {
        tag(
            "rect",
            attrs! { "class": "ab-halo" }
                .with(boxed(*bar))
                .set("rx", ACTIVATION_RADIUS)
                .with(styles.halo()),
        )
    }));
    group(
        Role::Lifeline,
        subject(SubjectKind::Node, &column.card.node.id, standing),
        attrs! { "opacity": ghost_opacity(standing), PART_ATTRIBUTE: "lifeline" },
        lines(parts),
    )
}

/// The frame around one flow, with the flow's name and summary on it.
fn paint_frame(
    ctx: &Ctx,
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
        subject(SubjectKind::Flow, &flow.id, standing),
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

/// The frame's own face behind a flow's head of cards, shown while a viewer moves the head.
fn head_shade(layout: &SequenceFlow, standing: Option<Standing>, palette: &Palette) -> Markup {
    let Some(first) = layout.columns.first() else {
        return Markup::new();
    };
    let card = first.card.bounds;
    let floor = floor_of(layout.frame);
    let shape = boxed(Rect {
        x: floor.x,
        y: card.y - HEAD_REACH,
        width: floor.width,
        height: card.height + HEAD_REACH + SHADOW_REACH,
    });
    let face = if standing == Some(Standing::Removed) {
        ghost_face(palette)
    } else {
        attrs! { "fill": palette.tray_floor }
    };
    group(
        Role::HeadShade,
        None,
        attrs! { "class": HEAD_SHADE_CLASS, "visibility": "hidden" },
        lines(vec![
            tag("rect", shape.clone().set("fill", palette.background)),
            group(
                Role::Marks,
                None,
                attrs! { MEMBERS_ATTRIBUTE: layout.flow.id.as_str() },
                tag("rect", shape.with(face)),
            ),
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
fn paint_fragment(
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
        subject(SubjectKind::Step, &frame.step.id, standing),
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

/// A rounded plate's geometry.
fn rect_of(rect: Rect) -> Attrs {
    boxed(rect).set("rx", PILL_RADIUS)
}

/// One message's label, a line at a time, each centred, on a chip.
fn paint_label(
    placed: &SequenceStep,
    rect: Rect,
    palette: &Palette,
    standing: Option<Standing>,
    mark: Option<Standing>,
) -> Markup {
    let words = standing_palette(palette, standing);
    let styles = Styles::of(&words);
    let plate = if standing == Some(Standing::Removed) {
        concat(vec![
            tag("rect", rect_of(rect).set("fill", palette.tray_floor)),
            tag("rect", rect_of(rect).with(ghost_face(palette))),
            row_tint(rect, mark, palette),
        ])
    } else {
        concat(vec![
            slab_seat(rect, PILL_RADIUS),
            slab(rect, &label_look(palette), palette, None, None),
        ])
    };
    let rule = tag(
        "rect",
        attrs! { "class": "ab-halo" }
            .with(rect_of(rect))
            .set("stroke-width", LIT_RULE_WIDTH)
            .with(styles.halo()),
    );
    let lines_of_words = placed.words.lines.iter().enumerate().map(|(index, line)| {
        text_node(
            attrs! {
                "x": coord(rect.x + rect.width / 2.0),
                "y": coord(rect.y + PILL_HEIGHT * PILL_BASELINE + index as f64 * MESSAGE_LINE_STEP),
                "text-anchor": "middle",
            }
            .with(styles.pill_text()),
            &line.text,
        )
    });
    let mut parts = vec![plate, rule];
    parts.extend(lines_of_words);
    concat(parts)
}

/// A step's note under its message, on a plate of the frame's own face.
fn paint_note(placed: &SequenceStep, palette: &Palette, mark: Option<Standing>) -> Markup {
    let Some(note) = &placed.note else {
        return Markup::new();
    };
    let styles = Styles::of(palette);
    let mut parts = vec![concat(vec![
        tag("rect", rect_of(note.bounds).set("fill", palette.tray_floor)),
        row_tint(note.bounds, mark, palette),
    ])];
    parts.extend(note.lines.iter().map(|run| {
        text_node(
            attrs! {
                "xml:space": "preserve",
                "x": coord(note.bounds.x + STEP_NOTE_PADDING_X + run.x),
                "y": coord(note.bounds.y + STEP_NOTE_PADDING_Y + run.y),
            }
            .with(styles.note()),
            &run.text,
        )
    }));
    lines(parts)
}

/// What one message says, on the layer above every run.
fn paint_step_words(
    placed: &SequenceStep,
    palette: &Palette,
    standing: Option<Standing>,
    mark: Option<Standing>,
    unsettled: bool,
) -> Markup {
    let plate = placed.label_box;
    group(
        Role::Label,
        subject(SubjectKind::Step, &placed.step.id, standing),
        attrs! { PART_ATTRIBUTE: "label" },
        lines(vec![
            paint_label(placed, plate, palette, standing, mark),
            paint_note(placed, palette, mark),
            warning_on_line(
                Some(Point {
                    x: plate.x,
                    y: plate.y + plate.height / 2.0,
                }),
                unsettled,
                palette,
            ),
        ]),
    )
}

/// One message: a glow a viewer can light up, the line itself, and its pulses.
fn paint_step(
    placed: &SequenceStep,
    palette: &Palette,
    standing: Option<Standing>,
    mark: Option<Standing>,
    crossing: &Crossing,
) -> Markup {
    let styles = Styles::of(palette);
    let path = step_path(placed);
    let ride = step_ride(placed);
    let kind = placed.step.kind;
    let head = step_head(kind);
    group(
        Role::Line,
        subject(SubjectKind::Step, &placed.step.id, standing),
        attrs! { "opacity": ghost_opacity(standing) },
        lines(vec![
            tag(
                "path",
                attrs! {
                    "class": "ab-halo",
                    "d": path.as_str(),
                    "stroke-width": stroke_width(STEP_WEIGHT) + STEP_HALO_EXTRA,
                    "stroke-opacity": STEP_HALO_OPACITY,
                    "stroke-linecap": "round",
                    "stroke-linejoin": "round",
                }
                .with(styles.halo()),
            ),
            tag(
                "path",
                attrs! { "d": path.as_str(), "marker-end": marker_for(STEP_WEIGHT, head, mark) }
                    .with(step_attributes(kind, palette, mark)),
            ),
            tag(
                "path",
                attrs! {
                    "class": "ab-halo",
                    "d": path.as_str(),
                    "marker-end": format!("url(#ah-{}-{}{LIT_HEAD})", head.as_str(), STEP_WEIGHT.as_str()),
                }
                .with(step_attributes(kind, palette, None))
                .with(styles.halo())
                .set("stroke-width", stroke_width(STEP_WEIGHT) + LIT_TRACE_EXTRA),
            ),
            match (&ride, standing) {
                (Some((curve, _)), standing) if standing != Some(Standing::Removed) => {
                    timed_crossings(placed, curve, palette, crossing, mark)
                }
                _ => Markup::new(),
            },
        ]),
    )
}

/// The appearance of a participant.
fn appearance_of<'a>(picture: &'a SequencePicture, id: &str) -> &'a NodeAppearance {
    picture
        .appearances
        .get(id)
        .unwrap_or_else(|| panic!("no appearance for {id}"))
}

/// One flow, painted: everything it draws, and the words that go above every flow's runs.
fn paint_flow(
    ctx: &Ctx,
    picture: &SequencePicture,
    layout: &SequenceFlow,
    palette: &Palette,
    standings: &Standings,
    unsettled: &Unsettled,
    crossing: &Crossing,
) -> (Markup, Markup) {
    let flow_standing = standings.of(&layout.flow.id);
    let mark_of = |id: &str| marked_within(flow_standing, standings.of(id));
    let mut body = vec![
        paint_frame(
            ctx,
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
            Some("label"),
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
    let mut head = vec![head_shade(layout, flow_standing, palette)];
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
    body.push(group(
        Role::FlowHead,
        None,
        attrs! { HEAD_ATTRIBUTE: layout.flow.id.as_str() },
        lines(head),
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
        attrs! {},
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
pub fn paint_sequence(
    ctx: &Ctx,
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
    let painted: Vec<(Markup, Markup)> = layout
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
    let mut parts: Vec<Markup> = Vec::new();
    let mut words: Vec<Markup> = Vec::new();
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
