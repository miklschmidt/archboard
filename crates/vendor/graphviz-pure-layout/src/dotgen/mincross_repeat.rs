//! archboard: not in C. A pass of `mincross` runs up to `MaxIter` iterations, and each
//! iteration is the same map of what the one before left: the order of every rank of the
//! graph, the crossing counts that `ncross` keeps (stale ones included, as C keeps them),
//! and `iter % 4`, which picks the step's direction and whether it exchanges ties. Once an
//! iteration leaves what an earlier one with the same `iter % 4` left, the iterations after
//! it repeat the ones after that earlier one, with the same crossings. The rest of the pass
//! is then decided by those crossings alone, so the port plays it out on the recorded
//! crossings and puts back what C's last iteration and last `save_best` left, instead of
//! running the iterations again.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use super::Dot;
use super::types::{G, N};

/// What one iteration of a pass left.
#[derive(Debug)]
pub(super) struct Left {
    /// `iter % 4`.
    phase: i32,
    /// A hash of `phase`, `nodes`, `orders` and the valid entries of `cache`.
    hash: u64,
    /// The graph's ranks, rank by rank, each in its order.
    nodes: Vec<N>,
    /// `ND_order` of each node of `nodes`.
    orders: Vec<i32>,
    /// `mval` of each node of `nodes`: not read by the next iteration, but left for later
    /// phases.
    mvals: Vec<f64>,
    /// `valid` and `cache_nc` of every rank of the root.
    cache: Vec<(bool, i64)>,
    /// What `ncross` answered after the iteration.
    pub(super) cross: i64,
}

impl Left {
    /// Whether the next iteration reads the same from both.
    fn same(&self, other: &Left) -> bool {
        self.phase == other.phase
            && self.hash == other.hash
            && self.nodes == other.nodes
            && self.orders == other.orders
            && self
                .cache
                .iter()
                .zip(&other.cache)
                .all(|(a, b)| a.0 == b.0 && (!a.0 || a.1 == b.1))
    }
}

/// What every iteration of a pass left, by iteration.
#[derive(Debug, Default)]
pub(super) struct Repeats {
    pub(super) left: Vec<Left>,
}

impl Dot<'_> {
    /// Records what iteration `iter` left, and answers the earlier iteration that left the
    /// same, if there is one.
    pub(super) fn repeated(
        &self,
        repeats: &mut Repeats,
        g: G,
        iter: i32,
        cross: i64,
    ) -> Option<usize> {
        let (minr, maxr) = (self.graphs[g].minrank, self.graphs[g].maxrank);
        let mut nodes = Vec::new();
        for r in minr..=maxr {
            for i in 0..self.rank_n(g, r) {
                nodes.push(self.rv(g, r, i).unwrap());
            }
        }
        let orders: Vec<i32> = nodes.iter().map(|&n| self.nodes[n].order).collect();
        let mvals: Vec<f64> = nodes.iter().map(|&n| self.nodes[n].mval).collect();
        let cache: Vec<(bool, i64)> = (self.graphs[0].minrank..=self.graphs[0].maxrank)
            .map(|r| {
                let rk = self.rk(0, r);
                (rk.valid, rk.cache_nc)
            })
            .collect();
        let phase = iter % 4;
        let mut hasher = DefaultHasher::new();
        phase.hash(&mut hasher);
        nodes.hash(&mut hasher);
        orders.hash(&mut hasher);
        for &(valid, nc) in &cache {
            valid.hash(&mut hasher);
            if valid {
                nc.hash(&mut hasher);
            }
        }
        let left = Left {
            phase,
            hash: hasher.finish(),
            nodes,
            orders,
            mvals,
            cache,
            cross,
        };
        let found = repeats.left.iter().position(|earlier| earlier.same(&left));
        repeats.left.push(left);
        found
    }

    /// Puts the graph's ranks, their nodes' `mval` and the root's crossing caches back as
    /// an iteration left them.
    pub(super) fn put_back(&mut self, g: G, left: &Left) {
        let (minr, maxr) = (self.graphs[g].minrank, self.graphs[g].maxrank);
        let mut k = 0;
        for r in minr..=maxr {
            for i in 0..self.rank_n(g, r) {
                let n = left.nodes[k];
                self.set_rv(g, r, i, Some(n));
                self.nodes[n].order = left.orders[k];
                self.nodes[n].mval = left.mvals[k];
                k += 1;
            }
        }
        for (r, &(valid, nc)) in (self.graphs[0].minrank..).zip(&left.cache) {
            let rk = self.rk_mut(0, r);
            rk.valid = valid;
            rk.cache_nc = nc;
        }
    }

    /// `save_best` of what an iteration left.
    pub(super) fn save_as_best(&mut self, left: &Left) {
        for (&n, &order) in left.nodes.iter().zip(&left.orders) {
            self.nodes[n].coord.x = f64::from(order);
        }
    }
}
