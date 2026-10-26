//! dot's binding of `lib/common/ns.c` (network simplex, `rank`/`rank2`).
//!
//! The algorithm lives in [`crate::common::ns`], generic over
//! [`NsGraph`]; this module implements that trait over dot's fast graph
//! rooted at `GD_nlist(g)` (`ND_in`/`ND_out`, `ND_rank`, `ED_minlen`,
//! `ED_weight` and the tree scratch fields of `NodeInfo`/`EdgeInfo`).
//!
//! archboard: network simplex runs on a dense copy of those fields, taken of every node and
//! edge when `rank2` starts and written back to each of them when it ends, so its searches
//! read a few words for each node and edge instead of a large `NodeInfo` and `EdgeInfo`. It
//! reads and writes nothing else of the graph, so the graph ends as it would without the
//! copy.

use super::Dot;
use super::types::*;
use super::utils::atoi;
use crate::common::ns::{self, NsGraph, SEARCHSIZE};

/// What network simplex reads and writes of one node.
#[derive(Debug, Clone)]
struct NsNode {
    rank: i32,
    priority: i32,
    low: i32,
    lim: i32,
    mark: usize,
    par: Option<E>,
    subtree: Option<usize>,
    tree_in: Vec<E>,
    tree_out: Vec<E>,
    /// The node's in-edges and out-edges: `adjacent[in_at..out_at]` and
    /// `adjacent[out_at..end]`.
    in_at: usize,
    out_at: usize,
    end: usize,
}

/// What network simplex reads and writes of one edge.
#[derive(Debug, Clone, Copy)]
struct NsEdge {
    tail: N,
    head: N,
    minlen: i32,
    weight: i32,
    cutvalue: i32,
    tree_index: i32,
}

/// `graph_t *g` as seen by `ns.c`: dot's arenas, read for the graph's node list, attributes
/// and names, and the copy that network simplex works on.
struct DotNs<'x, 'a> {
    d: &'x Dot<'a>,
    g: G,
    nodes: Vec<NsNode>,
    edges: Vec<NsEdge>,
    adjacent: Vec<E>,
}

impl<'x, 'a> DotNs<'x, 'a> {
    /// The copy of every node and edge of `d`.
    fn of(d: &'x Dot<'a>, g: G) -> Self {
        let mut adjacent = Vec::new();
        let nodes = d
            .nodes
            .iter()
            .map(|node| {
                let in_at = adjacent.len();
                adjacent.extend_from_slice(&node.in_);
                let out_at = adjacent.len();
                adjacent.extend_from_slice(&node.out);
                NsNode {
                    rank: node.rank,
                    priority: node.priority,
                    low: node.low,
                    lim: node.lim,
                    mark: node.mark,
                    par: node.par,
                    subtree: node.subtree,
                    tree_in: node.tree_in.clone(),
                    tree_out: node.tree_out.clone(),
                    in_at,
                    out_at,
                    end: adjacent.len(),
                }
            })
            .collect();
        let edges = d
            .edges
            .iter()
            .map(|edge| NsEdge {
                tail: edge.tail,
                head: edge.head,
                minlen: edge.minlen,
                weight: edge.weight,
                cutvalue: edge.cutvalue,
                tree_index: edge.tree_index,
            })
            .collect();
        DotNs {
            d,
            g,
            nodes,
            edges,
            adjacent,
        }
    }
}

/// What network simplex left of every node and edge, written back to the graph.
struct Left {
    nodes: Vec<NsNode>,
    edges: Vec<NsEdge>,
}

impl Left {
    fn write_back(self, d: &mut Dot<'_>) {
        for (node, left) in d.nodes.iter_mut().zip(self.nodes) {
            node.rank = left.rank;
            node.priority = left.priority;
            node.low = left.low;
            node.lim = left.lim;
            node.mark = left.mark;
            node.par = left.par;
            node.subtree = left.subtree;
            node.tree_in = left.tree_in;
            node.tree_out = left.tree_out;
        }
        for (edge, left) in d.edges.iter_mut().zip(self.edges) {
            edge.cutvalue = left.cutvalue;
            edge.tree_index = left.tree_index;
        }
    }
}

impl NsGraph for DotNs<'_, '_> {
    fn nlist(&self) -> Vec<usize> {
        let mut v = Vec::new();
        let mut n = self.d.graphs[self.g].nlist;
        while let Some(x) = n {
            v.push(x);
            n = self.d.nodes[x].next;
        }
        v
    }
    fn attr(&self, name: &str) -> Option<String> {
        self.d.agget(self.g, name).map(str::to_string)
    }
    fn is_normal(&self, n: usize) -> bool {
        self.d.nodes[n].node_type == NORMAL
    }
    fn dump_name(&self, n: usize) -> String {
        self.d.nodes[n].name.clone()
    }
    fn err_name(&self, n: usize) -> String {
        if self.d.nodes[n].node_type == NORMAL {
            self.d.nodes[n].name.clone()
        } else {
            "%0".to_string()
        }
    }
    fn rank(&self, n: usize) -> i32 {
        self.nodes[n].rank
    }
    fn set_rank(&mut self, n: usize, r: i32) {
        self.nodes[n].rank = r;
    }
    fn set_mark(&mut self, n: usize, m: bool) {
        self.nodes[n].mark = m as usize;
    }
    fn priority(&self, n: usize) -> i32 {
        self.nodes[n].priority
    }
    fn set_priority(&mut self, n: usize, p: i32) {
        self.nodes[n].priority = p;
    }
    fn low(&self, n: usize) -> i32 {
        self.nodes[n].low
    }
    fn set_low(&mut self, n: usize, v: i32) {
        self.nodes[n].low = v;
    }
    fn lim(&self, n: usize) -> i32 {
        self.nodes[n].lim
    }
    fn set_lim(&mut self, n: usize, v: i32) {
        self.nodes[n].lim = v;
    }
    fn par(&self, n: usize) -> Option<usize> {
        self.nodes[n].par
    }
    fn set_par(&mut self, n: usize, e: Option<usize>) {
        self.nodes[n].par = e;
    }
    fn subtree(&self, n: usize) -> Option<usize> {
        self.nodes[n].subtree
    }
    fn set_subtree(&mut self, n: usize, s: Option<usize>) {
        self.nodes[n].subtree = s;
    }
    fn in_edges(&self, n: usize) -> &[usize] {
        let node = &self.nodes[n];
        &self.adjacent[node.in_at..node.out_at]
    }
    fn out_edges(&self, n: usize) -> &[usize] {
        let node = &self.nodes[n];
        &self.adjacent[node.out_at..node.end]
    }
    fn tree_in(&self, n: usize) -> &[usize] {
        &self.nodes[n].tree_in
    }
    fn tree_out(&self, n: usize) -> &[usize] {
        &self.nodes[n].tree_out
    }
    fn tree_in_mut(&mut self, n: usize) -> &mut Vec<usize> {
        &mut self.nodes[n].tree_in
    }
    fn tree_out_mut(&mut self, n: usize) -> &mut Vec<usize> {
        &mut self.nodes[n].tree_out
    }
    fn tail(&self, e: usize) -> usize {
        self.edges[e].tail
    }
    fn head(&self, e: usize) -> usize {
        self.edges[e].head
    }
    fn minlen(&self, e: usize) -> i32 {
        self.edges[e].minlen
    }
    fn weight(&self, e: usize) -> i32 {
        self.edges[e].weight
    }
    fn cutvalue(&self, e: usize) -> i32 {
        self.edges[e].cutvalue
    }
    fn set_cutvalue(&mut self, e: usize, v: i32) {
        self.edges[e].cutvalue = v;
    }
    fn tree_index(&self, e: usize) -> i32 {
        self.edges[e].tree_index
    }
    fn set_tree_index(&mut self, e: usize, v: i32) {
        self.edges[e].tree_index = v;
    }
}

impl Dot<'_> {
    /// `rank2(g, balance, maxiter, search_size)`
    pub fn rank2(
        &mut self,
        g: G,
        balance: i32,
        maxiter: i32,
        search_size: i32,
    ) -> Result<i32, String> {
        let mut copy = DotNs::of(self, g);
        let ranked = ns::rank2(&mut copy, balance, maxiter, search_size);
        let left = Left {
            nodes: copy.nodes,
            edges: copy.edges,
        };
        left.write_back(self);
        ranked
    }

    /// `rank(g, balance, maxiter)`
    pub fn ns_rank(&mut self, g: G, balance: i32, maxiter: i32) -> Result<i32, String> {
        let search_size = match self.agget(g, "searchsize") {
            Some(s) => atoi(s),
            None => SEARCHSIZE,
        };
        self.rank2(g, balance, maxiter, search_size)
    }
}
