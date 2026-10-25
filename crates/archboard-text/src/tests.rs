use crate::{Face, Paragraph, outline, shape, width};

const FACE: Face = Face::SansRegular;

#[test]
fn a_run_is_shaped_with_the_fonts_kerning() {
    let pair = width(FACE, "AV", 20.0);
    let apart = width(FACE, "A", 20.0) + width(FACE, "V", 20.0);
    assert!(pair < apart, "AV kerns: {pair} against {apart}");
}

#[test]
fn a_width_scales_with_the_size_and_nothing_else() {
    let small = width(Face::SansMedium, "AuthService", 10.0);
    let large = width(Face::SansMedium, "AuthService", 20.0);
    assert!(small > 0.0);
    assert_eq!(large, small * 2.0);
}

#[test]
fn glyphs_stand_along_the_run_in_order() {
    let run = shape(Face::MonoRegular, "abc");
    assert_eq!(run.glyphs.len(), 3);
    assert_eq!(run.glyphs[0].x, 0);
    assert!(run.glyphs.windows(2).all(|pair| pair[0].x < pair[1].x));
    assert_eq!(i64::from(run.glyphs[2].x) * 3, run.advance * 2);
}

#[test]
fn a_letter_has_an_outline_and_a_space_none() {
    let letter = shape(FACE, "A").glyphs[0].id;
    let space = shape(FACE, " ").glyphs[0].id;
    assert!(!outline(FACE, letter).is_empty());
    assert!(outline(FACE, space).is_empty());
}

fn texts(paragraph: &Paragraph, width: f64) -> Vec<String> {
    paragraph
        .lines(width)
        .into_iter()
        .map(|line| line.text)
        .collect()
}

#[test]
fn words_break_after_spaces_that_hang() {
    let words = "alpha beta gamma";
    let paragraph = Paragraph::new(FACE, 10.0, words);
    let two = width(FACE, "alpha beta", 10.0);
    assert_eq!(texts(&paragraph, two), ["alpha beta", "gamma"]);
    assert_eq!(texts(&paragraph, 1000.0), [words]);
    // Its words, each set on its own, against the line set whole.
    assert!((paragraph.natural_width() - width(FACE, words, 10.0)).abs() < 0.05);
}

#[test]
fn a_word_wider_than_the_line_breaks_between_graphemes() {
    let paragraph = Paragraph::new(FACE, 10.0, "Supercalifragilistic");
    let lines = paragraph.lines(40.0);
    assert!(lines.len() > 1);
    assert!(lines[..lines.len() - 1].iter().all(|line| line.broken));
    assert!(lines.iter().all(|line| line.width <= 40.005));
    assert_eq!(
        lines
            .iter()
            .map(|line| line.text.as_str())
            .collect::<String>(),
        "Supercalifragilistic"
    );
}

#[test]
fn hard_breaks_always_break_and_no_words_make_no_line() {
    let paragraph = Paragraph::new(FACE, 10.0, "one\ntwo");
    assert_eq!(texts(&paragraph, 1000.0), ["one", "two"]);
    assert_eq!(Paragraph::new(FACE, 10.0, "").line_count(100.0), 0);
}

#[test]
fn a_balanced_width_keeps_the_lines_and_evens_them() {
    let paragraph = Paragraph::new(FACE, 10.0, "one two three four five six seven");
    let limit = width(FACE, "one two three four five six", 10.0);
    let balanced = paragraph.balanced_width(limit);
    assert!(balanced < limit);
    assert_eq!(paragraph.line_count(balanced), paragraph.line_count(limit));
    let lines = paragraph.lines(balanced);
    assert!(lines[1].width > width(FACE, "seven", 10.0));
}

#[test]
fn fewer_lines_are_found_at_the_narrowest_whole_width() {
    let paragraph = Paragraph::new(FACE, 10.0, "one two three");
    let narrow = width(FACE, "three", 10.0) + 1.0;
    let wider = paragraph
        .fewer_lines_at(narrow)
        .expect("three lines can be fewer");
    assert!(paragraph.line_count(wider) < paragraph.line_count(narrow));
    assert!(paragraph.line_count(wider - 1.0) >= paragraph.line_count(narrow));
    assert_eq!(paragraph.fewer_lines_at(1000.0), None);
}

#[test]
fn a_character_its_face_lacks_is_drawn_from_the_first_fallback_that_has_it() {
    let cases = [
        (Face::SansRegular, 'α', Face::GreekRegular),
        (Face::SansMedium, 'Ω', Face::GreekMedium),
        (Face::SansRegular, '✗', Face::Symbols),
        (Face::SansMedium, '■', Face::Symbols),
        (Face::SansRegular, '─', Face::Math),
        (Face::SansRegular, '√', Face::Math),
        (Face::SansRegular, '⇄', Face::Math),
        (Face::MonoRegular, '→', Face::Math),
    ];
    for (face, character, fallback) in cases {
        let run = shape(face, &format!("a{character}b"));
        let faces: Vec<Face> = run.glyphs.iter().map(|glyph| glyph.face).collect();
        assert_eq!(faces, [face, fallback, face], "{character} in {face:?}");
        let drawn = run.glyphs[1].id;
        assert_ne!(drawn, 0, "{character} is drawn, not .notdef");
        assert!(
            !outline(fallback, drawn).is_empty(),
            "{character} has an outline"
        );
        assert!(
            run.glyphs[1].x < run.glyphs[2].x,
            "{character} advances the pen"
        );
    }
}

#[test]
fn a_character_its_face_has_stays_in_its_face() {
    let run = shape(FACE, "a → b");
    assert!(run.glyphs.iter().all(|glyph| glyph.face == FACE));
}

#[test]
fn every_face_shares_one_unit() {
    assert!(Face::ALL.iter().all(|face| face.units_per_em() == 1000));
}

#[test]
fn unicode_mandatory_separators_break_even_a_wide_line() {
    for separator in [
        "\n", "\r\n", "\r", "\u{b}", "\u{c}", "\u{85}", "\u{2028}", "\u{2029}",
    ] {
        let words = format!("α{separator}б{separator}");
        let paragraph = Paragraph::new(FACE, 10.0, &words);
        assert_eq!(texts(&paragraph, 1000.0), ["α", "б", ""]);
    }
}

#[test]
fn nonbreaking_spaces_are_content_even_at_the_end_of_a_line() {
    for words in ["alpha\u{a0}", "alpha\u{202f}"] {
        let paragraph = Paragraph::new(FACE, 10.0, words);
        assert_eq!(texts(&paragraph, 1000.0), [words]);
    }
}

#[test]
fn tabs_advance_to_eight_space_stops_without_missing_glyphs() {
    let run = shape(FACE, "a\tb");
    let stop = shape(FACE, " ").advance * 8;
    assert_eq!(run.glyphs.len(), 2);
    assert!(run.glyphs.iter().all(|glyph| glyph.id != 0));
    assert_eq!(i64::from(run.glyphs[1].x), stop);
    assert_eq!(
        shape(FACE, "        \tb").advance,
        2 * stop + shape(FACE, "b").advance
    );
}

#[test]
fn wrapped_tabs_start_from_the_new_line() {
    let paragraph = Paragraph::new(FACE, 10.0, "ab\tc de\tf");
    let limit = width(FACE, "ab\tc", 10.0);
    let lines = paragraph.lines(limit);
    assert_eq!(texts(&paragraph, limit), ["ab\tc", "de\tf"]);
    assert!(lines.iter().all(|line| line.width <= limit));
}
