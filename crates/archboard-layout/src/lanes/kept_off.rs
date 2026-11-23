//! Where a relayed chain's stations may not stand (visual polish): the edges
//! of the scene, and for a label box what stands beside it and the other
//! chains' lanes.

use crate::constants::{LABEL_CARD_CLEARANCE, LABEL_LABEL_CLEARANCE};
use crate::lanes::chains::{ChainId, Kind, LANE, Router, StationId};
use crate::lanes::occupancy::Occupancy;
use crate::lanes::relay::Relay;
use crate::lanes::scene::{ItemId, Placement};
use crate::lanes::sweep::{Span, block};

/// Where a label box's centre may not stand on a band for what stands beside it there.
fn besides_off(scene: &Placement, band: usize, half: f64, spans: &mut Vec<Span>) {
    if let Some(besides) = scene.besides.get(&band) {
        spans.extend(
            besides
                .iter()
                .map(|&(low, high)| (low - LANE - half, high + LANE + half)),
        );
    }
}

impl Relay {
    /// Which columns a station may stand on.
    pub(super) fn free_at(
        &self,
        track: &Router<'_>,
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
        track: &Router<'_>,
        chain: ChainId,
        station: StationId,
        occupancy: &Occupancy,
    ) -> Vec<Span> {
        let one = track.station(station);
        let half = one
            .item
            .map_or(0.0, |item| track.scene.item(item).bx.width / 2.0);
        let (left, right) = self.extent;
        let mut spans = vec![
            (f64::NEG_INFINITY, left + half),
            (right - half, f64::INFINITY),
        ];
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
        track: &Router<'_>,
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
        track: &Router<'_>,
        chain: ChainId,
        label: ItemId,
        band: usize,
    ) -> Vec<Span> {
        let scene = &*track.scene;
        let half = scene.item(label).bx.width / 2.0;
        let solid = scene.cards.values().map(|&one| *scene.item(one));
        let others = scene
            .labels
            .values()
            .filter(|&&one| one != label)
            .map(|&one| *scene.item(one));
        let gapped = solid
            .map(|one| (one, LABEL_CARD_CLEARANCE))
            .chain(others.map(|one| (one, LABEL_LABEL_CLEARANCE)))
            .filter(|(one, _)| one.band == band)
            .map(|(one, gap)| (one.bx.x - gap - half, one.bx.x + one.bx.width + gap + half));
        let mut spans: Vec<Span> = gapped.collect();
        self.lanes_off(track, chain, band, half, &mut spans);
        besides_off(scene, band, half, &mut spans);
        spans
    }
}
