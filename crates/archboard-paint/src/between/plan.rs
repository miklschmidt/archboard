//! A move prepared once: the body of the next scene, with a mover wherever a
//! subject group is carried, borrowed, drawn on or faded, and everything else
//! left as it is. Each frame clones what is still and asks each mover for its
//! moment.

use archboard_scene::scene::{Group, Item, Mask, Role, Transform};

use super::arrive::{Ground, Grow, Leave, Swap};
use super::card::CardCarry;
use super::content::shell;
use super::ease::{ease_out, emphasised, phase};
use super::line::{DrawOn, LineCarry};
use super::ride::Ride;

/// What changes a part of the picture during a move.
#[derive(Clone, Debug)]
pub(super) enum Mover {
    /// A subject only the last scene had.
    Leave(Leave),
    /// A subject drawn another way.
    Swap(Swap),
    /// A card only the next scene has.
    Grow(Grow),
    /// A line only the next scene has.
    Draw(DrawOn),
    /// A card carried between two boxes.
    Card(Box<CardCarry>, Option<Ground>),
    /// A line carried between two routes.
    Line(LineCarry, Option<Ground>),
    /// A subject that only becomes more or less visible.
    Visible(Group, Ground),
    /// Part of the ground of a picture, faded in between two points of the move.
    Frame(Item, f64, f64),
    /// A shadow that rides under the card that casts it.
    Riding(Box<Riding>),
    /// A line's pulses on the line as it moves.
    Ride(Box<Ride>),
}

impl Mover {
    /// The part at a moment of the move.
    fn at(&self, progress: f64) -> Vec<Item> {
        match self {
            Mover::Leave(leave) => leave.at(progress),
            Mover::Swap(swap) => swap.at(progress),
            Mover::Grow(grow) => vec![Item::Group(grow.at(progress))],
            Mover::Draw(draw) => vec![Item::Group(draw.at(progress))],
            Mover::Card(card, ground) => grounded(card.at(progress), *ground, progress),
            Mover::Line(line, ground) => grounded(line.at(progress), *ground, progress),
            Mover::Visible(group, ground) => grounded(group.clone(), Some(*ground), progress),
            Mover::Riding(riding) => vec![riding.at(progress)],
            Mover::Ride(ride) => ride.at(progress),
            Mover::Frame(item, start, end) => {
                vec![faded_in(item, ease_out(phase(progress, *start, *end)))]
            }
        }
    }
}

/// A group, its opacity eased when its ground asks for it.
fn grounded(mut group: Group, ground: Option<Ground>, progress: f64) -> Vec<Item> {
    if let Some(ground) = ground {
        ground.apply(&mut group, progress);
    }
    vec![Item::Group(group)]
}

/// An item this much visible, under whatever visibility it states.
fn faded_in(item: &Item, visible: f64) -> Item {
    if visible >= 1.0 {
        return item.clone();
    }
    match item {
        Item::Group(group) => {
            let mut group = group.clone();
            group.opacity = Some(group.opacity.unwrap_or(1.0) * visible);
            Item::Group(group)
        }
        other => {
            let mut around = Group::new(Role::Marks, vec![other.clone()]);
            around.opacity = Some(visible);
            Item::Group(around)
        }
    }
}

/// One place in the body.
#[derive(Clone, Debug)]
enum Slot {
    /// An item that does not change.
    Still(Item),
    /// A plain group, some of whose parts change.
    Shell(Group, Vec<Slot>),
    /// The part a mover draws.
    Mover(usize),
}

/// A shadow on its way with the card that casts it.
#[derive(Clone, Debug)]
pub(super) struct Riding {
    /// The shadow, where the next picture draws it.
    pub(super) shadow: Group,
    /// How far back the card starts.
    pub(super) back: (f64, f64),
    pub(super) start: f64,
    pub(super) end: f64,
}

impl Riding {
    /// The shadow at a moment of the move.
    fn at(&self, progress: f64) -> Item {
        let left = 1.0 - emphasised(phase(progress, self.start, self.end));
        let mut around = Group::new(Role::Move, vec![Item::Group(self.shadow.clone())]);
        around.transform = Some(Transform::translate(self.back.0 * left, self.back.1 * left));
        Item::Group(around)
    }
}

/// Which movers stand where, as the body of a scene is walked.
pub(super) struct Wiring<'a> {
    /// The mover of each subject group of the body, in drawing order.
    pub(super) of_subject: &'a [Option<usize>],
    /// The mover of an item that holds no subject and comes in on its own, given
    /// the item and whether it stands at the top of the body.
    pub(super) furniture: &'a dyn Fn(&Item, bool) -> Option<Mover>,
}

/// The walk that turns a body into slots.
struct Walk<'a> {
    wiring: &'a Wiring<'a>,
    subjects: usize,
    movers: Vec<Mover>,
}

impl Walk<'_> {
    fn slots(&mut self, items: &[Item], top: bool) -> Vec<Slot> {
        items
            .iter()
            .map(|item| {
                if let Some(mover) = (self.wiring.furniture)(item, top) {
                    self.movers.push(mover);
                    return Slot::Mover(self.movers.len() - 1);
                }
                match item {
                    Item::Group(group) if group.subject.is_some() => {
                        let at = self.subjects;
                        self.subjects += 1;
                        self.wiring
                            .of_subject
                            .get(at)
                            .copied()
                            .flatten()
                            .map_or_else(|| Slot::Still(item.clone()), Slot::Mover)
                    }
                    Item::Group(group) => self.plain(group),
                    other => Slot::Still(other.clone()),
                }
            })
            .collect()
    }

    /// A group of no subject: whole, or a shell round slots.
    fn plain(&mut self, group: &Group) -> Slot {
        let slots = self.slots(&group.items, false);
        if slots.iter().all(|slot| matches!(slot, Slot::Still(_))) {
            let items = slots
                .into_iter()
                .filter_map(|slot| match slot {
                    Slot::Still(item) => Some(item),
                    _ => None,
                })
                .collect();
            return Slot::Still(Item::Group(Group {
                items,
                ..shell(group)
            }));
        }
        Slot::Shell(shell(group), slots)
    }
}

/// A body and the movers that draw its changing parts.
#[derive(Clone, Debug)]
pub(super) struct Plan {
    slots: Vec<Slot>,
    movers: Vec<Mover>,
}

impl Plan {
    /// Prepare the body of a scene.
    pub(super) fn new(body: &[Item], movers: Vec<Mover>, wiring: &Wiring<'_>) -> Plan {
        let mut walk = Walk {
            wiring,
            subjects: 0,
            movers,
        };
        let slots = walk.slots(body, true);
        Plan {
            slots,
            movers: walk.movers,
        }
    }

    /// Put a mover at a place among the top-level items.
    pub(super) fn insert(&mut self, place: usize, mover: Mover) {
        self.movers.push(mover);
        self.slots.insert(
            place.min(self.slots.len()),
            Slot::Mover(self.movers.len() - 1),
        );
    }

    /// The masks of the lines that move, at a moment of the move.
    pub(super) fn masks_at(&self, progress: f64) -> Vec<Mask> {
        self.movers
            .iter()
            .filter_map(|mover| match mover {
                Mover::Line(line, _) => line.mask_at(progress),
                _ => None,
            })
            .collect()
    }

    /// The body at a moment of the move.
    pub(super) fn at(&self, progress: f64) -> Vec<Item> {
        let mut body = Vec::with_capacity(self.slots.len());
        self.lay(&self.slots, progress, &mut body);
        body
    }

    fn lay(&self, slots: &[Slot], progress: f64, out: &mut Vec<Item>) {
        for slot in slots {
            match slot {
                Slot::Still(item) => out.push(item.clone()),
                Slot::Shell(group, inside) => {
                    let mut items = Vec::with_capacity(inside.len());
                    self.lay(inside, progress, &mut items);
                    out.push(Item::Group(Group {
                        items,
                        ..group.clone()
                    }));
                }
                Slot::Mover(mover) => out.extend(self.movers[*mover].at(progress)),
            }
        }
    }
}
