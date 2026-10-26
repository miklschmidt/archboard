//! archboard: not in C. What `reorder` reads of a rank's nodes, copied by the node's place
//! in the rank when the call starts, so its passes read one dense array instead of a large
//! `NodeInfo` per node. `reorder` exchanges places in a permutation of that array and
//! writes the rank back once, as `exchange` would have left it.

use super::Dot;
use super::types::{AdjMatrix, CLUSTER, G, N, VIRTUAL};

/// What `reorder` reads of the node at one place.
#[derive(Debug, Clone, Copy)]
pub(super) struct Place<'a> {
    pub(super) node: N,
    /// `ND_order`, which the place keeps.
    order: i32,
    /// `ND_mval`.
    pub(super) mval: f64,
    /// `ND_clust`.
    pub(super) clust: Option<G>,
    /// `ND_ranktype == CLUSTER && ND_node_type == VIRTUAL`.
    cluster_virtual: bool,
    /// `ND_low`, which indexes the rank's flat adjacency matrix.
    low: usize,
    /// The flat adjacency matrix of the node's rank.
    flat: Option<&'a AdjMatrix>,
}

/// A rank's nodes as `reorder` reads them, by their place when the copy was made.
#[derive(Debug)]
pub(super) struct RankCopy<'a> {
    pub(super) places: Vec<Place<'a>>,
    remincross: bool,
    flip: bool,
}

impl<'a> RankCopy<'a> {
    /// The nodes of rank `r` of `g`.
    pub(super) fn of(dot: &'a Dot<'_>, g: G, r: i32) -> Self {
        let places = (0..dot.rank_n(g, r))
            .map(|i| {
                let node = dot.rv(g, r, i).unwrap();
                let info = &dot.nodes[node];
                Place {
                    node,
                    order: info.order,
                    mval: info.mval,
                    clust: info.clust,
                    cluster_virtual: info.ranktype == CLUSTER && info.node_type == VIRTUAL,
                    low: info.low as usize,
                    flat: dot.rk(g, info.rank).flat.as_ref(),
                }
            })
            .collect();
        RankCopy {
            places,
            remincross: dot.remincross,
            flip: dot.graphs[g].flip(),
        }
    }

    /// `left2right(g, v, w)` of the nodes first at places `v` and `w`.
    pub(super) fn left2right(&self, v: usize, w: usize) -> bool {
        let (pv, pw) = (&self.places[v], &self.places[w]);
        if !self.remincross {
            if pv.clust != pw.clust && pv.clust.is_some() && pw.clust.is_some() {
                if pv.cluster_virtual {
                    return false;
                }
                if pw.cluster_virtual {
                    return false;
                }
                return true;
            }
        } else if pv.clust != pw.clust {
            return true;
        }
        let Some(m) = pv.flat else {
            return false;
        };
        let (a, b) = if self.flip { (pw, pv) } else { (pv, pw) };
        m.get(a.low, b.low)
    }

    /// The node and the `ND_order` of each place, once the copy's borrow of the graph
    /// must end.
    pub(super) fn into_places(self) -> Vec<(N, i32)> {
        self.places.iter().map(|p| (p.node, p.order)).collect()
    }
}

impl Dot<'_> {
    /// Writes rank `r` of `g` back with the node first at place `at[i]` now at place `i`,
    /// each with the `ND_order` of its new place, as `exchange` leaves them.
    pub(super) fn write_rank(&mut self, g: G, r: i32, places: &[(N, i32)], at: &[usize]) {
        for (i, &from) in at.iter().enumerate() {
            if from != i {
                let n = places[from].0;
                self.nodes[n].order = places[i].1;
                self.set_rv(g, r, i as i32, Some(n));
            }
        }
    }
}
