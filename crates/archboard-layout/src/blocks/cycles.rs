//! The relationships that close a cycle in a block (TASK-349), found by a
//! depth-first walk.

use crate::lanes::scene::{Map, Set};

/// Where a depth-first walk stands at an item.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Walked {
    Open,
    Done,
}

/// A depth-first walk over one block's projections that finds the ones closing a cycle.
#[derive(Default)]
pub(super) struct CycleWalk {
    back: Set<String>,
    state: Map<String, Walked>,
    out: Map<String, Vec<(String, String)>>,
}

impl CycleWalk {
    /// Add an ordering constraint: the relationship that runs from one item to another.
    pub(super) fn add(&mut self, from: &str, to: &str, edge: &str) {
        self.out
            .entry(from.to_owned())
            .or_default()
            .push((to.to_owned(), edge.to_owned()));
    }

    /// Find the relationships that close a cycle, walking from unconstrained
    /// roots first, then in authored order.
    pub(super) fn back_edges(&mut self, items: &[String]) -> Set<String> {
        let pointed: Set<&String> = self.out.values().flatten().map(|(to, _)| to).collect();
        let roots: Vec<String> = items
            .iter()
            .filter(|item| !pointed.contains(item))
            .cloned()
            .collect();
        for item in &roots {
            self.from(item);
        }
        for item in items {
            self.from(item);
        }
        std::mem::take(&mut self.back)
    }

    /// Walk from one item, unless the walk has been there.
    fn from(&mut self, item: &str) {
        if self.state.contains_key(item) {
            return;
        }
        self.state.insert(item.to_owned(), Walked::Open);
        let links = self.out.get(item).cloned().unwrap_or_default();
        for (to, edge) in links {
            if self.state.get(&to) == Some(&Walked::Open) {
                self.back.insert(edge);
            } else {
                self.from(&to);
            }
        }
        self.state.insert(item.to_owned(), Walked::Done);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_walk_turns_the_line_that_closes_a_cycle() {
        let mut walk = CycleWalk::default();
        walk.add("a", "b", "ab");
        walk.add("b", "c", "bc");
        walk.add("c", "a", "ca");
        let items: Vec<String> = ["a", "b", "c"].map(str::to_owned).to_vec();
        let back = walk.back_edges(&items);
        assert_eq!(back.into_iter().collect::<Vec<_>>(), vec!["ca".to_owned()]);
    }
}
