//! How tall each band's channel is: room for the tracks its lines turn on,
//! for an arrowhead's approach, and, at a block's own edge rows, for the
//! block's inset.

use crate::constants::{
    APPROACH_STRAIGHT, BEND_RADIUS, REGION_INSET, STRAIGHT_RUN, STRAND, approach_of,
};
use crate::ecma::{abs, js_max, js_min};
use crate::lanes::chains::{Kind, LANE, Router};
use crate::lanes::channels::{End, NetId};
use crate::lanes::scene::{ItemId, Placement, Set};

/// How far apart two ends may be and still be drawn as one straight drop.
const STRAIGHT: f64 = 0.5;
/// From the band above to the first track: room for the bend off a face.
pub(crate) const TRACK_TOP: f64 = 2.0 * BEND_RADIUS;
/// From the band above to the first track when a line on that track rises into it.
const TRACK_TOP_RISING: f64 = BEND_RADIUS + APPROACH_STRAIGHT;
/// From the last track to the band below: room for the bend and a straight arrow approach.
const TRACK_BOTTOM: f64 = APPROACH_STRAIGHT + 2.0 * BEND_RADIUS;
/// The height of a channel no line turns in.
pub(crate) const EMPTY_CHANNEL: f64 = 24.0;

/// The room a block that draws its own edge keeps where no line turns.
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct Rim {
    /// From the header row to the first thing the block holds.
    pub head: f64,
    /// From the lowest thing it holds to its bottom edge, when its bottom ports stand there.
    pub foot: Option<f64>,
}

/// How far below its band a channel's first track runs.
fn first_track(rising: bool) -> f64 {
    js_max(TRACK_TOP, if rising { TRACK_TOP_RISING } else { 0.0 })
}

/// How tall a channel is for the tracks it holds.
pub(crate) fn channel_height(tracks: usize, rising: bool) -> f64 {
    if tracks == 0 {
        EMPTY_CHANNEL
    } else {
        first_track(rising) + (tracks - 1) as f64 * LANE + TRACK_BOTTOM
    }
}

/// How far a Lanes channel's last track stands above the band under it: room for the bend, and
/// for the arrow's approach where a line ends on a card there, less what every line's end can
/// spare; a lane at least, clear of whatever stands on the band.
fn room_below(lifts: impl Iterator<Item = f64>) -> f64 {
    js_max(
        LANE,
        TRACK_BOTTOM - lifts.fold(f64::INFINITY, js_min).min(TRACK_BOTTOM),
    )
}

/// The height of a channel no line turns in at a block's edge rows.
fn rim_of(scene: &Placement, index: usize, rim: Option<Rim>) -> Option<f64> {
    let rim = rim?;
    if index == 0 {
        return Some(rim.head);
    }
    let ports = scene.bands.last().expect("a band");
    match rim.foot {
        Some(foot) if index + 2 == scene.bands.len() => Some(foot - (ports.bottom - ports.top)),
        _ => None,
    }
}

impl Router<'_> {
    /// The first track's offset, and the room after the last. Each bent cable that reaches a
    /// card keeps the same straight approach as the planner, including any track it detours on.
    fn cable_approaches(&self, nets: &[NetId], rising: bool) -> (f64, f64) {
        let mut first = first_track(rising);
        let mut last = TRACK_BOTTOM;
        for &id in nets {
            let net = self.net(id);
            let half = net.kind.matches(';').count() as f64 * STRAND / 2.0;
            if half == 0.0 || (net.wall.is_none() && abs(net.top_x - net.bottom_x) <= STRAIGHT) {
                continue;
            }
            let room = approach_of(half);
            let on_card =
                |end| net.wall != Some(end) && self.station(net.at(end)).kind == Kind::Card;
            if on_card(End::Top) {
                first = first.max(room - net.track as f64 * LANE);
            }
            if on_card(End::Bottom) {
                let padded = (half / LANE).ceil() * LANE;
                last = last.max(room - padded);
            }
        }
        (first, last)
    }

    /// Whether a line on a channel's first track turns there and rises into the band above.
    fn rises_on_first_track(&self, crossing: &[NetId], rising: &Set<NetId>) -> bool {
        crossing.iter().any(|&id| {
            let net = self.net(id);
            net.track == 0 && rising.contains(&id) && abs(net.top_x - net.bottom_x) > STRAIGHT
        })
    }

    /// How much of a channel's room below its last track a net does not need: the arrow's
    /// approach where it runs on into a lane past the band's top; a lane where it runs on into a
    /// container's door, so a join on the last track stands clear of a hop below it; or a
    /// container's title, where the face it ends on stands lower.
    fn lift_of(&self, net: NetId) -> f64 {
        let station = self.station(self.net(net).bottom);
        let Some(item) = station.item.filter(|_| station.kind == Kind::Card) else {
            return APPROACH_STRAIGHT;
        };
        let door = (self.scene.cards.iter()).any(|(name, &one)| {
            one == item
                && ["pin:", "port:", "stub:"]
                    .iter()
                    .any(|at| name.starts_with(at))
        });
        if door {
            LANE
        } else {
            self.scene.item(item).face_top
        }
    }

    /// Lay out every band and channel again, from the tracks each channel needs.
    pub(crate) fn space_bands(
        &mut self,
        nets: &[NetId],
        rising: &Set<NetId>,
        margin: f64,
        rim: Option<Rim>,
    ) {
        let held: Set<usize> = self
            .scene
            .cards
            .values()
            .chain(self.scene.labels.values())
            .map(|&item| self.scene.item(item).band)
            .collect();
        let mut top = margin;
        for index in 0..self.scene.bands.len() {
            self.scene.bands[index].new_top = top;
            let crossing: Vec<NetId> = nets
                .iter()
                .copied()
                .filter(|&net| self.net(net).channel == index)
                .collect();
            let tracks = self.assign_tracks(&crossing);
            let rises = self.rises_on_first_track(&crossing, rising);
            let (first, last) = self.cable_approaches(&crossing, rises);
            self.scene.bands[index].first_track = first;
            // A band no card or label stands on, which a nonnumeric centre leaves, keeps a region's inset.
            let unheld = crossing.is_empty() && !held.contains(&index);
            let rimmed = if tracks == 0 {
                rim_of(self.scene, index, rim)
            } else {
                None
            };
            let mut channel = rimmed.unwrap_or_else(|| {
                if unheld {
                    REGION_INSET
                } else if self.bus && tracks > 0 {
                    let lifts = crossing.iter().map(|&net| self.lift_of(net));
                    channel_height(tracks, rises) - TRACK_BOTTOM + room_below(lifts)
                } else {
                    channel_height(tracks, rises)
                }
            });
            if tracks > 0 {
                channel += first - first_track(rises) + last - TRACK_BOTTOM;
            }
            if crossing.iter().any(|&id| self.net(id).kind.contains(';')) {
                channel = channel.max(STRAIGHT_RUN);
            }
            let band = self.scene.bands[index];
            top += band.bottom - band.top + channel;
        }
        self.centre_label_bands(nets);
    }

    /// Whether a net leaves a label room.
    fn leaves_room(&self, id: NetId, item: ItemId) -> bool {
        let net = self.net(id);
        let bx = self.scene.item(item).bx;
        let (low, high) = (bx.x - LANE, bx.x + bx.width + LANE);
        if js_max(net.top_x, net.bottom_x) <= low || js_min(net.top_x, net.bottom_x) >= high {
            return true;
        }
        let own =
            self.station(net.top).item == Some(item) || self.station(net.bottom).item == Some(item);
        own && net.wall.is_none() && abs(net.top_x - net.bottom_x) <= STRAIGHT
    }

    /// Whether a row of labels may move into a channel.
    fn clear_for(&self, labels: &[ItemId], nets: &[NetId], channel: usize) -> bool {
        let crossing: Vec<NetId> = nets
            .iter()
            .copied()
            .filter(|&net| self.net(net).channel == channel)
            .collect();
        labels
            .iter()
            .all(|&item| crossing.iter().all(|&net| self.leaves_room(net, item)))
    }

    /// The labels a band holds alone, between two bands.
    fn label_row(&self, index: usize) -> Option<Vec<ItemId>> {
        let scene = &*self.scene;
        if index == 0 || index == scene.bands.len() - 1 {
            return None;
        }
        if scene
            .cards
            .values()
            .any(|&item| scene.item(item).band == index)
        {
            return None;
        }
        let labels: Vec<ItemId> = scene
            .labels
            .values()
            .copied()
            .filter(|&item| scene.item(item).band == index)
            .collect();
        (!labels.is_empty()).then_some(labels)
    }

    /// Stand each band that holds labels alone in the middle of the room
    /// between the bands either side of it, as far as the channel it moves
    /// into is clear of it.
    fn centre_label_bands(&mut self, nets: &[NetId]) {
        for index in 0..self.scene.bands.len() {
            let Some(labels) = self.label_row(index) else {
                continue;
            };
            let bands = &self.scene.bands;
            let (band, upper, lower) = (bands[index], bands[index - 1], bands[index + 1]);
            let above = band.new_top - (upper.new_top + upper.bottom - upper.top);
            let below = lower.new_top - (band.new_top + band.bottom - band.top);
            let up = if self.clear_for(&labels, nets, index - 1) {
                above - EMPTY_CHANNEL
            } else {
                0.0
            };
            let down = if self.clear_for(&labels, nets, index) {
                below - EMPTY_CHANNEL
            } else {
                0.0
            };
            let shift = js_min(down, js_max(-up, (below - above) / 2.0));
            for item in labels {
                self.scene.item_mut(item).bx.y += shift;
            }
        }
    }
}
