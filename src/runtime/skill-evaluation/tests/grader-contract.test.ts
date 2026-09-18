// The grader contract: what the prompt says once, and what a verdict must
// carry. A verdict short of a pass says what the run did, what the skill told
// it and where, and which authority the gap answers to; the report keeps a
// departure from the skill apart from a board the source contradicts, and
// never fails a run for an expectation the skill never taught. None of this
// runs a model.

import { expect, test } from "bun:test";
import {
	CATALOGUE_ROWS,
	FiledVerdictSchema,
	buildReport,
	findingsByAxis,
	graderPrompt,
	NO_DELEGATION,
	parseGraderOutput,
	renderReportMarkdown,
	semanticallyCompliant,
	type ConcernKind,
	type FindingAxis,
	type RunRecord,
	type RunVerdict,
} from "@/runtime/skill-evaluation/index";

const EXPECTED = [
	{ feature: "board.create", requirement: "one board", skill: ["SKILL.md#essentials"] },
	{ feature: "render.svg", requirement: "drawn", skill: ["SKILL.md#essentials"] },
];

const BARE = { evidence: "e", reason: "r" };

/**
 * A finding on one axis.
 * @param axis The authority it answers to.
 * @returns The finding.
 */
function finding(axis: FindingAxis) {
	return { axis, did: "d", taught: "t", passage: "SKILL.md#essentials", gap: "g" };
}

/**
 * A grader's whole answer for one run, as its final message carries it.
 * @param features The feature verdicts.
 * @param unprompted The catalogue rows judged.
 * @returns The answer text.
 */
function answer(features: unknown[], unprompted: unknown[] = []): string {
	return JSON.stringify({
		runs: [
			{
				run: "run-0123456789",
				features,
				semanticCorrectness: 5,
				architecturalTruth: 5,
				readability: 5,
				unprompted,
				behaviouralCompleteness: 5,
				summary: "s",
				concerns: [],
				visual: { inspectedCaptures: [], verdict: "incomplete", observations: [] },
			},
		],
	});
}

/**
 * A filed verdict over the given feature verdicts, read back as the report reads it.
 * @param features The feature verdicts.
 * @param concerns What the grader raised.
 * @returns The verdict.
 */
function filed(features: unknown[], concerns: string[] = []): RunVerdict {
	return FiledVerdictSchema.parse({
		run: "run-0123456789",
		features,
		semanticCorrectness: 5,
		architecturalTruth: 5,
		readability: 5,
		summary: "s",
		concerns,
	});
}

/**
 * A completed, visually passed run graded with the given feature verdicts.
 * @param run Its anonymous id.
 * @param arm Its arm.
 * @param features The feature verdicts.
 * @param concerns What the grader raised.
 * @returns The run record.
 */
function graded(
	run: string,
	arm: RunRecord["arm"],
	features: unknown[],
	concerns: string[] = [],
): RunRecord {
	const verdict = filed(features, concerns);
	return {
		run,
		arm,
		scenario: "S00",
		workflow: "architecture-create",
		report: "primary",
		repetition: 1,
		status: "completed",
		durationMs: 10,
		usage: null,
		commandCounts: {
			discovery: 0,
			operation: 0,
			"code-investigation": 0,
			"product-source": 0,
			setup: 0,
			ambiguous: 0,
		},
		directWrites: 0,
		exposure: { "evaluation-inputs": 0, "harness-source": 0, "skill-package": 0, "other-run": 0 },
		guidance: null,
		captures: null,
		visual: "pass",
		outcomesPassed: true,
		guardrailsPassed: true,
		verdict,
		semanticallyCompliant: semanticallyCompliant(EXPECTED, verdict),
		waivedFeatures: [],
		checklist: { standing: "answered", unmentioned: [], invented: [] },
		findings: findingsByAxis(EXPECTED, verdict),
		conformanceUnseen: [],
	};
}

test("the prompt names the runs, carries the rubric once, and forbids delegation in the agreed words", () => {
	const first = graderPrompt({
		rubric: "# Rubric\nBe exact.",
		layout: { flask: "flask", runs: "runs", skill: "skill", verdictFile: "verdict-1.json" },
		revisions: { "3.0.0": "abc" },
		runs: ["run-0000000001"],
		continuing: false,
	});
	expect(first).toContain(NO_DELEGATION);
	expect(NO_DELEGATION).toBe(
		"Do not use subagents. Inspect the source and grade every run yourself in this session.",
	);
	expect(first).toContain("Be exact.");
	expect(first).toContain("run-0000000001");
	const next = graderPrompt({
		rubric: "# Rubric\nBe exact.",
		layout: { flask: "flask", runs: "runs", skill: "skill", verdictFile: "verdict-2.json" },
		revisions: {},
		runs: ["run-0000000002"],
		continuing: true,
	});
	expect(next).not.toContain("Be exact.");
	expect(next).toContain("run-0000000002");
});

test("a verdict short of a pass states its finding, a pass states none, and the passage is a citation", () => {
	const feature = { ...BARE, feature: "board.create" };
	const departed = finding("conformance");
	expect(() =>
		parseGraderOutput(answer([{ ...feature, verdict: "missing", finding: departed }])),
	).not.toThrow();
	expect(() =>
		parseGraderOutput(answer([{ ...feature, verdict: "missing", finding: null }])),
	).toThrow();
	expect(() =>
		parseGraderOutput(answer([{ ...feature, verdict: "pass", finding: departed }])),
	).toThrow();
	expect(() =>
		parseGraderOutput(
			answer([{ ...feature, verdict: "missing", finding: { ...departed, passage: "line 12" } }]),
		),
	).toThrow();
});

test("an unprompted row is one of the catalogue's rows, and anything else is refused", () => {
	const passing = [{ ...BARE, feature: "board.create", verdict: "pass", finding: null }];
	const row = { verdict: "missed", evidence: "boards/", reason: "r" };
	for (const name of CATALOGUE_ROWS)
		expect(() => parseGraderOutput(answer(passing, [{ ...row, feature: name }]))).not.toThrow();
	expect(() =>
		parseGraderOutput(answer(passing, [{ ...row, feature: "node description" }])),
	).toThrow();
});

test("a feature the skill never taught fails no run; a departure or a contradicted board does", () => {
	const onAxis = (axis: FindingAxis): RunVerdict =>
		filed([
			{ ...BARE, feature: "board.create", verdict: "pass", finding: null },
			{ ...BARE, feature: "render.svg", verdict: "missing", finding: finding(axis) },
		]);
	expect(semanticallyCompliant(EXPECTED, onAxis("skill"))).toBe(true);
	expect(semanticallyCompliant(EXPECTED, onAxis("conformance"))).toBe(false);
	expect(semanticallyCompliant(EXPECTED, onAxis("truth"))).toBe(false);
	expect(findingsByAxis(EXPECTED, onAxis("truth"))).toEqual({
		conformance: [],
		truth: ["render.svg"],
		skill: [],
	});
});

test("the report counts findings by axis, lists findings about the skill apart, and reads a verdict filed before findings", () => {
	const departed = graded("run-00000000b1", "baseline", [
		{ ...BARE, feature: "board.create", verdict: "incorrect", finding: finding("truth") },
		{ ...BARE, feature: "render.svg", verdict: "missing", finding: finding("conformance") },
	]);
	const untaught = graded("run-00000000c1", "candidate", [
		{ ...BARE, feature: "board.create", verdict: "pass", finding: null },
		{ ...BARE, feature: "render.svg", verdict: "missing", finding: finding("skill") },
	]);
	const legacy = graded("run-00000000c2", "candidate", [
		{ ...BARE, feature: "board.create", verdict: "missing" },
		{ ...BARE, feature: "render.svg", verdict: "pass" },
	]);
	const report = buildReport([departed, untaught, legacy], null);
	const row = report.scenarios[0];
	expect(row?.baseline.findings).toEqual({ conformance: 1, truth: 1, skill: 0 });
	expect(row?.candidate.findings).toEqual({ conformance: 0, truth: 0, skill: 1 });
	expect(row?.candidate.semanticFailures).toBe(1);
	expect(report.skillFindings.map((run) => run.run)).toEqual(["run-00000000c1"]);
	expect(report.failures.map((run) => run.run)).toEqual(["run-00000000b1", "run-00000000c2"]);
	// Whether the skill teaches render.svg is one fact about S00; the grader said both.
	expect(report.skillDisagreements).toEqual([
		{
			scenario: "S00",
			feature: "render.svg",
			untaught: ["run-00000000c1"],
			otherwise: ["run-00000000b1", "run-00000000c2"],
		},
	]);
	expect(() => renderReportMarkdown(report)).not.toThrow();
});

test("a waiver is not a finding, and a departure from a passage the run's own skill lacked is counted apart", () => {
	const waived = graded("run-00000000b1", "baseline", [
		{ ...BARE, feature: "board.create", verdict: "missing", finding: finding("conformance") },
		{ ...BARE, feature: "render.svg", verdict: "not-applicable", finding: finding("conformance") },
	]);
	expect(waived.findings.conformance).toEqual(["board.create"]);
	const unseen = { ...waived, conformanceUnseen: ["board.create"] };
	const row = buildReport([unseen], null).scenarios[0];
	expect(row?.baseline.findings.conformance).toBe(0);
	expect(row?.baseline.conformanceUnseen).toBe(1);
});

test("a verdict filed before the catalogue was closed still loads, and only the closed rows count as missed", () => {
	const verdict = FiledVerdictSchema.parse({
		...filed([{ ...BARE, feature: "board.create", verdict: "pass" }]),
		unprompted: [
			{ feature: "traffic", verdict: "missed", evidence: "e", reason: "r" },
			{ feature: "node description", verdict: "missed", evidence: "e", reason: "r" },
		],
	});
	const record = { ...graded("run-00000000c1", "candidate", []), verdict };
	expect(buildReport([record], null).scenarios[0]?.candidate.missedUnprompted).toBe(1);
});

test("a finding's text is more than whitespace, as the schema the grader decodes against says", () => {
	const feature = { ...BARE, feature: "board.create", verdict: "missing" };
	expect(() =>
		parseGraderOutput(answer([{ ...feature, finding: { ...finding("truth"), did: "  " } }])),
	).toThrow();
});

test("every concern reaches the report, grouped by the prefix that says what it is about", () => {
	const pass = [{ ...BARE, feature: "board.create", verdict: "pass", finding: null }];
	const report = buildReport(
		[
			graded("run-00000000b1", "baseline", pass, ["fixture: the call lands on a container", "odd"]),
			graded("run-00000000c1", "candidate", pass, ["  tooling: read src/cli for --variant"]),
		],
		null,
	);
	const runsOf = (kind: ConcernKind) => report.concerns[kind].map((entry) => entry.run);
	expect(runsOf("fixture")).toEqual(["run-00000000b1"]);
	expect(runsOf("tooling")).toEqual(["run-00000000c1"]);
	expect(runsOf("other")).toEqual(["run-00000000b1"]);
});
