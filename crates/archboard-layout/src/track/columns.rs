//! Columns a line's lanes take either side of straightening each run of them
//! on its own (TASK-349). After lines lapping the drawing are relayed through it,
//! a stepping line with a label is tried on one column from card to card, its
//! label moving with it, on a column no other line holds. It moves only to
//! step fewer times, and never to cross more lines.

use crate::constants::LABEL_CARD_CLEARANCE;
use crate::ecma::{abs, js_max, js_min, or, sorted_by};
use crate::track::chains::{ByBand, ChainId, Kind, LANE, LaneRun, StationId, Track};
use crate::track::labels::extent_of;
use crate::track::occupancy::{Occupancy, nearest};
use crate::track::readings::{Relaid, by_band, on_band};
use crate::track::scene::{Item, Set};

/// What a line costs: the other lines it crosses, then the sideways steps it takes.
type Cost = [f64; 2];

/// A column a line may stand on, and what it costs there.
#[derive(Clone, Copy, Debug)]
struct Placing {
    x: f64,
    cost: Cost,
}

/// The stations of a line between its two cards, and those two cards.
#[derive(Clone, Debug)]
struct Stretch {
    middle: Vec<StationId>,
    before: StationId,
    after: StationId,
}

impl Stretch {
    /// A line's stations, top to bottom.
    fn stations(&self) -> Vec<StationId> {
        std::iter::once(self.before)
            .chain(self.middle.iter().copied())
            .chain([self.after])
            .collect()
    }
}

impl Track<'_> {
    /// Stand every line that has a label on one column from card to card,
    /// where one is free, the one that crosses fewest other lines and then
    /// steps fewest times. Longer lines choose first.
    pub(crate) fn straighten_through_labels(&mut self, chains: &[ChainId]) {
        let mut bands: Vec<ByBand> = chains
            .iter()
            .map(|&chain| by_band(self, &self.chain(chain).stations))
            .collect();
        // A line that already runs without a step keeps its column.
        let stepping: Vec<(ChainId, Stretch)> = chains
            .iter()
            .filter_map(|&chain| {
                let stretch = self.stretch_of(&self.chain(chain).stations)?;
                (self.steps_of(&stretch.stations(), &self.xs_of(&stretch, None)) > 0.0)
                    .then_some((chain, stretch))
            })
            .collect();
        let stepping = sorted_by(&stepping, |one, other| {
            other.1.middle.len() as f64 - one.1.middle.len() as f64
        });
        for (chain, _) in stepping {
            let index = chains
                .iter()
                .position(|&one| one == chain)
                .expect("a chain");
            let others: Vec<StationId> = chains
                .iter()
                .filter(|&&one| one != chain)
                .flat_map(|&one| self.chain(one).stations.iter().copied())
                .filter(|&station| self.station(station).kind == Kind::Lane)
                .collect();
            self.straighten_line(chain, index, &others, &mut bands);
            bands[index] = by_band(self, &self.chain(chain).stations);
        }
    }

    /// Stand one stepping labelled line on the column that serves it best.
    fn straighten_line(
        &mut self,
        chain: ChainId,
        index: usize,
        others: &[StationId],
        bands: &mut [ByBand],
    ) {
        let standing = self
            .stretch_of(&self.chain(chain).stations)
            .expect("a labelled line");
        let was = self.cost_of(&standing.stations(), &self.xs_of(&standing, None), bands);
        let kept = self.line_column(&standing, others, bands, was);
        if let Some(kept) = kept
            && kept.cost[1] == 0.0
        {
            self.stand(&standing, kept.x);
            return;
        }
        let readings = self.readings_of(chain);
        let mut straight: Vec<(Vec<StationId>, Placing)> = Vec::new();
        for stations in readings.into_iter().skip(1) {
            bands[index] = by_band(self, &stations);
            let stretch = self.stretch_of(&stations).expect("a labelled reading");
            let found =
                self.line_column(&stretch, others, bands, kept.map_or(was, |kept| kept.cost));
            bands[index] = by_band(self, &self.chain(chain).stations);
            if let Some(found) = found
                && found.cost[1] == 0.0
            {
                straight.push((stations, found));
            }
        }
        let best = sorted_by(&straight, |one, other| one.1.cost[0] - other.1.cost[0])
            .into_iter()
            .next();
        if let Some((stations, placing)) = best {
            let last = stations.len() - 1;
            let route = stations
                .iter()
                .enumerate()
                .map(|(at, &station)| {
                    if at == 0 || at == last {
                        self.x(station)
                    } else {
                        placing.x
                    }
                })
                .collect();
            self.take(
                chain,
                &Relaid {
                    stations,
                    route,
                    cost: 0.0,
                },
            );
        } else if let Some(kept) = kept {
            self.stand(&standing, kept.x);
        }
    }

    /// Stand a line's stations between its cards on one column.
    fn stand(&mut self, stretch: &Stretch, x: f64) {
        for &station in &stretch.middle {
            self.set_x(station, x);
        }
    }

    /// A line's stations between its cards, when a label is among them.
    fn stretch_of(&self, stations: &[StationId]) -> Option<Stretch> {
        let middle = stations[1..stations.len() - 1].to_vec();
        if !middle
            .iter()
            .any(|&station| self.station(station).kind == Kind::Label)
        {
            return None;
        }
        Some(Stretch {
            middle,
            before: stations[0],
            after: *stations.last().expect("a station"),
        })
    }

    /// The column a labelled line stands on from card to card, and what the
    /// line costs on it, or nothing when none will do.
    fn line_column(
        &self,
        stretch: &Stretch,
        others: &[StationId],
        bands: &[ByBand],
        standing: Cost,
    ) -> Option<Placing> {
        let labels: Vec<StationId> = stretch
            .middle
            .iter()
            .copied()
            .filter(|&station| self.station(station).kind == Kind::Label)
            .collect();
        let without: Set<_> = labels
            .iter()
            .map(|&label| self.station(label).item.expect("a label"))
            .collect();
        let mut occupancy = Occupancy::new(self.scene, &without);
        occupancy.take_all(self, others.iter().copied());
        let fits = self.line_fitting(&mut occupancy, stretch);
        let wanted = self.x(labels[0]);
        let (low, high) = (self.reach_of(stretch.before), self.reach_of(stretch.after));
        let both = (js_max(low.0, high.0), js_min(low.1, high.1));
        let mut columns: Vec<f64> = Vec::new();
        if both.0 <= both.1 {
            columns.push(js_min(both.1, js_max(both.0, wanted)));
        }
        columns.extend(stretch.middle.iter().map(|&station| self.x(station)));
        columns.extend([self.x(stretch.after), self.x(stretch.before)]);
        let free: Vec<f64> = columns.into_iter().filter(|&x| fits(self, x)).collect();
        if let Some(chosen) = self.least_crossing(stretch, &free, bands, standing) {
            return Some(chosen);
        }
        let edges = occupancy.edges(self, &stretch.middle);
        let found = nearest(wanted, |x| fits(self, x), &edges)?;
        self.least_crossing(stretch, &[found], bands, standing)
    }

    /// Of some columns, the one that crosses fewest other lines and then
    /// leaves the line fewest sideways steps, when that is better than where it stands.
    fn least_crossing(
        &self,
        stretch: &Stretch,
        columns: &[f64],
        bands: &[ByBand],
        standing: Cost,
    ) -> Option<Placing> {
        let own = stretch.stations();
        let crossings = self.crossings_for(&own, bands);
        let better: Vec<Placing> = columns
            .iter()
            .map(|&x| {
                let xs = self.xs_of(stretch, Some(x));
                Placing {
                    x,
                    cost: [crossings.count(self, &xs), self.steps_of(&own, &xs)],
                }
            })
            .filter(|placing| placing.cost[0] <= standing[0] && placing.cost[1] < standing[1])
            .collect();
        sorted_by(&better, |one, other| {
            or(one.cost[0] - other.cost[0], one.cost[1] - other.cost[1])
        })
        .into_iter()
        .next()
    }

    /// Where a line's stations stand, top to bottom: where they stand now, or
    /// those between its cards on one column.
    fn xs_of(&self, stretch: &Stretch, column: Option<f64>) -> Vec<f64> {
        std::iter::once(self.x(stretch.before))
            .chain(
                stretch
                    .middle
                    .iter()
                    .map(|&station| column.unwrap_or_else(|| self.x(station))),
            )
            .chain([self.x(stretch.after)])
            .collect()
    }

    /// What a line costs, its stations standing at some x.
    fn cost_of(&self, own: &[StationId], xs: &[f64], bands: &[ByBand]) -> Cost {
        [
            self.crossings_of(own, xs, bands, None),
            self.steps_of(own, xs),
        ]
    }

    /// How many times a line steps sideways between one station and the next.
    fn steps_of(&self, own: &[StationId], xs: &[f64]) -> f64 {
        (0..own.len().saturating_sub(1))
            .filter(|&index| {
                let (above, below) = (xs[index], xs[index + 1]);
                abs(self.meets_at(own[index], below, Some(above))
                    - self.meets_at(own[index + 1], above, Some(below)))
                    > 0.5
            })
            .count() as f64
    }

    /// Whether a line's stations between its cards may all stand on one column.
    fn line_fitting(
        &self,
        occupancy: &mut Occupancy,
        stretch: &Stretch,
    ) -> impl Fn(&Track<'_>, f64) -> bool + use<> {
        let lanes: Vec<StationId> = stretch
            .middle
            .iter()
            .copied()
            .filter(|&station| self.station(station).kind == Kind::Lane)
            .collect();
        let labels: Vec<StationId> = stretch
            .middle
            .iter()
            .copied()
            .filter(|&station| self.station(station).kind == Kind::Label)
            .collect();
        let extent = extent_of(self.scene);
        let fits = occupancy.fitting(
            self,
            &LaneRun {
                lanes,
                before: stretch.before,
                after: stretch.after,
            },
        );
        let rooms: Vec<LabelRoom> = labels
            .iter()
            .map(|&label| self.label_room(occupancy, label))
            .collect();
        move |_, x| fits.passes(x) && rooms.iter().all(|room| room.fits(x, extent))
    }

    /// What a label box keeps clear of on its band, read once for a search
    /// that tries column after column.
    fn label_room(&self, occupancy: &Occupancy, label: StationId) -> LabelRoom {
        let station = self.station(label);
        let own = *self.scene.item(station.item.expect("a label"));
        let item: Item = if own.band == station.band {
            own
        } else {
            on_band(self.scene, &own, station.band)
        };
        let mut taken: Vec<(f64, f64)> = occupancy.taken[station.band].clone();
        // A line drawn straight from a card's side to the wall is no lane, so the band's room does not hold it.
        if let Some(besides) = self.scene.besides.get(&station.band) {
            taken.extend(besides.iter().map(|&(low, high)| (low - LANE, high + LANE)));
        }
        let headings = self
            .scene
            .captions_for(&item)
            .into_iter()
            .chain(self.scene.title_bands_for(&item))
            .map(|one| one.bx)
            .collect();
        LabelRoom {
            width: item.bx.width,
            taken,
            headings,
        }
    }
}

/// [`Track::label_room`]: what a label box keeps clear of on its band.
struct LabelRoom {
    width: f64,
    taken: Vec<(f64, f64)>,
    headings: Vec<crate::geometry::Rect>,
}

impl LabelRoom {
    /// Whether a label box may stand centred on a column.
    fn fits(&self, x: f64, extent: (f64, f64)) -> bool {
        let width = self.width;
        // Everything taken already keeps a lane of its own: with half a lane
        // more, the box stands as far from a line or another label as labels keep apart.
        let half = width / 2.0 + LANE / 2.0;
        let (left, right) = (x - half, x + half);
        self.taken
            .iter()
            .all(|&(low, high)| right <= low || left >= high)
            && x - width / 2.0 >= extent.0
            && x + width / 2.0 <= extent.1
            && self.headings.iter().all(|bx| {
                x + width / 2.0 <= bx.x - LABEL_CARD_CLEARANCE
                    || x - width / 2.0 >= bx.x + bx.width + LABEL_CARD_CLEARANCE
            })
    }
}
