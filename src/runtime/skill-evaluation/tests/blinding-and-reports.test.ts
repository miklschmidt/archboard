// The grader sees runs it cannot tell apart, is told not to delegate, and
// answers in a shape the report can read; the report keeps author cost and
// grader cost apart and never loses a failed run.

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SemanticBoardSchema } from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import {
	anonymousRunId,
	buildReport,
	bundleForGrader,
	checklistGaps,
	FiledVerdictSchema,
	graderUsage,
	graderPrompt,
	median,
	NO_DELEGATION,
	parseGraderOutput,
	renderReportMarkdown,
	semanticallyCompliant,
	sumUsage,
	type CompletedRun,
	type RunRecord,
	type RunVerdict,
	type Scenario,
} from "@/runtime/skill-evaluation/index";

const usage = (input: number, output: number) => ({
	input,
	cached: 0,
	cacheWrite: null,
	output,
	reasoning: null,
	total: input + output,
});

const BOARD = SemanticBoardSchema.parse({
	schemaVersion: "2.2.0",
	kind: "semantic-board",
	id: "b1",
	name: "Flask",
	level: "system",
	version: 1,
	createdAt: "2026-09-14T00:00:00.000Z",
	updatedAt: "2026-09-14T00:00:00.000Z",
	views: [],
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "Initial",
			lifecycle: "current",
			content: {
				nodes: [{ id: "n1", name: "App", kind: "app" }],
				edges: [],
				flows: [],
				walkthroughs: [],
			},
		},
	],
});

const SCENARIO: Scenario = {
	id: "S00",
	name: "x",
	report: "primary",
	workflow: "architecture-create",
	flask: "3.0.0",
	fixture: "fixtures/S00.json",
	sources: ["src/flask/app.py"],
	prompt: "Create it.",
	expectedFeatures: [
		{ feature: "board.create", requirement: "one board" },
		{ feature: "render.svg", requirement: "drawn" },
	],
	outcomes: [{ check: "check-clean" }],
	guardrails: [],
	captures: [{ label: "board", board: "Flask" }],
};

const RUN: CompletedRun = {
	arm: "candidate",
	scenario: SCENARIO,
	repetition: 1,
	status: "completed",
	exitCode: 0,
	durationMs: 1000,
	finalMessage: "I read /run/home/.agents/skills/archboard/SKILL.md and wrote the board.",
	usage: { input: 10, cached: 4, cacheWrite: null, output: 5, reasoning: null, total: 15 },
	fileChanges: [],
	commands: [
		{
			command: "cat /run/home/.agents/skills/archboard/SKILL.md",
			exitCode: 0,
			status: "completed",
			output: "SECRET SKILL TEXT",
			class: "discovery",
			rule: "reads the installed skill",
			write: false,
			exposure: null,
		},
	],
	boards: new Map([["Flask", BOARD]]),
	snapshot: new Map(),
	policy: DEFAULT_SEMANTIC_POLICY,
	inspections: [
		{
			board: "Flask",
			group: "request",
			result: { members: [{ name: "App" }], internalEdges: [], boundaryEdges: [], neighbors: [] },
			detail: "inspected",
		},
	],
	renders: [{ board: "Flask", file: "/run/renders/render-0.svg" }],
	captures: [
		{
			label: "board",
			board: "Flask",
			ok: true,
			detail: "captured 900×400 of version 2 to capture-0-board.png",
			file: "/batch/runs/candidate/S00/1/captures/capture-0-board.png",
			provenance: {
				version: 2,
				variant: { id: "v1", name: "Initial", lifecycle: "current" },
				view: null,
				theme: "light",
				scale: 1,
				width: 900,
				height: 400,
				diagram: { width: 900, height: 400 },
				svgSha256: "ab".repeat(32),
				facesLoaded: 4,
				motion: "paused-at-start",
			},
			tiles: [
				{
					x: 0,
					y: 0,
					width: 900,
					height: 400,
					file: "/batch/runs/candidate/S00/1/captures/capture-0-board-tile-0.png",
				},
			],
		},
		{
			label: "missing",
			board: "Flask",
			view: "Nowhere",
			ok: false,
			detail: "rasterize failed (exit 1): no such view",
			tiles: [],
		},
	],
	outcomes: [{ check: "check-clean", passed: true, detail: "clean" }],
	guardrails: [],
	privatePaths: ["/run/home/.agents/skills/archboard", "/run/home", "/run"],
};

describe("blinding", () => {
	test("anonymous ids are stable per batch and say nothing about the arm", () => {
		const a = anonymousRunId("salt", "baseline", "S01", 1);
		expect(a).toBe(anonymousRunId("salt", "baseline", "S01", 1));
		expect(a).not.toBe(anonymousRunId("salt", "candidate", "S01", 1));
		expect(a).not.toBe(anonymousRunId("other", "baseline", "S01", 1));
		expect(a).toMatch(/^run-[0-9a-f]{10}$/u);
	});

	test("the bundle carries no arm, no command output and no private path", () => {
		const bundle = bundleForGrader(RUN, "run-0123456789");
		const text = JSON.stringify(bundle);
		expect(text).not.toContain("candidate");
		expect(text).not.toContain("SECRET SKILL TEXT");
		expect(text).not.toContain("/run/home");
		expect(bundle.commands[0]?.command).toBe("cat <private-0>/SKILL.md");
		expect(bundle.boardsAfter["Flask"]?.id).toBe("b1");
		expect(bundle.expectedFeatures).toEqual(SCENARIO.expectedFeatures);
		expect(bundle.policy).toEqual(RUN.policy);
		expect(bundle.inspections).toEqual(RUN.inspections);
		expect(bundle.renders[0]?.file).toBe("renders/render-0.svg");
	});

	test("captures reach the grader with their provenance and tiles, by relative path, failed ones listed with why", () => {
		const bundle = bundleForGrader(RUN, "run-0123456789");
		expect(JSON.stringify(bundle.captures)).not.toContain("candidate");
		expect(bundle.captures).toHaveLength(2);
		expect(bundle.captures[0]).toMatchObject({
			label: "board",
			ok: true,
			file: "captures/capture-0-board.png",
			provenance: { version: 2, width: 900, height: 400, svgSha256: "ab".repeat(32) },
		});
		expect(bundle.captures[0]?.tiles[0]?.file).toBe("captures/capture-0-board-tile-0.png");
		expect(bundle.captures[1]).toMatchObject({
			label: "missing",
			view: "Nowhere",
			ok: false,
			file: null,
			provenance: null,
		});
	});

	test("render references survive staging without exposing the source arm", () => {
		const bundle = bundleForGrader(
			{
				...RUN,
				renders: [{ board: "Flask", file: "/batch/runs/candidate/S00/1/renders/render-0.svg" }],
			},
			"run-0123456789",
		);
		expect(JSON.stringify(bundle)).not.toContain("candidate");
		expect(bundle.renders[0]?.file).toBe("renders/render-0.svg");
	});
});

describe("the grader contract", () => {
	test("the prompt names the runs, carries the rubric once, and forbids delegation in the agreed words", () => {
		const first = graderPrompt({
			rubric: "# Rubric\nBe exact.",
			layout: { flask: "flask", runs: "runs", verdictFile: "verdict-1.json" },
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
			layout: { flask: "flask", runs: "runs", verdictFile: "verdict-2.json" },
			revisions: {},
			runs: ["run-0000000002"],
			continuing: true,
		});
		expect(next).not.toContain("Be exact.");
		expect(next).toContain("run-0000000002");
	});

	test("a verdict is read strictly, waived required features are surfaced, and compliance needs every feature to pass", () => {
		const verdict: RunVerdict = {
			run: "run-0123456789",
			features: [
				{
					feature: "board.create",
					verdict: "pass",
					evidence: "boards/Flask.json",
					reason: "one board",
				},
				{
					feature: "render.svg",
					verdict: "not-applicable",
					evidence: "-",
					reason: "renderer absent",
				},
			],
			semanticCorrectness: 8,
			architecturalTruth: 7,
			readability: 9,
			unprompted: [
				{ feature: "traffic", verdict: "missed", evidence: "boards/", reason: "hot path bare" },
			],
			behaviouralCompleteness: 6,
			summary: "fine",
			concerns: [],
			visual: {
				inspectedCaptures: ["board"],
				verdict: "pass",
				observations: [{ capture: "board", observation: "labels readable, nothing clipped" }],
			},
		};
		expect(parseGraderOutput(JSON.stringify({ runs: [verdict] })).runs[0]?.run).toBe(
			"run-0123456789",
		);
		// The grader must say what it saw: a verdict without a visual answer is no verdict.
		const { visual: _visual, ...blind } = verdict;
		expect(() => parseGraderOutput(JSON.stringify({ runs: [blind] }))).toThrow(/visual/u);
		// And what the skill should have added unprompted: the rows and the score
		// are required from the grader, a read-only run answering nothing and null.
		const { unprompted: _rows, behaviouralCompleteness: _score, ...unjudged } = verdict;
		expect(() => parseGraderOutput(JSON.stringify({ runs: [unjudged] }))).toThrow(/unprompted/u);
		expect(
			parseGraderOutput(
				JSON.stringify({ runs: [{ ...verdict, unprompted: [], behaviouralCompleteness: null }] }),
			).runs[0]?.behaviouralCompleteness,
		).toBeNull();
		expect(() =>
			parseGraderOutput(
				JSON.stringify({
					runs: [{ ...verdict, unprompted: [{ ...verdict.unprompted?.[0], verdict: "pass" }] }],
				}),
			),
		).toThrow();
		// A verdict filed before the judgment existed still loads.
		expect(FiledVerdictSchema.parse(unjudged).behaviouralCompleteness).toBeUndefined();
		expect(() =>
			parseGraderOutput(JSON.stringify({ runs: [{ ...verdict, semanticCorrectness: 11 }] })),
		).toThrow();
		expect(checklistGaps(SCENARIO.expectedFeatures, verdict)).toEqual({
			waived: ["render.svg"],
			unmentioned: [],
		});
		expect(semanticallyCompliant(SCENARIO.expectedFeatures, verdict)).toBe(false);
		expect(
			semanticallyCompliant(SCENARIO.expectedFeatures, {
				...verdict,
				features: verdict.features.map((entry) => ({ ...entry, verdict: "pass" as const })),
			}),
		).toBe(true);
		expect(
			checklistGaps(SCENARIO.expectedFeatures, { ...verdict, features: [] }).unmentioned,
		).toEqual(["board.create", "render.svg"]);
	});
});

/**
 * One run record for the report.
 * @param overrides What differs from a passing candidate run.
 * @returns The record.
 */
function record(overrides: Partial<RunRecord>): RunRecord {
	return {
		run: "run-0000000000",
		arm: "candidate",
		scenario: "S01",
		workflow: "edit",
		report: "primary",
		repetition: 1,
		status: "completed",
		durationMs: 10,
		usage: { input: 100, cached: 50, cacheWrite: null, output: 20, reasoning: null, total: 120 },
		commandCounts: {
			discovery: 2,
			operation: 3,
			"code-investigation": 1,
			"product-source": 0,
			setup: 0,
			ambiguous: 0,
		},
		directWrites: 0,
		exposure: { "evaluation-inputs": 0, "harness-source": 0, "other-run": 0 },
		outcomesPassed: true,
		guardrailsPassed: true,
		captures: null,
		visual: "pass",
		verdict: {
			run: "run-0000000000",
			features: [],
			semanticCorrectness: 9,
			architecturalTruth: 9,
			readability: 9,
			summary: "Checked",
			concerns: [],
		},
		semanticallyCompliant: true,
		waivedFeatures: [],
		...overrides,
	};
}

describe("the comparison report", () => {
	test("legacy grading sessions override a stale summed usage file with their last cumulative reading", () => {
		const batch = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-grader-usage-"));
		const grader = path.join(batch, "grader");
		fs.mkdirSync(grader);
		try {
			fs.writeFileSync(
				path.join(grader, "session.json"),
				JSON.stringify({
					threadId: "thread-1",
					calls: [
						{
							index: 1,
							runs: [],
							promptFile: "p1",
							verdictFile: "v1",
							eventsFile: "e1",
							exitCode: 0,
							usage: usage(100, 10),
							graded: [],
							error: null,
						},
						{
							index: 2,
							runs: [],
							promptFile: "p2",
							verdictFile: "v2",
							eventsFile: "e2",
							exitCode: 0,
							usage: usage(250, 20),
							graded: [],
							error: null,
						},
					],
				}),
			);
			fs.writeFileSync(path.join(grader, "usage.json"), JSON.stringify(usage(350, 30)));
			// A batch graded before there was a choice holds `grader/`: that is the Codex grader.
			expect(graderUsage(batch, "codex")).toEqual(usage(250, 20));
			expect(graderUsage(batch, "claude")).toBeNull();
		} finally {
			fs.rmSync(batch, { recursive: true, force: true });
		}
	});

	test("medians ignore unavailable values and are null when nothing is available", () => {
		expect(median([3, null, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(median([null])).toBeNull();
		expect(sumUsage([null, null])).toBeNull();
		expect(
			sumUsage([
				{ input: 1, cached: 1, cacheWrite: null, output: 1, reasoning: 2, total: 2 },
				{ input: 2, cached: 0, cacheWrite: 3, output: 2, reasoning: null, total: 4 },
			]),
		).toEqual({ input: 3, cached: 1, cacheWrite: null, output: 3, reasoning: null, total: 6 });
	});

	test("rows compare arms, keep failures, separate the broad case and keep grader usage apart", () => {
		const runs = [
			record({
				run: "run-0000000001",
				arm: "baseline",
				usage: { input: 200, cached: 0, cacheWrite: null, output: 40, reasoning: null, total: 240 },
			}),
			record({
				run: "run-0000000002",
				arm: "baseline",
				usage: { input: 180, cached: 0, cacheWrite: null, output: 20, reasoning: null, total: 200 },
			}),
			record({ run: "run-0000000003", arm: "candidate" }),
			record({
				run: "run-0000000004",
				arm: "candidate",
				status: "timed-out",
				usage: null,
				outcomesPassed: false,
			}),
			record({
				run: "run-0000000005",
				arm: "candidate",
				scenario: "S14",
				workflow: "architecture-create",
				report: "broad",
				guardrailsPassed: false,
			}),
		];
		const grader = {
			input: 5000,
			cached: 1000,
			cacheWrite: null,
			output: 900,
			reasoning: null,
			total: 5900,
		};
		const report = buildReport(runs, grader);
		expect(report.scenarios.map((row) => row.key)).toEqual(["S01"]);
		expect(report.workflows.map((row) => row.key)).toEqual(["edit"]);
		expect(report.broad.map((row) => row.key)).toEqual(["S14"]);
		const s01 = report.scenarios[0]!;
		expect(s01.baseline.medianTotalTokens).toBe(220);
		expect(s01.candidate.medianTotalTokens).toBe(120);
		expect(s01.tokenChangePercent).toBeNull();
		expect(s01.candidate.runs).toBe(2);
		expect(s01.candidate.succeeded).toBe(1);
		expect(s01.candidate.outcomeFailures).toBe(1);
		expect(s01.qualityRegressed).toBe(true);
		expect(report.failures.map((run) => run.run)).toEqual(["run-0000000004", "run-0000000005"]);
		expect(report.graderUsage).toEqual(grader);
		expect(report.authorUsage.candidate).toBeNull();
		expect(report.authorUsage.baseline?.total).toBe(440);
		const markdown = renderReportMarkdown(report);
		expect(markdown).toContain("run-0000000004");
		expect(markdown).toContain("grader (one session, kept apart)");
		expect(markdown).toContain("n/a");
	});
});
