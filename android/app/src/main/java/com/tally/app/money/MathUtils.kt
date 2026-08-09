package com.tally.app.money

/**
 * Divide two numbers, returning [fallback] (default 0) for divide-by-zero or a
 * non-finite result. Ported from src/charts/utils.ts's `safeDiv` — nothing in
 * the money model performs a raw `a / b`; every division goes through this
 * (or a fixed, non-zero, non-data-dependent divisor).
 */
fun safeDiv(numerator: Double, denominator: Double, fallback: Double = 0.0): Double {
    if (!numerator.isFinite() || !denominator.isFinite() || denominator == 0.0) {
        return fallback
    }
    val result = numerator / denominator
    return if (result.isFinite()) result else fallback
}
