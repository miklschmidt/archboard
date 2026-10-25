//! Ports: where a line meets the foot of a card, it goes into a slot cut
//! through the card's front edge (TASK-424). The card's body is clipped round
//! the hole, the line's own group draws the inside of the port under the card,
//! and a pulse rides on into the hole.

use std::collections::HashMap;

use crate::drawing::{Edge, Node};
use crate::geometry::{Curve, Point, Rect, Segment, round_coord};
use crate::js;
use crate::paint::build::{Items, grouped, lines, point, shape};
use crate::paint::design::{CARD_THICKNESS, SLAB_RADIUS};
use crate::paint::palette::Palette;
use crate::paint::styles::stroke_width;
use crate::scene::{
    Cap, Clip, ClipId, Definition, Geometry, Gradient, GradientForm, GradientId, Group, PathStep,
    Pointer, Purpose, Role, Shape, Stop, Stroke,
};

const SOCKET: f64 = 2.1;
const LID: f64 = 0.6;
const SILL: f64 = 0.7;
const WEB: f64 = 1.5;
const FLOOR: f64 = 0.5;
const CORNER_ROOM: f64 = SLAB_RADIUS - 2.75;
const RIDE_IN: f64 = CARD_THICKNESS - LID + 1.0;

/// One slot, cut through a card's front edge where a line meets its foot.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Port {
    pub x: f64,
    pub foot: f64,
    pub half: f64,
    pub line: f64,
}

/// The ports of a drawing: each card's slots, and each line's, as indices into `all`.
#[derive(Default)]
pub(super) struct Ports {
    pub all: Vec<Port>,
    /// Each card's slots, in the order the cards are drawn.
    pub by_card: Vec<(String, Vec<usize>)>,
    pub by_edge: HashMap<String, Vec<usize>>,
    /// The box of every card drawn whole, in the order the cards are drawn.
    pub boxes: Vec<(String, Rect)>,
}

impl Ports {
    /// The slots a line runs into.
    pub(super) fn of_edge(&self, id: &str) -> Vec<Port> {
        self.by_edge
            .get(id)
            .map(|slots| slots.iter().map(|at| self.all[*at]).collect())
            .unwrap_or_default()
    }

    /// The box of a card drawn whole.
    pub(super) fn box_of(&self, id: &str) -> Option<Rect> {
        self.boxes
            .iter()
            .find(|(card, _)| card == id)
            .map(|(_, rect)| *rect)
    }
}

/// Where one line meets the foot of one card.
struct Meeting {
    card: String,
    edge: String,
    x: f64,
    line: f64,
}

/// Where a line's ends meet the foot of a card's box, between its sides.
fn meetings_of(routed: &Edge, boxes: &[(String, Rect)]) -> Vec<Meeting> {
    let edge = &routed.edge;
    let end = routed.curve.end();
    [(&edge.from, routed.curve.from), (&edge.to, end)]
        .into_iter()
        .filter_map(|(card, point)| {
            let rect = boxes.iter().find(|(id, _)| id == card)?.1;
            let foot = rect.y + rect.height;
            let inside = point.x > rect.x && point.x < rect.x + rect.width;
            ((point.y - foot).abs() < 0.5 && inside).then(|| Meeting {
                card: card.clone(),
                edge: edge.id.clone(),
                x: point.x,
                line: stroke_width(edge.emphasis),
            })
        })
        .collect()
}

/// Half the width of a port at `x`: its socket's, narrowed to keep clear of
/// the card's corners and of the ports beside it; none when that leaves too
/// little room round the line.
fn half_at(rect: Rect, x: f64, line: f64, neighbours: &[f64]) -> Option<f64> {
    let apart = neighbours
        .iter()
        .map(|other| ((other - x).abs() - WEB) / 2.0);
    let half = js::min(
        [
            line / 2.0 + SOCKET,
            x - rect.x - CORNER_ROOM,
            rect.x + rect.width - CORNER_ROOM - x,
        ]
        .into_iter()
        .chain(apart),
    );
    (half >= line / 2.0 + 0.5).then_some(half)
}

/// The box of every card drawn whole, each card once at its last box, in the
/// order the cards first come.
fn whole_boxes(cards: &[Node], drawn_whole: &dyn Fn(&str) -> bool) -> Vec<(String, Rect)> {
    let mut boxes: Vec<(String, Rect)> = Vec::new();
    for card in cards
        .iter()
        .filter(|card| drawn_whole(&card.measured.node.id))
    {
        let id = &card.measured.node.id;
        match boxes.iter_mut().find(|(held, _)| held == id) {
            Some(entry) => entry.1 = card.bounds,
            None => boxes.push((id.clone(), card.bounds)),
        }
    }
    boxes
}

impl Ports {
    /// The ports of one card: one at each place a line meets its foot, where
    /// the room beside its neighbours leaves a port wide enough.
    fn add_card(&mut self, card: &str, rect: Rect, here: &[&Meeting]) {
        let mut places: Vec<f64> = Vec::new();
        for meeting in here {
            if !places.contains(&meeting.x) {
                places.push(meeting.x);
            }
        }
        for &x in &places {
            let at: Vec<&Meeting> = here.iter().copied().filter(|one| one.x == x).collect();
            let line = js::max(at.iter().map(|one| one.line));
            let others: Vec<f64> = places.iter().copied().filter(|other| *other != x).collect();
            if let Some(half) = half_at(rect, x, line, &others) {
                let port = Port {
                    x,
                    foot: rect.y + rect.height,
                    half,
                    line,
                };
                self.add_port(card, port, &at);
            }
        }
    }

    /// One port of a card, in the slots of the card and of each line that meets it there.
    fn add_port(&mut self, card: &str, port: Port, at: &[&Meeting]) {
        let index = self.all.len();
        self.all.push(port);
        match self.by_card.iter_mut().find(|(held, _)| held == card) {
            Some(entry) => entry.1.push(index),
            None => self.by_card.push((card.to_owned(), vec![index])),
        }
        for one in at {
            self.by_edge
                .entry(one.edge.clone())
                .or_default()
                .push(index);
        }
    }
}

/// Every port of a drawing: where a line drawn whole meets the foot of a card drawn whole.
pub(super) fn ports_of(
    cards: &[Node],
    edges: &[Edge],
    drawn_whole: &dyn Fn(&str) -> bool,
) -> Ports {
    let boxes = whole_boxes(cards, drawn_whole);
    let meetings: Vec<Meeting> = edges
        .iter()
        .filter(|routed| drawn_whole(&routed.edge.id))
        .flat_map(|routed| meetings_of(routed, &boxes))
        .collect();
    let mut ports = Ports::default();
    for (card, rect) in &boxes {
        let here: Vec<&Meeting> = meetings
            .iter()
            .filter(|meeting| &meeting.card == card)
            .collect();
        ports.add_card(card, *rect, &here);
    }
    ports.boxes = boxes;
    ports
}

/// The slot a port shows in its card's front edge, below the lid and above the sill.
fn slot_of(port: &Port) -> Rect {
    let top = port.foot - CARD_THICKNESS + LID;
    Rect {
        x: port.x - port.half,
        y: top,
        width: 2.0 * port.half,
        height: port.foot - SILL - top,
    }
}

/// A move to a point.
const fn go(to: Point) -> PathStep {
    PathStep::Move { to }
}

/// A half turn of a slot's round end, to a point.
const fn turn(radius: Point, clockwise: bool, to: Point) -> PathStep {
    PathStep::Arc {
        radius,
        clockwise,
        to,
    }
}

/// A slot's outline as a path: a box with round ends.
fn outline_of(slot: Rect) -> Vec<PathStep> {
    let Rect {
        x,
        y,
        width,
        height,
    } = slot;
    let round = height / 2.0;
    let radius = point(round, round);
    vec![
        go(point(x + round, y)),
        PathStep::Across {
            x: round_coord(x + width - round),
        },
        turn(radius, true, point(x + width - round, y + height)),
        PathStep::Across {
            x: round_coord(x + round),
        },
        turn(radius, true, point(x + round, y)),
        PathStep::Close,
    ]
}

/// A slot's outline filled, which takes no pointer events.
fn outlined(steps: Vec<PathStep>, fill: impl Into<crate::scene::Paint>) -> Items {
    shape(
        Shape::path(Purpose::Port, steps)
            .filled(fill)
            .pointer(Pointer::None),
    )
}

/// A share of a card's box, spelt finely enough.
fn share(value: f64) -> f64 {
    js::fixed(value, 6)
}

/// A port's hole in its card's clip, in shares of the card's box: the slot, and
/// the gap its line runs down through to the card's foot.
fn hole_of(port: &Port, rect: Rect) -> Vec<PathStep> {
    let Rect {
        x,
        y,
        width,
        height,
    } = slot_of(port);
    let round = height / 2.0;
    let at = |across: f64, down: f64| Point {
        x: share((across - rect.x) / rect.width),
        y: share((down - rect.y) / rect.height),
    };
    let u = |value: f64| at(value, rect.y).x;
    let v = |value: f64| at(rect.x, value).y;
    let radius = Point {
        x: share(round / rect.width),
        y: share(round / rect.height),
    };
    let left = port.x - port.line / 2.0;
    let right = port.x + port.line / 2.0;
    vec![
        go(at(x + round, y)),
        PathStep::Across {
            x: u(x + width - round),
        },
        turn(radius, true, at(x + width - round, y + height)),
        PathStep::Across { x: u(right) },
        PathStep::Down {
            y: v(port.foot + 1.0),
        },
        PathStep::Across { x: u(left) },
        PathStep::Down { y: v(y + height) },
        PathStep::Across { x: u(x + round) },
        turn(radius, true, at(x + round, y)),
        PathStep::Close,
    ]
}

/// The lower half of a slot's outline, which the port's lip colour fills.
fn floor_of(slot: Rect) -> Vec<PathStep> {
    let Rect {
        x,
        y,
        width,
        height,
    } = slot;
    let round = height / 2.0;
    let (left, right, middle, foot) = (x, x + width, y + round, y + height);
    let radius = point(round, round);
    vec![
        go(point(left, middle)),
        turn(radius, false, point(left + round, foot)),
        PathStep::Across {
            x: round_coord(right - round),
        },
        turn(radius, false, point(right, middle)),
        turn(radius, true, point(right - round, foot - FLOOR)),
        PathStep::Across {
            x: round_coord(left + round),
        },
        turn(radius, true, point(left, middle)),
        PathStep::Close,
    ]
}

/// The inside of a port, drawn in its line's group under the card.
pub(super) fn port_inside(
    port: &Port,
    well: bool,
    stroke: &Stroke,
    width: f64,
    palette: &Palette,
) -> Items {
    let slot = slot_of(port);
    let left = port.x - width / 2.0;
    let bottom = slot.y + slot.height;
    grouped(Group::new(
        Role::Port,
        lines(vec![
            if well {
                outlined(outline_of(slot), GradientId::PortWell)
            } else {
                Items::new()
            },
            if well {
                outlined(floor_of(slot), &palette.port_lip)
            } else {
                Items::new()
            },
            shape(
                Shape::new(
                    Purpose::Line,
                    Geometry::Line {
                        from: point(port.x, port.foot),
                        to: point(port.x, slot.y),
                    },
                )
                .pointer(Pointer::None)
                .unfilled()
                .stroked(stroke.clone().capped(Cap::Butt)),
            ),
            outlined(
                vec![
                    go(point(left, slot.y)),
                    PathStep::Across {
                        x: round_coord(left + width),
                    },
                    PathStep::Down {
                        y: round_coord(bottom),
                    },
                    PathStep::Across {
                        x: round_coord(left),
                    },
                    PathStep::Close,
                ],
                GradientId::PortFade,
            ),
        ]),
    ))
}

/// A card's clip with a hole for each of its ports; none for a card with no port.
fn port_cut(card: &str, ports: &[Port], rect: Rect) -> Option<Clip> {
    if ports.is_empty() {
        return None;
    }
    let mut outline = vec![
        go(Point { x: -1.0, y: -1.0 }),
        PathStep::Across { x: 2.0 },
        PathStep::Down { y: 2.0 },
        PathStep::Across { x: -1.0 },
        PathStep::Close,
    ];
    for port in ports {
        outline.extend(hole_of(port, rect));
    }
    Some(Clip {
        id: ClipId {
            card: card.to_owned(),
        },
        outline,
    })
}

/// How a drawing's ports are drawn: which line draws each port's well, and
/// how each card with a port is cut.
pub(super) struct PortPlan {
    /// The line that draws each port's well, by port index.
    pub wells: HashMap<usize, String>,
    /// Each cut card's clip, in the order the cards are drawn.
    pub cuts: Vec<Clip>,
}

impl PortPlan {
    /// The clip a card's body is drawn through, if it has ports.
    pub(super) fn cut_of(&self, card: &str) -> Option<&ClipId> {
        self.cuts
            .iter()
            .find(|clip| clip.id.card == card)
            .map(|clip| &clip.id)
    }
}

/// How a drawing's ports are drawn.
pub(super) fn port_plan(ports: &Ports, edges: &[Edge]) -> PortPlan {
    let mut wells = HashMap::new();
    for routed in edges {
        for index in ports
            .by_edge
            .get(&routed.edge.id)
            .map(Vec::as_slice)
            .unwrap_or_default()
        {
            wells
                .entry(*index)
                .or_insert_with(|| routed.edge.id.clone());
        }
    }
    let cuts = ports
        .by_card
        .iter()
        .filter_map(|(id, slots)| {
            let rect = ports.box_of(id)?;
            let slots: Vec<Port> = slots.iter().map(|at| ports.all[*at]).collect();
            port_cut(id, &slots, rect)
        })
        .collect();
    PortPlan { wells, cuts }
}

/// Where a line's pulses start or stop when the line ends at a port's foot: a
/// little inside the port.
fn inside_port(point: Point, ports: &[Port]) -> Option<Point> {
    ports
        .iter()
        .any(|port| port.x == point.x && (port.foot - point.y).abs() < 0.5)
        .then_some(Point {
            x: point.x,
            y: point.y - RIDE_IN,
        })
}

/// The route a line's pulses ride: on from each end that runs into a port.
pub(super) fn ride_into(curve: &Curve, ports: &[Port]) -> Curve {
    let start = inside_port(curve.from, ports);
    let end = inside_port(curve.end(), ports);
    let mut segments = Vec::new();
    if start.is_some() {
        segments.push(Segment::Line { to: curve.from });
    }
    segments.extend(curve.segments.iter().copied());
    if let Some(end) = end {
        segments.push(Segment::Line { to: end });
    }
    Curve {
        from: start.unwrap_or(curve.from),
        segments,
    }
}

/// Whether a route ends in a port.
pub(super) fn ends_in_port(curve: &Curve, ports: &[Port]) -> bool {
    inside_port(curve.end(), ports).is_some()
}

/// One stop of a port's gradient.
fn stop(offset: f64, colour: &crate::scene::Colour, opacity: Option<f64>) -> Stop {
    Stop {
        offset: Some(offset),
        colour: colour.clone(),
        opacity,
    }
}

/// The gradients every port is drawn in.
pub(super) fn port_definitions(palette: &Palette) -> Vec<Definition> {
    let deep = &palette.port_deep;
    vec![
        Definition::Gradient(Gradient {
            id: GradientId::PortWell,
            form: GradientForm::Radial {
                centre: Point { x: 0.5, y: 0.3 },
                radius: 0.62,
            },
            stops: vec![
                stop(0.0, deep, None),
                stop(0.45, deep, None),
                stop(1.0, &palette.port_wall, None),
            ],
        }),
        Definition::Gradient(Gradient {
            id: GradientId::PortFade,
            form: GradientForm::Linear {
                line: Some((Point { x: 0.0, y: 0.0 }, Point { x: 0.0, y: 1.0 })),
                user_space: false,
            },
            stops: vec![
                stop(0.0, deep, None),
                stop(0.45, deep, Some(0.8)),
                stop(0.85, deep, Some(0.0)),
            ],
        }),
    ]
}
