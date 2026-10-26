//! archboard: not in C. What `reorder` reads of a rank's nodes, copied into arrays by the
//! node's place in the rank when the call starts, so its passes read a few dense arrays
//! instead of a large `NodeInfo` per node. `reorder` exchanges places in a permutation of
//! those arrays and writes the rank back once, as `exchange` would have left it.

use super::Dot;
use super::types::{AdjMatrix, CLUSTER, G, N, VIRTUAL};

/// A rank's nodes as `reorder` reads them, by their place when the copy was made.
#[derive(Debug)]
pub(super) struct RankCopy<'a> {
    /// The node at each place.
    pub(super) nodes: Vec<N>,
    /// `ND_order` of the node at each place, which the place keeps.
    orders: Vec<i32>,
    /// `ND_mval`.
    pub(super) mval: Vec<f64>,
    /// `ND_clust`.
    pub(super) clust: Vec<Option<G>>,
    /// `ND_ranktype == CLUSTER && ND_node_type == VIRTUAL`.
    cluster_virtual: Vec<bool>,
    /// `ND_low`, which indexes the rank's flat adjacency matrix.
    low: Vec<usize>,
    /// The flat adjacency matrix of each node's rank.
    flat: Vec<Option<&'a AdjMatrix>>,
    remincross: bool,
    flip: bool,
}

impl<'a> RankCopy<'a> {
    /// The nodes of rank `r` of `g`.
    pub(super) fn of(dot: &'a Dot<'_>, g: G, r: i32) -> Self {
        let nodes: Vec<N> = (0..dot.rank_n(g, r))
            .map(|i| dot.rv(g, r, i).unwrap())
            .collect();
        let info = |n: N| &dot.nodes[n];
        RankCopy {
            orders: nodes.iter().map(|&n| info(n).order).collect(),
            mval: nodes.iter().map(|&n| info(n).mval).collect(),
            clust: nodes.iter().map(|&n| info(n).clust).collect(),
            cluster_virtual: nodes
                .iter()
                .map(|&n| info(n).ranktype == CLUSTER && info(n).node_type == VIRTUAL)
                .collect(),
            low: nodes.iter().map(|&n| info(n).low as usize).collect(),
            flat: nodes
                .iter()
                .map(|&n| dot.rk(g, info(n).rank).flat.as_ref())
                .collect(),
            remincross: dot.remincross,
            flip: dot.graphs[g].flip(),
            nodes,
        }
    }

    /// `left2right(g, v, w)` of the nodes first at places `v` and `w`.
    pub(super) fn left2right(&self, v: usize, w: usize) -> bool {
        if !self.remincross {
            let (cv, cw) = (self.clust[v], self.clust[w]);
            if cv != cw && cv.is_some() && cw.is_some() {
                if self.cluster_virtual[v] {
                    return false;
                }
                if self.cluster_virtual[w] {
                    return false;
                }
                return true;
            }
        } else if self.clust[v] != self.clust[w] {
            return true;
        }
        let Some(m) = self.flat[v] else {
            return false;
        };
        let (a, b) = if self.flip { (w, v) } else { (v, w) };
        m.get(self.low[a], self.low[b])
    }
}

impl Dot<'_> {
    /// Writes rank `r` of `g` back with the node first at place `order[i]` now at place
    /// `i`, each with the `ND_order` of its new place, as `exchange` leaves them.
    pub(super) fn write_rank(&mut self, g: G, r: i32, nodes: &[N], orders: &[i32], order: &[usize]) {
        for (i, &from) in order.iter().enumerate() {
            if from != i {
                let n = nodes[from];
                self.nodes[n].order = orders[i];
                self.set_rv(g, r, i as i32, Some(n));
            }
        }
    }
}

impl RankCopy<'_> {
    /// The parts `write_rank` needs, once the copy's borrow of the graph must end.
    pub(super) fn into_places(self) -> (Vec<N>, Vec<i32>) {
        (self.nodes, self.orders)
    }
}
