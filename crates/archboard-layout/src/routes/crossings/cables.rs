//! A cable's hops over one place bulge one way, so its strands read as one ribbon passing over,
//! never as a tube with its outer strand turned out.

use std::collections::{BTreeMap, BTreeSet};

use archboard_scene::geometry::{Curve, curve_bounds};

use super::super::clusters::at_on;
use super::super::crowding::{crowded, crowding, mark_crowding, near_own_head, own_head_crowding};
use super::super::drawn_lines::{Axis, Passage, Run, line_runs};
use super::super::hops::{
    Bulge, Hop, crest_along, flipped, look_of, overlaps, overlaps_arrowhead, passage_beneath,
};
use super::{FULL_ROOM, LEAST_ROOM, Rise, Settling};
use crate::ecma::{max, min, sign};

impl Settling<'_> {
    /// The cable to which a cluster's line belongs, by the cable's leading line.
    fn cable_of(&self, cluster: usize) -> Option<&str> {
        let run = &self.scene.runs[self.cluster(cluster).run];
        let id = &self.edges()[run.edge_index].edge.id;
        self.riders
            .get(id)
            .or_else(|| {
                self.riders
                    .values()
                    .any(|leader| leader == id)
                    .then_some(id)
            })
            .map(String::as_str)
    }

    /// Make the hops of a cable's strands over one place all bulge the same way, so they read
    /// as one ribbon passing over, never as a tube with its outer strand turned out. The place
    /// turns to a way where no turned hop is crowded, the way most of them bulge first (the
    /// usual way between equals); else each line its hops pass over rises over the ribbon
    /// instead; else it turns to the way that crowds least, as a lone hop with no clear way does
    /// (`force`). A hop turns only where the lines beneath still run straight under it.
    /// A crossed line's end approach counts as crowding, and the hop's own strands never do.
    pub(super) fn align_cables(&mut self) {
        let mut places = self.cable_places();
        places.reverse();
        while let Some(place) = places.pop() {
            if self.align(&place) {
                self.unstand(&place);
                for index in places.iter_mut().flatten() {
                    *index -= place.iter().filter(|&&removed| removed < *index).count();
                }
            }
        }
    }

    /// The clusters a rise crosses, on the lines beneath it.
    fn crossed_clusters<'a>(&'a self, rise: &'a Rise) -> impl Iterator<Item = usize> + 'a {
        rise.crossings
            .iter()
            .map(|&crossing| self.other_cluster(rise.cluster, crossing))
    }

    /// Cable hops sharing a crossing cluster on the line beneath them. A crest can
    /// connect several such clusters when it spans several lines.
    fn cable_places(&self) -> Vec<Vec<usize>> {
        let mut by_crossing = BTreeMap::new();
        let mut links = vec![Vec::new(); self.stood.len()];
        for (index, rise) in self.stood.iter().enumerate() {
            let Some(leader) = self.cable_of(rise.cluster) else {
                continue;
            };
            for other in self.crossed_clusters(rise) {
                let first = *by_crossing.entry((leader, other)).or_insert(index);
                if first != index {
                    links[first].push(index);
                    links[index].push(first);
                }
            }
        }

        connected_hops(&links)
    }

    /// Make the hops of one place of a cable bulge one way (`align_cables`). True where the
    /// lines they pass over rose over the ribbon instead, so the place's hops are to come down.
    fn align(&mut self, place: &[usize]) -> bool {
        let sides: Vec<Bulge> = place
            .iter()
            .map(|&index| bulge_of(&self.scene.hops[index]))
            .collect();
        if sides.iter().all(|side| *side == sides[0]) {
            return false;
        }
        let turnings = self.turnings(place, &sides);
        if let Some((turned, _)) = turnings.iter().find(|(_, nearest)| *nearest > 1.0) {
            self.turn(turned);
            return false;
        }
        if self.over_ribbon(place) {
            return true;
        }
        let least = (turnings.iter()).reduce(|best, one| if one.1 > best.1 { one } else { best });
        if let Some((turned, _)) = least {
            self.turn(turned);
        }
        false
    }

    /// The ways the hops of one place of a cable could all bulge one way (`align_cables`), the
    /// way most of them bulge first: the hops to turn, each with its turned curve, and how near
    /// the most crowded of them comes to what crowds it. Leave out a way where a turned hop
    /// would not pass over its lines.
    fn turnings(&mut self, place: &[usize], sides: &[Bulge]) -> Vec<(Vec<(usize, Curve)>, f64)> {
        let up = sides.iter().filter(|&&one| one > 0.0).count();
        let first = if 2 * up >= sides.len() { 1.0 } else { -1.0 };
        let runs: Vec<usize> = (place.iter())
            .map(|&index| self.cluster(self.stood[index].cluster).run)
            .collect();
        let flips: Vec<Curve> = (place.iter())
            .map(|&index| flipped(&self.scene.hops[index]))
            .collect();
        self.without(place, |settling| {
            [first, -first]
                .into_iter()
                .filter_map(|bulge| {
                    let mut nearest = f64::INFINITY;
                    let turned = (place.iter().zip(sides).zip(&flips))
                        .filter(|&((_, &now), _)| now != bulge)
                        .map(|((&index, _), curve)| {
                            let curve = curve.clone();
                            let near = settling.turned_nearness(index, &curve, bulge, &runs)?;
                            nearest = nearest.min(near);
                            Some((index, curve))
                        })
                        .collect::<Option<Vec<_>>>()?;
                    Some((turned, nearest))
                })
                .collect()
        })
    }

    /// Stand turned hops in place of theirs.
    fn turn(&mut self, turned: &[(usize, Curve)]) {
        for (index, curve) in turned {
            let axis = self.scene.hops[*index].axis;
            self.scene.hops[*index] = Hop::new(curve.clone(), axis);
        }
    }

    /// Where the hops of one place of a cable cannot all bulge one way, each line they pass over
    /// rises over the whole ribbon instead, under one crest, the usual way or else the other.
    /// True when every such crest stands; the place's hops are then to come down.
    fn over_ribbon(&mut self, place: &[usize]) -> bool {
        let mut lines = BTreeMap::<usize, Vec<usize>>::new();
        for &index in place {
            let rise = &self.stood[index];
            for &crossing in &rise.crossings {
                lines
                    .entry(self.other_cluster(rise.cluster, crossing))
                    .or_default()
                    .push(crossing);
            }
        }
        let mut bundles = BTreeMap::<_, Vec<Rise>>::new();
        for (cluster, crossings) in lines {
            let cable = self.cable_of(cluster);
            let group = (cable, cable.is_none().then_some(cluster));
            bundles
                .entry(group)
                .or_default()
                .push(Rise { cluster, crossings });
        }
        let bundles: Vec<_> = bundles
            .into_iter()
            .map(|((cable, _), bundle)| {
                let sides = self.ribbon_sides(cable, &bundle, place);
                (bundle, sides)
            })
            .collect();
        let crests = self.without(place, |settling| {
            let runs = &settling.scene.runs;
            let mut crests = Vec::new();
            let mut pending = Vec::new();
            for (bundle, sides) in bundles {
                let siblings: Vec<_> = bundle
                    .iter()
                    .map(|rise| &runs[settling.cluster(rise.cluster).run])
                    .collect();
                let curves = sides.into_iter().find_map(|bulge| {
                    bundle
                        .iter()
                        .map(|rise| settling.ribbon_crest(rise, bulge, &siblings, &pending))
                        .collect::<Option<Vec<_>>>()
                })?;
                for (rise, curve) in bundle.into_iter().zip(curves) {
                    let axis = runs[settling.cluster(rise.cluster).run].axis;
                    pending.push(Hop::new(curve.clone(), axis));
                    crests.push((rise, curve));
                }
            }
            Some(crests)
        });
        let Some(crests) = crests else {
            return false;
        };
        for (rise, curve) in crests {
            self.stand(&rise, curve);
        }
        true
    }

    /// The sides a bundle can take without making a cable's standing hops disagree
    /// with its new crests over the same crossed clusters.
    fn ribbon_sides(&self, cable: Option<&str>, bundle: &[Rise], replaced: &[usize]) -> Vec<Bulge> {
        let mut sides = vec![1.0, -1.0];
        if let Some(cable) = cable {
            let crossed: BTreeSet<_> = bundle
                .iter()
                .flat_map(|rise| self.crossed_clusters(rise))
                .collect();
            for (index, (rise, hop)) in self.stood.iter().zip(&self.scene.hops).enumerate() {
                if !replaced.contains(&index)
                    && self.cable_of(rise.cluster) == Some(cable)
                    && self
                        .crossed_clusters(rise)
                        .any(|one| crossed.contains(&one))
                {
                    sides.retain(|&side| side == bulge_of(hop));
                }
            }
        }
        sides
    }

    /// A replacement crest on one side of the cable, where the whole rise fits.
    fn ribbon_crest(
        &self,
        rise: &Rise,
        bulge: Bulge,
        siblings: &[&Run],
        pending: &[Hop],
    ) -> Option<Curve> {
        let runs = &self.scene.runs;
        let cluster = self.cluster(rise.cluster);
        let run = &runs[cluster.run];
        let mut beneath = siblings.to_vec();
        for &crossing in &rise.crossings {
            let (upper, lower) = self.sides(rise.cluster, crossing);
            let under = &runs[lower.drawer];
            if !self.risers(crossing).contains(&rise.cluster)
                || self.lead_over(upper, lower).is_none()
                || !passage_beneath(runs, under, self.crossings[crossing].point, bulge).is_clear()
            {
                return None;
            }
            beneath.push(under);
        }
        let places: Vec<f64> = rise
            .crossings
            .iter()
            .map(|&crossing| at_on(run, &self.crossings[crossing]))
            .collect();
        [FULL_ROOM, LEAST_ROOM]
            .into_iter()
            .filter_map(|room| crest_along(runs, run, &places, room, bulge))
            .find(|curve| {
                let feet = [curve.from, curve.end()].map(|point| run.axis.of(point));
                let low = min(feet);
                let high = max(feet);
                let spans_other = cluster.crossings.iter().any(|crossing| {
                    let at = run.axis.of(self.crossings[*crossing].point);
                    at > low && at < high && !rise.crossings.contains(crossing)
                });
                !spans_other
                    && !crowded(&self.scene, run, &beneath, curve, pending)
                    && !near_own_head(&self.scene, run, curve)
                    && mark_crowding(&self.scene, run, curve) > 1.0
            })
    }

    /// How near a hop turned to bulge one way comes to what crowds it, as a share of the clear
    /// space it keeps, its cable's other strands at the place aside. None where it would not
    /// pass over its lines or where it touches a card or mark. An end approach counts as
    /// crowded where the turn has room before the arrowhead.
    fn turned_nearness(
        &self,
        index: usize,
        curve: &Curve,
        bulge: Bulge,
        siblings: &[usize],
    ) -> Option<f64> {
        let rise = &self.stood[index];
        let runs = &self.scene.runs;
        let run = &runs[self.cluster(rise.cluster).run];
        let bounds = curve_bounds(curve);
        if mark_crowding(&self.scene, run, curve) <= 1.0
            || self
                .scene
                .drawing
                .cards
                .iter()
                .any(|card| overlaps(bounds, card.bounds))
        {
            return None;
        }
        let mut approach = f64::INFINITY;
        let mut beneath: Vec<&Run> = Vec::new();
        for &crossing in &rise.crossings {
            let under = &runs[self.sides(rise.cluster, crossing).1.drawer];
            match passage_beneath(runs, under, self.crossings[crossing].point, bulge) {
                Passage::Interrupted => return None,
                Passage::Approach => {
                    if line_runs(runs, under).into_iter().any(|member| {
                        let edge = &self.edges()[member.edge_index];
                        overlaps_arrowhead(edge, look_of(self.lines, &edge.edge.id), bounds)
                    }) {
                        return None;
                    }
                    approach = 1.0;
                }
                Passage::Clear => {}
            }
            beneath.push(under);
        }
        beneath.extend(siblings.iter().map(|&sibling| &runs[sibling]));
        Some(min([
            approach,
            crowding(&self.scene, run, &beneath, curve, &[]),
            own_head_crowding(&self.scene, run, curve),
        ]))
    }
}

/// The groups of standing hops linked by the crossed lines they share.
fn connected_hops(links: &[Vec<usize>]) -> Vec<Vec<usize>> {
    let mut places = Vec::new();
    let mut seen = vec![false; links.len()];
    for index in 0..links.len() {
        if seen[index] || links[index].is_empty() {
            continue;
        }
        let mut place = Vec::new();
        let mut pending = vec![index];
        seen[index] = true;
        while let Some(hop) = pending.pop() {
            place.push(hop);
            for &neighbour in &links[hop] {
                if !seen[neighbour] {
                    seen[neighbour] = true;
                    pending.push(neighbour);
                }
            }
        }
        places.push(place);
    }
    places
}

/// Which way a hop bulges: 1 up from a line across or right of a line down, -1 the other way.
fn bulge_of(hop: &Hop) -> Bulge {
    let crest = hop.curve.segments[0].to();
    match hop.axis {
        Axis::X => sign(hop.curve.from.y - crest.y),
        Axis::Y => sign(crest.x - hop.curve.from.x),
    }
}
