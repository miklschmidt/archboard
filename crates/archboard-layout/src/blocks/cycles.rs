//! Ordering between a block's items (TASK-349): whether one item leads down
//! to another through the edges added so far, and which relationships close a
//! cycle in a block, found by a depth-first walk.

use crate::track::scene::{Map, Set};

/// Whether one item leads down to another, as edges are added.
#[derive(Default)]
pub(crate) struct Below {
    next: Map<String, Vec<String>>,
}

impl Below {
    /// Record that one item ranks below another.
    pub(crate) fn add(&mut self, tail: &str, head: &str) {
        self.next
            .entry(tail.to_owned())
            .or_default()
            .push(head.to_owned());
    }

    /// Every item one leads down to, itself among them.
    pub(crate) fn reach(&self, from: &str) -> Set<String> {
        let mut seen: Set<String> = Set::default();
        let mut open = vec![from.to_owned()];
        while let Some(at) = open.pop() {
            if !seen.contains(&at)
                && let Some(next) = self.next.get(&at)
            {
                open.extend(next.iter().cloned());
            }
            seen.insert(at);
        }
        seen
    }

    /// Whether one item leads down to another.
    pub(crate) fn reaches(&self, from: &str, target: &str) -> bool {
        let mut seen: Set<String> = Set::default();
        let mut open = vec![from.to_owned()];
        while let Some(at) = open.pop() {
            if at == target {
                return true;
            }
            if !seen.contains(&at)
                && let Some(next) = self.next.get(&at)
            {
                open.extend(next.iter().cloned());
            }
            seen.insert(at);
        }
        false
    }
}

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
    out: Map<String, Vec<(String, Option<String>)>>,
}

impl CycleWalk {
    /// Add an ordering constraint. Containment has no relationship to reverse.
    pub(super) fn add(&mut self, from: &str, to: &str, edge: Option<&str>) {
        self.out
            .entry(from.to_owned())
            .or_default()
            .push((to.to_owned(), edge.map(str::to_owned)));
    }

    /// Find cycles from unconstrained roots first, then in authored order.
    fn walk(&mut self, items: &[String]) -> Set<String> {
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

    /// Add only containment constraints that participate in a cycle.
    pub(super) fn with_containment(
        &mut self,
        items: &[String],
        containment: &[(String, String)],
    ) -> Set<String> {
        let mut below = Below::default();
        for (from, links) in &self.out {
            for (to, _) in links {
                below.add(from, to);
            }
        }
        for (member, around) in containment {
            below.add(around, member);
        }
        let cyclic: Vec<&(String, String)> = containment
            .iter()
            .filter(|(member, around)| below.reaches(member, around))
            .collect();
        for (member, around) in &cyclic {
            self.add(around, member, None);
        }
        let frames: Set<String> = cyclic.iter().map(|(_, around)| around.clone()).collect();
        let mut walked: Vec<String> = frames.into_iter().collect();
        walked.extend(items.iter().cloned());
        self.walk(&walked)
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
                if let Some(edge) = edge {
                    self.back.insert(edge);
                }
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
        walk.add("a", "b", Some("ab"));
        walk.add("b", "c", Some("bc"));
        walk.add("c", "a", Some("ca"));
        let items: Vec<String> = ["a", "b", "c"].map(str::to_owned).to_vec();
        let back = walk.with_containment(&items, &[]);
        assert_eq!(back.into_iter().collect::<Vec<_>>(), vec!["ca".to_owned()]);
    }

    #[test]
    fn below_reaches_down_its_edges() {
        let mut below = Below::default();
        below.add("a", "b");
        below.add("b", "c");
        assert!(below.reaches("a", "c"));
        assert!(!below.reaches("c", "a"));
        assert_eq!(below.reach("b").len(), 2);
    }
}
