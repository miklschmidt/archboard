//! The ECMAScript arithmetic and spelling of [`crate::js`] that only this
//! crate's own code reads.

use crate::js::to_fixed;

/// `Number(value.toFixed(places))`: a number rounded to some places.
pub(crate) fn fixed(value: f64, places: usize) -> f64 {
    to_fixed(value, places).parse::<f64>().unwrap_or(f64::NAN)
}

/// `x ** n` for a small whole exponent, as JavaScriptCore multiplies it out.
pub(crate) fn powi(base: f64, exponent: u32) -> f64 {
    let mut result = 1.0;
    let mut x = base;
    let mut n = exponent;
    while n != 0 {
        if n & 1 == 1 {
            result *= x;
        }
        x *= x;
        n >>= 1;
    }
    result
}

/// Whether a character is white space to ECMAScript: `\s` and `trim`.
pub(crate) fn is_space(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'
            | '\u{000A}'
            | '\u{000B}'
            | '\u{000C}'
            | '\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `text.trimEnd()`.
pub(crate) fn trim_end(text: &str) -> &str {
    text.trim_end_matches(is_space)
}

/// `text.split(/\s+/u)`: the pieces between runs of white space, an empty one
/// at either end where the text starts or ends with white space.
pub(crate) fn split_spaces(text: &str) -> Vec<&str> {
    let mut pieces = Vec::new();
    let mut start = 0;
    let mut in_space = false;
    for (at, character) in text.char_indices() {
        if is_space(character) {
            if !in_space {
                pieces.push(&text[start..at]);
                in_space = true;
            }
        } else if in_space {
            start = at;
            in_space = false;
        }
    }
    pieces.push(if in_space { "" } else { &text[start..] });
    pieces
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_on_white_space() {
        assert_eq!(split_spaces(" a  b "), vec!["", "a", "b", ""]);
        assert_eq!(split_spaces("a"), vec!["a"]);
        assert_eq!(split_spaces(""), vec![""]);
    }
}
