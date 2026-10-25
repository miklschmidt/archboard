//! Label boxes slide onto their lines (TASK-349).
//!
//! Graphviz puts every label box somewhere on its rank. A line through a box
//! that stands to one side of both its ends has to jog on the way in and on
//! the way out. Here each box slides sideways, within its band, to where both
//! ends could reach it straight, and then to the middle of that stretch where
//! the room allows. Cards, title rows, lanes and frame walls stay where they
//! are; boxes between them keep their spacing and their order, or the order
//! of where they want to be when that crosses fewer lines (`label_runs.rs`).

use crate::constants::{CONTAINER_INSET, LABEL_CARD_CLEARANCE, LABEL_LABEL_CLEARANCE};
use crate::ecma::{abs, js_max, js_min, max, min, number_key, sign, sort_by, sorted_by, via_text};
use crate::geometry::Rect;
use crate::track::chains::{Kind, LANE, StationId, Track};
use crate::track::channels::{End, NetId};
use crate::track::label_runs::{Slider, place_run};
use crate::track::scene::{Item, ItemId, Map, Placement, Set, centre_x};

/// Room kept between a sliding box and a card or lane beside it.
const LABEL_GAP: f64 = LANE;
/// How far a line keeps from a card's corner, as ports do.
const FACE_MARGIN: f64 = 20.0;
/// The bound of a stretch with nothing on one side: beyond any drawing.
const OPEN_REACH: f64 = 1_000_000.0;

/// The label boxes of one band that slide over one stretch, keyed by the
/// stretch's spelling, with the stretch as read back from it.
type Runs = Map<(u64, u64), ((f64, f64), Vec<Slider>)>;

/// Something that stays put on a band, as an interval a box may not enter.
type Wall = (f64, f64);

/// How far the scene's cards, title rows and labels reach, left and right.
pub(crate) fn extent_of(scene: &Placement) -> Wall {
    let boxes: Vec<Rect> = scene
        .cards
        .values()
        .chain(scene.titles.values())
        .chain(scene.labels.values())
        .map(|&item| scene.item(item).bx)
        .collect();
    (
        min(boxes.iter().map(|bx| bx.x)),
        max(boxes.iter().map(|bx| bx.x + bx.width)),
    )
}

/// Everything on the scene a label box keeps a card's clearance from.
fn standing(scene: &Placement, label: &Item) -> Vec<Item> {
    scene
        .cards
        .values()
        .chain(scene.titles.values())
        .map(|&item| *scene.item(item))
        .chain(scene.captions_for(label))
        .collect()
}

/// The walls of every frame and group region a band passes through, widened by the frame's inset.
fn frame_walls_on(scene: &Placement, band: usize) -> Vec<Wall> {
    scene
        .walled(band)
        .values()
        .flat_map(|&(left, right)| {
            [left, right].map(|wall| (wall - CONTAINER_INSET, wall + CONTAINER_INSET))
        })
        .collect()
}

/// What stays put on one band for one label box, widened by the gap a box keeps.
fn walls_on(scene: &Placement, band: usize, lanes: &[f64], label: &Item) -> Vec<Wall> {
    let items: Vec<Item> = standing(scene, label)
        .into_iter()
        .filter(|item| item.band == band)
        .collect();
    let (left, right) = extent_of(scene);
    let mut walls: Vec<Wall> = items
        .iter()
        .map(|item| (item.bx.x - LABEL_GAP, item.bx.x + item.bx.width + LABEL_GAP))
        .collect();
    walls.extend(lanes.iter().map(|&x| (x - LABEL_GAP, x + LABEL_GAP)));
    walls.extend(frame_walls_on(scene, band));
    walls.push((-OPEN_REACH, left));
    walls.push((right, OPEN_REACH));
    sort_by(&mut walls, |one, other| one.0 - other.0);
    walls
}

/// The open stretch of a band a box stands in, between the walls either side of it.
fn stretch_of(walls: &[Wall], item: &Item) -> (f64, f64) {
    let centre = centre_x(item);
    let left = walls
        .iter()
        .filter(|&&(_, high)| high <= centre + 0.5)
        .map(|&(_, high)| high);
    let right = walls
        .iter()
        .filter(|&&(low, _)| low >= centre - 0.5)
        .map(|&(low, _)| low);
    (
        max(std::iter::once(-OPEN_REACH).chain(left)),
        min(std::iter::once(OPEN_REACH).chain(right)),
    )
}

/// The stretch both of a label's ends reach straight, if they share one.
fn face_of(slider: &Slider) -> Option<(f64, f64)> {
    let low = max(slider.reaches.iter().map(|&(one, _)| one));
    let high = min(slider.reaches.iter().map(|&(_, other)| other));
    (low <= high).then_some((low, high))
}

/// Whether a box keeps a gap from every other item on its band.
fn keeps_gap(
    item: (ItemId, &Item),
    bx: &Rect,
    others: impl IntoIterator<Item = (Option<ItemId>, Item)>,
    gap: f64,
) -> bool {
    others
        .into_iter()
        .filter(|(id, other)| *id != Some(item.0) && other.band == item.1.band)
        .all(|(_, other)| {
            let other = other.bx;
            other.x >= bx.x + bx.width + gap || bx.x >= other.x + other.width + gap
        })
}

/// Whether a box stands within a stretch.
fn within(bx: &Rect, stretch: Wall) -> bool {
    bx.x >= stretch.0 && bx.x + bx.width <= stretch.1
}

/// How far a box keeps from a container's wall, on whichever side it stands.
fn keeps_from(bx: &Rect, wall: f64) -> f64 {
    js_max(bx.x - wall, wall - bx.x - bx.width)
}

/// Whether a label box, moved, keeps its room from everything else on its band.
fn clear_on_band(scene: &Placement, item: ItemId, bx: &Rect, lanes: &[f64]) -> bool {
    let label = *scene.item(item);
    keeps_gap(
        (item, &label),
        bx,
        standing(scene, &label).into_iter().map(|one| (None, one)),
        LABEL_CARD_CLEARANCE,
    ) && keeps_gap(
        (item, &label),
        bx,
        scene
            .labels
            .values()
            .map(|&other| (Some(other), *scene.item(other))),
        LABEL_LABEL_CLEARANCE,
    ) && lanes
        .iter()
        .all(|&x| x <= bx.x - LABEL_GAP || x >= bx.x + bx.width + LABEL_GAP)
        && scene
            .walled(label.band)
            .values()
            .flat_map(|&(left, right)| [left, right])
            .all(|wall| {
                keeps_from(bx, wall) >= js_min(CONTAINER_INSET, keeps_from(&label.bx, wall))
            })
        && within(bx, extent_of(scene))
}

impl Track<'_> {
    /// The x a station's line can reach it at: a card's face, the one point
    /// of the card its line is held to, or a single x.
    fn reach(&self, station: StationId) -> (f64, f64) {
        let one = self.station(station);
        if one.kind != Kind::Card {
            let x = self.x(station);
            return (x, x);
        }
        let bx = self.scene.item(one.item.expect("a card")).bx;
        if let Some(at) = one.at {
            return (bx.x + at, bx.x + at);
        }
        let margin = js_min(FACE_MARGIN, bx.width / 2.0);
        (bx.x + margin, bx.x + bx.width - margin)
    }

    /// The x a label's line reaches it at straight from one of its far ends.
    fn reach_from(&self, net: NetId, end: End) -> (f64, f64) {
        if self.shared_at(net, end).is_none() {
            self.reach(self.net(net).at(end))
        } else {
            (-OPEN_REACH, OPEN_REACH)
        }
    }

    /// Where a label box wants its centre.
    fn wanted_centre(&self, item: ItemId, above: NetId, below: NetId) -> f64 {
        let (a, b) = self.reach_from(above, End::Top);
        let (c, d) = self.reach_from(below, End::Bottom);
        let low = js_max(a, c);
        let high = js_min(b, d);
        if low > high {
            return if c > b { b } else { a };
        }
        let port = if self.shared_at(above, End::Top).is_none() {
            self.net(below).bottom_x
        } else {
            self.net(above).top_x
        };
        let shared = self.shared_at(above, End::Top).is_some()
            || self.shared_at(below, End::Bottom).is_some();
        js_min(
            high,
            js_max(
                low,
                if shared {
                    port
                } else {
                    centre_x(self.scene.item(item))
                },
            ),
        )
    }

    /// Which way from a station a line steps back under its card.
    fn inward_from(&self, station: StationId) -> f64 {
        let one = self.station(station);
        let Some(at) = one.at else {
            return 0.0;
        };
        sign(self.scene.item(one.item.expect("a card")).bx.width / 2.0 - at)
    }

    /// Every label box that sits on a line, with where it wants its centre.
    fn sliders_of(&self, nets: &[NetId]) -> Vec<Slider> {
        let mut into: Map<ItemId, NetId> = Map::default();
        let mut out_of: Map<ItemId, NetId> = Map::default();
        for &id in nets {
            let net = self.net(id);
            let (top, bottom) = (self.station(net.top), self.station(net.bottom));
            if bottom.kind == Kind::Label {
                into.insert(bottom.item.expect("a label"), id);
            }
            if top.kind == Kind::Label {
                out_of.insert(top.item.expect("a label"), id);
            }
        }
        into.iter()
            .filter_map(|(&item, &above)| {
                let &below = out_of.get(&item)?;
                Some(Slider {
                    item,
                    wanted: self.wanted_centre(item, above, below),
                    reaches: vec![
                        self.reach_from(above, End::Top),
                        self.reach_from(below, End::Bottom),
                    ],
                    ends: [self.net(above).top_x, self.net(below).bottom_x],
                    inward: self.inward_from(self.net(above).top),
                })
            })
            .collect()
    }

    /// Slide every label box toward where its line can reach it straight,
    /// then move the nets through it with it.
    pub(crate) fn slide_labels(&mut self, nets: &[NetId]) {
        let lanes = self.lanes_by_band(nets);
        let sliders = self.sliders_of(nets);
        for (band, on_band) in lanes.iter().enumerate() {
            let mut runs: Runs = Map::default();
            for slider in sliders
                .iter()
                .filter(|slider| self.scene.item(slider.item).band == band)
            {
                let item = *self.scene.item(slider.item);
                let walls = walls_on(self.scene, band, on_band, &item);
                // The stretch is keyed and read back through its spelling, which loses a negative zero.
                let (low, high) = stretch_of(&walls, &item);
                let key = (number_key(low), number_key(high));
                runs.entry(key)
                    .or_insert_with(|| ((via_text(low), via_text(high)), Vec::new()))
                    .1
                    .push(slider.clone());
            }
            for (_, ((low, high), run)) in runs {
                place_run(self.scene, &run, low, high);
            }
        }
        self.settle_labels(nets);
    }

    /// Settle every label box onto the lane or face its line meets it from,
    /// and move the nets through it with it.
    pub(crate) fn settle_labels(&mut self, nets: &[NetId]) {
        self.settle_on_lanes(nets);
        let sliders = self.sliders_of(nets);
        self.centre_on_faces(nets, &sliders);
        for &id in nets {
            let net = self.net(id).clone();
            if self.station(net.top).kind == Kind::Label {
                self.net_mut(id).top_x = centre_x(
                    self.scene
                        .item(self.station(net.top).item.expect("a label")),
                );
            }
            if self.station(net.bottom).kind == Kind::Label {
                self.net_mut(id).bottom_x = centre_x(
                    self.scene
                        .item(self.station(net.bottom).item.expect("a label")),
                );
            }
        }
    }

    /// Centre each label whose line runs straight on the middle of the stretch
    /// both its ends reach, as near as the free room beside it allows.
    fn centre_on_faces(&mut self, nets: &[NetId], sliders: &[Slider]) {
        let lanes = self.lanes_by_band(nets);
        let ordered = sorted_by(sliders, |one, other| {
            self.scene.item(one.item).bx.x - self.scene.item(other.item).bx.x
        });
        for slider in ordered {
            let Some(face) = face_of(&slider) else {
                continue;
            };
            let item = *self.scene.item(slider.item);
            let labels = self
                .scene
                .labels
                .values()
                .filter(|&&other| other != slider.item && self.scene.item(other).band == item.band)
                .map(|&other| {
                    let bx = self.scene.item(other).bx;
                    (
                        bx.x - LABEL_LABEL_CLEARANCE,
                        bx.x + bx.width + LABEL_LABEL_CLEARANCE,
                    )
                });
            let mut walls = walls_on(self.scene, item.band, &lanes[item.band], &item);
            walls.extend(labels);
            let (left, right) = stretch_of(&walls, &item);
            let half = item.bx.width / 2.0;
            let lowest = js_max(face.0, left + half);
            let highest = js_min(face.1, right - half);
            let centre = centre_x(&item);
            if centre < lowest - 0.5 || centre > highest + 0.5 {
                continue;
            }
            let middle = js_min(highest, js_max(lowest, (face.0 + face.1) / 2.0));
            self.scene.item_mut(slider.item).bx.x = middle - half;
        }
    }

    /// Where a line would meet a label from one of its other stations.
    fn meeting_x(&self, station: StationId, item: ItemId) -> f64 {
        let (low, high) = self.reach(station);
        js_min(high, js_max(low, centre_x(self.scene.item(item))))
    }

    /// Move a label box straight over or under the lane or card face its line
    /// comes from or goes to, when it stands within a jog's width of it and
    /// can move there clear of its neighbours.
    fn settle_on_lanes(&mut self, nets: &[NetId]) {
        let lanes = self.lanes_by_band(nets);
        // In the board's order, so which of two neighbours moves first never depends on the document's.
        let ordered = sorted_by(nets, |&one, &other| {
            self.net(one).order - self.net(other).order
        });
        let below: Vec<(StationId, StationId)> = ordered
            .iter()
            .map(|&net| (self.net(net).top, self.net(net).bottom))
            .collect();
        let above: Vec<(StationId, StationId)> = ordered
            .iter()
            .map(|&net| (self.net(net).bottom, self.net(net).top))
            .collect();
        let pairs: Vec<(StationId, StationId)> = (if self.scene.inline {
            [below, above]
        } else {
            [above, below]
        })
        .concat()
        .into_iter()
        .filter(|&(label, other)| {
            self.station(label).kind == Kind::Label && self.station(other).kind != Kind::Label
        })
        .collect();
        let mut settled: Set<ItemId> = nets
            .iter()
            .filter(|&&net| {
                let net = self.net(net);
                self.station(net.top).at.is_some() && self.station(net.bottom).kind == Kind::Label
            })
            .map(|&net| self.station(self.net(net).bottom).item.expect("a label"))
            .collect();
        for (label, other) in pairs {
            let item = self.station(label).item.expect("a label");
            let shift = self.meeting_x(other, item) - centre_x(self.scene.item(item));
            let bx = self.scene.item(item).bx;
            let moved = Rect {
                x: bx.x + shift,
                ..bx
            };
            let band = self.scene.item(item).band;
            let clear = clear_on_band(self.scene, item, &moved, &lanes[band]);
            if settled.contains(&item) || abs(shift) >= 2.0 * LANE || !clear {
                continue;
            }
            self.scene.item_mut(item).bx = moved;
            settled.insert(item);
        }
    }

    /// Move a label box so its centre stands at an x, when it stays clear of
    /// everything else on its band. Answers whether it moved.
    pub(crate) fn nudge_label(&mut self, nets: &[NetId], item: ItemId, x: f64) -> bool {
        let bx = self.scene.item(item).bx;
        let moved = Rect {
            x: x - bx.width / 2.0,
            ..bx
        };
        let lanes = self.lanes_by_band(nets);
        if !clear_on_band(self.scene, item, &moved, &lanes[self.scene.item(item).band]) {
            return false;
        }
        self.scene.item_mut(item).bx = moved;
        true
    }

    /// Slide a block's own port along the block's edge to an x, when only this
    /// net runs through it, the x is on its stretch, and it keeps a lane from
    /// the block's other sliding ports. Answers whether it moved.
    pub(crate) fn slide_port(&mut self, nets: &[NetId], net: NetId, end: End, x: f64) -> bool {
        let item = self.station(self.net(net).at(end)).item.expect("a port");
        let (low, high) = self.scene.slides[&item];
        let shared = nets.iter().any(|&other| {
            other != net && {
                let one = self.net(other);
                self.station(one.top).item == Some(item)
                    || self.station(one.bottom).item == Some(item)
            }
        });
        let band = self.scene.item(item).band;
        let crowded = self.scene.slides.keys().any(|&other| {
            other != item
                && self.scene.item(other).band == band
                && abs(centre_x(self.scene.item(other)) - x) < LANE
        });
        if x < low || x > high || shared || crowded {
            return false;
        }
        let one = self.scene.item_mut(item);
        one.bx.x = x - one.bx.width / 2.0;
        self.net_mut(net).set_x_at(end, x);
        true
    }

    /// The x of every lane, by the band it passes.
    pub(crate) fn lanes_by_band(&self, nets: &[NetId]) -> Vec<Vec<f64>> {
        let mut lanes: Vec<Vec<f64>> = vec![Vec::new(); self.scene.bands.len()];
        for &id in nets {
            let net = self.net(id);
            // A line to a wall ends on its track: the far end it aims at is no lane.
            let stations = match net.wall {
                Some(End::Bottom) => [Some(net.top), None],
                Some(End::Top) => [Some(net.bottom), None],
                None => [Some(net.top), Some(net.bottom)],
            };
            for station in stations.into_iter().flatten() {
                let one = self.station(station);
                if one.kind == Kind::Lane {
                    lanes[one.band].push(self.x(station));
                }
            }
        }
        lanes
    }
}
