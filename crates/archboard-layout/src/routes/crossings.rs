//! Crossings belong to the final drawing: route and paint order are settled
//! here.
//!
//! Where two lines cross, one of them hops over the other (`hops` says where a
//! hop may stand), and every hop bulges the same way, so two never face each
//! other. The more emphasised line rises; between equals, the line with more
//! straight room, then the later-painted. A dashed or dotted line never rises
//! over a solid one. Crossings along one run closer than a crest's reach are a
//! cluster (`clusters`): its crossers hop it one each where every hop fits,
//! else its line rises over all of it under one crest, else over single
//! crossings of it where it is the upper line at the rest. A crossing no plan
//! settles still hops where a hop fits; where none stands, the two lines cross
//! plainly and both stay whole, and only beside a join is a line cut.

use std::collections::BTreeMap;

use archboard_scene::drawing::{ArchitectureDrawing, Bridged, DrawingBridge, EdgeFacts, NodeFacts};
use archboard_scene::geometry::Curve;
use archboard_scene::request::Dash;

use crate::constants::BEND_RADIUS;
use crate::ecma::{js_min, max, min, round, sign, sorted_by};

use super::clusters::{Cluster, Clusters, at_on, clusters_of, sides_of};
use super::drawn_lines::{
    DrawnCrossing, Edges, Line, drawn_crossings, join_near, piece_of, straight_runs, straightness,
    weight,
};
use super::folded::unfold_crossings;
use super::hops::{
    Bulge, HOP_MARGIN, Hop, HopScene, carried, crest_along, crowded, keepouts_of, look_of,
    near_own_head, passes_beneath, replace_runs,
};
use super::{BRIDGE_RADIUS, LineLook};

/// The straight line a rising line keeps past each foot: a bend's room, so a
/// bend a few points past a hop never draws one squiggle with it.
const FULL_ROOM: f64 = HOP_MARGIN + BEND_RADIUS;

/// The least a rising line keeps past each foot, where no line has a bend's room.
const LEAST_ROOM: f64 = HOP_MARGIN;

/// Straight line on a crossing's shorter side past which a line has all the
/// room a hop could want.
const ROOM_CAP: f64 = BRIDGE_RADIUS + FULL_ROOM;

/// How much straighter one line must run through a crossing to count as the straighter.
const STRAIGHTER: f64 = 0.5;

/// How near a join a cut must be to keep the joining line whole: within a hop's radius.
const JOIN_REACH: f64 = BRIDGE_RADIUS;

/// One run rising over some crossings of one of its clusters, under one hop or crest.
#[derive(Clone, Debug)]
struct Rise {
    cluster: usize,
    crossings: Vec<usize>,
}

/// Rises that stand together or not at all, and the crossings left plain when they do.
#[derive(Clone, Debug)]
struct Plan {
    rises: Vec<Rise>,
    plain: Vec<usize>,
    /// The straight line each rising line keeps past its feet.
    room: f64,
    /// Where it comes in the order plans are tried, lower first.
    key: [f64; 4],
}

/// Everything settling the crossings reads and records.
struct Settling<'a> {
    scene: HopScene<'a>,
    /// How each line is drawn, by relationship id.
    lines: &'a BTreeMap<String, LineLook>,
    crossings: Vec<DrawnCrossing>,
    clusters: Clusters,
    bridges: Vec<DrawingBridge>,
    /// The hops each route's straight segments carry, by segment.
    replacements: Vec<BTreeMap<usize, Vec<Curve>>>,
    settled: Vec<bool>,
}

impl Settling<'_> {
    /// The routes.
    fn edges(&self) -> &Edges {
        &self.scene.drawing.edges
    }

    /// A cluster by its index.
    fn cluster(&self, index: usize) -> &Cluster {
        &self.clusters.all[index]
    }

    /// A crossing's two lines along a cluster: the cluster's, and the one crossing it.
    fn sides(&self, cluster: usize, crossing: usize) -> (&Line, &Line) {
        sides_of(self.cluster(cluster), &self.crossings[crossing])
    }

    /// A crossing's cluster along its other line than a given cluster's.
    fn other_cluster(&self, cluster: usize, crossing: usize) -> usize {
        self.clusters.of[crossing][1 - self.cluster(cluster).side]
    }

    /// Whether a rise may be tried: its crossings are unsettled, and, rising
    /// over part of a cluster, its line would be the upper one at the rest of
    /// it, so it is never above at one crossing of a cluster and beneath at
    /// the next.
    fn open(&self, rise: &Rise) -> bool {
        let cluster = self.cluster(rise.cluster);
        cluster.crossings.iter().all(|&crossing| {
            if rise.crossings.contains(&crossing) {
                !self.settled[crossing]
            } else {
                self.settled[crossing] || usize::from(!self.upper_of(crossing).1) == cluster.side
            }
        })
    }

    /// The crest a rise draws, when it may stand now beside the crests
    /// standing with it.
    fn crest_of(&self, rise: &Rise, room: f64, pending: &[Hop]) -> Option<Curve> {
        if !self.open(rise) {
            return None;
        }
        let runs = &self.scene.runs;
        let run = &runs[self.cluster(rise.cluster).run];
        let places: Vec<f64> = rise
            .crossings
            .iter()
            .map(|&crossing| at_on(run, &self.crossings[crossing]))
            .collect();
        let curve = crest_along(runs, run, &places, room, 1.0)?;
        let beneath: Vec<_> = rise
            .crossings
            .iter()
            .map(|&crossing| &runs[self.sides(rise.cluster, crossing).1.drawer])
            .collect();
        (!(crowded(&self.scene, run, &beneath, &curve, pending)
            || near_own_head(&self.scene, run, &curve)))
        .then_some(curve)
    }

    /// Stand every rise of a plan and leave its plain crossings plain, or do nothing.
    fn attempt(&mut self, plan: &Plan) {
        if plan.plain.iter().any(|&crossing| self.settled[crossing]) {
            return;
        }
        let mut crests: Vec<Hop> = Vec::new();
        for rise in &plan.rises {
            let Some(curve) = self.crest_of(rise, plan.room, &crests) else {
                return;
            };
            let axis = self.scene.runs[self.cluster(rise.cluster).run].axis;
            crests.push(Hop { curve, axis });
        }
        for (rise, crest) in plan.rises.iter().zip(crests) {
            self.stand(rise, crest.curve);
        }
        for &crossing in &plan.plain {
            self.cross(crossing);
        }
    }

    /// Record one standing hop: its bridge, and the hop on every route of the
    /// rising trunk, which `crest_along` found each to hold all of.
    fn stand(&mut self, rise: &Rise, curve: Curve) {
        let run_index = self.cluster(rise.cluster).run;
        for &crossing in &rise.crossings {
            self.settled[crossing] = true;
        }
        let mut under = Vec::new();
        let mut members = Vec::new();
        for &crossing in &rise.crossings {
            let (line, beneath) = self.sides(rise.cluster, crossing);
            under.extend(self.ids_of(beneath));
            members.extend(line.members.iter().copied());
        }
        let edge_id = self.edges()[self.scene.runs[run_index].edge_index]
            .edge
            .id
            .clone();
        self.bridges.push(DrawingBridge {
            edge_id,
            under: unique(under),
            curve: curve.clone(),
            join: None,
        });
        let run = &self.scene.runs[run_index];
        for member in unique(members) {
            let member = &self.scene.runs[member];
            self.replacements[member.edge_index]
                .entry(member.segment_index)
                .or_default()
                .push(carried(&curve, run, member));
        }
        let axis = run.axis;
        self.scene.hops.push(Hop { curve, axis });
    }

    /// The ids of the routes a drawn line holds, each once.
    fn ids_of(&self, line: &Line) -> Vec<String> {
        unique(
            line.members
                .iter()
                .map(|&member| {
                    self.edges()[self.scene.runs[member].edge_index]
                        .edge
                        .id
                        .clone()
                })
                .collect(),
        )
    }

    /// How a line stands when choosing which rises: its emphasis, then whether
    /// it is drawn solid.
    fn standing_of(&self, line: &Line) -> [f64; 2] {
        let edge = &self.edges()[self.scene.runs[line.drawer].edge_index].edge;
        let solid = look_of(self.lines, &edge.id).dash == Dash::Solid;
        [weight(edge.emphasis), if solid { 1.0 } else { 0.0 }]
    }

    /// How far one line stands ahead of another it would rise over, in weight
    /// and in solidity; or nothing where it may not rise over it at all: a
    /// dashed or dotted line over a solid one.
    fn lead_over(&self, upper: &Line, lower: &Line) -> Option<[f64; 2]> {
        let [weight, solid] = self.standing_of(upper);
        let [under, solid_under] = self.standing_of(lower);
        (solid >= solid_under).then_some([weight - under, solid - solid_under])
    }

    /// How much straight room a rise's line has at its crossings, up to all a
    /// hop could want.
    fn room_of(&self, rise: &Rise) -> f64 {
        let runs = &self.scene.runs;
        let run = &runs[self.cluster(rise.cluster).run];
        min(rise.crossings.iter().map(|&crossing| {
            let point = self.crossings[crossing].point;
            js_min(ROOM_CAP, straightness(runs, run, run.axis.of(point)))
        }))
    }

    /// A plan with its place in the order plans are tried: the plans whose
    /// rising lines outweigh the lines beneath them, then those between
    /// equals, then those whose rising lines are lighter; within each, by
    /// stage; then the roomier; then the later-painted. Nothing where a line
    /// in it may not stand over the one beneath it. A plain crossing of the
    /// cluster still has an upper line: the cluster's line, over its crosser.
    fn plan_of(
        &self,
        stage: f64,
        room: f64,
        rises: Vec<Rise>,
        plain: Vec<usize>,
        cluster: Option<usize>,
    ) -> Option<Plan> {
        let mut leads = Vec::new();
        for rise in &rises {
            for &crossing in &rise.crossings {
                let (upper, lower) = self.sides(rise.cluster, crossing);
                leads.push(self.lead_over(upper, lower));
            }
        }
        if let Some(cluster) = cluster {
            for &crossing in &plain {
                let (upper, lower) = self.sides(cluster, crossing);
                leads.push(self.lead_over(upper, lower));
            }
        }
        let leads: Vec<[f64; 2]> = leads.into_iter().collect::<Option<_>>()?;
        let weight = min(leads.iter().map(|lead| lead[0]));
        let roomy =
            min(std::iter::once(ROOM_CAP).chain(rises.iter().map(|rise| self.room_of(rise))));
        let painted = max(std::iter::once(-1.0).chain(
            rises
                .iter()
                .map(|rise| self.scene.runs[self.cluster(rise.cluster).run].edge_index as f64),
        ));
        // Round the room so a hair of floating noise never outranks paint order.
        let key = [-sign(weight), stage, -round(roomy / STRAIGHTER), -painted];
        Some(Plan {
            rises,
            plain,
            room,
            key,
        })
    }

    /// Whether the lines beneath a rise pass beneath it at every crossing of it.
    fn passable(&self, rise: &Rise) -> bool {
        let runs = &self.scene.runs;
        rise.crossings.iter().all(|&crossing| {
            let beneath = &runs[self.sides(rise.cluster, crossing).1.drawer];
            passes_beneath(runs, beneath, self.crossings[crossing].point, 1.0)
        })
    }

    /// The whole of a cluster rising.
    fn whole_of(&self, cluster: usize) -> Rise {
        Rise {
            cluster,
            crossings: self.cluster(cluster).crossings.clone(),
        }
    }

    /// The plan of a cluster's crossers hopping it one each. A dashed crosser
    /// of a solid line may not rise over it, and its crossing is left plain
    /// instead: a solid line under one long crest over dashed lines close
    /// together read worse (the owner, 2026-09-27).
    fn one_each(&self, cluster: usize) -> Option<Plan> {
        let mut rises: Vec<Rise> = Vec::new();
        let mut plain = Vec::new();
        for &crossing in &self.cluster(cluster).crossings {
            let (line, crosser) = self.sides(cluster, crossing);
            if self.lead_over(crosser, line).is_none() {
                plain.push(crossing);
                continue;
            }
            let rise = self.whole_of(self.other_cluster(cluster, crossing));
            if !rises.iter().any(|one| one.cluster == rise.cluster) {
                rises.push(rise);
            }
        }
        self.plan_of(0.0, FULL_ROOM, rises, plain, Some(cluster))
    }

    /// The plans one cluster offers, by stage: its crossers hopping it one
    /// each with a bend's room, or, for a lone crossing no other line crosses
    /// among others, its line hopping it; then its line rising over all of it
    /// with a bend's room, and then with less; last, its line rising over any
    /// single crossing of it with less room. A lone crossing another line
    /// crosses among others waits for that line's cluster to be settled.
    fn plans_of(&self, cluster: usize) -> Vec<Plan> {
        let crossings = &self.cluster(cluster).crossings;
        let several = crossings.len() > 1;
        let alone = !several
            && self
                .cluster(self.other_cluster(cluster, crossings[0]))
                .crossings
                .len()
                == 1;
        let mut plans = Vec::new();
        if several {
            plans.extend(self.one_each(cluster));
        }
        if alone {
            plans.extend(self.plan_of(0.0, FULL_ROOM, vec![self.whole_of(cluster)], vec![], None));
        }
        if several {
            plans.extend(self.plan_of(1.0, FULL_ROOM, vec![self.whole_of(cluster)], vec![], None));
            plans.extend(self.plan_of(2.0, LEAST_ROOM, vec![self.whole_of(cluster)], vec![], None));
        }
        for &crossing in crossings {
            let single = Rise {
                cluster,
                crossings: vec![crossing],
            };
            plans.extend(self.plan_of(3.0, LEAST_ROOM, vec![single], vec![], None));
        }
        plans.retain(|plan| plan.rises.iter().all(|rise| self.passable(rise)));
        plans
    }

    /// Hop a crossing no plan settled: the line that would stay whole where it
    /// is cut rises over it alone first, then the other line, with the least
    /// room; bulging the usual way first, then, where only the other side is
    /// clear of a bend, the other way. A crossing where a line joins or parts
    /// is left to be cut clear of the join. True when a hop stands.
    fn hop_alone(&mut self, crossing: usize) -> bool {
        let (joined, first_stays) = self.upper_of(crossing);
        if joined {
            return false;
        }
        let [first, second] = self.clusters.of[crossing];
        let order = if first_stays {
            [first, second]
        } else {
            [second, first]
        };
        [1.0, -1.0].into_iter().any(|bulge| {
            order
                .into_iter()
                .any(|cluster| self.rise_alone(cluster, crossing, bulge))
        })
    }

    /// Stand one line's hop over a single crossing, where the line has the
    /// least room a hop needs, the line beneath runs straight under it, and
    /// nothing crowds it. True when it stands.
    fn rise_alone(&mut self, cluster: usize, crossing: usize, bulge: Bulge) -> bool {
        let runs = &self.scene.runs;
        let run = &runs[self.cluster(cluster).run];
        let beneath = &runs[self.sides(cluster, crossing).1.drawer];
        let point = self.crossings[crossing].point;
        if !passes_beneath(runs, beneath, point, bulge) {
            return false;
        }
        let place = at_on(run, &self.crossings[crossing]);
        let Some(curve) = crest_along(runs, run, &[place], LEAST_ROOM, bulge) else {
            return false;
        };
        if crowded(&self.scene, run, &[beneath], &curve, &[])
            || near_own_head(&self.scene, run, &curve)
        {
            return false;
        }
        let rise = Rise {
            cluster,
            crossings: vec![crossing],
        };
        self.stand(&rise, curve);
        true
    }

    /// Settle a crossing that no hop stands over. The two lines cross plainly
    /// and both stay whole, since a gap with no arc over it reads as a break in
    /// the line (TASK-408). Only beside a join is a line cut: the line that
    /// joins stays whole, and the other is cut beneath it clear of the join's
    /// mark, so the crossing does not read as a four-way join.
    fn cross(&mut self, crossing: usize) {
        self.settled[crossing] = true;
        let (joined, one_joins) = self.upper_of(crossing);
        if !joined {
            return;
        }
        let [one, other] = &self.crossings[crossing].lines;
        let (upper, lower) = if one_joins {
            (one, other)
        } else {
            (other, one)
        };
        let drawer = &self.scene.runs[upper.drawer];
        let bridge = DrawingBridge {
            edge_id: self.edges()[drawer.edge_index].edge.id.clone(),
            under: self.ids_of(lower),
            curve: piece_of(
                drawer,
                at_on(drawer, &self.crossings[crossing]),
                BRIDGE_RADIUS,
            ),
            join: Some(true),
        };
        self.bridges.push(bridge);
    }

    /// Which of a crossing's two lines would stay whole: a line that joins or
    /// parts there, since cutting it would sever the join from its mark; else
    /// the weightier, the solid, the one that runs straighter through the
    /// crossing, the later-painted. Whether the one staying whole joins there,
    /// and whether it is the first line.
    fn upper_of(&self, crossing: usize) -> (bool, bool) {
        let runs = &self.scene.runs;
        let DrawnCrossing { point, lines } = &self.crossings[crossing];
        let joins = lines.each_ref().map(|line| {
            let drawer = &runs[line.drawer];
            join_near(runs, drawer, drawer.axis.of(*point), JOIN_REACH)
        });
        if joins[0] != joins[1] {
            return (true, joins[0]);
        }
        let [one, other] = lines.each_ref().map(|line| {
            let drawer = &runs[line.drawer];
            let [weight, solid] = self.standing_of(line);
            [
                weight,
                solid,
                straightness(runs, drawer, drawer.axis.of(*point)) / STRAIGHTER,
                drawer.edge_index as f64,
            ]
        });
        let first = one
            .iter()
            .zip(other)
            .find(|&(value, other)| (value - other).abs() >= 1.0);
        (false, first.is_some_and(|(value, other)| *value > other))
    }
}

/// The values without repeats, each where it first stood.
fn unique<T: PartialEq>(values: Vec<T>) -> Vec<T> {
    let mut kept = Vec::new();
    for value in values {
        if !kept.contains(&value) {
            kept.push(value);
        }
    }
    kept
}

/// Compare two plans' places in the order: below zero when `a` goes first.
fn by_key(a: &Plan, b: &Plan) -> f64 {
    a.key
        .iter()
        .zip(b.key)
        .find(|&(value, other)| *value != other)
        .map_or(0.0, |(value, other)| value - other)
}

/// Raises one line over each crossing where a hop fits, and lets the two
/// lines cross plainly wherever none does, on routes whose folded crossings
/// have already moved onto straight runs (`bridgeUnfolded`). No placement
/// moves, and painters and interaction geometry share the resulting curves.
pub(crate) fn bridge_unfolded(
    drawing: &ArchitectureDrawing<NodeFacts, EdgeFacts>,
    lines: &BTreeMap<String, LineLook>,
) -> Bridged<EdgeFacts> {
    let edges = &drawing.edges;
    let runs = straight_runs(edges);
    let crossings = drawn_crossings(edges, &runs);
    let clusters = clusters_of(&runs, &crossings);
    let mut state = Settling {
        scene: HopScene {
            drawing,
            runs,
            keepouts: keepouts_of(drawing, lines),
            hops: Vec::new(),
        },
        lines,
        settled: vec![false; crossings.len()],
        crossings,
        clusters,
        bridges: Vec::new(),
        replacements: vec![BTreeMap::new(); edges.len()],
    };
    let plans: Vec<Plan> = (0..state.clusters.all.len())
        .flat_map(|cluster| state.plans_of(cluster))
        .collect();
    for plan in sorted_by(&plans, by_key) {
        state.attempt(&plan);
    }
    for crossing in 0..state.crossings.len() {
        if !state.settled[crossing] && !state.hop_alone(crossing) {
            state.cross(crossing);
        }
    }
    Bridged {
        edges: edges
            .iter()
            .zip(&state.replacements)
            .map(|(edge, replacements)| replace_runs(edge, replacements))
            .collect(),
        bridges: state.bridges,
    }
}

/// Settles a drawing's crossings (`bridgeCrossings`): a crossing folded into
/// two corners first moves onto straight runs, taking a label on a moved lane
/// along ([`unfold_crossings`]), and then each crossing is hopped or crossed
/// plainly ([`bridge_unfolded`]).
pub(crate) fn bridge_crossings(
    settled: &ArchitectureDrawing<NodeFacts, EdgeFacts>,
    lines: &BTreeMap<String, LineLook>,
) -> Bridged<EdgeFacts> {
    bridge_unfolded(&unfold_crossings(settled), lines)
}
