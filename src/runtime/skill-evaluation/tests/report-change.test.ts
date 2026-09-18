import { expect, test } from "bun:test";
import {
	buildReport,
	checklistStanding,
	directionOf,
	pairedNoise,
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
		checklist: { standing: "answered", unmentioned: [], invented: [] },
		...overrides,
	};
}

/**
 * One arm of one scenario, scored run by run on semantic correctness.
 * @param side Which arm.
 * @param scenario The scenario.
 * @param scores One score per repetition.
 * @param completeness One completeness per repetition, null where the run wrote nothing.
 * @returns The records.
 */
function armRuns(
	side: RunRecord["arm"],
	scenario: string,
	scores: readonly number[],
	completeness?: readonly (number | null)[],
): RunRecord[] {
	return scores.map((score, index) =>
		record({
			run: `run-${side}-${scenario}-${index}`,
			arm: side,
			scenario,
			repetition: index + 1,
			verdict: {
				...verdict,
				semanticCorrectness: score,
				behaviouralCompleteness:
					completeness === undefined
						? verdict.behaviouralCompleteness
						: (completeness[index] ?? null),
			},
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

test("the bar is the spread of the paired differences over the root of how many were averaged", () => {
	expect(pairedNoise([])).toBe(0);
	expect(pairedNoise([-1, -1, -1])).toBe(0);
	expect(pairedNoise([0, 1, 2])).toBeCloseTo(2 / Math.sqrt(3), 10);
	// It must fall as the root of the pairs, not as the pairs: a bar dividing
	// by the count would shrink four times faster over sixteen pairs than the
	// uncertainty it stands for, and would call a batch regressed on a
	// fraction of a grader point.
	const sixteen = Array.from({ length: 16 }, (_, index) => (index % 2 === 0 ? 0 : 2));
	expect(pairedNoise(sixteen)).toBe(0.5);
	expect(pairedNoise(sixteen)).toBe(pairedNoise([0, 2]) * Math.sqrt(2 / 16));
});

test("one grader point on one run is never a move once two pairs can spread against it", () => {
	for (const pairs of [2, 3, 12, 42]) {
		const differences: number[] = Array.from({ length: pairs }, (_, index) =>
			index === 0 ? -1 : 0,
		);
		const delta = differences.reduce((sum, value) => sum + value, 0) / pairs;
		expect(directionOf(delta, pairedNoise(differences))).toBe("held");
	}
	// One pair spreads against nothing, so it could only ever call its own
	// difference a move. A run that wrote nothing has no completeness to
	// score, which is how an axis thins out while the row stays comparable;
	// an axis down to one pair is not reported at all.
	expect(pairedNoise([-1])).toBe(0);
	const thin = buildReport(
		[
			...armRuns("baseline", "S01", [9, 9, 9], [6, null, null]),
			...armRuns("candidate", "S01", [9, 9, 9], [7, 7, 7]),
		],
		null,
	).scenarios[0];
	expect(axisOf(thin, "completeness")).toBeUndefined();
	expect(axisOf(thin, "correctness")).toBeDefined();
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

test("the bar a row is held to comes from its own runs, so consistent arms expose a one-point fall", () => {
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
	// The same fall of a third, under runs that already disagree by two, is noise.
	const spread = buildReport(
		[...armRuns("baseline", "S01", [9, 9, 8]), ...armRuns("candidate", "S01", [8, 8, 9])],
		null,
	).scenarios[0];
	expect(axisOf(spread, "correctness")?.noise).toBeCloseTo(2 / Math.sqrt(3), 10);
	expect(axisOf(spread, "correctness")?.direction).toBe("held");
});

test("what a scenario scores in both arms cancels, so an aggregate row measures only the arms apart", () => {
	// Two scenarios four points apart, each arm identical to the other but for
	// a single point on one run of one of them. Pooling the raw scores would
	// call that four-point gap noise; pairing sees it cancel.
	const runs = [
		...armRuns("baseline", "S01", [9, 9, 9]),
		...armRuns("candidate", "S01", [9, 9, 9]),
		...armRuns("baseline", "S03", [5, 5, 5]),
		...armRuns("candidate", "S03", [5, 5, 4]),
	];
	const total = buildReport(runs, null).totals[0];
	expect(axisOf(total, "correctness")?.noise).toBeCloseTo(1 / Math.sqrt(6), 10);
	// And the one point still cannot carry the row.
	expect(axisOf(total, "correctness")?.direction).toBe("held");
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

test("what counts as answering off the checklist is one rule, and it needs both halves", () => {
	const expected = [{ feature: "a" }, { feature: "b" }];
	const answer = (...features: string[]): RunVerdict => ({
		...verdict,
		features: features.map((feature) => ({
			feature,
			verdict: "pass" as const,
			evidence: "board",
			reason: "seen",
		})),
	});
	expect(checklistStanding(expected, answer("a", "b"))).toBe("answered");
	// Only skipped: still an answer about these features, and a fair failure.
	expect(checklistStanding(expected, answer("a"))).toBe("answered");
	// Only added: everything asked was answered as well.
	expect(checklistStanding(expected, answer("a", "b", "c"))).toBe("answered");
	// Both: the grader graded a checklist of its own.
	expect(checklistStanding(expected, answer("c", "d"))).toBe("off-checklist");
});

test("a verdict answered off the checklist sets its run aside without calling its board wrong", () => {
	const offChecklist = {
		checklist: {
			standing: "off-checklist" as const,
			unmentioned: ["groups.multi-membership"],
			invented: ["node.groups"],
		},
		semanticallyCompliant: null,
	};
	const runs = [
		...armRuns("baseline", "S01", [9, 9, 9]),
		// The same run also never had a picture opened, which is its own defect.
		...withFirst(armRuns("candidate", "S01", [9, 9, 9]), {
			...offChecklist,
			visual: "incomplete",
		}),
	];
	const report = buildReport(runs, null);
	const row = report.scenarios[0];
	expect(report.ungradable.map((run) => run.run)).toEqual(["run-candidate-S01-0"]);
	// Not a semantic failure, since nothing was said about the checklist.
	expect(row?.candidate.semanticFailures).toBe(0);
	expect(row?.candidate.ungradable).toBe(1);
	// Its own defects survive being set aside: it is still a run that did not
	// succeed, and the report still has to account for the lost pass.
	expect(report.failures.map((run) => run.run)).toEqual(["run-candidate-S01-0"]);
	expect(row?.candidate.succeeded).toBe(2);
	// Neither comparison may be drawn over it.
	expect(row?.change).toEqual({ assessed: false, reason: "arms-not-comparable" });
	expect(row?.tokenChangePercent).toBeNull();
});
