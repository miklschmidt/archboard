//! Ports: where a line meets the foot of a card, it goes into a slot cut
//! through the card's front edge (TASK-424). The card's body is clipped round
//! the hole, the line's own group draws the inside of the port under the card,
//! and a pulse rides on into the hole.

use std::collections::HashMap;

use crate::attrs;
use crate::drawing::{Edge, Node};
use crate::geometry::{Curve, Point, Rect, Segment, coord};
use crate::js;
use crate::markup::{Attrs, Markup, concat, content_id, group, lines, markup_of, tag, wrap};
use crate::paint::design::{CARD_THICKNESS, SLAB_RADIUS};
use crate::paint::palette::Palette;
use crate::paint::styles::stroke_width;
use crate::scene::Role;

const PORT_CLASS: &str = "ab-port";
const SOCKET: f64 = 2.1;
const LID: f64 = 0.6;
const SILL: f64 = 0.7;
const WEB: f64 = 1.5;
const FLOOR: f64 = 0.5;
const CORNER_ROOM: f64 = SLAB_RADIUS - 2.75;
const RIDE_IN: f64 = CARD_THICKNESS - LID + 1.0;
const WELL_ID: &str = "ab-port-well";
const FADE_ID: &str = "ab-port-fade";

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

/// A slot's outline as a path: a box with round ends.
fn outline_of(slot: Rect) -> String {
    let Rect {
        x,
        y,
        width,
        height,
    } = slot;
    let round = height / 2.0;
    let arc = format!("A{},{} 0 0 1", coord(round), coord(round));
    format!(
        "M{},{}H{}{arc} {},{}H{}{arc} {},{}Z",
        coord(x + round),
        coord(y),
        coord(x + width - round),
        coord(x + width - round),
        coord(y + height),
        coord(x + round),
        coord(x + round),
        coord(y),
    )
}

/// A slot's outline filled, which takes no pointer events.
fn outlined(slot: Rect, fill: &str) -> Markup {
    tag(
        "path",
        attrs! { "d": outline_of(slot), "fill": fill, "pointer-events": "none" },
    )
}

/// A share of a card's box, spelt finely enough.
fn share(value: f64) -> String {
    js::fixed_number(value, 6)
}

/// A port's hole in its card's clip, in shares of the card's box: the slot, and
/// the gap its line runs down through to the card's foot.
fn hole_of(port: &Port, rect: Rect) -> String {
    let Rect {
        x,
        y,
        width,
        height,
    } = slot_of(port);
    let round = height / 2.0;
    let u = |value: f64| share((value - rect.x) / rect.width);
    let v = |value: f64| share((value - rect.y) / rect.height);
    let arc = format!(
        "A{},{} 0 0 1",
        share(round / rect.width),
        share(round / rect.height)
    );
    let left = port.x - port.line / 2.0;
    let right = port.x + port.line / 2.0;
    format!(
        "M{},{}H{}{arc} {},{}H{}V{}H{}V{}H{}{arc} {},{}Z",
        u(x + round),
        v(y),
        u(x + width - round),
        u(x + width - round),
        v(y + height),
        u(right),
        v(port.foot + 1.0),
        u(left),
        v(y + height),
        u(x + round),
        u(x + round),
        v(y),
    )
}

/// The lower half of a slot's outline, which the port's lip colour fills.
fn floor_of(slot: Rect) -> String {
    let Rect {
        x,
        y,
        width,
        height,
    } = slot;
    let round = height / 2.0;
    let (left, right, middle, foot) = (x, x + width, y + round, y + height);
    let arc = format!("A{},{} 0 0", coord(round), coord(round));
    format!(
        "M{},{}{arc} 0 {},{}H{}{arc} 0 {},{}{arc} 1 {},{}H{}{arc} 1 {},{}Z",
        coord(left),
        coord(middle),
        coord(left + round),
        coord(foot),
        coord(right - round),
        coord(right),
        coord(middle),
        coord(right - round),
        coord(foot - FLOOR),
        coord(left + round),
        coord(left),
        coord(middle),
    )
}

/// The inside of a port, drawn in its line's group under the card.
pub(super) fn port_inside(
    port: &Port,
    well: bool,
    stroke: Attrs,
    width: f64,
    palette: &Palette,
) -> Markup {
    let slot = slot_of(port);
    let left = port.x - width / 2.0;
    let bottom = slot.y + slot.height;
    group(
        Role::Port,
        None,
        attrs! { "class": PORT_CLASS },
        lines(vec![
            if well {
                outlined(slot, &format!("url(#{WELL_ID})"))
            } else {
                Markup::new()
            },
            if well {
                tag(
                    "path",
                    attrs! { "d": floor_of(slot), "fill": palette.port_lip, "pointer-events": "none" },
                )
            } else {
                Markup::new()
            },
            tag(
                "line",
                attrs! {
                    "x1": coord(port.x),
                    "y1": coord(port.foot),
                    "x2": coord(port.x),
                    "y2": coord(slot.y),
                    "pointer-events": "none",
                }
                .with(stroke)
                .set("stroke-linecap", "butt"),
            ),
            tag(
                "path",
                attrs! {
                    "d": format!(
                        "M{},{}H{}V{}H{}Z",
                        coord(left),
                        coord(slot.y),
                        coord(left + width),
                        coord(bottom),
                        coord(left)
                    ),
                    "fill": format!("url(#{FADE_ID})"),
                    "pointer-events": "none",
                },
            ),
        ]),
    )
}

/// A card's cut: its id and its clip's definition.
pub(super) struct Cut {
    pub id: String,
    pub markup: Markup,
}

/// A card's clip with a hole for each of its ports; none for a card with no port. Its id comes from its content.
fn port_cut(ports: &[Port], rect: Rect) -> Option<Cut> {
    if ports.is_empty() {
        return None;
    }
    let mut d = String::from("M-1,-1H2V2H-1Z");
    for port in ports {
        d.push_str(&hole_of(port, rect));
    }
    let outline = tag("path", attrs! { "d": d, "clip-rule": "evenodd" });
    let id = format!("ab-port-{}", content_id(&markup_of(&outline)));
    let markup = wrap(
        "clipPath",
        attrs! { "id": id.as_str(), "clipPathUnits": "objectBoundingBox" },
        outline,
    );
    Some(Cut { id, markup })
}

/// How a drawing's ports are drawn: which line draws each port's well, and
/// how each card with a port is cut.
pub(super) struct PortPlan {
    /// The line that draws each port's well, by port index.
    pub wells: HashMap<usize, String>,
    /// Each cut card's clip, in the order the cards are drawn.
    pub cuts: Vec<(String, Cut)>,
}

impl PortPlan {
    /// The clip a card's body is drawn through, if it has ports.
    pub(super) fn cut_of(&self, card: &str) -> Option<&Cut> {
        self.cuts
            .iter()
            .find(|(id, _)| id == card)
            .map(|(_, cut)| cut)
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
            port_cut(&slots, rect).map(|cut| (id.clone(), cut))
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

/// The gradients every port is drawn in.
pub(super) fn port_definitions(palette: &Palette) -> Markup {
    concat(vec![
        wrap(
            "radialGradient",
            attrs! { "id": WELL_ID, "cx": 0.5, "cy": 0.3, "r": 0.62 },
            concat(vec![
                tag(
                    "stop",
                    attrs! { "offset": 0.0, "stop-color": palette.port_deep },
                ),
                tag(
                    "stop",
                    attrs! { "offset": 0.45, "stop-color": palette.port_deep },
                ),
                tag(
                    "stop",
                    attrs! { "offset": 1.0, "stop-color": palette.port_wall },
                ),
            ]),
        ),
        wrap(
            "linearGradient",
            attrs! { "id": FADE_ID, "x1": 0.0, "y1": 0.0, "x2": 0.0, "y2": 1.0 },
            concat(vec![
                tag(
                    "stop",
                    attrs! { "offset": 0.0, "stop-color": palette.port_deep },
                ),
                tag(
                    "stop",
                    attrs! { "offset": 0.45, "stop-color": palette.port_deep, "stop-opacity": 0.8 },
                ),
                tag(
                    "stop",
                    attrs! { "offset": 0.85, "stop-color": palette.port_deep, "stop-opacity": 0.0 },
                ),
            ]),
        ),
    ])
}
