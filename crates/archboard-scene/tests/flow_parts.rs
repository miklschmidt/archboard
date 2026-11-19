//! Flow part measures: each part a flow layout places is measured where the
//! painter draws it from, so the layout and the painter agree without sharing a
//! size. Each test states the agreement its measure exists for.

use archboard_scene::{CardWords, ColumnLimits, HeadCards, sequence_cards};

/// A sequence card's words.
fn card<'a>(name: &'a str, responsibility: Option<&'a str>, drills: bool) -> CardWords<'a> {
    CardWords {
        name,
        responsibility,
        path: None,
        tags: &[],
        drills,
        door: false,
        toggle: None,
    }
}

/// A card's chrome across: its padding either side, its chip and the gap after it.
const CARD_CHROME: f64 = 13.0 * 2.0 + 24.0 + 10.0;

/// What a reserving service is responsible for: three lines or so in a column.
const RESERVES: &str =
    "Reserves stock for every order line and releases what an order no longer holds";

/// A plain card and a card with a responsibility that opens another picture,
/// measured together in the layout's usual limits.
fn two_cards() -> HeadCards {
    sequence_cards(
        &[
            card("Checkout API", None, false),
            card("Inventory service", Some(RESERVES), true),
        ],
        ColumnLimits {
            least: 112.0,
            most: 192.0,
            floor: 0.0,
        },
    )
}

#[test]
fn a_card_holds_its_whole_responsibility_inside_its_text_run() {
    let heads = two_cards();
    assert!((112.0..=192.0).contains(&heads.width));
    let notes = &heads.cards[1].notes;
    assert!(notes.len() > 1);
    for line in notes {
        assert!(
            line.width + CARD_CHROME <= heads.width,
            "{} overruns",
            line.text
        );
    }
    let joined: Vec<&str> = notes.iter().map(|line| line.text.as_str()).collect();
    assert_eq!(joined.join(" "), RESERVES);
}

#[test]
fn a_card_grows_a_note_line_at_a_time_and_keeps_its_mark_beside_its_name() {
    let heads = two_cards();
    let [plain, noted] = heads.cards.as_slice() else {
        panic!("one card each");
    };
    assert_eq!((plain.notes.len(), plain.height), (0, 46.0));
    // One line of a note is 9.5 high at a 1.35 line height.
    let extra = noted.notes.len() as f64 - 1.0;
    assert!((noted.height - (58.0 + extra * 12.825)).abs() < 1e-9);
    assert_eq!(plain.title_room, heads.width - CARD_CHROME);
    assert_eq!(noted.title_room, heads.width - CARD_CHROME - 21.0);
    // The lifeline starts clear of the card's shadow.
    assert_eq!(heads.lifeline_drop, 13.0);
}

#[test]
fn a_long_name_steps_its_title_down_before_it_widens_every_column() {
    let long = "Fulfilment orchestration coordinator";
    let heads = sequence_cards(
        &[card(long, None, false)],
        ColumnLimits {
            least: 112.0,
            most: 120.0,
            floor: 300.0,
        },
    );
    assert_eq!(heads.width, 300.0, "the layout's floor wins");
    let narrow = sequence_cards(
        &[card(long, None, false)],
        ColumnLimits {
            least: 112.0,
            most: 120.0,
            floor: 0.0,
        },
    );
    let fitted = &narrow.cards[0];
    assert!(
        fitted.title_size < 11.5,
        "a narrow column sets a smaller title"
    );
    assert!(fitted.title_size >= 10.5, "never below the floor");
    assert!(
        narrow.width > 120.0,
        "the smallest title still fits, so columns widen"
    );
}
