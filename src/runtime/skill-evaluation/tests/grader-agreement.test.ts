// Two graders of one batch are compared run by run; the batch report carries
// one section per grader and the agreement between them, and the version
// pins are rewritten from what is on PATH without touching anything else.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	agreementOf,
	buildReport,
	pinVersions,
	renderBatchReportMarkdown,
	type RunRecord,
} from "@/runtime/skill-evaluation/index";

/**
 * A graded run record.
 * @param overrides The condition being exercised.
 * @returns The record.
 */
function record(overrides: Partial<RunRecord> & { scores?: [number, number, number] }): RunRecord {
	const { scores = [9, 9, 9], ...rest } = overrides;
	const run = rest.run ?? "run-0000000001";
	return {
		run,
		arm: "candidate",
		scenario: "S01",
		workflow: "edit",
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
		outcomesPassed: true,
		guardrailsPassed: true,
		captures: null,
		visual: "pass",
		verdict: {
			run,
			features: [],
			semanticCorrectness: scores[0],
			architecturalTruth: scores[1],
			readability: scores[2],
			summary: "Checked",
			concerns: [],
		},
		semanticallyCompliant: true,
		waivedFeatures: [],
		checklist: { standing: "answered", unmentioned: [], invented: [] },
		findings: { conformance: [], truth: [], skill: [] },
		conformanceUnseen: [],
		uncited: [],
		excusedDepartures: [],
		...rest,
	};
}

test("agreement covers only runs both graded and reports shares and mean absolute score differences", () => {
	const codex = [
		record({ run: "run-0000000001", scores: [8, 8, 8] }),
		record({
			run: "run-0000000002",
			scores: [4, 6, 8],
			semanticallyCompliant: false,
			visual: "fail",
		}),
		record({ run: "run-0000000003" }),
		record({ run: "run-0000000004", verdict: null, semanticallyCompliant: null, visual: null }),
	];
	const claude = [
		record({ run: "run-0000000001", scores: [6, 9, 8] }),
		record({
			run: "run-0000000002",
			scores: [5, 6, 5],
			semanticallyCompliant: false,
			visual: "incomplete",
		}),
		record({ run: "run-0000000004" }),
	];
	const agreement = agreementOf(
		{ grader: "codex", runs: codex },
		{ grader: "claude", runs: claude },
	);
	expect(agreement?.graders).toEqual(["codex", "claude"]);
	expect(agreement?.runs.map((run) => run.run)).toEqual(["run-0000000001", "run-0000000002"]);
	expect(agreement?.semanticAgreement).toBe(1);
	expect(agreement?.visualAgreement).toBe(0.5);
	expect(agreement?.meanAbsoluteDifference).toEqual({
		semanticCorrectness: 1.5,
		architecturalTruth: 0.5,
		readability: 1.5,
	});
	expect(agreement?.runs[0]?.verdicts.claude.semanticCorrectness).toBe(6);
	expect(agreementOf({ grader: "codex", runs: codex }, { grader: "claude", runs: [] })).toBeNull();
});

/**
 * A grader identity as a session records it.
 * @param name The grader.
 * @returns The identity.
 */
function identity(name: "codex" | "claude") {
	return {
		name,
		semantics: name === "codex" ? "cumulative" : "per-call",
		model: `${name}-model`,
	} as const;
}

test("the batch report renders one section per grader and the agreement between two", () => {
	const runs = [record({})];
	const one = {
		grader: identity("codex"),
		report: buildReport(runs, null, runs, identity("codex")),
		runs,
	};
	const two = {
		grader: identity("claude"),
		report: buildReport(runs, null, runs, identity("claude")),
		runs,
	};
	const single = renderBatchReportMarkdown({ graders: [one], agreement: null });
	expect(single).toContain("grader: codex, codex-model");
	expect(single).not.toContain("Grader agreement");
	const both = renderBatchReportMarkdown({
		graders: [one, two],
		agreement: agreementOf({ grader: "codex", runs }, { grader: "claude", runs }),
	});
	expect(both).toContain("grader: claude, claude-model");
	expect(both).toContain("Grader agreement (codex vs claude)");
	expect(both).toContain("the sum of its calls");
	expect(both).toContain("the thread's last cumulative reading");
	const ungraded = renderBatchReportMarkdown({
		graders: [{ grader: null, report: buildReport(runs, null), runs }],
		agreement: null,
	});
	expect(ungraded).toContain("not graded");
});

test("pin rewrites every version pin from PATH, says which starts a new baseline, and changes nothing else", async () => {
	const evals = path.join(import.meta.dir, "../../../..", "evals");
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-pin-"));
	try {
		for (const file of ["pins.json", "graders.json"])
			fs.copyFileSync(path.join(evals, file), path.join(root, file));
		const before = {
			pins: JSON.parse(fs.readFileSync(path.join(root, "pins.json"), "utf8")),
			graders: JSON.parse(fs.readFileSync(path.join(root, "graders.json"), "utf8")),
		};
		const versions: Record<string, string> = {
			codex: "9.9.9",
			claude: before.graders.claude.version,
		};
		const changes = await pinVersions(root, {
			locate: (name) => `/bin/${name}`,
			versionOf: (executable) => Promise.resolve(versions[path.basename(executable)] ?? "none"),
		});
		expect(
			changes.map((change) => [change.file, change.key, change.to, change.startsNewBaseline]),
		).toEqual([
			["pins.json", "codex.version", "9.9.9", true],
			["graders.json", "codex.version", "9.9.9", false],
			["graders.json", "claude.version", before.graders.claude.version, false],
		]);
		const after = {
			pins: JSON.parse(fs.readFileSync(path.join(root, "pins.json"), "utf8")),
			graders: JSON.parse(fs.readFileSync(path.join(root, "graders.json"), "utf8")),
		};
		expect(after.pins).toEqual({
			...before.pins,
			codex: { ...before.pins.codex, version: "9.9.9" },
		});
		expect(after.graders).toEqual({
			...before.graders,
			codex: { ...before.graders.codex, version: "9.9.9" },
		});
		expect(fs.readFileSync(path.join(root, "pins.json"), "utf8")).toMatch(/^\{\n\t"/u);
		await expect(
			pinVersions(root, { locate: () => null, versionOf: () => Promise.resolve("1.0.0") }),
		).rejects.toThrow(/no codex on PATH/u);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
