// The arithmetic a comparison report is made of: a median and a mean over
// values some runs could not supply, and a usage field summed only when every
// run supplied it. A number the runs could not all supply is null, never a
// guess.

import type { Usage } from "@/runtime/skill-evaluation/lib/events";

/** A number the runs could not all supply is null. */
type Maybe = number | null;

/**
 * The values that exist, sorted.
 * @param values The values, some possibly null.
 * @returns The numbers.
 */
function present(values: readonly Maybe[]): number[] {
	return values.filter((value): value is number => value !== null).toSorted((a, b) => a - b);
}

/**
 * The median of the values that exist; null when none do.
 * @param values The values, some possibly null.
 * @returns The median.
 */
function median(values: readonly Maybe[]): Maybe {
	const sorted = present(values);
	if (sorted.length === 0) return null;
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? (sorted[middle] ?? null)
		: ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * The mean of the values that exist; null when none do.
 * @param values The values.
 * @returns The mean.
 */
function mean(values: readonly Maybe[]): Maybe {
	const numbers = present(values);
	return numbers.length === 0
		? null
		: numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

/**
 * One usage field summed across usages, or null when any usage lacks it.
 * @param usages The usages.
 * @param pick The field.
 * @returns The sum or null.
 */
function summedField(
	usages: readonly Usage[],
	pick: (usage: Usage) => number | null,
): number | null {
	const values = usages.map(pick);
	return values.some((value) => value === null)
		? null
		: values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export { mean, median, present, summedField, type Maybe };
