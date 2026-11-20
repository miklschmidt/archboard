//! How the SVG spells a number beyond its shortest form, as the TypeScript
//! painter's JavaScript spelt it: in a base, padded, rounded to some places,
//! and as a locale decimal without an exponent.

use archboard_scene::js::{fixed, number};

/// `String(Number(value.toFixed(places)))`: a number rounded to some places and
/// spelt without trailing zeros.
pub(crate) fn fixed_number(value: f64, places: usize) -> String {
    number(fixed(value, places))
}

/// `value.toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 21 })`:
/// the shortest digits that read back as the number, always without an exponent.
pub(crate) fn plain_decimal(value: f64) -> String {
    let spelt = number(value);
    let Some(at) = spelt.find('e') else {
        return spelt;
    };
    let (mantissa, exponent) = (&spelt[..at], &spelt[at + 1..]);
    let exponent: i32 = exponent.parse().unwrap_or(0);
    let (sign, mantissa) = match mantissa.strip_prefix('-') {
        Some(rest) => ("-", rest),
        None => ("", mantissa),
    };
    let digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
    let (point, zeros) = moved_point(mantissa.find('.').unwrap_or(mantissa.len()), exponent);
    let written = if point == 0 {
        format!("0.{}{digits}", "0".repeat(zeros))
    } else if point >= digits.len() {
        format!("{digits}{}", "0".repeat(point - digits.len()))
    } else {
        format!("{}.{}", &digits[..point], &digits[point..])
    };
    format!("{sign}{written}")
}

/// Where the decimal point stands once an exponent moves it from after a
/// mantissa's `whole` digits: how many digits stand before it, or, when none
/// do, how many zeros stand between it and the digits.
fn moved_point(whole: usize, exponent: i32) -> (usize, usize) {
    let shift = exponent.unsigned_abs() as usize;
    if exponent >= 0 {
        return (whole + shift, 0);
    }
    match whole.checked_sub(shift) {
        Some(point) if point > 0 => (point, 0),
        _ => (0, shift - whole),
    }
}

/// A 32-bit number spelt in some base, lowercase, as `toString(radix)` spells it.
pub(crate) fn radix(mut value: u32, base: u32) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".to_owned();
    }
    let mut spelt = Vec::new();
    while value > 0 {
        spelt.push(DIGITS[(value % base) as usize]);
        value /= base;
    }
    spelt.reverse();
    String::from_utf8(spelt).unwrap_or_default()
}

/// `text.padStart(width, fill)`.
pub(crate) fn pad_start(text: &str, width: usize, fill: char) -> String {
    let length = text.encode_utf16().count();
    if length >= width {
        return text.to_owned();
    }
    format!("{}{text}", fill.to_string().repeat(width - length))
}

#[cfg(test)]
#[expect(
    clippy::unreadable_literal,
    reason = "the expected numbers are spelt as ECMAScript prints them, digit for digit"
)]
mod tests {
    use super::*;

    #[test]
    fn spells_locale_decimals_without_exponent() {
        assert_eq!(plain_decimal(1e-7), "0.0000001");
        assert_eq!(plain_decimal(2.345_678_901_234_568), "2.345678901234568");
        assert_eq!(plain_decimal(1e21), "1000000000000000000000");
        assert_eq!(plain_decimal(0.000001234), "0.000001234");
    }
}
