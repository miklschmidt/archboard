//! What Graphviz answers, read into diagram coordinates: the JSON a layout
//! returns, its boxes in inches, and its polylines and centres in points; and
//! the joined cards Graphviz stacked a few points out of one column, lined up.

use serde::Deserialize;

use crate::ecma::{abs, js_max, js_min, max, min, number_of, via_text};
use crate::geometry::{Point, Rect};
use crate::track::scene::{Map, Set};
use crate::track::{hold_slots, wrap_columns};
use crate::viz::Node;

/// One object Graphviz placed: a node or a cluster.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct Object {
    pub name: String,
    #[serde(default)]
    pub bb: Option<String>,
    #[serde(default)]
    pub pos: Option<String>,
}

/// One edge Graphviz drew.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct OutputEdge {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub pos: Option<String>,
}

/// What Graphviz answers in its `json0` format.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct Output {
    pub bb: String,
    #[serde(default)]
    pub objects: Vec<Object>,
    #[serde(default)]
    pub edges: Vec<OutputEdge>,
}

/// Read Graphviz's answer.
///
/// # Errors
///
/// When the answer is not the JSON Graphviz writes.
pub(crate) fn output_of(answer: &str) -> Result<Output, String> {
    serde_json::from_str(answer)
        .map_err(|error| format!("Graphviz answered unreadable JSON: {error}"))
}

/// Finite numbers from Graphviz's comma-separated geometry.
///
/// # Errors
///
/// When Graphviz answered a coordinate that is not a number.
pub(crate) fn numbers(value: &str) -> Result<Vec<f64>, String> {
    let parsed: Vec<f64> = value.split(',').map(number_of).collect();
    if parsed.iter().any(|number| !number.is_finite()) {
        return Err("Graphviz returned non-finite geometry".to_owned());
    }
    Ok(parsed)
}

/// The polyline points of a Graphviz edge, without its arrow markers, in
/// diagram coordinates. The TypeScript engine kept each as `x,y` text.
pub(crate) fn polyline_points(pos: &str, origin: Point) -> Result<Vec<Point>, String> {
    pos.split(' ')
        .filter(|token| !token.starts_with("e,") && !token.starts_with("s,"))
        .map(|token| {
            let xy = numbers(token)?;
            Ok(Point {
                x: via_text(xy[0] - origin.x),
                y: via_text(xy[1] - origin.y),
            })
        })
        .collect()
}

/// Every vendor node's centre in diagram coordinates, by vendor name.
pub(crate) fn centres_of(output: &Output, origin: Point) -> Result<Map<String, Point>, String> {
    let mut centres = Map::default();
    for object in &output.objects {
        let Some(pos) = &object.pos else {
            continue;
        };
        let xy = numbers(pos)?;
        centres.insert(
            object.name.clone(),
            Point {
                x: xy[0] - origin.x,
                y: xy[1] - origin.y,
            },
        );
    }
    Ok(centres)
}

/// Every node's box where Graphviz placed it, from its centre and its size, by name.
pub(crate) fn boxes_of(nodes: &[&Node], centres: &Map<String, Point>) -> Map<String, Rect> {
    let mut boxes = Map::default();
    for node in nodes {
        let Some(centre) = centres.get(&node.name) else {
            continue;
        };
        let size = |key: &str| {
            node.attributes
                .get(key)
                .map_or(f64::NAN, crate::viz::Value::number)
                * 72.0
        };
        let (width, height) = (size("width"), size("height"));
        boxes.insert(
            node.name.clone(),
            Rect {
                x: centre.x - width / 2.0,
                y: centre.y - height / 2.0,
                width,
                height,
            },
        );
    }
    boxes
}

/// How far apart two joined cards stacked in a column may stand and still be lined up.
const NEAR_MISS: f64 = 16.0;

/// A line between two items, upper end first, through its label's box when it has one.
#[derive(Clone, Debug)]
pub(crate) struct Join {
    pub tail: String,
    pub head: String,
    pub label: Option<String>,
    /// The ids of the Graphviz edges that draw it.
    pub legs: Option<Vec<String>>,
}

/// The wrap Graphviz placed a block's rank by.
pub(crate) struct Wrap<'a> {
    /// Every card of the wrapped rank and the row it was dealt to.
    pub rows: &'a Map<String, usize>,
    /// The innermost cluster around a card, if any.
    pub around: &'a dyn Fn(&str) -> Option<String>,
}

/// The invisible holds a block's containers keep their members below their titles with.
pub(crate) struct Holds<'a> {
    /// How far in from its container's wall a hold passing beside a member stands it.
    pub slot: f64,
    /// The innermost container around a card, if any.
    pub around: &'a dyn Fn(&str) -> Option<String>,
}

/// What an item moved sideways must keep to.
pub(crate) struct Room<'a> {
    /// How far it keeps from every other item.
    pub gap: f64,
    /// Every Graphviz edge's polyline, by id, which a moved item must stay clear of.
    pub polylines: Option<&'a Map<String, Vec<Point>>>,
    /// Where an item may stand: the span it must stay within, or nothing for one that stays.
    pub within: &'a dyn Fn(&str) -> Option<(f64, f64)>,
    /// Whether an item is a card, whose width may be evened with the card over or under it.
    pub card: Option<&'a dyn Fn(&str) -> bool>,
    /// The wrap the block's rank was placed by.
    pub wrap: Option<Wrap<'a>>,
    /// The invisible holds the block's containers keep their members with.
    pub holds: Option<Holds<'a>>,
}

impl Room<'_> {
    /// Whether an item is a card: `room.card?.(name) === true`.
    pub(crate) fn is_card(&self, name: &str) -> bool {
        self.card.is_some_and(|card| card(name))
    }
}

/// Whether two boxes on one rank come closer than a gap.
fn crowds(one: &Rect, other: &Rect, gap: f64) -> bool {
    one.x < other.x + other.width + gap
        && other.x < one.x + one.width + gap
        && one.y < other.y + other.height
        && other.y < one.y + one.height
}

/// Whether one box holds another whole, as a container holds its members.
fn holds(outer: &Rect, inner: &Rect) -> bool {
    outer.x <= inner.x
        && outer.y <= inner.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height
}

/// Whether a straight run passes through a box.
fn through(from: Point, to: Point, at: &Rect) -> bool {
    let (mut low, mut high) = (0.0, 1.0);
    for (start, end, least, most) in [
        (from.x, to.x, at.x, at.x + at.width),
        (from.y, to.y, at.y, at.y + at.height),
    ] {
        let step = end - start;
        if abs(step) < 1e-9 {
            if start <= least || start >= most {
                return false;
            }
            continue;
        }
        let (one, other) = ((least - start) / step, (most - start) / step);
        low = js_max(low, js_min(one, other));
        high = js_min(high, js_max(one, other));
    }
    low < high
}

/// The horizontal centre of a box.
pub(crate) fn middle(at: &Rect) -> f64 {
    at.x + at.width / 2.0
}

/// Whether one box stands wholly above or below another.
fn apart(one: &Rect, other: &Rect) -> bool {
    one.y + one.height <= other.y || other.y + other.height <= one.y
}

/// Whether cards make a fan of a card: two or more, all on one rank, and all
/// above it or all below it.
fn fans(at: &Rect, fan: &[Rect]) -> bool {
    if fan.len() < 2 {
        return false;
    }
    let rank = fan[0].y + fan[0].height / 2.0;
    fan.iter()
        .all(|end| abs(end.y + end.height / 2.0 - rank) < 0.5)
        && (fan.iter().all(|end| end.y + end.height <= at.y)
            || fan.iter().all(|end| at.y + at.height <= end.y))
}

/// The lines between items Graphviz placed, and the items lined up so far.
pub(crate) struct Columns<'a, 'r> {
    pub boxes: &'a mut Map<String, Rect>,
    pub joins: &'a [Join],
    pub room: &'a Room<'r>,
    /// The items standing in line with another over or under them: they stay.
    pub held: Set<String>,
    /// Every line as Graphviz drew it, and what it joins.
    paths: Vec<(Set<String>, Vec<Point>)>,
}

impl<'a, 'r> Columns<'a, 'r> {
    /// Read what the items stand in.
    pub(crate) fn new(
        boxes: &'a mut Map<String, Rect>,
        joins: &'a [Join],
        room: &'a Room<'r>,
    ) -> Columns<'a, 'r> {
        let paths = joins
            .iter()
            .map(|join| {
                let ends: Set<String> = [
                    join.tail.clone(),
                    join.head.clone(),
                    join.label.clone().unwrap_or_else(|| join.tail.clone()),
                ]
                .into_iter()
                .collect();
                let points = join
                    .legs
                    .iter()
                    .flatten()
                    .flat_map(|leg| {
                        room.polylines
                            .and_then(|polylines| polylines.get(leg))
                            .into_iter()
                            .flatten()
                            .copied()
                    })
                    .collect();
                (ends, points)
            })
            .collect();
        let mut columns = Columns {
            boxes,
            joins,
            room,
            held: Set::default(),
            paths,
        };
        for join in columns.stacked() {
            if abs(columns.offset(&join)) < 0.5 {
                columns.held.insert(join.tail.clone());
                columns.held.insert(join.head.clone());
            }
        }
        columns
    }

    /// The lines whose upper end stands wholly above their lower end.
    pub(crate) fn stacked(&self) -> Vec<Join> {
        self.joins
            .iter()
            .filter(
                |join| match (self.boxes.get(&join.tail), self.boxes.get(&join.head)) {
                    (Some(one), Some(other)) => one.y + one.height <= other.y,
                    _ => false,
                },
            )
            .cloned()
            .collect()
    }

    /// How far a line's upper end stands right of its lower end.
    pub(crate) fn offset(&self, join: &Join) -> f64 {
        middle(&self.boxes[&join.tail]) - middle(&self.boxes[&join.head])
    }

    /// An item's box centred on another x.
    pub(crate) fn moved(&self, name: &str, centre: f64) -> Rect {
        let at = self.boxes[name];
        Rect {
            x: centre - at.width / 2.0,
            ..at
        }
    }

    /// Whether an item may stand at a box, whatever lines Graphviz drew there:
    /// inside its span, and crowding nothing but what holds it.
    pub(crate) fn roomy(&self, name: &str, at: &Rect) -> bool {
        let Some((left, right)) = (self.room.within)(name) else {
            return false;
        };
        if at.x < left || at.x + at.width > right {
            return false;
        }
        let was = self.boxes[name];
        !self.boxes.iter().any(|(other, placed)| {
            other != name && !holds(placed, &was) && crowds(at, placed, self.room.gap)
        })
    }

    /// Whether an item may stand at a box: inside its span, crowding nothing
    /// but what holds it, and clear of every line it is not an end of.
    pub(crate) fn free(&self, name: &str, at: &Rect) -> bool {
        self.roomy(name, at)
            && self.paths.iter().all(|(ends, points)| {
                ends.contains(name) || points.windows(2).all(|pair| !through(pair[0], pair[1], at))
            })
    }

    /// The cards stacked on one centre with an item that moves, which move with it.
    fn carried(&self, name: &str, centre: f64) -> Vec<String> {
        let was = self.boxes[name];
        self.boxes
            .iter()
            .filter(|(other, at)| {
                other.as_str() != name
                    && self.room.is_card(other)
                    && !self.held.contains(other.as_str())
                    && abs(middle(at) - middle(&was)) < 0.5
                    && apart(at, &was)
            })
            .map(|(other, _)| other.clone())
            .collect::<Vec<_>>()
            .into_iter()
            .filter(|other| self.free(other, &self.moved(other, centre)))
            .collect()
    }

    /// Whether both ends of a line are cards.
    fn cards(&self, join: &Join) -> bool {
        self.room.is_card(&join.tail) && self.room.card.is_some_and(|card| card(&join.head))
    }

    /// The narrower of two joined cards stacked on one centre, when their
    /// widths differ by no more than a near miss, and the other's width.
    fn uneven(&self, join: &Join) -> Option<(String, f64)> {
        if !self.cards(join) || abs(self.offset(join)) >= 0.5 {
            return None;
        }
        let (one, other) = (self.boxes[&join.tail], self.boxes[&join.head]);
        let short = abs(one.width - other.width);
        if short < 0.5 || short > NEAR_MISS {
            return None;
        }
        Some(if one.width < other.width {
            (join.tail.clone(), other.width)
        } else {
            (join.head.clone(), one.width)
        })
    }

    /// Widen the narrower of two joined cards stacked on one centre to the
    /// other's width. Answers whether a card was widened.
    fn even(&mut self, join: &Join) -> bool {
        let Some((narrow, width)) = self.uneven(join) else {
            return false;
        };
        let at = self.boxes[&narrow];
        let widened = Rect {
            x: middle(&at) - width / 2.0,
            width,
            ..at
        };
        if !self.free(&narrow, &widened) {
            return false;
        }
        self.boxes.insert(narrow, widened);
        true
    }

    /// Whether an item is a card not yet lined up with another.
    fn loose(&self, name: &str) -> bool {
        self.room.is_card(name) && !self.held.contains(name)
    }

    /// The cards a card's lines join, when they make a fan of it.
    fn fan_of(&self, name: &str) -> Option<Vec<Rect>> {
        let mut ends: Set<&str> = Set::default();
        for join in self.joins {
            if join.tail == name {
                ends.insert(&join.head);
            } else if join.head == name {
                ends.insert(&join.tail);
            }
        }
        if !self.loose(name) || ends.iter().any(|end| !self.room.is_card(end)) {
            return None;
        }
        let fan: Vec<Rect> = ends.iter().map(|end| self.boxes[*end]).collect();
        fans(&self.boxes[name], &fan).then_some(fan)
    }

    /// Centre a card on the fan its lines make, midway between the fan's outer centres.
    fn centre(&mut self, name: &str) {
        let Some(fan) = self.fan_of(name) else {
            return;
        };
        let centres: Vec<f64> = fan.iter().map(middle).collect();
        let at = self.moved(
            name,
            (min(centres.iter().copied()) + max(centres.iter().copied())) / 2.0,
        );
        if abs(middle(&at) - middle(&self.boxes[name])) >= 0.5 && self.free(name, &at) {
            self.boxes.insert(name.to_owned(), at);
        }
    }

    /// Line one line's ends up, when one of them may move under or over the
    /// other, and its label onto the line.
    fn line_up(&mut self, join: &Join) {
        let choices = [
            (join.head.clone(), middle(&self.boxes[&join.tail])),
            (join.tail.clone(), middle(&self.boxes[&join.head])),
        ];
        let Some((name, centre)) = choices.into_iter().find(|(name, centre)| {
            !self.held.contains(name) && self.free(name, &self.moved(name, *centre))
        }) else {
            return;
        };
        for other in self.carried(&name, centre) {
            let moved = self.moved(&other, centre);
            self.boxes.insert(other, moved);
        }
        let moved = self.moved(&name, centre);
        self.boxes.insert(name, moved);
        self.held.insert(join.tail.clone());
        self.held.insert(join.head.clone());
        let Some(label) = &join.label else {
            return;
        };
        if !self.boxes.contains_key(label) {
            return;
        }
        let onto = self.moved(label, centre);
        if self.free(label, &onto) {
            self.boxes.insert(label.clone(), onto);
        }
    }
}

/// Line up the joined cards Graphviz stacked a few points out of one column.
/// First, where the room names the holds, a member a hold stood a slot in
/// from its container's wall moves onto it. Last, where the room names the
/// cards, two joined cards on one centre whose widths differ by no more than
/// a near miss are made one width, and where it names a wrap, its lowered
/// cards stand out of the way of the lines through it.
pub(crate) fn align_columns(boxes: &mut Map<String, Rect>, joins: &[Join], room: &Room<'_>) {
    let mut columns = Columns::new(boxes, joins, room);
    hold_slots::close_slots(&mut columns, room.holds.as_ref());
    for join in columns.stacked() {
        let shift = abs(columns.offset(&join));
        if (0.5..=NEAR_MISS).contains(&shift) {
            columns.line_up(&join);
        }
    }
    let names: Vec<String> = columns.boxes.keys().cloned().collect();
    for name in names {
        columns.centre(&name);
    }
    // Widening one card can line its edges up with a third's.
    while columns.stacked().iter().any(|join| columns.even(join)) {}
    wrap_columns::clear_wrap(&mut columns, room.wrap.as_ref());
}
