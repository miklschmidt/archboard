//! archboard: json0's geometry without its drawing model and attribute copies.
//! Layout clients read only node positions, registered cluster boxes, and named
//! edge paths. Keep their json0 order and five-digit coordinate spelling.

use graphviz_pure_core::{ClusterReg, Graph};
use serde::Serialize;

use crate::emit::output::{bounds, pt};
use crate::emit::y_offset;

#[derive(Serialize)]
struct Geometry {
    bb: String,
    objects: Vec<Object>,
    edges: Vec<Edge>,
}

#[derive(Serialize)]
struct Object {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pos: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bb: Option<String>,
}

#[derive(Serialize)]
struct Edge {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pos: Option<String>,
}

/// The geometry a dot layout client consumes. The caller supplies a laid-out graph.
pub fn render(graph: &Graph) -> String {
    let y = y_offset(graph.bb);
    let mut objects = Vec::with_capacity(graph.subgraphs.len() + graph.nodes.len());
    fn cluster(graph: &Graph, index: usize, y: f64, objects: &mut Vec<Object>) {
        let sub = &graph.subgraphs[index];
        if sub.layout.reg == ClusterReg::Registered {
            objects.push(Object {
                name: graph.subgraph_name(index),
                bb: Some(bounds(sub.bb, y)),
                pos: None,
            });
        }
        for child in &sub.subgraphs {
            cluster(graph, child.0 as usize, y, objects);
        }
    }
    let mut child = vec![false; graph.subgraphs.len()];
    for sub in &graph.subgraphs {
        for id in &sub.subgraphs {
            child[id.0 as usize] = true;
        }
    }
    for (index, child) in child.into_iter().enumerate() {
        if !child {
            cluster(graph, index, y, &mut objects);
        }
    }
    objects.extend(
        graph
            .nodes
            .iter()
            .filter(|n| !n.layout.clust_node)
            .map(|n| Object {
                name: n.name.clone(),
                pos: Some(pt(n.pos, y)),
                bb: None,
            }),
    );
    let edges = graph
        .edges
        .iter()
        .filter_map(|edge| {
            let id = edge.attrs.get("id").filter(|id| !id.is_empty())?.clone();
            let pos = if edge.layout.no_attrs || edge.spline.segments.is_empty() {
                edge.attrs.get("pos").filter(|s| !s.is_empty()).cloned()
            } else {
                let mut pos = String::new();
                for (index, segment) in edge.spline.segments.iter().enumerate() {
                    if index > 0 {
                        pos.push(';');
                    }
                    for (flag, mark, point) in [
                        (segment.sflag, "s,", segment.start_arrow),
                        (segment.eflag, "e,", segment.end_arrow),
                    ] {
                        if flag != 0 {
                            pos.push_str(mark);
                            pos.push_str(&pt(point.unwrap_or_default(), y));
                            pos.push(' ');
                        }
                    }
                    for (index, point) in segment.points.iter().enumerate() {
                        if index > 0 {
                            pos.push(' ');
                        }
                        pos.push_str(&pt(*point, y));
                    }
                }
                Some(pos)
            };
            Some(Edge { id, pos })
        })
        .collect();
    serde_json::to_string(&Geometry {
        bb: bounds(graph.bb, y),
        objects,
        edges,
    })
    .expect("geometry contains only strings")
}
