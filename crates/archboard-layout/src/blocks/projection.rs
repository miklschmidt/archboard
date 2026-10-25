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
    Block, BlockId, BlockTree, ClusterKind, Ends, Line, Piece, Pin, Projection, Route, exit_key,
    header_of, holds,
};

impl BlockTree {
    /// The blocks between a node and a block around it, innermost first, or
    /// nothing when the block does not hold the node.
    fn inside(&self, id: &str, frame: &str) -> Option<Vec<BlockId>> {
        let block = self.blocks.get(frame)?;
        let chain = self.above(id);
        let index = chain.iter().position(|one| one == block)?;
        Some(chain[..index].to_vec())
    }

    /// Where a relationship is drawn: in the block it leaves from or goes to
    /// when that block holds its other end, else in the lowest block holding both.
    pub(super) fn project(&self, edge: Rc<Edge>) -> Result<Projection, String> {
        let (source, target) = (edge.source().to_owned(), edge.target().to_owned());
        if let Some(into) = self.inside(&target, &source) {
            let at = self.blocks[source.as_str()];
            let to = into
                .last()
                .map_or(target, |&outer| self.get(outer).id.clone());
            return Ok(Projection {
                edge,
                at,
                out: Vec::new(),
                into,
                from: header_of(self.get(at)),
                to,
            });
        }
        if let Some(out) = self.inside(&source, &target) {
            let at = self.blocks[target.as_str()];
            let from = out
                .last()
                .map_or(source, |&outer| self.get(outer).id.clone());
            return Ok(Projection {
                edge,
                at,
                out,
                into: Vec::new(),
                from,
                to: header_of(self.get(at)),
            });
        }
        let (from_chain, to_chain) = (self.above(&source), self.above(&target));
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
        let label_at = if before {
            projection.out.first().copied().unwrap_or(projection.at)
        } else {
            projection
                .into
                .first()
                .or_else(|| projection.out.first())
                .copied()
                .unwrap_or(projection.at)
        };
        let (mut pieces, from) = self.leave(projection, upward, label_at);
        let (entering, to) = self.enter(projection, upward, label_at);
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
    ) -> (Vec<Piece>, String) {
        let edge = &projection.edge;
        let face = if upward { Side::Top } else { Side::Bottom };
        let mut pieces = Vec::new();
        let mut from = if projection.out.is_empty() {
            projection.from.clone()
        } else {
            edge.source().to_owned()
        };
        for &block in &projection.out {
            let along = format!("{}|{}", projection.to, self.kind_of(edge));
            let side = self.exit_of(block, "out", face, &along, Some(label_at));
            // A line that carries its label to a wall reaches it under the label,
            // not under its card, so it shares no wall port.
            let inner = if block == label_at {
                format!("{}|{from}", edge.id)
            } else {
                from.clone()
            };
            let port = self.port(
                block,
                &format!("out|{}|{}{along}", side.name(), walled(side, &inner)),
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
            );
            pieces.push((block, line));
            from = self.pin(block, &port);
        }
        (pieces, from)
    }

    /// A relationship's lines in the blocks it enters, outermost first, and
    /// the end they enter from in the block that holds both ends.
    fn enter(
        &mut self,
        projection: &Projection,
        upward: bool,
        label_at: BlockId,
    ) -> (Vec<Piece>, String) {
        let edge = &projection.edge;
        let face = if upward { Side::Bottom } else { Side::Top };
        let mut pieces = Vec::new();
        let mut to = if projection.into.is_empty() {
            projection.to.clone()
        } else {
            edge.target().to_owned()
        };
        for &block in &projection.into {
            let along = format!("{}|{}", projection.from, self.kind_of(edge));
            let side = self.exit_of(block, "in", face, &along, None);
            let port = self.port(
                block,
                &format!("in|{}|{}{along}", side.name(), walled(side, &to)),
                side,
            );
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
            );
            pieces.insert(0, (block, line));
            to = self.pin(block, &port);
        }
        (pieces, to)
    }

    /// What a relationship's ports on a block's edge share: its kind and look, or its own id.
    pub(crate) fn kind_of(&self, edge: &Edge) -> String {
        if self.apart.contains(&edge.id) {
            format!("{}|{}", trunk_kind(edge), edge.id)
        } else {
            trunk_kind(edge)
        }
    }

    /// The edge a port crosses: the wall an earlier layout moved it to, or its
    /// face; where it leaves the block with its label, its face.
    fn exit_of(
        &self,
        block: BlockId,
        way: &str,
        face: Side,
        along: &str,
        label_at: Option<BlockId>,
    ) -> Side {
        if Some(block) == label_at {
            return face;
        }
        self.exits
            .get(&exit_key(&self.get(block).id, way, face, along))
            .copied()
            .unwrap_or(face)
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
    fn line(&mut self, block: BlockId, edge: &Rc<Edge>, ends: Ends, labelled: bool) -> String {
        let carries = labelled && edge.label_count() > 0;
        let key = if carries {
            edge.id.clone()
        } else {
            format!("{}>{}|{}", ends.from, ends.to, trunk_kind(edge))
        };
        let lines = &mut self.get_mut(block).lines;
        if !lines.contains_key(&key) {
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
                },
            );
        }
        key
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

/// Lines that join on the way to one card stay one line into it (`joins.ts`):
/// each line of a join keeps its label before the join, by its source, or,
/// where its block is kept apart, keeps ports of its own. The relationships
/// in joins each way, by id.
pub(super) fn join_ways(
    projections: &[Projection],
    arena: &[Block],
    back: &Set<String>,
    apart: &Set<String>,
) -> (Set<String>, Set<String>) {
    let joins: Vec<String> = projections
        .iter()
        .map(|projection| {
            if projection.into.is_empty() {
                return String::new();
            }
            let upward = back.contains(&projection.edge.id);
            format!(
                "{}|{}|{}|{upward}",
                projection.from,
                projection.edge.target(),
                trunk_kind(&projection.edge)
            )
        })
        .collect();
    let mut counts: Map<&str, usize> = Map::default();
    for join in &joins {
        *counts.entry(join.as_str()).or_default() += 1;
    }
    let (mut before, mut own) = (Set::default(), Set::default());
    for (projection, join) in projections.iter().zip(&joins) {
        if join.is_empty() || counts[join.as_str()] == 1 {
            continue;
        }
        let block = &arena[projection.out.first().copied().unwrap_or(projection.at).0].id;
        if apart.contains(block) {
            &mut own
        } else {
            &mut before
        }
        .insert(projection.edge.id.clone());
    }
    (before, own)
}
