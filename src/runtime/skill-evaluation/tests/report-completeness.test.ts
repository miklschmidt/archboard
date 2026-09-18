import { expect, test } from "bun:test";
import {
	CATALOGUE_ROWS,
	buildReport,
	sumUsage,
	type AxisChange,
	type ComparisonRow,
	type CountChange,
	type QualityAxis,
	type QualityCount,
	type RunRecord,
	type RunVerdict,
} from "@/runtime/skill-evaluation/index";

const verdict: RunVerdict = {
	run: "run-0000000000",
	features: [],
	semanticCorrectness: 9,
	architecturalTruth: 9,
	readability: 9,
	summary: "Checked",
	concerns: [],
};

/**
 * A graded successful run for comparison, with one changed condition.
 * @param overrides The condition being exercised.
 * @returns The run record.
 */
function record(overrides: Partial<RunRecord> = {}): RunRecord {
	return {
		run: verdict.run,
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
 * One axis of a row's change, when the row was assessed at all.
 * @param row The comparison row.
 * @param axis The axis.
 * @returns The change, or undefined.
 */
function axisOf(row: ComparisonRow | undefined, axis: QualityAxis): AxisChange | undefined {
	return row?.change.assessed === true
		? row.change.axes.find((entry) => entry.axis === axis)
		: undefined;
}

/**
 * One pass/fail count of a row's change, when the row was assessed at all.
 * @param row The comparison row.
 * @param measure The count.
 * @returns The change, or undefined.
 */
function countOf(row: ComparisonRow | undefined, measure: QualityCount): CountChange | undefined {
	return row?.change.assessed === true
		? row.change.counts.find((entry) => entry.measure === measure)
		: undefined;
}

/**
 * Whether a row was assessed and nothing on it moved either way.
 * @param row The comparison row.
 * @returns True when every count and axis held.
 */
function held(row: ComparisonRow | undefined): boolean {
	return (
		row?.change.assessed === true &&
		[...row.change.counts, ...row.change.axes].every((entry) => entry.direction === "held")
	);
}

test("ungraded runs stay unsuccessful and cannot establish held quality or token savings", () => {
	const report = buildReport(
		[record(), record({ arm: "candidate", verdict: null, semanticallyCompliant: null })],
		null,
	);
	expect(report.scenarios[0]?.candidate.succeeded).toBe(0);
	expect(report.scenarios[0]?.candidate.graded).toBe(0);
	expect(report.scenarios[0]?.change).toEqual({ assessed: false, reason: "pictures-not-judged" });
	expect(report.scenarios[0]?.tokenChangePercent).toBeNull();
	expect(report.failures).toHaveLength(1);
});

test("failed, partial and unmatched arms cannot claim an efficiency improvement", () => {
	for (const candidate of [
		record({ arm: "candidate", status: "failed" }),
		record({ arm: "candidate", usage: null }),
		record({ arm: "candidate", semanticallyCompliant: false }),
	]) {
		expect(buildReport([record(), candidate], null).scenarios[0]?.tokenChangePercent).toBeNull();
	}
	expect(buildReport([record()], null).scenarios[0]?.change).toEqual({
		assessed: false,
		reason: "arms-not-comparable",
	});
	expect(sumUsage([record().usage, null])).toBeNull();
});

test("complete passing arms report measured token changes and assessed quality", () => {
	const report = buildReport([record(), record({ arm: "candidate" })], null);
	expect(report.scenarios[0]?.candidate.succeeded).toBe(1);
	expect(held(report.scenarios[0])).toBe(true);
	expect(report.scenarios[0]?.tokenChangePercent).toBe(0);
});

test("legacy unaudited and contaminated arms keep raw measurements but withhold comparisons", () => {
	for (const candidate of [
		record({ arm: "candidate", directWrites: null, exposure: null }),
		record({
			arm: "candidate",
			exposure: { "evaluation-inputs": 1, "harness-source": 0, "skill-package": 0, "other-run": 0 },
		}),
		record({ arm: "candidate", directWrites: 1 }),
	]) {
		const row = buildReport([record(), candidate], null).scenarios[0];
		expect(row?.candidate.meanSemanticCorrectness).toBe(9);
		expect(row?.tokenChangePercent).toBeNull();
		expect(row?.change).toEqual({ assessed: false, reason: "arms-not-comparable" });
	}
});

test("equally sized partial arms cannot replace the batch's planned repetitions", () => {
	const runs = [record(), record({ arm: "candidate" })];
	const planned = [...runs, record({ repetition: 2 }), record({ arm: "candidate", repetition: 2 })];
	const report = buildReport(runs, null, planned);
	expect(report.scenarios[0]?.baseline.succeeded).toBe(1);
	expect(report.scenarios[0]?.baseline.planned).toBe(2);
	expect(report.scenarios[0]?.change).toEqual({ assessed: false, reason: "arms-not-comparable" });
	expect(report.scenarios[0]?.tokenChangePercent).toBeNull();
	expect(report.workflows[0]?.tokenChangePercent).toBeNull();
});

test("paired counts must represent the same scenario and repetition identities", () => {
	for (const candidate of [
		record({ arm: "candidate", repetition: 2 }),
		record({ arm: "candidate", scenario: "S02" }),
	]) {
		const report = buildReport([record(), candidate], null);
		expect(report.workflows[0]?.tokenChangePercent).toBeNull();
		expect(report.workflows[0]?.change).toEqual({ assessed: false, reason: "arms-not-comparable" });
	}
});

test("unstarted planned scenarios stay visible without comparison conclusions", () => {
	const planned = [record(), record({ arm: "candidate" })];
	const report = buildReport([], null, planned);
	expect(report.scenarios[0]?.key).toBe("S01");
	expect(report.scenarios[0]?.baseline.runs).toBe(0);
	expect(report.scenarios[0]?.change).toEqual({ assessed: false, reason: "arms-not-comparable" });
	expect(report.scenarios[0]?.tokenChangePercent).toBeNull();
});

test("what the skill added unprompted is scored, its misses counted, and a drop is a regression", () => {
	const judged = (score: number | null, missed: number): RunVerdict => ({
		...verdict,
		behaviouralCompleteness: score,
		unprompted: Array.from({ length: missed }, (_, index) => ({
			feature: CATALOGUE_ROWS[index % CATALOGUE_ROWS.length] ?? "traffic",
			verdict: "missed" as const,
			evidence: "boards/",
			reason: "left out",
		})),
	});
	const unjudged = buildReport([record(), record({ arm: "candidate" })], null).scenarios[0];
	expect(unjudged?.candidate.meanBehaviouralCompleteness).toBeNull();
	expect(unjudged?.candidate.missedUnprompted).toBe(0);
	expect(held(unjudged)).toBe(true);
	expect(axisOf(unjudged, "completeness")).toBeUndefined();
	const readOnly = buildReport(
		[record({ verdict: judged(null, 0) }), record({ arm: "candidate", verdict: judged(null, 0) })],
		null,
	).scenarios[0];
	expect(readOnly?.candidate.meanBehaviouralCompleteness).toBeNull();
	expect(held(readOnly)).toBe(true);
	// One pair of runs cannot set a bar, so the axis says nothing until a
	// second pair is there to spread against it.
	const single = buildReport(
		[record({ verdict: judged(8, 1) }), record({ arm: "candidate", verdict: judged(5, 3) })],
		null,
	).scenarios[0];
	expect(single?.baseline.meanBehaviouralCompleteness).toBe(8);
	expect(single?.candidate.meanBehaviouralCompleteness).toBe(5);
	expect(single?.candidate.missedUnprompted).toBe(3);
	expect(axisOf(single, "completeness")).toBeUndefined();
	const dropped = buildReport(
		[
			record({ verdict: judged(8, 1) }),
			record({ run: "run-0000000003", repetition: 2, verdict: judged(8, 1) }),
			record({ arm: "candidate", verdict: judged(5, 3) }),
			record({
				run: "run-0000000004",
				arm: "candidate",
				repetition: 2,
				verdict: judged(5, 3),
			}),
		],
		null,
	).scenarios[0];
	expect(dropped?.candidate.missedUnprompted).toBe(6);
	expect(axisOf(dropped, "completeness")).toMatchObject({
		before: 8,
		after: 5,
		delta: -3,
		direction: "regressed",
	});
});

test("runs that read the product source are counted per arm without failing or contaminating them", () => {
	const reader = record({
		arm: "candidate",
		commandCounts: {
			discovery: 1,
			operation: 2,
			"code-investigation": 1,
			"product-source": 3,
			setup: 0,
			ambiguous: 0,
		},
	});
	const report = buildReport([record(), reader], null);
	expect(report.scenarios[0]?.baseline.productSourceReads).toBe(0);
	expect(report.scenarios[0]?.candidate.productSourceReads).toBe(1);
	expect(report.scenarios[0]?.candidate.succeeded).toBe(1);
	expect(report.scenarios[0]?.candidate.contaminated).toBe(0);
	expect(report.scenarios[0]?.tokenChangePercent).toBe(0);
});

test("visual defects regress quality but keep the shared renderer's cost measured; unavailable visuals withhold both", () => {
	for (const visual of ["fail", "incomplete", null] as const) {
		const report = buildReport([record(), record({ arm: "candidate", visual })], null);
		expect(report.scenarios[0]?.tokenChangePercent).toBe(visual === "fail" ? 0 : null);
		expect(countOf(report.scenarios[0], "visualFailed")?.direction).toBe(
			visual === "fail" ? "regressed" : undefined,
		);
		expect(report.scenarios[0]?.candidate.succeeded).toBe(0);
		expect(report.failures).toHaveLength(1);
	}
});

test("a run that skipped the guidance its scenario names is counted and listed, and one that read it counts as read", () => {
	const skipped = record({
		run: "run-0000000001",
		guidance: {
			expected: ["references/edit.md"],
			read: ["SKILL.md"],
			missing: ["references/edit.md"],
		},
	});
	const read = record({
		run: "run-0000000002",
		arm: "candidate",
		guidance: { expected: ["references/edit.md"], read: ["references/edit.md"], missing: [] },
	});
	const report = buildReport([skipped, read], null);
	expect(report.skippedGuidance.map((run) => run.run)).toEqual(["run-0000000001"]);
	const row = report.scenarios[0];
	expect([row?.baseline.guidanceRead, row?.baseline.guidanceRecorded]).toEqual([0, 1]);
	expect([row?.candidate.guidanceRead, row?.candidate.guidanceRecorded]).toEqual([1, 1]);
	expect(buildReport([record()], null).scenarios[0]?.baseline.guidanceRecorded).toBe(0);
});
