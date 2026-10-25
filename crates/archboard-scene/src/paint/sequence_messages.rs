//! The messages of a sequence painted: each message's line with its head and
//! the pulses that ride it on the exchange's shared clock, and each message's
//! words, label chip and note, with the tint a comparison lays over its row.

use crate::drawing::Emphasis;
use crate::geometry::{Curve, Point, Rect, Segment, curve_through, round_coord};
use crate::js;
use crate::paint::appearance::label_look;
use crate::paint::build::{Items, concat, group, grouped, lines, point, shape, text};
use crate::paint::design::{
    MESSAGE_LINE_STEP, PILL_HEIGHT, PILL_RADIUS, SELF_LOOP_CORNER, SELF_LOOP_DROP, SELF_LOOP_REACH,
    STEP_NOTE_PADDING_X, STEP_NOTE_PADDING_Y,
};
use crate::paint::palette::Palette;
use crate::paint::relay::PULSE_PACE;
use crate::paint::slab::{boxed, ghost_face, slab, slab_seat};
use crate::paint::standing::{ghost_opacity, ink_of, standing_palette, subject, warning_on_line};
use crate::paint::styles::{
    Styles, full_line_colour, head_base, head_reach, line_colour, marker_for, stroke_width,
};
use crate::paint::traffic::pulse_look;
use crate::request::{MessageKind, SequenceClock, SequenceStep, Standing};
use crate::scene::traffic::PULSE_LENGTH;
use crate::scene::{
    Group, Head, HeadInk, Item, MarkerId, Motion, PathStep, Purpose, Role, Shape, Stroke,
    SubjectKind, TrafficMark,
};

const STEP_WEIGHT: Emphasis = Emphasis::Normal;
const STEP_HALO_EXTRA: f64 = 5.0;
const STEP_HALO_OPACITY: f64 = 0.3;
const LIT_TRACE_EXTRA: f64 = 0.5;
const ROW_TINT: f64 = 0.08;
const LIT_RULE_WIDTH: f64 = 1.25;
/// Where the baseline of a line of pill words stands in its row, as a share of the row.
pub(super) const PILL_BASELINE: f64 = 0.68;
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
fn step_dash(kind: MessageKind) -> &'static [f64] {
    if kind == MessageKind::Return {
        &[5.0, 4.0]
    } else {
        &[]
    }
}

/// How one message's line is stroked.
fn step_stroke(kind: MessageKind, palette: &Palette, standing: Option<Standing>) -> Stroke {
    Stroke::new(line_colour(palette, standing), stroke_width(STEP_WEIGHT))
        .rounded()
        .dashed(step_dash(kind))
}

/// The path a self-message takes: out to the right, down, and back.
fn self_path(placed: &SequenceStep) -> Vec<PathStep> {
    let corner = Point {
        x: SELF_LOOP_CORNER,
        y: SELF_LOOP_CORNER,
    };
    vec![
        PathStep::Move {
            to: point(placed.start, placed.y),
        },
        PathStep::AcrossBy {
            dx: round_coord(SELF_LOOP_REACH),
        },
        PathStep::ArcBy {
            radius: corner,
            clockwise: true,
            by: corner,
        },
        PathStep::DownBy {
            dy: round_coord(SELF_LOOP_DROP),
        },
        PathStep::ArcBy {
            radius: corner,
            clockwise: true,
            by: Point {
                x: -SELF_LOOP_CORNER,
                y: SELF_LOOP_CORNER,
            },
        },
        PathStep::AcrossBy {
            dx: -round_coord(SELF_LOOP_REACH - arrow_standoff(MessageKind::Myself)),
        },
    ]
}

/// The path one message's line takes.
fn step_path(placed: &SequenceStep) -> Vec<PathStep> {
    if placed.travel == 0 {
        return self_path(placed);
    }
    vec![
        PathStep::Move {
            to: point(placed.start, placed.y),
        },
        PathStep::Line {
            to: point(placed.end, placed.y),
        },
    ]
}

/// The part of one message's line its pulses ride, and how long it is.
pub(super) fn step_ride(placed: &SequenceStep) -> Option<(Curve, f64)> {
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
pub(super) struct Crossing {
    cycle: f64,
    speed: f64,
    starts: Vec<f64>,
}

/// The clock for a drawing whose turns cross lines of some lengths, in order.
pub(super) fn exchange_clock(lengths: &[f64], clock: &SequenceClock) -> Crossing {
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
) -> Items {
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

/// A standing's tint over a box.
pub(super) fn row_tint(rect: Rect, standing: Option<Standing>, palette: &Palette) -> Items {
    let Some(ink) = ink_of(standing, palette) else {
        return Items::new();
    };
    shape(Shape {
        fill_opacity: Some(ROW_TINT),
        ..Shape::rect(Purpose::Box, boxed(rect), None).filled(ink)
    })
}

/// A rounded plate.
fn plate_of(rect: Rect) -> Shape {
    Shape::rect(Purpose::Box, boxed(rect), Some(PILL_RADIUS))
}

/// One message's label, a line at a time, each centred, on a chip.
fn paint_label(
    placed: &SequenceStep,
    rect: Rect,
    palette: &Palette,
    standing: Option<Standing>,
    mark: Option<Standing>,
) -> Items {
    let words = standing_palette(palette, standing);
    let styles = Styles::of(&words);
    let plate = if standing == Some(Standing::Removed) {
        concat(vec![
            shape(plate_of(rect).filled(&palette.tray_floor)),
            shape(ghost_face(plate_of(rect), palette)),
            row_tint(rect, mark, palette),
        ])
    } else {
        concat(vec![
            slab_seat(rect, PILL_RADIUS),
            slab(rect, &label_look(palette), palette, None, None),
        ])
    };
    let rule = shape(Shape {
        purpose: Purpose::Halo,
        ..plate_of(rect)
            .unfilled()
            .stroked(styles.ring(Some(LIT_RULE_WIDTH)))
    });
    let lines_of_words = placed.words.lines.iter().enumerate().map(|(index, line)| {
        text(
            styles
                .pill_text()
                .set(
                    point(
                        rect.x + rect.width / 2.0,
                        rect.y + PILL_HEIGHT * PILL_BASELINE + index as f64 * MESSAGE_LINE_STEP,
                    ),
                    &line.text,
                )
                .centred(),
        )
    });
    let mut parts = vec![plate, rule];
    parts.extend(lines_of_words);
    concat(parts)
}

/// A step's note under its message, on a plate of the frame's own face.
fn paint_note(placed: &SequenceStep, palette: &Palette, mark: Option<Standing>) -> Items {
    let Some(note) = &placed.note else {
        return Items::new();
    };
    let styles = Styles::of(palette);
    let mut parts = vec![concat(vec![
        shape(plate_of(note.bounds).filled(&palette.tray_floor)),
        row_tint(note.bounds, mark, palette),
    ])];
    parts.extend(note.lines.iter().map(|run| {
        text(styles.note().set(
            point(
                note.bounds.x + STEP_NOTE_PADDING_X + run.x,
                note.bounds.y + STEP_NOTE_PADDING_Y + run.y,
            ),
            &run.text,
        ))
    }));
    lines(parts)
}

/// What one message says, on the layer above every run.
pub(super) fn paint_step_words(
    placed: &SequenceStep,
    palette: &Palette,
    standing: Option<Standing>,
    mark: Option<Standing>,
    unsettled: bool,
) -> Items {
    let plate = placed.label_box;
    group(
        Role::Label,
        Some(subject(SubjectKind::Step, &placed.step.id, standing)),
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
pub(super) fn paint_step(
    placed: &SequenceStep,
    palette: &Palette,
    standing: Option<Standing>,
    mark: Option<Standing>,
    crossing: &Crossing,
) -> Items {
    let styles = Styles::of(palette);
    let path = step_path(placed);
    let ride = step_ride(placed);
    let kind = placed.step.kind;
    let head = step_head(kind);
    let width = stroke_width(STEP_WEIGHT);
    let line = Shape {
        marker: Some(marker_for(STEP_WEIGHT, head, mark)),
        ..Shape::path(Purpose::Line, path.clone())
            .unfilled()
            .stroked(step_stroke(kind, palette, mark))
    };
    let lit = Shape {
        marker: Some(MarkerId::Shared {
            head,
            weight: STEP_WEIGHT,
            ink: HeadInk::Lit,
        }),
        ..styles.halo(Shape::path(Purpose::LitLine, path.clone()).stroked(Stroke {
            width: Some(width + LIT_TRACE_EXTRA),
            ..step_stroke(kind, palette, None)
        }))
    };
    grouped(Group {
        opacity: ghost_opacity(standing),
        ..Group::new(
            Role::Line(None),
            lines(vec![
                shape(
                    Shape::path(Purpose::Halo, path).unfilled().stroked(
                        styles
                            .ring(Some(width + STEP_HALO_EXTRA))
                            .at(STEP_HALO_OPACITY)
                            .rounded(),
                    ),
                ),
                shape(line),
                shape(lit),
                match (&ride, standing) {
                    (Some((curve, _)), standing) if standing != Some(Standing::Removed) => {
                        timed_crossings(placed, curve, palette, crossing, mark)
                    }
                    _ => Items::new(),
                },
            ]),
        )
        .drawing(subject(SubjectKind::Step, &placed.step.id, standing))
    })
}
