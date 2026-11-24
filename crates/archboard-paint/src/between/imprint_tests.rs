//! A mutation's imprint and glow, carried with its line from one scene to the next.

use archboard_scene::scene::{Geometry, Item, Purpose, Scene, Shape, Stroke, Token};

use super::Between;
use super::testing::{PHASES, drawing, line, scene};

/// A straight mutation with the stripe and glow laid across its target.
fn mutation(start: f64, end: f64) -> Scene {
    let Item::Group(mut group) = line("write", &[(start, 0.0), (end, 0.0)]) else {
        panic!("a line group")
    };
    let stripe = Geometry::Line {
        from: super::testing::at(end - 1.8, -9.0),
        to: super::testing::at(end - 1.8, 9.0),
    };
    group.items.splice(
        ..0,
        [(Purpose::Glow, 16.0), (Purpose::Imprint, 3.6)].map(|(purpose, width)| {
            Item::Shape(
                Shape::new(purpose, stripe.clone())
                    .unfilled()
                    .stroked(Stroke::new(Token::Border, width)),
            )
        }),
    );
    scene(vec![Item::Group(group)], &[])
}

fn imprints(body: &[Item]) -> Vec<Item> {
    drawing(body, "write")[0]
        .items
        .iter()
        .filter(|item| super::line::target_imprint(item))
        .cloned()
        .collect()
}

#[test]
fn a_carried_mutation_keeps_its_landed_marks_at_a_stationary_target() {
    let from = mutation(0.0, 100.0);
    let moved_caller = mutation(6.0, 100.0);
    let t = PHASES.transition;
    let during = f64::midpoint(t.move_start, t.move_end);
    let stationary = Between::new(&from, &moved_caller, (0.0, 0.0), &PHASES);
    assert_eq!(imprints(&stationary.at(during)), imprints(&from.body));

    let without_marks = scene(vec![line("write", &[(0.0, 0.0), (100.0, 0.0)])], &[]);
    let arriving = Between::new(&without_marks, &moved_caller, (0.0, 0.0), &PHASES);
    assert_eq!(imprints(&arriving.at(during)), Vec::<Item>::new());
    assert_eq!(
        imprints(&arriving.at(t.move_end)),
        imprints(&moved_caller.body)
    );
}

#[test]
fn a_carried_mutation_leaves_its_old_marks_and_lands_its_new_ones() {
    let from = mutation(0.0, 100.0);
    let moved_target = mutation(6.0, 106.0);
    let t = PHASES.transition;
    let during = f64::midpoint(t.move_start, t.move_end);
    for (old, next) in [(&from, &moved_target), (&moved_target, &from)] {
        let between = Between::new(old, next, (0.0, 0.0), &PHASES);
        assert_eq!(imprints(&between.at(t.move_start)), imprints(&old.body));
        assert_eq!(imprints(&between.at(during)), Vec::<Item>::new());
        assert_eq!(imprints(&between.at(t.move_end)), imprints(&next.body));
    }
}
