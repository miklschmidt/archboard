//! Lining up the cards of a block of cards after Graphviz ranks them (TASK-349):
//! the joined cards it stacked a few points out of one column move into line,
//! and the widths of cards evened with the card over or under them.

use crate::geometry::{Point, Rect};
use crate::lanes::graphviz::{Join, Room, align_columns};
use crate::lanes::scene::Map;

use super::card_layout::CardLayout;
use super::lone::Card;

/// The room a card moved into line keeps from its neighbours: half what Graphviz keeps.
const LINED_UP_GAP: f64 = 20.0;

impl CardLayout<'_> {
    /// Line up the joined cards Graphviz stacked a few points out of one column:
    /// a card or label moves inside the block, clear of the lines.
    pub(super) fn line_up(
        &mut self,
        joins: &[Join],
        centres: &mut Map<String, Point>,
        placed: LinedUp<'_>,
    ) {
        let LinedUp {
            boxes,
            polylines,
            width,
            cards,
            lowered,
        } = placed;
        {
            let block = self.block;
            let within = |name: &str| {
                (block.items.iter().any(|item| item == name) || name.starts_with("label:"))
                    .then_some((0.0, width))
            };
            let card = |name: &str| cards.get(name).is_some_and(|card| !card.door);
            let room = Room {
                gap: LINED_UP_GAP,
                polylines: Some(polylines),
                within: &within,
                card: Some(&card),
                wrap: Some(lowered),
            };
            align_columns(boxes, joins, &room);
        }
        for (name, at) in boxes.iter() {
            if cards.contains_key(name.as_str()) {
                self.widths.insert(name.clone(), at.width);
            }
        }
        for (name, at) in boxes.iter() {
            if let Some(centre) = centres.get_mut(name) {
                *centre = Point {
                    x: at.x + at.width / 2.0,
                    y: centre.y,
                };
            }
        }
    }
}

/// What lining a block's cards up reads and moves.
pub(crate) struct LinedUp<'a> {
    /// Every vendor node's box; the moved ones are replaced.
    pub boxes: &'a mut Map<String, Rect>,
    /// Every vendor edge's polyline, by id.
    pub polylines: &'a Map<String, Vec<Point>>,
    /// The block's width.
    pub width: f64,
    /// The block's cards, whose widths may be evened with the card over or under them.
    pub cards: &'a Map<String, Card>,
    /// How far a wrap lowered each card of its rank; empty when none.
    pub lowered: &'a Map<String, usize>,
}
