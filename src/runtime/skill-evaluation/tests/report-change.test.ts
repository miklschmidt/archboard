import { expect, test } from "bun:test";
import {
	armNoise,
	buildReport,
	directionOf,
	standingOf,
	type AxisChange,
	type ComparisonRow,
	type QualityAxis,
	type RunRecord,
	type RunVerdict,
} from "@/runtime/skill-evaluation/index";

const verdict: RunVerdict = {
	run: "run-0000000000",
	features: [],
	semanticCorrectness: 9,
	architecturalTruth: 9,
	readability: 9,
	behaviouralCompleteness: 6,
	unprompted: [],
	summary: "Checked",
	concerns: [],
};

/**
 * One graded, successful, audited run.
 * @param overrides What this run does differently.
 * @returns The record.
 */
function record(overrides: Partial<RunRecord> = {}): RunRecord {
	return {
		run: "run-0000000000",
		arm: "baseline",
		scenario: "S01",
		workflow: "edit",
		report: "primary",
		repetition: 1,
		status: "completed",
		durationMs: 10,
		usage: { input: 100, cached: 20, cacheWrite: null, output: 10, reasoning: null, total: 110 },
		commandCounts: {
			discovery: 1,
			operation: 2,
			"code-investigation": 1,
			"product-source": 0,
			setup: 0,
			ambiguous: 0,
		},
		directWrites: 0,
		exposure: { "evaluation-inputs": 0, "harness-source": 0, "skill-package": 0, "other-run": 0 },
		guidance: null,
		outcomesPassed: true,
		guardrailsPassed: true,
		captures: null,
		visual: "pass",
		verdict,
		semanticallyCompliant: true,
		waivedFeatures: [],
		checklist: { unmentioned: [], invented: [] },
		...overrides,
	};
}

/**
 * One arm of one scenario, scored run by run on semantic correctness.
 * @param side Which arm.
 * @param scenario The scenario.
 * @param scores One score per repetition.
 * @returns The records.
 */
function armRuns(side: RunRecord["arm"], scenario: string, scores: readonly number[]): RunRecord[] {
	return scores.map((score, index) =>
		record({
			run: `run-${side}-${scenario}-${index}`,
			arm: side,
			scenario,
			repetition: index + 1,
			verdict: { ...verdict, semanticCorrectness: score },
		}),
	);
}

/**
 * One arm's runs with the first of them changed.
 * @param runs The arm's runs.
 * @param overrides What the first run does differently.
 * @returns The runs.
 */
function withFirst(runs: readonly RunRecord[], overrides: Partial<RunRecord>): RunRecord[] {
	return runs.map((run, index) => (index === 0 ? { ...run, ...overrides } : run));
}

/**
 * One axis of a row's change.
 * @param row The row.
 * @param axis The axis.
 * @returns The change, or undefined when the row was not assessed or the axis not scored.
 */
function axisOf(row: ComparisonRow | undefined, axis: QualityAxis): AxisChange | undefined {
	return row?.change.assessed === true
		? row.change.axes.find((entry) => entry.axis === axis)
		: undefined;
}

test("an arm's noise is the spread of its scores over the runs it averages", () => {
	expect(armNoise([])).toBe(0);
	expect(armNoise([9, 9, 9])).toBe(0);
	// One run three points from its fellows moves a three-run mean by one.
	expect(armNoise([8, 6, 9])).toBe(1);
	expect(armNoise([9, 8])).toBe(0.5);
});

test("a move is called only past the bar, and the same way in both directions", () => {
	expect(directionOf(-0.5, 0.5)).toBe("held");
	expect(directionOf(0.5, 0.5)).toBe("held");
	expect(directionOf(-0.6, 0.5)).toBe("regressed");
	expect(directionOf(0.6, 0.5)).toBe("improved");
	// The smallest move three runs can make against the bar its own spread of
	// one sets: equal, and no rounding of thirds may tip it either way.
	expect(directionOf((8 + 8 + 9) / 3 - (9 + 9 + 8) / 3, 1 / 3)).toBe("held");
});

test("a row's word says mixed rather than burying a rise under a fall", () => {
	expect(standingOf(["held", "held"])).toBe("held");
	expect(standingOf(["improved", "held"])).toBe("improved");
	expect(standingOf(["regressed", "held"])).toBe("regressed");
	expect(standingOf(["regressed", "improved"])).toBe("mixed");
});

test("the bar a row is held to comes from its own arms, so consistent arms expose a one-point fall", () => {
	const consistent = buildReport(
		[...armRuns("baseline", "S01", [10, 10, 10]), ...armRuns("candidate", "S01", [9, 9, 9])],
		null,
	).scenarios[0];
	expect(axisOf(consistent, "correctness")).toEqual({
		axis: "correctness",
		before: 10,
		after: 9,
		delta: -1,
		noise: 0,
		direction: "regressed",
	});
	// The same fall of a third, under arms that already spread by one, is noise.
	const spread = buildReport(
		[...armRuns("baseline", "S01", [9, 9, 8]), ...armRuns("candidate", "S01", [8, 8, 9])],
		null,
	).scenarios[0];
	expect(axisOf(spread, "correctness")?.noise).toBeCloseTo(1 / 3, 10);
	expect(axisOf(spread, "correctness")?.direction).toBe("held");
});

test("a rise past the bar is reported as readily as a fall", () => {
	const row = buildReport(
		[...armRuns("baseline", "S01", [7, 7, 7]), ...armRuns("candidate", "S01", [9, 9, 9])],
		null,
	).scenarios[0];
	expect(axisOf(row, "correctness")).toMatchObject({ delta: 2, direction: "improved" });
});

test("the verdict is drawn where scenarios are aggregated, not over one scenario's repetitions", () => {
	const runs = [
		...armRuns("baseline", "S01", [10, 10, 10]),
		...armRuns("candidate", "S01", [9, 9, 9]),
		...armRuns("baseline", "S03", [9, 9, 9]),
		...armRuns("candidate", "S03", [9, 9, 9]),
	];
	const report = buildReport(runs, null);
	const scenario = report.scenarios.find((row) => row.key === "S01");
	expect(scenario?.change.assessed === true && scenario.change.standing).toBeNull();
	expect(
		report.workflows[0]?.change.assessed === true && report.workflows[0]?.change.standing,
	).toBe("regressed");
	expect(report.totals[0]?.change.assessed === true && report.totals[0]?.change.standing).toBe(
		"regressed",
	);
});

test("a count that fell is reported apart from the means, and a rise in failed pictures is a fall", () => {
	const runs = [
		...armRuns("baseline", "S01", [9, 9, 9]),
		...withFirst(armRuns("candidate", "S01", [9, 9, 9]), { visual: "fail" }),
	];
	const row = buildReport(runs, null).scenarios[0];
	const counts = row?.change.assessed === true ? row.change.counts : [];
	expect(counts).toContainEqual({
		measure: "succeeded",
		before: 3,
		after: 2,
		delta: -1,
		direction: "regressed",
	});
	expect(counts).toContainEqual({
		measure: "visualFailed",
		before: 0,
		after: 1,
		delta: 1,
		direction: "regressed",
	});
	// The means did not move, and the counts did not make them say otherwise.
	expect(axisOf(row, "correctness")?.direction).toBe("held");
});

test("a row that cannot be compared says which precondition failed", () => {
	const unpaired = buildReport(
		[...armRuns("baseline", "S01", [9, 9, 9]), ...armRuns("candidate", "S01", [9, 9])],
		null,
	).scenarios[0];
	expect(unpaired?.change).toEqual({ assessed: false, reason: "arms-not-comparable" });
	const unopened = buildReport(
		[
			...armRuns("baseline", "S01", [9, 9, 9]),
			...withFirst(armRuns("candidate", "S01", [9, 9, 9]), { visual: "incomplete" }),
		],
		null,
	).scenarios[0];
	expect(unopened?.change).toEqual({ assessed: false, reason: "pictures-not-judged" });
});

test("a verdict answered off the checklist sets its run aside without failing it", () => {
	const offChecklist = {
		checklist: { unmentioned: ["groups.multi-membership"], invented: ["node.groups"] },
		semanticallyCompliant: null,
	};
	const runs = [
		...armRuns("baseline", "S01", [9, 9, 9]),
		...withFirst(armRuns("candidate", "S01", [9, 9, 9]), offChecklist),
	];
	const report = buildReport(runs, null);
	const row = report.scenarios[0];
	expect(report.ungradable.map((run) => run.run)).toEqual(["run-candidate-S01-0"]);
	// Set aside, not failed, and not counted against semantic compliance.
	expect(report.failures).toHaveLength(0);
	expect(row?.candidate.semanticFailures).toBe(0);
	expect(row?.candidate.ungradable).toBe(1);
	// Neither comparison may be drawn over it.
	expect(row?.change).toEqual({ assessed: false, reason: "arms-not-comparable" });
	expect(row?.tokenChangePercent).toBeNull();
});
