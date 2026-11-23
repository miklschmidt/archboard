//! Ordering between a block's items (TASK-349): whether one item leads down
//! to another through the edges added so far, and which relationships close a
//! cycle in a block, found by a depth-first walk, or, for a Lanes drawing, as
//! few as the greedy order of Eades, Lin and Smyth turns.

use crate::lanes::scene::{Map, Set};

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
    /// The items the walk stands in, outermost first, each with the
    /// relationship it was entered by: none for a root or a containment link.
    path: Vec<(String, Option<String>)>,
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
            self.from(item, None);
        }
        for item in items {
            self.from(item, None);
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

    /// The relationships that close a cycle, as few as a greedy order turns: an
    /// item that points at nothing still unplaced goes last, one that nothing
    /// still unplaced points at goes first, and else the item that sends the most
    /// lines more than it takes, the first in authored order on a tie. Every
    /// relationship that runs back up that order closes a cycle. A depth-first
    /// walk turns whichever line it meets last, which can be a bundle of many
    /// lines kept for one line the other way.
    pub(super) fn fewest_back(&self, items: &[String]) -> Set<String> {
        let greedy = Greedy {
            links: self
                .out
                .iter()
                .flat_map(|(from, links)| {
                    links
                        .iter()
                        .filter_map(move |(to, edge)| Some((from, to, edge.as_ref()?)))
                })
                .collect(),
        };
        let order = greedy.order(items);
        let place: Map<&String, usize> = order
            .iter()
            .enumerate()
            .map(|(at, &item)| (item, at))
            .collect();
        greedy
            .links
            .into_iter()
            .filter(|&(from, to, _)| place[from] >= place[to])
            .map(|(_, _, edge)| edge.clone())
            .collect()
    }

    /// Walk from one item, entered by a relationship or not, unless the walk has been there.
    fn from(&mut self, item: &str, entered: Option<String>) {
        if self.state.contains_key(item) {
            return;
        }
        self.state.insert(item.to_owned(), Walked::Open);
        self.path.push((item.to_owned(), entered));
        let links = self.out.get(item).cloned().unwrap_or_default();
        for (to, edge) in links {
            if self.state.get(&to) == Some(&Walked::Open) {
                if let Some(turned) = edge.or_else(|| self.closing(&to)) {
                    self.back.insert(turned);
                }
            } else {
                self.from(&to, edge);
            }
        }
        self.path.pop();
        self.state.insert(item.to_owned(), Walked::Done);
    }

    /// The relationship to turn where a containment link closes a cycle back
    /// to an open item: a frame cannot stand below its own member, so the
    /// cycle turns the last relationship the walk took since that item.
    fn closing(&self, to: &str) -> Option<String> {
        let start = self.path.iter().rposition(|(item, _)| item == to)?;
        self.path[start + 1..]
            .iter()
            .rev()
            .find_map(|(_, entered)| entered.clone())
    }
}

/// The greedy order of a block's items: every relationship as its source, its target and its id.
struct Greedy<'w> {
    links: Vec<(&'w String, &'w String, &'w String)>,
}

impl<'w> Greedy<'w> {
    /// Every item in the greedy order: the items first, in authored order, then
    /// any end no item names.
    fn order(&self, items: &'w [String]) -> Vec<&'w String> {
        let mut left: Vec<&String> = items.iter().collect();
        for &(from, to, _) in &self.links {
            for end in [from, to] {
                if !left.contains(&end) {
                    left.push(end);
                }
            }
        }
        let (mut first, mut last) = (Vec::new(), Vec::new());
        while !left.is_empty() {
            if let Some(sink) = left.iter().position(|item| self.sends(item, &left) == 0) {
                last.push(left.remove(sink));
            } else {
                let next = self.next(&left);
                first.push(left.remove(next));
            }
        }
        first.extend(last.into_iter().rev());
        first
    }

    /// Where the next item to go first stands among those left: one nothing left
    /// points at, else the one whose sent lines lead its taken lines the most.
    fn next(&self, left: &[&String]) -> usize {
        if let Some(source) = left.iter().position(|item| self.takes(item, left) == 0) {
            return source;
        }
        // Every count stays below the number of links, so the lead never falls below zero.
        let lead =
            |item: &&String| self.links.len() + self.sends(item, left) - self.takes(item, left);
        let best = left.iter().map(lead).max().expect("an item left");
        left.iter()
            .position(|item| lead(item) == best)
            .expect("the item that leads")
    }

    /// The lines an item sends to the items left, itself apart.
    fn sends(&self, item: &String, left: &[&String]) -> usize {
        self.links
            .iter()
            .filter(|&&(from, to, _)| from == item && to != item && left.contains(&to))
            .count()
    }

    /// The lines an item takes from the items left, itself apart.
    fn takes(&self, item: &String, left: &[&String]) -> usize {
        self.links
            .iter()
            .filter(|&&(from, to, _)| to == item && from != item && left.contains(&from))
            .count()
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
    fn a_cycle_a_frame_closes_round_its_member_turns_the_line_into_the_frame() {
        // Walked from `c`, the cycle is closed by the frame's link to its own
        // member, which no line can turn.
        let mut walk = CycleWalk::default();
        walk.add("c", "a", Some("ca"));
        walk.add("a", "b", Some("ab"));
        walk.add("b", "frame", Some("into"));
        let items: Vec<String> = ["c", "a", "b"].map(str::to_owned).to_vec();
        let back = walk.with_containment(&items, &[("a".to_owned(), "frame".to_owned())]);
        assert_eq!(
            back.into_iter().collect::<Vec<_>>(),
            vec!["into".to_owned()]
        );
    }

    #[test]
    fn below_reaches_down_its_edges() {
        let mut below = Below::default();
        below.add("a", "b");
        below.add("b", "c");
        assert!(below.reaches("a", "c"));
        assert!(!below.reaches("c", "a"));
    }
}
