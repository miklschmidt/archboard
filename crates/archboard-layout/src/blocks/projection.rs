//! Where a relationship is drawn and the lines it is given (TASK-349): the
//! lowest block that holds both its ends, the ports it crosses on the edge of
//! every block between, and the lines that carry it in each of them. It also
//! finds the relationships that run upward, because they close a cycle, and
//! which of those that join on the way to one card keep a label or ports of
//! their own.

use std::rc::Rc;

use crate::geometry::Side;
use crate::graph::Edge;
use crate::track::route::trunk_kind;
use crate::track::scene::{Map, Set};

use super::cycles::CycleWalk;
use super::tree::{
    BlockId, BlockTree, ClusterKind, Ends, Kind, Line, Piece, Pin, Projection, Route, exit_key,
    header_of, holds,
};

impl BlockTree {
    /// A parent is its measured header inside its own block, like a member card.
    fn endpoint_of(&self, id: &str, inside: bool) -> (String, Vec<BlockId>) {
        let mut chain = self.above(id);
        if let Some(block) = self
            .block_of(id)
            .filter(|_| inside)
            .filter(|&block| self.get(block).kind == Kind::Frame)
        {
            chain.insert(0, block);
            (header_of(self.get(block)), chain)
        } else {
            (id.to_owned(), chain)
        }
    }

    /// Project both visible cards through the lowest block that holds them.
    pub(super) fn project(&self, edge: Rc<Edge>) -> Result<Projection, String> {
        let source_inside = self.block_of(edge.source()).is_some_and(|block| {
            self.above(edge.target()).contains(&block) || edge.label_count() > 0
        });
        let (source, from_chain) = self.endpoint_of(edge.source(), source_inside);
        let (target, to_chain) = self.endpoint_of(edge.target(), true);
        let at = *from_chain
            .iter()
            .find(|block| to_chain.contains(block))
            .ok_or_else(|| {
                format!(
                    "Relationship {} names a node the board does not hold.",
                    edge.id
                )
            })?;
        let out = from_chain[..from_chain.iter().position(|&one| one == at).unwrap_or(0)].to_vec();
        let into = to_chain[..to_chain.iter().position(|&one| one == at).unwrap_or(0)].to_vec();
        let from = out
            .last()
            .map_or(source, |&outer| self.get(outer).id.clone());
        let to = into
            .last()
            .map_or(target, |&outer| self.get(outer).id.clone());
        Ok(Projection {
            edge,
            at,
            out,
            into,
            from,
            to,
        })
    }

    /// The relationships that close a cycle in the block they are drawn in,
    /// found depth-first from the items nothing points at, in the board's
    /// order. A line into its own container runs upward.
    pub(crate) fn back_edges(&self) -> Set<String> {
        let mut back = Set::default();
        for &block in self.blocks.values() {
            back.extend(self.back_edges_in(block));
        }
        back
    }

    /// The relationships that close a cycle in one block.
    fn back_edges_in(&self, id: BlockId) -> Set<String> {
        let block = self.get(id);
        let here: Vec<&Projection> = self
            .projections
            .iter()
            .filter(|projection| projection.at == id)
            .collect();
        let header = header_of(block);
        let upward: Vec<bool> = here
            .iter()
            .map(|projection| {
                projection.to == header || holds(block, &projection.to, &projection.from)
            })
            .collect();
        let mut walk = CycleWalk::default();
        for (projection, &up) in here.iter().zip(&upward) {
            if !up {
                walk.add(&projection.from, &projection.to, Some(&projection.edge.id));
            }
        }
        let containment: Vec<(String, String)> = block
            .cluster_of
            .iter()
            .filter(|&(_, around)| block.clusters[around.as_str()].kind == ClusterKind::Frame)
            .map(|(member, around)| (member.clone(), around.clone()))
            .collect();
        let mut items = vec![header];
        items.extend(block.items.iter().cloned());
        let walked = walk.with_containment(&items, &containment);
        let mut back: Set<String> = here
            .iter()
            .zip(&upward)
            .filter(|&(_, &up)| up)
            .map(|(projection, _)| projection.edge.id.clone())
            .collect();
        back.extend(walked);
        back
    }

    /// Give a relationship its lines: one in each block it leaves or enters,
    /// and one in the block that holds both ends.
    pub(super) fn draw(&mut self, projection: &Projection, back: &Set<String>, before: bool) {
        let edge = &projection.edge;
        let upward = back.contains(&edge.id);
        let label_at = self.label_holder(projection, before);
        let source = source_port(edge, projection.out.contains(&label_at));
        let (mut pieces, from) = self.leave(projection, upward, label_at, &source);
        let (entering, to) = self.enter(projection, upward, label_at, &source);
        let (tail, head) = if upward {
            (to.clone(), from.clone())
        } else {
            (from.clone(), to.clone())
        };
        let at = projection.at;
        let middle = self.line(
            at,
            edge,
            Ends {
                from,
                to,
                tail,
                head,
            },
            at == label_at,
            &source,
        );
        pieces.push((at, middle));
        pieces.extend(entering);
        self.routes
            .insert(edge.id.clone(), Route { pieces, label_at });
    }

    /// A relationship's lines in the blocks it leaves, innermost first, and
    /// the end they leave it at in the block that holds both ends.
    fn leave(
        &mut self,
        projection: &Projection,
        upward: bool,
        label_at: BlockId,
        source: &str,
    ) -> (Vec<Piece>, String) {
        let edge = &projection.edge;
        let face = if upward { Side::Top } else { Side::Bottom };
        let mut pieces = Vec::new();
        let mut from = self.leaving_end(projection, face, source);
        for &block in &projection.out {
            let kind = trunk_kind(edge);
            let along = format!("{}|{kind}", edge.target());
            let side = self.exit_of(block, "out", face, &along);
            let side = if side == Side::Top
                && block == label_at
                && from == header_of(self.get(block))
                && edge.label_count() > 0
            {
                Side::Right
            } else {
                side
            };
            // A line that carries its label to a wall reaches it under the label,
            // not under its card, so it shares no wall port.
            let inner = if block == label_at {
                format!("{}|{from}", edge.id)
            } else {
                from.clone()
            };
            let port = self.port(
                block,
                &format!(
                    "out|{}|{}{}|{kind}",
                    side.name(),
                    walled(side, &inner),
                    source
                ),
                side,
            );
            let (tail, head) = if side == Side::Top {
                (port.clone(), from.clone())
            } else {
                (from.clone(), port.clone())
            };
            let line = self.line(
                block,
                edge,
                Ends {
                    from: from.clone(),
                    to: port.clone(),
                    tail,
                    head,
                },
                block == label_at,
                source,
            );
            pieces.push((block, line));
            from = self.pin(block, &port);
        }
        (pieces, from)
    }

    /// The visible source, or an external unlabelled frame boundary.
    fn leaving_end(&mut self, projection: &Projection, face: Side, source: &str) -> String {
        let edge = &projection.edge;
        let start = if projection.out.is_empty() {
            projection.from.clone()
        } else {
            let own = self.block_of(edge.source());
            self.endpoint_of(edge.source(), own == projection.out.first().copied())
                .0
        };
        if let Some(block) = self
            .block_of(&start)
            .filter(|&block| self.get(block).kind == Kind::Frame)
        {
            let key = format!("from|{}|{}|{}", face.name(), source, trunk_kind(edge));
            let port = self.port(block, &key, face);
            self.pin(block, &port)
        } else {
            start
        }
    }

    /// A relationship's lines in the blocks it enters, outermost first, and
    /// the end they enter from in the block that holds both ends.
    fn enter(
        &mut self,
        projection: &Projection,
        upward: bool,
        label_at: BlockId,
        source: &str,
    ) -> (Vec<Piece>, String) {
        let edge = &projection.edge;
        let face = if upward { Side::Bottom } else { Side::Top };
        let mut pieces = Vec::new();
        let end = if projection.into.is_empty() {
            projection.to.clone()
        } else {
            self.endpoint_of(edge.target(), true).0
        };
        let mut to = end;
        for &block in &projection.into {
            let kind = trunk_kind(edge);
            let along = format!("{}|{kind}", edge.source());
            let side = self.exit_of(block, "in", face, &along);
            let target = format!("{}{}", walled(side, &to), edge.target());
            let port = self.port(block, &format!("in|{}|{target}|{kind}", side.name()), side);
            let (tail, head) = if side == Side::Bottom {
                (to.clone(), port.clone())
            } else {
                (port.clone(), to.clone())
            };
            let line = self.line(
                block,
                edge,
                Ends {
                    from: port.clone(),
                    to: to.clone(),
                    tail,
                    head,
                },
                block == label_at,
                source,
            );
            pieces.insert(0, (block, line));
            to = self.pin(block, &port);
        }
        (pieces, to)
    }

    /// The block that holds a relationship's label: the innermost block around
    /// its target that can hold one, or with the label before a join its
    /// source's, else the block that holds both ends.
    pub(super) fn label_holder(&self, projection: &Projection, before: bool) -> BlockId {
        if self.peer_of(projection.edge.target()).is_some() {
            return projection.at;
        }
        if projection.edge.label_count() > 0
            && let Some(frame) = self
                .block_of(projection.edge.source())
                .filter(|&frame| self.get(frame).kind == Kind::Frame)
        {
            return frame;
        }
        let own = projection.out.first().copied().unwrap_or(projection.at);
        if [projection.edge.source(), projection.edge.target()]
            .into_iter()
            .any(|end| {
                self.block_of(end)
                    .is_some_and(|block| self.get(block).kind == Kind::Frame)
            })
        {
            return projection.at;
        }
        if before {
            return own;
        }
        projection.into.first().copied().unwrap_or(own)
    }

    /// The edge a port crosses: the wall an earlier layout moved it to, or its
    /// face. A labelled exit can use the same facing wall as an unlabelled one.
    fn exit_of(&self, block: BlockId, way: &str, face: Side, along: &str) -> Side {
        let side = self
            .exits
            .get(&exit_key(&self.get(block).id, way, face, along))
            .copied()
            .unwrap_or(face);
        let own = self.get(block);
        if side == Side::Top
            && own.kind == Kind::Frame
            && own.lone.as_ref().is_some_and(|lone| {
                own.header.as_ref().is_some_and(|header| {
                    super::lone::caption_width(lone) + 2.0 * crate::track::chains::LANE
                        >= header.width
                })
            })
        {
            if way == "out" {
                Side::Right
            } else {
                Side::Left
            }
        } else {
            side
        }
    }

    /// A block's port, made on first use.
    pub(crate) fn port(&mut self, block: BlockId, key: &str, side: Side) -> String {
        let id = format!("port:{key}");
        self.get_mut(block).ports.insert(id.clone(), side);
        id
    }

    /// The item where a child block's port meets its parent's lines.
    pub(crate) fn pin(&mut self, block: BlockId, port: &str) -> String {
        let id = format!("pin:{}:{port}", self.get(block).id);
        self.pins.insert(
            id.clone(),
            Pin {
                block,
                port: port.to_owned(),
            },
        );
        id
    }

    /// A line in a block, shared with every relationship that runs between the
    /// same ends here without a label of its own.
    fn line(
        &mut self,
        block: BlockId,
        edge: &Rc<Edge>,
        ends: Ends,
        labelled: bool,
        source: &str,
    ) -> String {
        let carries = labelled && edge.label_count() > 0;
        let key = if carries {
            edge.id.clone()
        } else {
            format!("{}>{}|{}", ends.from, ends.to, trunk_kind(edge))
        };
        let lines = &mut self.get_mut(block).lines;
        if let Some(line) = lines.get_mut(&key) {
            if line.source.as_deref() != Some(source) {
                line.source = None;
            }
            if line.target.as_deref() != Some(edge.target()) {
                line.target = None;
            }
        } else {
            let Ends {
                from,
                to,
                tail,
                head,
            } = ends;
            lines.insert(
                key.clone(),
                Line {
                    key: key.clone(),
                    edge: Rc::clone(edge),
                    from,
                    to,
                    tail,
                    head,
                    labelled: carries,
                    source: Some(source.to_owned()),
                    target: Some(edge.target().to_owned()),
                },
            );
        }
        key
    }
}

/// A label before an exit applies only to the branch toward its target.
fn source_port(edge: &Edge, before: bool) -> String {
    if before && edge.label_count() > 0 {
        format!("{}>{}", edge.source(), edge.target())
    } else {
        edge.source().to_owned()
    }
}

/// What a port on a side wall adds to its key: the line's end inside the
/// block. Each line crosses a wall on the track it runs on inside, so lines
/// from different items never share a wall port.
fn walled(side: Side, inner: &str) -> String {
    if matches!(side, Side::Left | Side::Right) {
        format!("{inner}|")
    } else {
        String::new()
    }
}

/// Put each fan-in label before the join to its original target card.
pub(super) fn labels_before_joins(projections: &[Projection], back: &Set<String>) -> Set<String> {
    let joins: Vec<String> = projections
        .iter()
        .map(|projection| {
            if projection.into.is_empty() {
                return String::new();
            }
            let upward = back.contains(&projection.edge.id);
            format!(
                "{}|{}|{upward}",
                projection.edge.target(),
                trunk_kind(&projection.edge)
            )
        })
        .collect();
    let mut counts: Map<&str, usize> = Map::default();
    for join in &joins {
        *counts.entry(join.as_str()).or_default() += 1;
    }
    projections
        .iter()
        .zip(&joins)
        .filter(|(_, join)| !join.is_empty() && counts[join.as_str()] > 1)
        .map(|(projection, _)| projection.edge.id.clone())
        .collect()
}
