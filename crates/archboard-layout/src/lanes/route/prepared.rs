//! Reusable choice-independent routing prefixes and snapshots for Lanes trials.

use std::rc::Rc;

use crate::lanes::buses::{Buses, gather};
use crate::lanes::chains::{Chain, ChainId, Router, Station, chain_kind};
use crate::lanes::channels::{End, Net, NetId, Trunk};
use crate::lanes::jogs::nothing;
use crate::lanes::scene::{ItemId, Map, Placement, Set};
use crate::lanes::sides::{Choice, Routing};
use crate::lanes::spacing::Rim;

use super::{Routed, SceneLine, routed_of};

/// Snapshot of the mutable router state at an intermediate point in `route_once`.
#[derive(Clone)]
pub(crate) struct RouterSnapshot {
    stations: Vec<Station>,
    chains: Vec<Chain>,
    nets: Vec<Net>,
    trunks: Vec<Trunk>,
    sided: Set<(NetId, End)>,
    loose: Set<NetId>,
}

impl RouterSnapshot {
    fn from_router(track: &Router<'_>) -> Self {
        Self {
            stations: track.stations.clone(),
            chains: track.chains.clone(),
            nets: track.nets.clone(),
            trunks: track.trunks.clone(),
            sided: track.sided.clone(),
            loose: track.loose.clone(),
        }
    }

    fn into_router(self, scene: &mut Placement, bus: bool) -> Router<'_> {
        Router {
            scene,
            stations: self.stations,
            chains: self.chains,
            nets: self.nets,
            trunks: self.trunks,
            bus,
            sided: self.sided,
            loose: self.loose,
        }
    }
}

/// The choice-independent prefix of routing a Lanes block (chains, straightening, relay laps,
/// and net creation), built once and reused across every bus, knot, and side-port trial.
pub(crate) struct Prepared<'l, 'e> {
    pub(crate) base_scene: Placement,
    base_state: RouterSnapshot,
    inner: Vec<&'l SceneLine<'e>>,
    chains: Map<String, ChainId>,
    all: Vec<ChainId>,
    routed: Map<String, Routed>,
    nets: Vec<NetId>,
    routes: Vec<Vec<NetId>>,
    rising: Set<NetId>,
    bus: bool,
}

impl<'l, 'e> Prepared<'l, 'e> {
    /// Run the choice-independent prefix of `route_once` on a copy of `scene`.
    pub(crate) fn new(scene: &Placement, lines: &'l [SceneLine<'e>], bus: bool) -> Self {
        let mut base_scene = scene.clone();
        let mut track = Router::new(&mut base_scene);
        track.bus = bus;
        let inner: Vec<&SceneLine<'_>> = lines.iter().filter(|line| line.wall.is_none()).collect();
        let chains: Map<String, ChainId> = inner
            .iter()
            .map(|line| (line.id.clone(), track.chain_of(line.placed)))
            .collect();
        // A line that enters or leaves its block by a wall comes from or goes to that wall, not its stub.
        let movable: Vec<ChainId> = inner
            .iter()
            .filter(|line| line.enters.is_none() && line.leaves.is_none())
            .map(|line| chains[&line.id])
            .collect();
        let all: Vec<ChainId> = chains.values().copied().collect();
        track.straighten_lanes(&all);
        let kinds: Vec<(ChainId, Rc<str>)> = inner
            .iter()
            .map(|line| {
                let chain = chains[&line.id];
                (
                    chain,
                    chain_kind(&line.kind, track.chain(chain).upward).into(),
                )
            })
            .collect();
        track.relay_laps(&kinds, &movable);
        track.straighten_through_labels(&all);
        let routed = routed_of(&mut track, lines, &inner, &chains);
        let nets: Vec<NetId> = routed
            .values()
            .flat_map(|route| route.nets.iter().copied())
            .collect();
        let routes: Vec<Vec<NetId>> = routed.values().map(|route| route.nets.clone()).collect();
        let rising: Set<NetId> = routed
            .values()
            .filter(|route| route.upward)
            .map(|route| route.nets[0])
            .collect();
        let base_state = RouterSnapshot::from_router(&track);
        Self {
            base_scene,
            base_state,
            inner,
            chains,
            all,
            routed,
            nets,
            routes,
            rising,
            bus,
        }
    }

    /// Snapshot the router after `mark_loose` and `bundle_trunks`, which depend only on `loose`.
    pub(crate) fn post_trunks(&self, loose: &Set<String>) -> RouterSnapshot {
        let mut scratch = self.base_scene.clone();
        let mut track = self.base_state.clone().into_router(&mut scratch, self.bus);
        track.mark_loose(loose, &self.routed);
        track.bundle_trunks(&self.nets);
        RouterSnapshot::from_router(&track)
    }

    /// Run from after `bundle_trunks` up to (but not including) `gather`, returning the snapshot
    /// ready for `finish`.
    pub(crate) fn pre_gather(
        &self,
        scene: &mut Placement,
        post_trunks: &RouterSnapshot,
        reserve: bool,
        choice: &Choice,
    ) -> Result<RouterSnapshot, Map<ItemId, f64>> {
        *scene = self.base_scene.clone();
        let mut track = post_trunks.clone().into_router(scene, self.bus);
        track.mark_sided(&choice.sided, &self.routed);
        let crowded = track.required_port_widths(&self.nets);
        if reserve && !crowded.is_empty() {
            return Err(crowded);
        }
        track.assign_ports(&self.nets);
        track.slide_labels(&self.nets);
        if track.unstrand_lanes(&self.all) {
            track.follow_lanes(&self.nets);
        }
        track.assign_ports(&self.nets);
        track.pull_onto_ports(&self.all, &self.routes, &self.nets);
        track.close_jogs(&self.all, &self.routes, &nothing);
        for route in &self.routes {
            track.settle_straights(route);
        }
        for line in &self.inner {
            let nets = &self.routed[&line.id].nets;
            track.turn_to_wall(line, nets, self.routed[&line.id].upward);
        }
        track.part_and_close(&self.all, &self.routes);
        Ok(RouterSnapshot::from_router(&track))
    }

    /// Run from `gather` through `drawn` using a pre-gather snapshot. Returns the routing and
    /// the post-`space_bands` snapshot.
    pub(crate) fn finish(
        &self,
        scene: &mut Placement,
        pre_gather: &RouterSnapshot,
        (margin, top): (f64, f64),
        rim: Option<Rim>,
        choice: &Choice,
    ) -> (Routing, RouterSnapshot) {
        let mut track = pre_gather.clone().into_router(scene, self.bus);
        let buses = if self.bus {
            gather(
                &mut track,
                (&self.inner, &self.routed, &self.chains),
                &choice.buses,
            )
        } else {
            Buses::default()
        };
        track.follow_sided();
        track.space_bands(&self.nets, &self.rising, top, rim);
        let mut routing = track.drawn(&self.routed, margin);
        routing.buses = buses;
        let done = RouterSnapshot::from_router(&track);
        (routing, done)
    }

    /// Compute the side-port candidates for a finished routing snapshot.
    pub(crate) fn side_candidates_of(
        &self,
        scene: &Placement,
        done: &RouterSnapshot,
        margin: f64,
    ) -> crate::lanes::sides::Sided {
        let mut copy = scene.clone();
        let track = done.clone().into_router(&mut copy, self.bus);
        track.find_side_candidates(&self.routed, margin)
    }
}
