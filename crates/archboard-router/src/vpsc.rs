//! Variable placement with separation constraints: place variables as close
//! as their weights allow to where each wants to be, such that every
//! constraint `left + gap <= right` holds. \[D05\] §4: `satisfy` merges
//! variables into blocks along violated constraints in topological order,
//! and `solve` then splits a block wherever a constraint's Lagrange
//! multiplier is negative and merges again, until none is.
//!
//! The constraints must form no cycle. Every loop is bounded, so a degenerate
//! set answers a feasible placement instead of running on.

/// One variable: where it wants to be and how much it cares.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Var {
    pub desired: f64,
    pub weight: f64,
}

/// `position[left] + gap <= position[right]`.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Constraint {
    pub left: usize,
    pub right: usize,
    pub gap: f64,
}

impl Constraint {
    /// The variable at the constraint's other end from one of its own, or
    /// nothing when the variable is neither of its ends.
    fn other_end(&self, var: usize) -> Option<usize> {
        if self.left == var {
            Some(self.right)
        } else if self.right == var {
            Some(self.left)
        } else {
            None
        }
    }
}

const EPS: f64 = 1e-7;

/// Variables that move together: their indices, the constraints that hold them
/// together, where the block stands, and whether it is still in use or merged away.
struct Block {
    vars: Vec<usize>,
    active: Vec<usize>,
    position: f64,
    live: bool,
}

/// One solve: each variable's block and its offset in that block, and the blocks.
struct Solver<'a> {
    vars: &'a [Var],
    constraints: &'a [Constraint],
    block_of: Vec<usize>,
    offset: Vec<f64>,
    blocks: Vec<Block>,
}

impl<'a> Solver<'a> {
    /// Start with each variable in a block of its own, where it wants to be.
    fn new(vars: &'a [Var], constraints: &'a [Constraint]) -> Solver<'a> {
        Solver {
            vars,
            constraints,
            block_of: (0..vars.len()).collect(),
            offset: vec![0.0; vars.len()],
            blocks: vars
                .iter()
                .enumerate()
                .map(|(index, var)| Block {
                    vars: vec![index],
                    active: Vec::new(),
                    position: var.desired,
                    live: true,
                })
                .collect(),
        }
    }

    /// Where a variable stands: its block's position plus its offset in the block.
    fn at(&self, var: usize) -> f64 {
        self.blocks[self.block_of[var]].position + self.offset[var]
    }

    /// How far a constraint is from holding: above zero where it is broken.
    fn violation(&self, c: &Constraint) -> f64 {
        self.at(c.left) + c.gap - self.at(c.right)
    }

    /// Place a block where its variables are best off together.
    fn place(&mut self, block: usize) {
        let (mut sum, mut weight) = (0.0, 0.0);
        for &var in &self.blocks[block].vars {
            sum += self.vars[var].weight * (self.vars[var].desired - self.offset[var]);
            weight += self.vars[var].weight;
        }
        self.blocks[block].position = sum / weight;
    }

    /// Merge the block on a constraint's left into the block on its right,
    /// with the constraint active.
    fn merge(&mut self, index: usize) {
        let c = self.constraints[index];
        let (from, into) = (self.block_of[c.left], self.block_of[c.right]);
        let shift = self.offset[c.right] - c.gap - self.offset[c.left];
        let moved = std::mem::take(&mut self.blocks[from].vars);
        let active = std::mem::take(&mut self.blocks[from].active);
        self.blocks[from].live = false;
        for &var in &moved {
            self.offset[var] += shift;
            self.block_of[var] = into;
        }
        self.blocks[into].vars.extend(moved);
        self.blocks[into].active.extend(active);
        self.blocks[into].active.push(index);
        self.place(into);
    }

    /// The most violated constraint between two blocks, if any is.
    fn most_violated(&self, into: Option<usize>) -> Option<usize> {
        let mut best: Option<(f64, usize)> = None;
        for (index, c) in self.constraints.iter().enumerate() {
            if self.block_of[c.left] == self.block_of[c.right] {
                continue;
            }
            if into.is_some_and(|block| self.block_of[c.right] != block) {
                continue;
            }
            let violation = self.violation(c);
            if violation > EPS && best.is_none_or(|(most, _)| violation > most) {
                best = Some((violation, index));
            }
        }
        best.map(|(_, index)| index)
    }

    /// \[D05\] Fig. 2: blocks built in topological order, each merging the
    /// blocks on its left that it violates.
    fn satisfy(&mut self) {
        for var in self.topological() {
            let mut rounds = self.constraints.len() + 1;
            while rounds > 0 {
                rounds -= 1;
                let Some(index) = self.most_violated(Some(self.block_of[var])) else {
                    break;
                };
                self.merge(index);
            }
        }
    }

    /// The variables in an order where every constraint's left comes before
    /// its right, ties by index.
    fn topological(&self) -> Vec<usize> {
        let n = self.vars.len();
        let mut incoming = vec![0usize; n];
        let mut outgoing = vec![Vec::new(); n];
        for c in self.constraints {
            incoming[c.right] += 1;
            outgoing[c.left].push(c.right);
        }
        let mut ready: std::collections::BTreeSet<usize> =
            (0..n).filter(|&var| incoming[var] == 0).collect();
        let mut order = Vec::with_capacity(n);
        while let Some(var) = ready.pop_first() {
            order.push(var);
            for &next in &outgoing[var] {
                incoming[next] -= 1;
                if incoming[next] == 0 {
                    ready.insert(next);
                }
            }
        }
        // A cycle leaves variables out; place them last rather than never.
        let placed: std::collections::BTreeSet<usize> = order.iter().copied().collect();
        order.extend((0..n).filter(|var| !placed.contains(var)));
        order
    }

    /// The active constraint with the most negative Lagrange multiplier.
    fn most_negative(&self) -> Option<(usize, usize)> {
        let mut best: Option<(f64, usize, usize)> = None;
        for (block_index, block) in self.blocks.iter().enumerate() {
            if !block.live || block.active.is_empty() {
                continue;
            }
            for &index in &block.active {
                let c = self.constraints[index];
                let side = self.component(block_index, c.right, index);
                let multiplier: f64 = side
                    .iter()
                    .map(|&var| self.vars[var].weight * (self.at(var) - self.vars[var].desired))
                    .sum();
                if multiplier < -EPS && best.is_none_or(|(most, _, _)| multiplier < most) {
                    best = Some((multiplier, block_index, index));
                }
            }
        }
        best.map(|(_, block, index)| (block, index))
    }

    /// The variables a block's active constraints connect to one variable,
    /// with one constraint left out.
    fn component(&self, block: usize, from: usize, without: usize) -> Vec<usize> {
        let mut seen = vec![from];
        let mut stack = vec![from];
        while let Some(var) = stack.pop() {
            let others = self.blocks[block]
                .active
                .iter()
                .filter(|&&index| index != without)
                .filter_map(|&index| self.constraints[index].other_end(var));
            for other in others {
                if !seen.contains(&other) {
                    seen.push(other);
                    stack.push(other);
                }
            }
        }
        seen.sort_unstable();
        seen
    }

    /// Split a block at one active constraint into two blocks.
    fn split(&mut self, block: usize, index: usize) {
        let c = self.constraints[index];
        let right = self.component(block, c.right, index);
        let fresh = self.blocks.len();
        self.blocks[block].active.retain(|&other| other != index);
        let (moved, kept): (Vec<usize>, Vec<usize>) = self.blocks[block]
            .active
            .iter()
            .partition(|&&other| right.contains(&self.constraints[other].left));
        self.blocks[block].active = kept;
        self.blocks[block].vars.retain(|var| !right.contains(var));
        let position = self.blocks[block].position;
        for &var in &right {
            self.block_of[var] = fresh;
        }
        self.blocks.push(Block {
            vars: right,
            active: moved,
            position,
            live: true,
        });
        self.place(block);
        self.place(fresh);
    }

    /// \[D05\] Fig. 4: split at negative multipliers and merge again until
    /// every multiplier is non-negative, within a bounded number of rounds.
    fn solve(&mut self) {
        self.satisfy();
        let mut rounds = 4 * self.constraints.len() + 8;
        while rounds > 0 {
            rounds -= 1;
            let Some((block, index)) = self.most_negative() else {
                return;
            };
            self.split(block, index);
            let mut merges = self.constraints.len() + 1;
            while merges > 0 {
                merges -= 1;
                let Some(violated) = self.most_violated(None) else {
                    break;
                };
                self.merge(violated);
            }
        }
    }
}

/// Where each variable goes.
pub(crate) fn solve(vars: &[Var], constraints: &[Constraint]) -> Vec<f64> {
    let mut solver = Solver::new(vars, constraints);
    solver.solve();
    (0..vars.len()).map(|var| solver.at(var)).collect()
}
