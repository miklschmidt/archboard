//! The ways a block of blocks may be packed: its items cut, in the order
//! their lines run, into rows or columns, and each of those with a later item
//! moved up into an earlier row or column that has room for it.

use crate::constants::fit_in;
use crate::ecma::{max, min, sorted_by};
use crate::track::scene::Map;

use super::super::laid::Size;

/// The most blocks whose every packing is tried.
const EVERY_PACKING: usize = 9;
/// How nearly a packing's estimated fit must reach the best one's to be laid out and weighed.
const WORTH_LAYING: f64 = 0.8;
/// The share of the smallest cut's packed area a packing with an item moved up
/// must fit in to be laid out: moving the item must fill real room, not only
/// reshape the page.
const FILLS: f64 = 0.9;
/// The most packings with an item moved up that are laid out and weighed
/// besides the cuts: a bound on time, since each is laid out and routed whole.
const MOST_BACKFILLED: usize = 4;

/// How a block's items are packed: in rows read left to right, or in columns read down.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Packing {
    pub across: bool,
    pub groups: Vec<Vec<usize>>,
    /// Room between two packed blocks, when trunks need more than the least.
    pub gap: Option<f64>,
    /// Room left of the packed blocks, when trunks need it.
    pub margin: Option<f64>,
    /// Whether each block slides in line with the blocks its lines reach, where it may.
    pub aligned: bool,
}

impl Packing {
    /// A packing of groups, at the least room.
    fn of(across: bool, groups: Vec<Vec<usize>>) -> Packing {
        Packing {
            across,
            groups,
            gap: None,
            margin: None,
            aligned: false,
        }
    }
}

/// Every way to cut a sequence of some items into consecutive groups, each as its group sizes.
fn every_cut(count: usize, sizes: &[usize]) -> Vec<Vec<usize>> {
    if count == 0 {
        return vec![sizes.to_vec()];
    }
    (0..count)
        .flat_map(|index| {
            let mut more = sizes.to_vec();
            more.push(index + 1);
            every_cut(count - index - 1, &more)
        })
        .collect()
}

/// The cuts of a sequence worth trying: every one for a few items, else one
/// to four even groups.
fn cuts_of(count: usize) -> Vec<Vec<usize>> {
    if count <= EVERY_PACKING {
        return every_cut(count, &[]);
    }
    (1..=4)
        .map(|groups| {
            (0..groups)
                .map(|group| (group + 1) * count / groups - group * count / groups)
                .collect()
        })
        .collect()
}

/// How long and how thick one group is: along the way it is read, and across it.
pub(crate) fn extent_of(sizes: &[Size], across: bool, gap: f64) -> (f64, f64) {
    let along = sizes.iter().fold(0.0, |sum, size| {
        sum + if across { size.width } else { size.height }
    });
    let thick = max(sizes
        .iter()
        .map(|size| if across { size.height } else { size.width }));
    (along + (sizes.len() as f64 - 1.0) * gap, thick)
}

/// Every packing that cuts the items, in order, into consecutive groups, rows first.
fn cut_packings(order: &[usize]) -> Vec<Packing> {
    [true, false]
        .into_iter()
        .flat_map(|across| {
            cuts_of(order.len()).into_iter().map(move |sizes| {
                let mut start = 0;
                let groups = sizes
                    .iter()
                    .map(|&size| {
                        let group = order[start..start + size].to_vec();
                        start += size;
                        group
                    })
                    .collect();
                Packing::of(across, groups)
            })
        })
        .collect()
}

/// A packing with one item moved from its group into an earlier one, at its
/// start or its end: a small block late in the order then fills the room a
/// short row or column leaves, instead of widening the page on a row of its
/// own. A column is read down, so an item joins one at its foot.
fn backfilled(packing: &Packing) -> Vec<Packing> {
    let groups = &packing.groups;
    let mut moved = Vec::new();
    for (before, group) in groups.iter().enumerate().skip(1) {
        for &item in group {
            for (into, earlier) in groups[..before].iter().enumerate() {
                let mut ends = Vec::new();
                if packing.across {
                    ends.push([&[item][..], earlier].concat());
                }
                ends.push([earlier, &[item][..]].concat());
                for filled in ends {
                    let groups = groups
                        .iter()
                        .enumerate()
                        .map(|(at, one)| {
                            if at == into {
                                filled.clone()
                            } else {
                                one.iter().copied().filter(|&other| other != item).collect()
                            }
                        })
                        .filter(|one: &Vec<usize>| !one.is_empty())
                        .collect();
                    moved.push(Packing::of(packing.across, groups));
                }
            }
        }
    }
    moved
}

/// A page's area.
fn area_of(page: Size) -> f64 {
    page.width * page.height
}

/// The packings worth laying out: every cut whose estimated fit comes near
/// the best cut's, and the few best packings with an item moved up that do
/// too and pack clearly smaller than every such cut.
pub(crate) fn packings_of(order: &[usize], page_of: impl Fn(&Packing) -> Size) -> Vec<Packing> {
    let fit = |packing: &Packing| {
        let page = page_of(packing);
        fit_in(page.width, page.height)
    };
    let cuts = cut_packings(order);
    let fits: Vec<f64> = cuts.iter().map(fit).collect();
    let least = max(fits.iter().copied()) * WORTH_LAYING;
    let mut moved: Map<(bool, Vec<Vec<usize>>), Packing> = Map::default();
    for packing in cuts.iter().flat_map(backfilled) {
        moved.insert((packing.across, packing.groups.clone()), packing);
    }
    let weighed: Vec<(Packing, f64)> = moved
        .into_values()
        .map(|packing| {
            let fit = fit(&packing);
            (packing, fit)
        })
        .filter(|(_, fit)| *fit >= least)
        .collect();
    let filled = sorted_by(&weighed, |one, other| other.1 - one.1)
        .into_iter()
        .take(MOST_BACKFILLED)
        .map(|(packing, _)| packing);
    let laid: Vec<Packing> = cuts
        .into_iter()
        .zip(&fits)
        .filter(|(_, fit)| **fit >= least)
        .map(|(packing, _)| packing)
        .collect();
    let room = min(laid.iter().map(|packing| area_of(page_of(packing)))) * FILLS;
    let kept: Vec<Packing> = filled
        .filter(|packing| area_of(page_of(packing)) <= room)
        .collect();
    laid.into_iter().chain(kept).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cuts_a_few_items_every_way_and_more_into_even_groups() {
        assert_eq!(cuts_of(3).len(), 4);
        assert_eq!(
            cuts_of(10),
            vec![vec![10], vec![5, 5], vec![3, 3, 4], vec![2, 3, 2, 3]]
        );
    }

    #[test]
    fn moves_a_later_item_into_an_earlier_row_at_either_end() {
        let rows = Packing::of(true, vec![vec![0, 1], vec![2]]);
        let moved: Vec<Vec<Vec<usize>>> = backfilled(&rows)
            .into_iter()
            .map(|packing| packing.groups)
            .collect();
        assert_eq!(moved, vec![vec![vec![2, 0, 1]], vec![vec![0, 1, 2]]]);
    }
}
