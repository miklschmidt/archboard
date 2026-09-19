// Model-free owner of the one retry: a verdict short of what the report holds
// a run to (every declared feature by its name, none invented, an observation
// of every capture) is asked for once more in the same session, through both
// runners, with fake `claude` and `codex` executables. The retried answer
// replaces the filed verdict, with a receipt of the bytes filed, only when it
// mends the shortfall; the retry's usage counts; and it is never retried again.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	checklistStanding,
	digestOf,
	filedVerdict,
	gradeBatch,
	graderLayout,
	graderUsage,
	inputDigest,
	keepBatchSkill,
	loadSuite,
	verdictShortfall,
	visualStandingOf,
	type GraderName,
	type GradingOptions,
	type RunVerdict,
} from "@/runtime/skill-evaluation/index";
import { combinedDelivery, suppliedCaptures } from "@/runtime/skill-evaluation/audit";

const checkout = path.resolve(import.meta.dir, "../../../..");
const loaded = loadSuite(path.join(checkout, "evals"));
const SCENARIO = "S02";
const DECLARED = (
	loaded.suite.evals.find((entry) => entry.id === SCENARIO)?.expectedFeatures ?? []
).map((entry) => entry.feature);
const CAPTURES = { declared: ["overview"], captured: ["overview"], failed: [] };
const RUNS = ["run-00000000a1", "run-00000000a2"] as const;

const roots: string[] = [];
let emptyCodexHome = "";
const operatorCodexHome = process.env["CODEX_HOME"];
beforeAll(() => {
	// The Codex runner copies the operator's login into its private home; a test copies none.
	emptyCodexHome = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-retry-codex-home-"));
	process.env["CODEX_HOME"] = emptyCodexHome;
});
afterAll(() => {
	if (operatorCodexHome === undefined) delete process.env["CODEX_HOME"];
	else process.env["CODEX_HOME"] = operatorCodexHome;
	fs.rmSync(emptyCodexHome, { recursive: true, force: true });
});
afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const png = (): Buffer =>
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=",
		"base64",
	);

/**
 * A batch of two bundled runs of one scenario, with manifests, and a fake grader.
 * @param grader Which runner grades.
 * @param mode What the fake's answers lack (fake-grader-answer.ts).
 * @returns The batch root, the grading options and the fake's argv log.
 */
function batch(grader: GraderName, mode: string) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-grader-retry-"));
	roots.push(root);
	const candidateSkill = digestOf(keepBatchSkill(path.join(checkout, "skills", "archboard"), root));
	fs.writeFileSync(
		path.join(root, "batch.json"),
		JSON.stringify({
			salt: "s",
			provenance: {
				inputs: inputDigest(loaded),
				implementation: "i",
				baseline: "b",
				candidate: "c",
				bun: Bun.version,
			},
			arms: ["candidate"],
			scenarios: [SCENARIO],
			repetitions: 2,
			codexExecutable: "codex",
			pins: loaded.pins,
			candidateSkillDigest: candidateSkill,
		}),
	);
	RUNS.forEach((run, index) => {
		const directory = path.join(root, "runs", "candidate", SCENARIO, String(index + 1));
		fs.mkdirSync(path.join(directory, "captures"), { recursive: true });
		fs.writeFileSync(path.join(directory, "captures/main.png"), png());
		fs.writeFileSync(
			path.join(directory, "bundle.json"),
			JSON.stringify({
				run,
				revision: "3.0.0",
				captures: [
					{
						label: "overview",
						ok: true,
						file: "captures/main.png",
						provenance: { width: 1, height: 1 },
						tiles: [],
					},
				],
			}),
		);
		fs.writeFileSync(
			path.join(directory, "run.json"),
			JSON.stringify({ run, scenario: SCENARIO, captures: CAPTURES }),
		);
	});
	fs.mkdirSync(path.join(root, "graders", "workspace", "flask", "3.0.0", ".git"), {
		recursive: true,
	});
	const log = path.join(root, "fake.log");
	const executable = path.join(root, grader);
	const version = loaded.graders[grader].version;
	const fake = grader === "claude" ? "fake-claude.ts" : "fake-codex.ts";
	const environment = [
		`FAKE_CLAUDE_VERSION=${version}`,
		`FAKE_CLAUDE_LOG=${log}`,
		`FAKE_CODEX_VERSION=${version}`,
		`FAKE_CODEX_LOG=${log}`,
		`FAKE_GRADER_MODE=${mode}`,
		`FAKE_GRADER_FEATURES=${DECLARED.join(",")}`,
		`FAKE_GRADER_STATE=${path.join(root, "fake-state.json")}`,
	].join(" ");
	fs.writeFileSync(
		executable,
		`#!/bin/sh\n${environment} exec "${process.execPath}" "${path.join(import.meta.dir, fake)}" "$@"\n`,
		{ mode: 0o755 },
	);
	const options: GradingOptions = {
		batchRoot: root,
		checkout,
		cache: path.join(root, "absent-cache"),
		loaded,
		chunkSize: 2,
		signal: new AbortController().signal,
		log: () => {},
		grader,
		executable,
	};
	return { root, options, log };
}

/**
 * The argv of every grading call the fake received, version checks left out.
 * @param log The fake's log.
 * @returns The argvs in order.
 */
function gradingCalls(log: string): string[][] {
	return fs
		.readFileSync(log, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as string[])
		.filter((argv) => !argv.includes("--version"));
}

/**
 * The session a call continued, as its command line names it.
 * @param grader The runner.
 * @param argv The call's argv.
 * @returns The session id, or null for a call that started one.
 */
function continuedSession(grader: GraderName, argv: readonly string[]): string | null {
	if (grader === "claude") {
		const at = argv.indexOf("--resume");
		return at === -1 ? null : (argv[at + 1] ?? null);
	}
	return argv[0] === "exec" && argv[1] === "resume" ? (argv[2] ?? null) : null;
}

/**
 * How the report reads a filed verdict: its checklist standing and its visual standing.
 * @param root The batch.
 * @param grader The grader.
 * @param run The run.
 * @returns Both standings.
 */
function reportReading(root: string, grader: GraderName, run: string) {
	const verdict = filedVerdict(root, grader, run);
	const expected = DECLARED.map((feature) => ({ feature }));
	return {
		checklist: verdict === null ? null : checklistStanding(expected, verdict),
		visual: visualStandingOf(CAPTURES, verdict, suppliedCaptures(root, grader, run)),
	};
}

describe.each(["claude", "codex"] as const)("the %s runner", (grader) => {
	test("a short answer is asked for once more in the same session, and the mended answer is filed with its receipt", async () => {
		const { root, options, log } = batch(grader, "lapse-once");
		const graded = await gradeBatch(options);
		const [first, retry] = graded.session.calls;
		expect(graded.session.calls).toHaveLength(2);
		expect(first?.graded).toEqual([...RUNS]);
		expect(retry?.retry?.of).toBe(first?.index);
		expect(retry?.runs).toEqual([...RUNS]);
		expect(retry?.retry?.runs.map((entry) => entry.outcome)).toEqual(["replaced", "replaced"]);
		expect(retry?.retry?.runs[0]?.asked).toEqual({
			unanswered: DECLARED,
			invented: ["invented.by-the-grader"],
			unobserved: ["overview"],
		});
		expect(retry?.graded).toEqual([...RUNS]);
		expect(retry?.error).toBeNull();
		// The retry continues the session the first call started.
		const argvs = gradingCalls(log);
		expect(argvs).toHaveLength(2);
		expect(continuedSession(grader, argvs[0] ?? [])).toBeNull();
		expect(continuedSession(grader, argvs[1] ?? [])).toBe(graded.session.threadId);
		// The prompt names each run it asks again for, and what it lacks.
		const prompt = fs.readFileSync(retry?.promptFile ?? "", "utf8");
		for (const name of [...RUNS, ...DECLARED, "invented.by-the-grader", "overview"])
			expect(prompt).toContain(name);
		for (const run of RUNS) {
			expect(filedVerdict(root, grader, run)?.summary).toBe(`graded ${run} (answer 2)`);
			expect(reportReading(root, grader, run)).toEqual({ checklist: "answered", visual: "pass" });
		}
		// Both calls are counted, under the runner's own semantics.
		expect(graded.session.calls.every((call) => call.callUsage !== null)).toBe(true);
		const total = (graded.session.calls[0]?.callUsage?.total ?? 0) + (retry?.callUsage?.total ?? 0);
		expect(graded.usage?.total).toBe(total);
		expect(graderUsage(root, grader)?.total).toBe(total);
	});

	test("an answer still short after the retry leaves the first verdict filed, and nothing is asked a third time", async () => {
		const { root, options, log } = batch(grader, "lapse-always");
		const graded = await gradeBatch(options);
		expect(gradingCalls(log)).toHaveLength(2);
		const retry = graded.session.calls[1];
		expect(retry?.retry?.runs.map((entry) => entry.outcome)).toEqual([
			"still-short",
			"still-short",
		]);
		expect(retry?.graded).toEqual([]);
		for (const run of RUNS) {
			expect(filedVerdict(root, grader, run)?.summary).toBe(`graded ${run} (answer 1)`);
			// The report sets it aside and leaves its pictures incomplete, as before the retry existed.
			expect(reportReading(root, grader, run)).toEqual({
				checklist: "off-checklist",
				visual: "incomplete",
			});
			// The first call's receipt still vouches for the verdict it filed.
			expect(suppliedCaptures(root, grader, run)).toEqual(["overview"]);
		}
	});

	test("an answer that meets every obligation is not asked again", async () => {
		const { root, options, log } = batch(grader, "mend");
		const graded = await gradeBatch(options);
		expect(gradingCalls(log)).toHaveLength(1);
		expect(graded.session.calls.map((call) => call.retry)).toEqual([undefined]);
		expect(fs.existsSync(path.join(graderLayout(root, grader).root, "prompt-2.md"))).toBe(false);
	});
});

/**
 * An answer for one run answering the given features and observing the given captures.
 * @param features The feature names answered.
 * @param observed The captures observed.
 * @returns The verdict.
 */
function answering(features: readonly string[], observed: readonly string[]): RunVerdict {
	return {
		run: "run-00000000b1",
		semanticCorrectness: 5,
		architecturalTruth: 5,
		readability: 5,
		summary: "s",
		concerns: [],
		features: features.map((feature) => ({
			feature,
			verdict: "pass",
			evidence: "e",
			reason: "r",
			finding: null,
		})),
		visual: {
			inspectedCaptures: ["x", "y"],
			verdict: "pass",
			observations: observed.map((capture) => ({ capture, observation: "o" })),
		},
	};
}

/**
 * One offered picture.
 * @param capture Its capture.
 * @param file Its file.
 * @returns The picture.
 */
function image(capture: string, file: string) {
	return { capture, file, width: 1, height: 1, sha256: file };
}

describe("the obligations a retry is asked for are the report's", () => {
	const expected = [{ feature: "a" }, { feature: "b" }];
	const taken = { declared: ["x", "y"], captured: ["x", "y"], failed: [] };

	test("a complete answer owes nothing and stands as the report reads it", () => {
		const whole = answering(["a", "b"], ["x", "y"]);
		expect(verdictShortfall(expected, taken, whole, ["x", "y"])).toBeNull();
		expect(checklistStanding(expected, whole)).toBe("answered");
		expect(visualStandingOf(taken, whole, ["x", "y"])).toBe("pass");
	});

	test("an answer off its checklist owes the declared names and drops the invented ones", () => {
		const off = answering(["a", "c"], ["x", "y"]);
		expect(verdictShortfall(expected, taken, off, ["x", "y"])).toMatchObject({
			unanswered: ["b"],
			invented: ["c"],
			unobserved: [],
		});
	});

	test("a capture without an observation, or never delivered, is owed; one the harness failed to take is not", () => {
		const partial = answering(["a", "b"], ["x"]);
		expect(verdictShortfall(expected, taken, partial, ["x", "y"])?.unobserved).toEqual(["y"]);
		expect(visualStandingOf(taken, partial, ["x", "y"])).toBe("incomplete");
		const whole = answering(["a", "b"], ["x", "y"]);
		expect(verdictShortfall(expected, taken, whole, ["x"])?.unobserved).toEqual(["y"]);
		const failed = { declared: ["x", "y"], captured: ["x"], failed: ["y"] };
		expect(verdictShortfall(expected, failed, partial, ["x"])).toBeNull();
	});
});

test("a capture counts as delivered when its pictures reached the session over the first call and the retry together", () => {
	const offered = {
		run: "run-00000000c1",
		images: [image("x", "x.png"), image("x", "x-tile-0.png"), image("y", "y.png")],
		suppliedCaptures: ["x", "y"],
		failures: [],
	};
	const first = { ...offered, images: [image("x", "x.png")], suppliedCaptures: [] };
	const retry = { ...offered, images: [image("x", "x-tile-0.png")], suppliedCaptures: [] };
	expect(combinedDelivery(offered, [first, retry]).suppliedCaptures).toEqual(["x"]);
	expect(combinedDelivery(offered, [first, null]).suppliedCaptures).toEqual([]);
	expect(combinedDelivery(offered, [offered, undefined]).suppliedCaptures).toEqual(["x", "y"]);
});
