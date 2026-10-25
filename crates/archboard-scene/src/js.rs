//! The arithmetic and the spelling of ECMAScript that the pictures were first
//! drawn with. The SVG a picture writes is compared byte for byte with the one
//! the TypeScript painter wrote (ADR 0057), so a number is rounded and spelt
//! here exactly as JavaScript rounds and spells it.

/// `Math.round`, as JavaScriptCore computes it: the nearest integer, a half
/// rounded up, and the sign of a zero kept.
pub fn round(value: f64) -> f64 {
    if !value.is_finite() || value == value.trunc() {
        return value;
    }
    let floor = value.floor();
    // Exact: a value with a fraction is below 2^52, where this has no error.
    let rounded = if value - floor >= 0.5 {
        floor + 1.0
    } else {
        floor
    };
    if rounded == 0.0 && value < 0.0 {
        -0.0
    } else {
        rounded
    }
}

/// `String(value)`: the shortest spelling that reads back as the same number,
/// with an exponent only beyond the range ECMAScript writes without one.
pub fn number(value: f64) -> String {
    if value == 0.0 {
        // ECMAScript spells negative zero as "0".
        return "0".to_owned();
    }
    let mut buffer = ryu_js::Buffer::new();
    buffer.format(value).to_owned()
}

/// `value.toFixed(digits)`: the decimal with `digits` places nearest the exact
/// value, the larger one where two are as near.
pub fn to_fixed(value: f64, digits: usize) -> String {
    if !value.is_finite() || value.abs() >= 1e21 {
        return number(value);
    }
    let negative = value < 0.0;
    let magnitude = value.abs();
    let mut fixed = format!("{magnitude:.digits$}");
    if is_tie(magnitude, digits) {
        fixed = rounded_up(&format!("{magnitude:.width$}", width = digits + 1));
    }
    if negative { format!("-{fixed}") } else { fixed }
}

/// Whether a non-negative number lies exactly halfway between two decimals of
/// some places, where Rust rounds to the even one and ECMAScript up.
fn is_tie(magnitude: f64, digits: usize) -> bool {
    let near = format!("{magnitude:.width$}", width = digits + 3);
    let tail = &near[near.len() - 3..];
    if tail != "500" && tail != "499" && tail != "501" {
        return false;
    }
    // A double has at most 1074 places; spelt in full, a tie is a 5 and zeros.
    let exact = format!("{magnitude:.1100}");
    let point = exact.find('.').unwrap_or(exact.len());
    let rest = &exact[point + 1 + digits..];
    rest.starts_with('5') && rest[1..].bytes().all(|digit| digit == b'0')
}

/// A decimal of one place more than wanted, whose last digit is a 5, rounded
/// up to the places wanted.
fn rounded_up(longer: &str) -> String {
    let mut digits: Vec<u8> = longer[..longer.len() - 1].bytes().collect();
    if digits.last() == Some(&b'.') {
        digits.pop();
    }
    let mut index = digits.len();
    loop {
        if index == 0 {
            digits.insert(0, b'1');
            break;
        }
        index -= 1;
        match digits[index] {
            b'.' => continue,
            b'9' => digits[index] = b'0',
            digit => {
                digits[index] = digit + 1;
                break;
            }
        }
    }
    String::from_utf8(digits).unwrap_or_default()
}

/// `String(Number(value.toFixed(places)))`: a number rounded to some places and
/// spelt without trailing zeros.
pub fn fixed_number(value: f64, places: usize) -> String {
    number(to_fixed(value, places).parse::<f64>().unwrap_or(f64::NAN))
}

/// `value.toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 21 })`:
/// the shortest digits that read back as the number, always without an exponent.
pub fn plain_decimal(value: f64) -> String {
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
    let point = mantissa.find('.').unwrap_or(mantissa.len()) as i32 + exponent;
    let written = if point <= 0 {
        format!("0.{}{digits}", "0".repeat((-point) as usize))
    } else if point as usize >= digits.len() {
        format!("{digits}{}", "0".repeat(point as usize - digits.len()))
    } else {
        format!(
            "{}.{}",
            &digits[..point as usize],
            &digits[point as usize..]
        )
    };
    format!("{sign}{written}")
}

/// Two to a power, exactly.
const fn power_of_two(exponent: i64) -> f64 {
    f64::from_bits(((1023 + exponent) as u64) << 52)
}

/// `Math.hypot(a, b)` as Bun computes it on Linux, where JavaScriptCore calls
/// the C library's `hypot`: glibc's, a square root corrected by its error.
pub fn hypot(a: f64, b: f64) -> f64 {
    /// Below this share of the larger value, the smaller adds nothing.
    const EPS: f64 = power_of_two(-54);
    /// Beyond these, the squares would overflow or underflow unscaled.
    const LARGE: f64 = power_of_two(511);
    const TINY: f64 = power_of_two(-511);
    const SCALE: f64 = power_of_two(-600);
    if a.is_infinite() || b.is_infinite() {
        return f64::INFINITY;
    }
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    let (a, b) = (a.abs(), b.abs());
    let (large, small) = if a < b { (b, a) } else { (a, b) };
    let kernel = |ax: f64, ay: f64| {
        let mut h = (ax * ax + ay * ay).sqrt();
        let (t1, t2) = if h <= 2.0 * ay {
            let delta = h - ay;
            (ax * (2.0 * delta - ax), (delta - 2.0 * (ax - ay)) * delta)
        } else {
            let delta = h - ax;
            (
                2.0 * delta * (ax - 2.0 * ay),
                (4.0 * delta - ay) * ay + delta * delta,
            )
        };
        h -= (t1 + t2) / (2.0 * h);
        h
    };
    if large > LARGE {
        if small <= large * EPS {
            return large + small;
        }
        return kernel(large * SCALE, small * SCALE) / SCALE;
    }
    if small < TINY {
        if large >= small / EPS {
            return large + small;
        }
        return kernel(large / SCALE, small / SCALE) * SCALE;
    }
    if small <= large * EPS {
        return large + small;
    }
    kernel(large, small)
}

/// `Math.min(...values)`: infinity for none.
pub fn min(values: impl IntoIterator<Item = f64>) -> f64 {
    values.into_iter().fold(f64::INFINITY, js_min)
}

/// `Math.max(...values)`: negative infinity for none.
pub fn max(values: impl IntoIterator<Item = f64>) -> f64 {
    values.into_iter().fold(f64::NEG_INFINITY, js_max)
}

/// `Math.min(a, b)`: NaN wins, and negative zero is below positive zero.
pub fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a == 0.0 && b == 0.0 {
        return if a.is_sign_negative() { a } else { b };
    }
    if b < a { b } else { a }
}

/// `Math.max(a, b)`: NaN wins, and positive zero is above negative zero.
pub fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a == 0.0 && b == 0.0 {
        return if a.is_sign_positive() { a } else { b };
    }
    if b > a { b } else { a }
}

/// `Math.sign`.
pub fn sign(value: f64) -> f64 {
    if value > 0.0 {
        1.0
    } else if value < 0.0 {
        -1.0
    } else {
        value
    }
}

/// `a % b`: the remainder with the sign of the dividend.
pub fn remainder(a: f64, b: f64) -> f64 {
    a % b
}

/// `x ** n` for a small whole exponent, as JavaScriptCore multiplies it out.
pub fn powi(base: f64, exponent: u32) -> f64 {
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

/// `Math.pow` and `**`.
pub fn pow(base: f64, exponent: f64) -> f64 {
    if exponent.fract() == 0.0 && (0.0..=1000.0).contains(&exponent) {
        return powi(base, exponent as u32);
    }
    libm::pow(base, exponent)
}

/// Whether a character is white space to ECMAScript: `\s` and `trim`.
pub fn is_space(character: char) -> bool {
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

/// `text.trim()`.
pub fn trim(text: &str) -> &str {
    text.trim_matches(is_space)
}

/// `text.trimEnd()`.
pub fn trim_end(text: &str) -> &str {
    text.trim_end_matches(is_space)
}

/// `text.split(/\s+/u)`: the pieces between runs of white space, an empty one
/// at either end where the text starts or ends with white space.
pub fn split_spaces(text: &str) -> Vec<&str> {
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

/// A 32-bit number spelt in some base, lowercase, as `toString(radix)` spells it.
pub fn radix(mut value: u32, base: u32) -> String {
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
pub fn pad_start(text: &str, width: usize, fill: char) -> String {
    let length = text.encode_utf16().count();
    if length >= width {
        return text.to_owned();
    }
    format!("{}{text}", fill.to_string().repeat(width - length))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spells_numbers_as_ecmascript_does() {
        assert_eq!(number(-0.0), "0");
        assert_eq!(number(1e21), "1e+21");
        assert_eq!(number(1e-7), "1e-7");
        assert_eq!(number(123.456), "123.456");
        assert_eq!(number(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(number(5.0), "5");
    }

    #[test]
    fn fixes_ties_upward() {
        assert_eq!(to_fixed(0.125, 2), "0.13");
        assert_eq!(to_fixed(0.03125, 4), "0.0313");
        assert_eq!(to_fixed(1.005, 2), "1.00");
        assert_eq!(to_fixed(-0.0, 2), "0.00");
        assert_eq!(to_fixed(-0.0001, 2), "-0.00");
        assert_eq!(to_fixed(9.995, 2), "9.99");
        assert_eq!(to_fixed(0.5, 0), "1");
        assert_eq!(to_fixed(9.5, 0), "10");
    }

    #[test]
    fn spells_locale_decimals_without_exponent() {
        assert_eq!(plain_decimal(1e-7), "0.0000001");
        assert_eq!(plain_decimal(2.345_678_901_234_568), "2.345678901234568");
        assert_eq!(plain_decimal(1e21), "1000000000000000000000");
        assert_eq!(plain_decimal(0.000001234), "0.000001234");
    }

    #[test]
    fn rounds_as_math_round() {
        assert!(round(-0.5) == 0.0 && round(-0.5).is_sign_negative());
        assert_eq!(round(2.5), 3.0);
        assert_eq!(round(-2.5), -2.0);
        assert_eq!(round(0.49999999999999994), 0.0);
    }

    #[test]
    fn measures_hypotenuses_as_bun_does() {
        // Each answered by Bun, and by neither a plain nor a compensated sum.
        for (a, b, bun) in [
            (
                -0.04125701277109656,
                0.09338635618024804,
                0.10209384224045334,
            ),
            (
                -0.11534136387768265,
                -0.04230269221230534,
                0.12285417367583829,
            ),
            (
                0.06478591813463064,
                -0.1430739112631762,
                0.15705845813801395,
            ),
            (3.0, 4.0, 5.0),
            (1e-200, 1e-200, 1.414213562373095e-200),
        ] {
            assert_eq!(hypot(a, b), bun);
        }
    }

    #[test]
    fn raises_powers_as_bun_did() {
        let expected = [
            "0",
            "0.006386195777429465",
            "0.03144931701563672",
            "0.07991367703609605",
            "0.15487460378925744",
            "0.2587457578615632",
            "0.39354110813135823",
            "0.5610062767350065",
            "0.7626920128966066",
        ];
        for (step, want) in expected.iter().enumerate() {
            assert_eq!(number(pow(step as f64 / 9.0, 2.3)), *want);
        }
    }

    #[test]
    fn splits_on_white_space() {
        assert_eq!(split_spaces(" a  b "), vec!["", "a", "b", ""]);
        assert_eq!(split_spaces("a"), vec!["a"]);
        assert_eq!(split_spaces(""), vec![""]);
    }
}
