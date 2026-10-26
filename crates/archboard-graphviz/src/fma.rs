//! A fused multiply-add for WebAssembly that rounds correctly and runs fast.
//!
//! WebAssembly has no fused multiply-add instruction, so `f64::mul_add`
//! becomes a call to the C function `fma`, which `compiler_builtins` defines
//! with a generic software routine. graphviz-pure calls `mul_add` wherever C
//! Graphviz is contracted to a fused multiply-add, and in the core that
//! routine took 15.6% of every Graphviz layout (ADR 0058).
//!
//! This module defines `fma` for the WebAssembly build, which the linker
//! takes in place of the weak definition of `compiler_builtins`. It emulates
//! the fused operation with ordinary double arithmetic (Boldo and Melquiond,
//! "Emulation of FMA and correctly rounded sums: proved algorithms using
//! rounding to odd", IEEE Transactions on Computers, 2008, algorithm 5): the
//! exact product as a sum of two doubles, the exact sum of its high part and
//! the addend, the two low parts added with rounding to odd, and one rounding
//! to nearest. Where an intermediate could overflow, or lose bits below the
//! normal range, it answers with the `libm` crate's software `fma`. Either
//! way the answer is the correctly rounded one, so a drawing does not move.

/// `a + b` as the rounded sum and its exact error (Knuth's two-sum).
fn two_sum(a: f64, b: f64) -> (f64, f64) {
    let sum = a + b;
    let b_part = sum - a;
    (sum, (a - (sum - b_part)) + (b - b_part))
}

/// `a` as two halves of 26 significant bits each (Veltkamp's split).
fn split(a: f64) -> (f64, f64) {
    // 2^27 + 1.
    let scaled = 134_217_729.0 * a;
    let high = scaled - (scaled - a);
    (high, a - high)
}

/// `a * b` as the rounded product and its exact error (Dekker's two-product).
fn two_product(a: f64, b: f64) -> (f64, f64) {
    let product = a * b;
    let (a_high, a_low) = split(a);
    let (b_high, b_low) = split(b);
    let error = ((a_high * b_high - product) + a_high * b_low + a_low * b_high) + a_low * b_low;
    (product, error)
}

/// `a + b` rounded to odd: the sum when it is exact, else the neighbour of
/// the exact sum whose last significand bit is one.
fn add_round_to_odd(a: f64, b: f64) -> f64 {
    let (sum, error) = two_sum(a, b);
    let bits = sum.to_bits();
    if error == 0.0 || bits & 1 == 1 {
        return sum;
    }
    // The sum is even and inexact, so its odd neighbour lies towards the error.
    f64::from_bits(if (error > 0.0) == (sum > 0.0) {
        bits + 1
    } else {
        bits - 1
    })
}

/// The unbiased binary exponent of a double: 0 for 1.0, -1023 for zero.
fn exponent(x: f64) -> i64 {
    let biased = (x.to_bits() >> 52) & 0x7ff;
    i64::from(u16::try_from(biased).unwrap_or(0)) - 1023
}

/// `a * b + c` with one rounding.
pub(crate) fn fma(a: f64, b: f64, c: f64) -> f64 {
    // A zero factor makes the product exact (a signed zero, or NaN against an
    // infinity), so the one rounding is the addition's.
    if a == 0.0 || b == 0.0 {
        return a * b + c;
    }
    // With |a| and |b| in [2^-400, 2^401) and |c| in [2^-800, 2^801), the
    // product and every error term are normal and finite. Elsewhere, and for
    // infinities and NaNs, the software fma answers.
    if !(-400..=400).contains(&exponent(a)) || !(-400..=400).contains(&exponent(b)) {
        return libm::fma(a, b, c);
    }
    // The product is normal and not zero, so rounding it is the answer.
    if c == 0.0 {
        return a * b + c;
    }
    if !(-800..=800).contains(&exponent(c)) {
        return libm::fma(a, b, c);
    }
    let (product, product_error) = two_product(a, b);
    let (sum, sum_error) = two_sum(c, product);
    sum + add_round_to_odd(sum_error, product_error)
}

/// The C function that `f64::mul_add` calls on WebAssembly.
#[cfg(target_arch = "wasm32")]
#[expect(
    unsafe_code,
    reason = "naming the symbol fma is what takes the place of compiler_builtins' slow one; the function is safe Rust"
)]
#[unsafe(export_name = "fma")]
extern "C" fn fma_symbol(a: f64, b: f64, c: f64) -> f64 {
    fma(a, b, c)
}

#[cfg(test)]
mod tests {
    use super::fma;

    /// A splitmix64 sequence: the operands of a test, the same on every run.
    struct Operands(u64);

    impl Operands {
        fn bits(&mut self) -> u64 {
            self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
            let mut z = self.0;
            z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
            z ^ (z >> 31)
        }

        /// A number in [-1, 1) times a power of ten in [10^-span, 10^span).
        fn scaled(&mut self, span: i32) -> f64 {
            let unit =
                f64::from(u32::try_from(self.bits() >> 40).unwrap_or(0)) / f64::from(1u32 << 23);
            let power =
                i32::try_from(self.bits() % u64::from(2 * span.unsigned_abs())).unwrap_or(0) - span;
            (unit - 1.0) * 10f64.powi(power)
        }
    }

    /// The answer of the correctly rounded fma of the platform the tests run on.
    fn check(a: f64, b: f64, c: f64) {
        let got = fma(a, b, c);
        let want = a.mul_add(b, c);
        assert!(
            got.to_bits() == want.to_bits() || (got.is_nan() && want.is_nan()),
            "fma({a:e}, {b:e}, {c:e}) = {got:e}, not {want:e}"
        );
    }

    #[test]
    fn it_answers_the_correctly_rounded_fma_of_random_operands() {
        let mut operands = Operands(7);
        for _ in 0..1_000_000 {
            // Layout-sized coordinates and fractions, with an addend that often
            // nearly cancels the product.
            let (a, b) = (operands.scaled(6), operands.scaled(6));
            let c = if operands.bits() & 1 == 0 {
                -(a * b) * (1.0 + operands.scaled(12) * 1e-12)
            } else {
                operands.scaled(8)
            };
            check(a, b, c);
            // Any bit pattern: infinities, NaNs and subnormals among them.
            check(
                f64::from_bits(operands.bits()),
                f64::from_bits(operands.bits()),
                f64::from_bits(operands.bits()),
            );
        }
    }

    #[test]
    fn it_answers_the_correctly_rounded_fma_of_zeros_and_extremes() {
        let firsts = [0.0, -0.0, 1.5, -1.5, f64::INFINITY, f64::NAN, 1e-310];
        let seconds = [0.0, -0.0, 3.25, -3.25, f64::NEG_INFINITY, 1e-310];
        let addends = [0.0, -0.0, 2.0, -2.0, f64::INFINITY, 1e-320];
        for (a, b, c) in firsts
            .iter()
            .flat_map(|&a| seconds.iter().map(move |&b| (a, b)))
            .flat_map(|(a, b)| addends.iter().map(move |&c| (a, b, c)))
        {
            check(a, b, c);
        }
        for (a, b, c) in [
            (1.0, 1.0, -1.0),
            (f64::MAX, 2.0, -f64::MAX),
            (1e-300, 1e-300, 1e-310),
            (0.1, 10.0, -1.0),
            // A product halfway between two doubles.
            (67_108_865.0, 67_108_863.5, 0.0),
        ] {
            check(a, b, c);
        }
    }
}
