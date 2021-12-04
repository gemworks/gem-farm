use crate::number::*;

// fixme beyond me
/// Computes the Taylor expansion of exp(x) - 1, using the
/// indicated number of terms.
/// For example,
///     expm1_approx(x, 3) = x + x^2 / 2 + x^3 / 6
pub fn expm1_approx(x: Number, terms: usize) -> Number {
    if terms == 0 {
        return 0.into();
    }
    if terms == 1 {
        return x;
    }

    let mut z = x;
    let mut acc = x;
    let mut fac = 1u64;

    for k in 2..terms + 1 {
        z *= x;
        fac *= k as u64;
        acc += z / fac;
    }

    acc
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_5() {
        assert_eq!(
            Number::from_decimal(221402666666665u64, -15),
            expm1_approx(Number::from_decimal(2, -1), 5)
        )
    }
}
