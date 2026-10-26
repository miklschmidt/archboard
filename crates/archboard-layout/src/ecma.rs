//! The semantics of ECMAScript the layout was first written with, beyond the
//! arithmetic of `archboard_scene::js`: how a comparator orders a sort, how a
//! number reads back from its spelling, and how a set of numbers tells two
//! apart. The layout is held to what the TypeScript engine answered (ADR 0057).

use std::cmp::Ordering;

pub(crate) use archboard_scene::js::{
    hypot, js_max, js_min, max, min, number, pow, round, sign, to_fixed,
};

/// What a comparator's answer means to a sort: below zero first, above zero
/// second, and zero or not a number alike.
pub(crate) fn order(value: f64) -> Ordering {
    if value < 0.0 {
        Ordering::Less
    } else if value > 0.0 {
        Ordering::Greater
    } else {
        Ordering::Equal
    }
}

/// `first || second` of two numbers: the first unless it is zero or not a number.
pub(crate) fn or(first: f64, second: f64) -> f64 {
    if first != 0.0 && !first.is_nan() {
        first
    } else {
        second
    }
}

/// `array.toSorted(compare)`: a stable sort by a comparator that answers a number.
pub(crate) fn sorted_by<T: Clone>(items: &[T], mut compare: impl FnMut(&T, &T) -> f64) -> Vec<T> {
    let mut sorted = items.to_vec();
    sorted.sort_by(|one, other| order(compare(one, other)));
    sorted
}

/// `array.sort(compare)` in place: a stable sort by a comparator that answers a number.
pub(crate) fn sort_by<T>(items: &mut [T], mut compare: impl FnMut(&T, &T) -> f64) {
    items.sort_by(|one, other| order(compare(one, other)));
}

/// A number as it reads back from its spelling (`Number(String(value))`):
/// the same number, but negative zero reads back as zero.
pub(crate) fn via_text(value: f64) -> f64 {
    if value == 0.0 { 0.0 } else { value }
}

/// The key a `Set` or `Map` of ECMAScript keeps a number by: SameValueZero,
/// under which negative zero is zero and every not-a-number is one.
pub(crate) fn number_key(value: f64) -> u64 {
    if value == 0.0 {
        0
    } else if value.is_nan() {
        f64::NAN.to_bits()
    } else {
        value.to_bits()
    }
}

/// `[...new Set(values)]`: the values without repeats, each where it first stood.
pub(crate) fn unique(values: &[f64]) -> Vec<f64> {
    let mut seen = rustc_hash::FxHashSet::default();
    values
        .iter()
        .copied()
        .filter(|value| seen.insert(number_key(*value)))
        .collect()
}

/// `[...new Set(values)].sort((a, b) => a - b)`, without hashing: a stable
/// sort keeps the first of equal values first, so keeping the first of each
/// run keeps the value the set keeps. Only for numbers that are finite, which
/// the comparator orders; others go the set's way.
pub(crate) fn sorted_unique(values: &[f64]) -> Vec<f64> {
    if !values.iter().all(|value| value.is_finite()) {
        let mut set = unique(values);
        sort_by(&mut set, |one, other| one - other);
        return set;
    }
    let mut sorted = values.to_vec();
    sort_by(&mut sorted, |one, other| one - other);
    sorted.dedup_by(|later, first| later == first);
    sorted
}

/// `Number(text)` for the decimals a layout spells: white space trimmed, the
/// empty text zero, anything else not a number.
pub(crate) fn number_of(text: &str) -> f64 {
    let trimmed = archboard_scene::js::trim(text);
    if trimmed.is_empty() {
        return 0.0;
    }
    match trimmed {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    let decimal = trimmed
        .bytes()
        .all(|byte| byte.is_ascii_digit() || matches!(byte, b'.' | b'-' | b'+' | b'e' | b'E'));
    if !decimal {
        return f64::NAN;
    }
    trimmed.parse::<f64>().unwrap_or(f64::NAN)
}

/// `Math.min(...values)` over a slice.
pub(crate) fn min_of(values: &[f64]) -> f64 {
    min(values.iter().copied())
}

/// `Math.abs`.
pub(crate) fn abs(value: f64) -> f64 {
    value.abs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_numbers_as_ecmascript_does() {
        assert_eq!(number_of(""), 0.0);
        assert_eq!(number_of(" 12.5 "), 12.5);
        assert_eq!(number_of("-0"), 0.0);
        assert!(number_of("abc").is_nan());
        assert_eq!(number_of("1e3"), 1000.0);
    }

    #[test]
    fn keeps_numbers_as_a_set_does() {
        assert_eq!(unique(&[0.0, -0.0, 1.0, 1.0, 2.0]), vec![0.0, 1.0, 2.0]);
        assert_eq!(number_key(-0.0), number_key(0.0));
    }

    #[test]
    fn sorts_a_set_of_numbers_as_sorting_the_set_does() {
        for values in [
            vec![3.0, -0.0, 1.0, 0.0, 3.0, -2.5, 1.0],
            vec![0.0, -0.0, 2.0],
            vec![f64::INFINITY, 1.0, f64::NEG_INFINITY, 1.0],
        ] {
            let mut set = unique(&values);
            sort_by(&mut set, |one, other| one - other);
            let sorted = sorted_unique(&values);
            assert_eq!(
                sorted
                    .iter()
                    .map(|value| value.to_bits())
                    .collect::<Vec<_>>(),
                set.iter().map(|value| value.to_bits()).collect::<Vec<_>>()
            );
        }
    }
}
