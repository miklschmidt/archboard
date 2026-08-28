import type { SweepDiagnosticInterval } from "../../diagnostics.js";

export function interval(
	id: string,
	min: number,
	max: number,
	partition = id,
	overrides: Partial<SweepDiagnosticInterval> = {},
): SweepDiagnosticInterval {
	return { id, min, max, partition, ...overrides };
}

export const controls = () => ["a", "a\0", "a\u001f", "a\ud800", "aa"] as const;

export function reversed<T>(values: readonly T[]): T[] {
	return values.toReversed();
}
