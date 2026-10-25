//! Where a relayed chain's stations may not stand (visual polish): the walls
//! of the frames it was not inside, the edges of the scene, and for a label
//! box what stands beside it, the other chains' lanes and the group regions
//! that would hold it.

use crate::constants::{CONTAINER_INSET, LABEL_CARD_CLEARANCE, LABEL_LABEL_CLEARANCE};
use crate::track::chains::{ChainId, Kind, LANE, StationId, Track};
use crate::track::occupancy::Occupancy;
use crate::track::readings::on_band;
use crate::track::relay::Relay;
use crate::track::scene::{Item, ItemId, Placement, Set};
use crate::track::sweep::{EDGE, Span, block};

impl Track<'_> {
    /// The frames a chain's two ends stand inside.
    fn end_frames(&self, chain: ChainId) -> Set<String> {
        let stations = &self.chain(chain).stations;
        let mut frames = Set::default();
        for end in [stations[0], *stations.last().expect("a station")] {
            let (band, x) = (self.station(end).band, self.x(end));
            for (id, (low, high)) in self.scene.frame_walls(band) {
                if x > low && x < high {
                    frames.insert(id);
                }
            }
        }
        frames
    }

    /// Where a station may not stand for the frames it stood in.
    fn frames_off(&self, station: StationId, open: &Set<String>) -> Vec<Span> {
        let x = self.x(station);
        let mut spans = Vec::new();
        for (id, (low, high)) in self.scene.frame_walls(self.station(station).band) {
            if x > low && x < high {
                spans.push((f64::NEG_INFINITY, low + EDGE));
                spans.push((high - EDGE, f64::INFINITY));
            } else if !open.contains(&id) {
                spans.push((low, high));
            }
        }
        spans
    }
}
/// Where a label box's centre may not stand on a band for what stands beside
/// it there and for the walls of the containers on it.
fn walls_off(scene: &Placement, band: usize, half: f64, spans: &mut Vec<Span>) {
    if let Some(besides) = scene.besides.get(&band) {
        spans.extend(
            besides
                .iter()
                .map(|&(low, high)| (low - LANE - half, high + LANE + half)),
        );
    }
    for &(low, high) in scene.walled(band).values() {
        for wall in [low, high] {
            spans.push((wall - CONTAINER_INSET - half, wall + CONTAINER_INSET + half));
        }
    }
}

impl Relay {
    /// Which columns a station may stand on.
    pub(super) fn free_at(
        &self,
        track: &Track<'_>,
        chain: ChainId,
        station: StationId,
        xs: &[f64],
        occupancy: &Occupancy,
    ) -> Vec<bool> {
        let mut free = vec![true; xs.len()];
        for span in self.kept_off(track, chain, station, occupancy) {
            block(&mut free, xs, span);
        }
        free
    }

    /// Where a station may not stand.
    fn kept_off(
        &self,
        track: &Track<'_>,
        chain: ChainId,
        station: StationId,
        occupancy: &Occupancy,
    ) -> Vec<Span> {
        let one = track.station(station);
        let half = one
            .item
            .map_or(0.0, |item| track.scene.item(item).bx.width / 2.0);
        let (left, right) = self.extent;
        let mut spans = track.frames_off(station, &track.end_frames(chain));
        spans.push((f64::NEG_INFINITY, left + half));
        spans.push((right - half, f64::INFINITY));
        match one.item {
            None => spans.extend(occupancy.taken[one.band].iter().copied()),
            Some(item) => spans.extend(self.label_walls(track, chain, item, one.band)),
        }
        spans
    }

    /// Where a label box's centre may not stand on its band for the lanes of
    /// the other chains there.
    fn lanes_off(
        &self,
        track: &Track<'_>,
        chain: ChainId,
        band: usize,
        half: f64,
        spans: &mut Vec<Span>,
    ) {
        for &other in self.chains.iter().filter(|&&other| other != chain) {
            for &station in &track.chain(other).stations {
                let one = track.station(station);
                if one.kind == Kind::Lane && one.band == band {
                    let x = track.x(station);
                    spans.push((x - LANE - half, x + LANE + half));
                }
            }
        }
    }

    /// Where a label box's centre may not stand on its band.
    fn label_walls(
        &self,
        track: &Track<'_>,
        chain: ChainId,
        label: ItemId,
        band: usize,
    ) -> Vec<Span> {
        let scene = &*track.scene;
        let item = *scene.item(label);
        let half = item.bx.width / 2.0;
        let placed = if band == item.band {
            item
        } else {
            on_band(scene, &item, band)
        };
        let solid: Vec<Item> = scene
            .cards
            .values()
            .chain(scene.titles.values())
            .map(|&one| *scene.item(one))
            .chain(scene.captions_for(&placed))
            .collect();
        let others = scene
            .labels
            .values()
            .filter(|&&one| one != label)
            .map(|&one| *scene.item(one));
        let gapped = solid
            .into_iter()
            .map(|one| (one, LABEL_CARD_CLEARANCE))
            .chain(others.map(|one| (one, LABEL_LABEL_CLEARANCE)))
            .filter(|(one, _)| one.band == band)
            .map(|(one, gap)| (one.bx.x - gap - half, one.bx.x + one.bx.width + gap + half));
        let mut spans: Vec<Span> = gapped.collect();
        self.lanes_off(track, chain, band, half, &mut spans);
        walls_off(scene, band, half, &mut spans);
        let stations = &track.chain(chain).stations;
        let (from, to) = (
            track.spot(stations[0]),
            track.spot(*stations.last().expect("a station")),
        );
        spans.extend(scene.regions_off(from, to, &item, band));
        spans
    }
}
