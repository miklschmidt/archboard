import type { SweepDiagnosticInterval } from "../../diagnostics.js";

function interval(
	id: string,
	min: number,
	max: number,
	partition = id,
	overrides: Partial<SweepDiagnosticInterval> = {},
): SweepDiagnosticInterval {
	return { id, min, max, partition, ...overrides };
}

const controls = () => ["a", "a\0", "a\u001f", "a\ud800", "aa"] as const;

function reversed<T>(values: readonly T[]): T[] {
	return values.toReversed();
}

export { interval, controls, reversed };
