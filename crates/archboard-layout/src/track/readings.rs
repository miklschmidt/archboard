//! A labelled line read with its label box on another band (visual polish).
//! Graphviz ranks a label on one band of its line, and its only free slot
//! there may lie far off the line's column where the band above or below had
//! room on it; the relay tries each reading and keeps the cheapest route.

use crate::ecma::abs;
use crate::geometry::Rect;
use crate::track::chains::{ByBand, ChainId, Kind, Station, StationId, Track};
use crate::track::scene::{Item, ItemId, Placement};

/// A chain's route relaid: its stations, where each stands, and what it costs.
#[derive(Clone, Debug)]
pub(crate) struct Relaid {
    pub stations: Vec<StationId>,
    pub route: Vec<f64>,
    pub cost: f64,
}

/// A chain's stations by band.
pub(crate) fn by_band(track: &Track<'_>, stations: &[StationId]) -> ByBand {
    stations
        .iter()
        .map(|&station| (track.station(station).band, station))
        .collect()
}

/// A label box moved onto another band, centred on it.
pub(crate) fn on_band(scene: &Placement, label: &Item, band: usize) -> Item {
    let (top, bottom) = (scene.bands[band].top, scene.bands[band].bottom);
    Item::new(
        Rect {
            y: (top + bottom - label.bx.height) / 2.0,
            ..label.bx
        },
        band,
    )
}

impl Track<'_> {
    /// The ways a chain's stations may be read: as they stand, and, when it
    /// has a label box, with the box on the band above or below between its
    /// ends, where that band is tall enough to hold it, and a lane where the
    /// box stood. The standing one comes first.
    pub(crate) fn readings_of(&mut self, chain: ChainId) -> Vec<Vec<StationId>> {
        let stations = self.chain(chain).stations.clone();
        let Some(&label) = stations
            .iter()
            .find(|&&station| self.station(station).kind == Kind::Label)
        else {
            return vec![stations];
        };
        let item = self.station(label).item.expect("a label's box");
        let label_band = self.station(label).band;
        let height = self.scene.item(item).bx.height;
        let moved: Vec<StationId> = stations[1..stations.len() - 1]
            .iter()
            .copied()
            .filter(|&station| {
                let band = self.station(station).band;
                let (top, bottom) = (self.scene.bands[band].top, self.scene.bands[band].bottom);
                abs(band as f64 - label_band as f64) == 1.0 && height <= bottom - top
            })
            .collect();
        let mut readings = vec![stations.clone()];
        for lane in moved {
            let reading = stations
                .iter()
                .map(|&station| {
                    if station == lane {
                        let x = self.x(lane);
                        return self.add(Station::new(
                            Kind::Label,
                            self.station(lane).band,
                            Some(item),
                            x,
                        ));
                    }
                    if station == label {
                        let x = self.x(label);
                        return self.add(Station::new(Kind::Lane, label_band, None, x));
                    }
                    station
                })
                .collect();
            readings.push(reading);
        }
        readings
    }

    /// Put a chain on its relaid route: its stations, its label box moved onto
    /// its station's band where the reading moved it, and each station between
    /// its ends at its x, a label box's moving with it.
    pub(crate) fn take(&mut self, chain: ChainId, relaid: &Relaid) {
        let stations: Vec<StationId> = relaid
            .stations
            .iter()
            .map(|&station| {
                let one = *self.station(station);
                match one.item {
                    Some(item)
                        if one.kind == Kind::Label && self.scene.item(item).band != one.band =>
                    {
                        self.move_label(item, one.band)
                    }
                    _ => station,
                }
            })
            .collect();
        self.chains[chain.0].stations = stations.clone();
        for (index, &station) in stations[1..stations.len() - 1].iter().enumerate() {
            self.set_x(station, relaid.route[index + 1]);
        }
    }

    /// Move a label box onto another band, centred on it, and answer its station there.
    fn move_label(&mut self, item: ItemId, band: usize) -> StationId {
        let moved = on_band(self.scene, self.scene.item(item), band).bx;
        let one = self.scene.item_mut(item);
        one.bx = moved;
        one.band = band;
        self.label_station(item, band)
    }
}
