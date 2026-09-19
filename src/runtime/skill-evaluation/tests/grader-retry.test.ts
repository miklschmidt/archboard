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
 * @param extra What else differs.
 * @param extra.runModes A mode per run, overriding `mode`.
 * @param extra.environment More of the fake's environment.
 * @param extra.unofferable Whether each run also declares a capture the harness cannot offer.
 * @returns The batch root, the grading options, the fake's argv log, and a way to change the fake's mode.
 */
function batch(
	grader: GraderName,
	mode: string,
	extra: {
		readonly runModes?: Readonly<Record<string, string>>;
		readonly environment?: readonly string[];
		readonly unofferable?: boolean;
	} = {},
) {
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
					// A picture whose dimensions disagree with its provenance is never offered.
					...(extra.unofferable === true
						? [
								{
									label: "detail",
									ok: true,
									file: "captures/main.png",
									provenance: { width: 2, height: 1 },
									tiles: [],
								},
							]
						: []),
				],
			}),
		);
		const labels = extra.unofferable === true ? ["overview", "detail"] : ["overview"];
		fs.writeFileSync(
			path.join(directory, "run.json"),
			JSON.stringify({
				run,
				scenario: SCENARIO,
				captures: { declared: labels, captured: labels, failed: [] },
			}),
		);
	});
	fs.mkdirSync(path.join(root, "graders", "workspace", "flask", "3.0.0", ".git"), {
		recursive: true,
	});
	const log = path.join(root, "fake.log");
	const executable = path.join(root, grader);
	const version = loaded.graders[grader].version;
	const fake = grader === "claude" ? "fake-claude.ts" : "fake-codex.ts";
	/**
	 * Writes the fake with the mode its answers take from now on.
	 * @param now The mode.
	 */
	const refake = (now: string): void => {
		const environment = [
			`FAKE_CLAUDE_VERSION=${version}`,
			`FAKE_CLAUDE_LOG=${log}`,
			`FAKE_CODEX_VERSION=${version}`,
			`FAKE_CODEX_LOG=${log}`,
			`FAKE_GRADER_MODE=${now}`,
			`FAKE_GRADER_RUN_MODES=${Object.entries(extra.runModes ?? {})
				.map(([run, runMode]) => `${run}=${runMode}`)
				.join(",")}`,
			`FAKE_GRADER_FEATURES=${DECLARED.join(",")}`,
			`FAKE_GRADER_STATE=${path.join(root, "fake-state.json")}`,
			...(extra.environment ?? []),
		].join(" ");
		fs.writeFileSync(
			executable,
			`#!/bin/sh\n${environment} exec "${process.execPath}" "${path.join(import.meta.dir, fake)}" "$@"\n`,
			{ mode: 0o755 },
		);
	};
	refake(mode);
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
	return { root, options, log, refake };
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

	test("a name invented beside every declared one, or a capture the harness could not offer, is not asked about", async () => {
		const invented = batch(grader, "invent-extra");
		await gradeBatch(invented.options);
		expect(gradingCalls(invented.log)).toHaveLength(1);
		const unofferable = batch(grader, "mend", { unofferable: true });
		await gradeBatch(unofferable.options);
		expect(gradingCalls(unofferable.log)).toHaveLength(1);
	});

	test("one retry settles each run on its own: mended, improved, or still short", async () => {
		const { root, options } = batch(grader, "lapse-once", {
			runModes: { [RUNS[1]]: "lapse-always" },
		});
		const graded = await gradeBatch(options);
		expect(graded.session.calls[1]?.retry?.runs.map((entry) => entry.outcome)).toEqual([
			"replaced",
			"still-short",
		]);
		expect(graded.session.calls[1]?.graded).toEqual([RUNS[0]]);
		expect(filedVerdict(root, grader, RUNS[0])?.summary).toBe(`graded ${RUNS[0]} (answer 2)`);
		expect(filedVerdict(root, grader, RUNS[1])?.summary).toBe(`graded ${RUNS[1]} (answer 1)`);

		// An answer that mends part of what was asked, and breaks nothing else, replaces the first.
		const half = batch(grader, "half-mend");
		const halfGraded = await gradeBatch(half.options);
		const settled = halfGraded.session.calls[1]?.retry?.runs[0];
		expect(settled?.outcome).toBe("replaced");
		expect(settled?.remaining).toEqual({ unanswered: [], invented: [], unobserved: ["overview"] });
		expect(reportReading(half.root, grader, RUNS[0])).toEqual({
			checklist: "answered",
			visual: "incomplete",
		});
	});

	test("a retry that brings no answer leaves every first verdict filed and is not made again", async () => {
		const { root, options, log } = batch(grader, "lapse-then-silent");
		const graded = await gradeBatch(options);
		const retry = graded.session.calls[1];
		expect(retry?.retry?.runs.map((entry) => entry.outcome)).toEqual(["no-answer", "no-answer"]);
		expect(retry?.error).not.toBeNull();
		for (const run of RUNS)
			expect(filedVerdict(root, grader, run)?.summary).toBe(`graded ${run} (answer 1)`);
		await gradeBatch(options);
		expect(gradingCalls(log)).toHaveLength(2);
	});

	test("a verdict filed without its retry, as by an interrupted pass or before retries existed, is re-asked on the next pass", async () => {
		const { root, options, log, refake } = batch(grader, "lapse-always");
		const first = await gradeBatch(options);
		// Make it a batch graded before retries: its session holds no retry, its receipts stand.
		const layout = graderLayout(root, grader);
		const session = JSON.parse(fs.readFileSync(layout.session, "utf8")) as {
			calls: { retry?: unknown }[];
		};
		session.calls = session.calls.filter((call) => call.retry === undefined);
		fs.writeFileSync(layout.session, JSON.stringify(session));
		refake("mend");
		const second = await gradeBatch(options);
		const retry = second.session.calls[1];
		expect(second.session.calls).toHaveLength(2);
		expect(retry?.retry?.of).toBe(1);
		expect(retry?.retry?.runs.map((entry) => entry.outcome)).toEqual(["replaced", "replaced"]);
		const argvs = gradingCalls(log);
		expect(argvs).toHaveLength(3);
		expect(continuedSession(grader, argvs[2] ?? [])).toBe(first.session.threadId);
		for (const run of RUNS)
			expect(reportReading(root, grader, run)).toEqual({ checklist: "answered", visual: "pass" });
		// Once asked, never again.
		await gradeBatch(options);
		expect(gradingCalls(log)).toHaveLength(3);
	});
});

test("a session whose runner named no session is never re-asked: a fresh one has read nothing", async () => {
	const { options, log } = batch("codex", "lapse-always", {
		environment: ["FAKE_CODEX_THREAD=none"],
	});
	const graded = await gradeBatch(options);
	expect(graded.session.threadId).toBeNull();
	expect(gradingCalls(log)).toHaveLength(1);
	await gradeBatch(options);
	expect(gradingCalls(log)).toHaveLength(1);
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

	test("an answer that skipped a declared feature owes it, and invented nothing", () => {
		expect(verdictShortfall(expected, taken, answering(["a"], ["x", "y"]), ["x", "y"])).toEqual({
			run: "run-00000000b1",
			unanswered: ["b"],
			invented: [],
			unobserved: [],
		});
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
