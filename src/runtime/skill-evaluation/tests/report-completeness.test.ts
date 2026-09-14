import { expect, test } from "bun:test";
import {
	buildReport,
	sumUsage,
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
		commandCounts: { discovery: 1, operation: 2, "code-investigation": 1, setup: 0, ambiguous: 0 },
		directWrites: 0,
		exposure: { "evaluation-inputs": 0, "harness-source": 0, "other-run": 0 },
		outcomesPassed: true,
		guardrailsPassed: true,
		verdict,
		semanticallyCompliant: true,
		waivedFeatures: [],
		...overrides,
	};
}

test("ungraded runs stay unsuccessful and cannot establish held quality or token savings", () => {
	const report = buildReport(
		[record(), record({ arm: "candidate", verdict: null, semanticallyCompliant: null })],
		null,
	);
	expect(report.scenarios[0]?.candidate.succeeded).toBe(0);
	expect(report.scenarios[0]?.candidate.graded).toBe(0);
	expect(report.scenarios[0]?.qualityRegressed).toBeNull();
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
	expect(buildReport([record()], null).scenarios[0]?.qualityRegressed).toBeNull();
	expect(sumUsage([record().usage, null])).toBeNull();
});

test("complete passing arms report measured token changes and assessed quality", () => {
	const report = buildReport([record(), record({ arm: "candidate" })], null);
	expect(report.scenarios[0]?.candidate.succeeded).toBe(1);
	expect(report.scenarios[0]?.qualityRegressed).toBe(false);
	expect(report.scenarios[0]?.tokenChangePercent).toBe(0);
});

test("equally sized partial arms cannot replace the batch's planned repetitions", () => {
	const runs = [record(), record({ arm: "candidate" })];
	const planned = [...runs, record({ repetition: 2 }), record({ arm: "candidate", repetition: 2 })];
	const report = buildReport(runs, null, planned);
	expect(report.scenarios[0]?.baseline.succeeded).toBe(1);
	expect(report.scenarios[0]?.baseline.planned).toBe(2);
	expect(report.scenarios[0]?.qualityRegressed).toBeNull();
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
		expect(report.workflows[0]?.qualityRegressed).toBeNull();
	}
});

test("unstarted planned scenarios stay visible without comparison conclusions", () => {
	const planned = [record(), record({ arm: "candidate" })];
	const report = buildReport([], null, planned);
	expect(report.scenarios[0]?.key).toBe("S01");
	expect(report.scenarios[0]?.baseline.runs).toBe(0);
	expect(report.scenarios[0]?.qualityRegressed).toBeNull();
	expect(report.scenarios[0]?.tokenChangePercent).toBeNull();
});
