//! The relationships that close a cycle in a block (TASK-349), found by a
//! depth-first walk, or, for a Lanes drawing, as few as the greedy order of
//! Eades, Lin and Smyth turns.

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
                .flat_map(|(from, links)| links.iter().map(move |(to, edge)| (from, to, edge)))
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

/// The greedy order of a block's items: every relationship as its source, its target and its id.
struct Greedy<'w> {
    links: Vec<(&'w String, &'w String, &'w String)>,
}

/// An item's line counts to and from the items still unplaced.
#[derive(Default)]
struct Degree {
    sends: usize,
    takes: usize,
}

impl<'w> Greedy<'w> {
    /// Every item in the greedy order: the items first, in authored order, then
    /// any end no item names.
    fn order(&self, items: &'w [String]) -> Vec<&'w String> {
        let mut left: Map<&String, Degree> =
            items.iter().map(|item| (item, Degree::default())).collect();
        for &(from, to, _) in &self.links {
            let outgoing = left.entry(from).or_default();
            if from != to {
                outgoing.sends += 1;
                left.entry(to).or_default().takes += 1;
            }
        }
        let (mut first, mut last) = (Vec::new(), Vec::new());
        while !left.is_empty() {
            let next = self.next(&left);
            let (item, degree) = self.remove(&mut left, next);
            if degree.sends == 0 {
                last.push(item);
            } else {
                first.push(item);
            }
        }
        first.extend(last.into_iter().rev());
        first
    }

    /// Remove an item and discount its lines to and from the items still unplaced.
    fn remove(&self, left: &mut Map<&'w String, Degree>, index: usize) -> (&'w String, Degree) {
        let (item, degree) = left.shift_remove_index(index).expect("an item left");
        for &(from, to, _) in &self.links {
            if from == item
                && let Some(target) = left.get_mut(to)
            {
                target.takes -= 1;
            } else if to == item
                && let Some(source) = left.get_mut(from)
            {
                source.sends -= 1;
            }
        }
        (item, degree)
    }

    /// The first sink, else the first source, else the greatest lead in authored order.
    fn next(&self, left: &Map<&String, Degree>) -> usize {
        if let Some(sink) = left.values().position(|degree| degree.sends == 0) {
            return sink;
        }
        if let Some(source) = left.values().position(|degree| degree.takes == 0) {
            return source;
        }
        // Offset the lead by the number of links so it never falls below zero.
        // The maximum keeps the last tie, so read the remaining items in reverse.
        left.values()
            .enumerate()
            .rev()
            .max_by_key(|(_, degree)| self.links.len() + degree.sends - degree.takes)
            .map(|(index, _)| index)
            .expect("an item left")
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
