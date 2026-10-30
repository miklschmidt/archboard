//! Label boxes that share one stretch of a band, placed together (TASK-349):
//! in the order Graphviz stood them, or in the order of where they want to be
//! when that crosses fewer lines, spaced, so that the fewest lines jog at their
//! labels, then each as near where it wants to be as that allows.
//!
//! Before all of that, no box stands where its line would step back under the
//! decision it comes down from (TASK-491).

use crate::constants::LABEL_LABEL_CLEARANCE;
use crate::ecma::{abs, js_max, js_min, or, sorted_by, unique};
use crate::track::chains::LANE;
use crate::track::scene::{ItemId, Placement};

/// A label box that may slide, where it wants its centre, and where its line reaches it straight.
#[derive(Clone, Debug)]
pub(crate) struct Slider {
    pub item: ItemId,
    pub wanted: f64,
    /// The x its line reaches it at straight from the station above, and from the one below.
    pub reaches: Vec<(f64, f64)>,
    /// Where its line leaves the station above and enters the one below.
    pub ends: [f64; 2],
    /// Which way runs back under the decision when its line comes down from a side point of one.
    pub inward: f64,
}

/// A placement's cost: steps back under a decision, jogs, jogs too short to turn whole, displacement.
type Cost = [f64; 4];

/// The shortest jog a line turns with two whole bends and a straight run between them.
const WHOLE_JOG: f64 = 2.0 * LANE;
/// How far outside a reach still counts as in it: rounding, not a jog.
const TOLERANCE: f64 = 1e-6;

/// What one box costs standing at one centre.
fn cost_at(slider: &Slider, centre: f64) -> Cost {
    let off: Vec<f64> = slider
        .reaches
        .iter()
        .map(|&(low, high)| js_max(js_max(low - centre, centre - high), 0.0))
        .collect();
    [
        if (centre - slider.reaches[0].0) * slider.inward > TOLERANCE {
            1.0
        } else {
            0.0
        },
        off.iter().filter(|&&d| d > TOLERANCE).count() as f64,
        off.iter()
            .filter(|&&d| d > TOLERANCE && d < WHOLE_JOG - TOLERANCE)
            .count() as f64,
        abs(centre - slider.wanted),
    ]
}

/// Two costs together.
fn plus(one: &Cost, other: &Cost) -> Cost {
    [
        one[0] + other[0],
        one[1] + other[1],
        one[2] + other[2],
        one[3] + other[3],
    ]
}

/// Whether one cost is lower than another: fewer steps back under a decision, fewer jogs, then less displacement.
fn cheaper(one: &Cost, other: &Cost) -> bool {
    match (0..3).find(|&index| one[index] != other[index]) {
        None => one[3] < other[3] - TOLERANCE,
        Some(at) => one[at] < other[at],
    }
}

/// Where the boxes of one stretch stand, in their order, and what that costs.
struct RunPlan {
    sliders: Vec<Slider>,
    centres: Vec<f64>,
    cost: Cost,
}

/// One box's centre in a plan, its cost with every box left of it, and the step it came from.
#[derive(Clone, Copy)]
struct Step {
    centre: f64,
    cost: Cost,
    from: usize,
}

/// The gap each box keeps from the one before it, and each box's offset from
/// the first: half of each width beside it and the clearance between labels.
fn spacing_of(widths: &[f64]) -> (Vec<f64>, Vec<f64>) {
    let gaps: Vec<f64> = widths
        .iter()
        .enumerate()
        .map(|(index, &width)| {
            if index == 0 {
                0.0
            } else {
                f64::midpoint(widths[index - 1], width) + LABEL_LABEL_CLEARANCE
            }
        })
        .collect();
    let offsets: Vec<f64> = (0..gaps.len())
        .map(|index| gaps[..=index].iter().fold(0.0, |sum, gap| sum + gap))
        .collect();
    (gaps, offsets)
}

/// Where the first box's centre may stand that puts some box where it wants
/// to be or a whole jog off its lines' reach: the run's two ends, then each
/// box's wanted centre and its reaches, moved back by its offset.
fn anchors_of(sliders: &[Slider], offsets: &[f64], first: f64, last: f64) -> Vec<f64> {
    let mut anchors = vec![first, last];
    for (index, slider) in sliders.iter().enumerate() {
        let mut own = vec![slider.wanted];
        for &(one, other) in &slider.reaches {
            own.extend([one - WHOLE_JOG, one, other, other + WHOLE_JOG]);
        }
        anchors.extend(own.into_iter().map(|x| x - offsets[index]));
    }
    anchors
}

/// The cheapest step of the box before that stands at least a gap left of a
/// centre, and where it stands among those steps.
fn best_before(previous: &[Step], centre: f64, gap: f64) -> Option<(Step, usize)> {
    let mut best: Option<(Step, usize)> = None;
    for (at, step) in previous.iter().enumerate() {
        if step.centre > centre - gap + TOLERANCE {
            continue;
        }
        if best.is_none_or(|(chosen, _)| cheaper(&step.cost, &chosen.cost)) {
            best = Some((*step, at));
        }
    }
    best
}

/// One box's steps: each centre it may take, with its cost and that of the
/// cheapest box before it that leaves the gap, the steps before and the gap
/// given; a centre no box before leaves room for is left out.
fn steps_at(slider: &Slider, centres: Vec<f64>, previous: Option<(&[Step], f64)>) -> Vec<Step> {
    let mut made = Vec::new();
    for centre in centres {
        let own = cost_at(slider, centre);
        match previous {
            None => made.push(Step {
                centre,
                cost: own,
                from: usize::MAX,
            }),
            Some((previous, gap)) => {
                if let Some((best, from)) = best_before(previous, centre, gap) {
                    made.push(Step {
                        centre,
                        cost: plus(&best.cost, &own),
                        from,
                    });
                }
            }
        }
    }
    made
}

/// The centres of the cheapest plan, read back from its last box's cheapest
/// step, and what the plan costs.
fn cheapest_plan(steps: &[Vec<Step>]) -> (Vec<f64>, Cost) {
    let finals = &steps[steps.len() - 1];
    let mut at = (0..finals.len()).fold(0, |best, index| {
        if cheaper(&finals[index].cost, &finals[best].cost) {
            index
        } else {
            best
        }
    });
    let cost = finals[at].cost;
    let mut centres = vec![0.0; steps.len()];
    for index in (0..steps.len()).rev() {
        let step = steps[index][at];
        centres[index] = step.centre;
        at = step.from;
    }
    (centres, cost)
}

/// Where boxes that share one stretch would stand: in their order, spaced, so
/// that the fewest lines jog, then each as near its wanted centre as that
/// allows; nothing when the boxes do not fit.
fn plan_run(scene: &Placement, sliders: Vec<Slider>, low: f64, high: f64) -> Option<RunPlan> {
    let widths: Vec<f64> = sliders
        .iter()
        .map(|slider| scene.item(slider.item).bx.width)
        .collect();
    let (gaps, offsets) = spacing_of(&widths);
    let first = low + widths[0] / 2.0;
    let last = high - widths[widths.len() - 1] / 2.0 - offsets[offsets.len() - 1];
    if last < first {
        return None;
    }
    let anchors = anchors_of(&sliders, &offsets, first, last);
    let mut steps: Vec<Vec<Step>> = Vec::with_capacity(sliders.len());
    for (index, slider) in sliders.iter().enumerate() {
        let centres = unique(
            &anchors
                .iter()
                .map(|&x| js_min(last, js_max(first, x)) + offsets[index])
                .collect::<Vec<_>>(),
        );
        let previous = index
            .checked_sub(1)
            .map(|before| (steps[before].as_slice(), gaps[index]));
        let made = steps_at(slider, centres, previous);
        steps.push(made);
    }
    let (centres, cost) = cheapest_plan(&steps);
    Some(RunPlan {
        sliders,
        centres,
        cost,
    })
}

/// How many pairs of boxes in an order stand their lines across each other.
fn crossings_in(sliders: &[Slider]) -> f64 {
    let mut sum = 0.0;
    for (index, one) in sliders.iter().enumerate() {
        for other in &sliders[index + 1..] {
            sum += (0..2)
                .filter(|&end| one.ends[end] > other.ends[end] + 0.5)
                .count() as f64;
        }
    }
    sum
}

/// Place boxes that share one stretch in the order Graphviz stood them, or in
/// the order of where they want to be when that crosses no more lines and
/// jogs fewer or moves them less.
pub(crate) fn place_run(scene: &mut Placement, sliders: &[Slider], low: f64, high: f64) {
    let x = |slider: &Slider| scene.item(slider.item).bx.x;
    let orders = [
        sorted_by(sliders, |one, other| x(one) - x(other)),
        sorted_by(sliders, |one, other| {
            or(one.wanted - other.wanted, x(one) - x(other))
        }),
    ];
    let mut plan: Option<RunPlan> = None;
    for order in orders {
        let Some(one) = plan_run(scene, order, low, high) else {
            continue;
        };
        plan = Some(match plan {
            None => one,
            Some(best) => {
                let (crossed, least) = (crossings_in(&one.sliders), crossings_in(&best.sliders));
                if crossed < least || (crossed == least && cheaper(&one.cost, &best.cost)) {
                    one
                } else {
                    best
                }
            }
        });
    }
    if let Some(plan) = plan {
        for (index, slider) in plan.sliders.iter().enumerate() {
            let item = scene.item_mut(slider.item);
            item.bx.x = plan.centres[index] - item.bx.width / 2.0;
        }
    }
}

#[cfg(test)]
mod tests {
    use archboard_scene::geometry::Rect;

    use super::*;
    use crate::track::scene::Item;

    /// A label box on a line that runs straight through one x above and
    /// below it, Graphviz standing its left edge at `x`.
    fn slider(scene: &mut Placement, x: f64, end: f64) -> Slider {
        let bx = Rect {
            x,
            y: 0.0,
            width: 100.0,
            height: 20.0,
        };
        Slider {
            item: scene.add(Item::new(bx, 0)),
            wanted: end,
            reaches: vec![(end, end), (end, end)],
            ends: [end, end],
            inward: 0.0,
        }
    }

    // A port settled after Graphviz ranked its block can stand one label's
    // line on the far side of another's; kept in Graphviz's order, the two
    // lines cross between their labels and their ends.
    #[test]
    fn labels_whose_lines_graphviz_s_order_would_cross_stand_in_the_order_of_their_lines() {
        let mut scene = Placement::default();
        let left = slider(&mut scene, 0.0, 500.0);
        let right = slider(&mut scene, 200.0, 100.0);
        let (one, other) = (left.item, right.item);
        place_run(&mut scene, &[left, right], 0.0, 800.0);
        assert!(scene.item(other).bx.x < scene.item(one).bx.x);
    }
}
