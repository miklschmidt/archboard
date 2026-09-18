// The evidence an author run leaves behind, read the way the batch of
// 2026-09-14 showed it has to be (TASK-212): a board patched with Codex's own
// editing tool is a `file_change` item and no command; a read that names a
// board file is not a write, whatever it redirects to /dev/null; a `--help`
// is not a write attempt; a read of the scenario, the fixtures or the rubric
// is recorded as exposure; and a resumed grading call reports the thread's
// cumulative usage, not its own.

import { describe, expect, test } from "bun:test";
import { SemanticBoardSchema } from "@/shared/semantic-board/index";
import {
	callUsageFrom,
	countDirectBoardWrites,
	exposureCounts,
	sessionUsage,
} from "@/runtime/skill-evaluation/audit";
import {
	buildReport,
	classifyCommands,
	evaluateGuardrails,
	parseTrace,
	renderReportMarkdown,
	type ClassifiedCommand,
	type RunRecord,
	type Usage,
} from "@/runtime/skill-evaluation/index";

const CHECKOUT = "/checkout";
const BATCH = `${CHECKOUT}/.skill-evals/2026-09-14T13-50-10-617Z`;
const RUN = `${BATCH}/runs/candidate/S11/3`;
/** The author's own world, the only part of the run it may read or write. */
const WORLD = `${RUN}/world`;
const VAULT = `${WORLD}/vault`;
const CONTEXT = {
	skillRoot: `${WORLD}/home/.agents/skills/archboard`,
	checkoutRoot: `${WORLD}/flask`,
	archboardRoot: CHECKOUT,
	vault: VAULT,
	exposure: {
		evaluationInputs: `${CHECKOUT}/evals`,
		harnessSource: `${CHECKOUT}/src/runtime/skill-evaluation`,
		skillPackages: [
			`${CHECKOUT}/skills/archboard`,
			`${CHECKOUT}/docs/design/skill-evals/baseline/archboard`,
		],
		batchRoot: BATCH,
		world: WORLD,
	},
};

/**
 * One recorded command, classified.
 * @param command The command as Codex recorded it.
 * @returns The classified command.
 */
function classified(command: string): ClassifiedCommand {
	const [one] = classifyCommands(
		[{ command, exitCode: 0, status: "completed", output: "" }],
		CONTEXT,
	);
	if (one === undefined) throw new Error("nothing classified");
	return one;
}

const BOARD = SemanticBoardSchema.parse({
	schemaVersion: "2.2.0",
	kind: "semantic-board",
	id: "b1",
	name: "Flask JSON",
	level: "service",
	version: 3,
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

/**
 * The write guardrail's verdict over some commands and file changes.
 * @param commands The commands, as recorded.
 * @param fileChanges What Codex's editing tool changed.
 * @returns The verdict.
 */
function writeGuardrail(
	commands: readonly string[],
	fileChanges: readonly { path: string; kind: string }[] = [],
) {
	const [verdict] = evaluateGuardrails(["doing-on-writes"], {
		snapshot: new Map([["Flask JSON", BOARD]]),
		boards: new Map([["Flask JSON", BOARD]]),
		configBefore: "a",
		configAfter: "a",
		commands: commands.map(classified),
		fileChanges,
		vault: VAULT,
	});
	if (verdict === undefined) throw new Error("no verdict");
	return verdict;
}

describe("file changes", () => {
	test("a board patched with the editing tool is read off the stream and fails the write guardrail", () => {
		const trace = parseTrace(
			[
				{ type: "thread.started", thread_id: "t" },
				{
					type: "item.started",
					item: {
						id: "i1",
						type: "file_change",
						changes: [{ path: `${VAULT}/Flask JSON.semantic.json`, kind: "update" }],
						status: "in_progress",
					},
				},
				{
					type: "item.completed",
					item: {
						id: "i1",
						type: "file_change",
						changes: [{ path: `${VAULT}/Flask JSON.semantic.json`, kind: "update" }],
						status: "completed",
					},
				},
				{
					type: "item.completed",
					item: {
						id: "i2",
						type: "file_change",
						changes: [{ path: `${RUN}/flask/notes.md`, kind: "add" }],
						status: "completed",
					},
				},
			]
				.map((event) => JSON.stringify(event))
				.join("\n"),
		);
		// Started and completed are one change, not two.
		expect(trace.fileChanges).toEqual([
			{ path: `${VAULT}/Flask JSON.semantic.json`, kind: "update" },
			{ path: `${RUN}/flask/notes.md`, kind: "add" },
		]);
		const verdict = writeGuardrail([], trace.fileChanges);
		expect(verdict.passed).toBe(false);
		expect(verdict.detail).toContain("1 board files patched directly");
		// A file outside the vault is the author's business.
		expect(writeGuardrail([], [trace.fileChanges[1]!]).passed).toBe(true);
		expect(
			writeGuardrail([], [{ path: `${VAULT}-backup/Flask JSON.semantic.json`, kind: "update" }])
				.passed,
		).toBe(true);
	});
});

describe("what counts as a direct write", () => {
	const board = `'${VAULT}/Flask JSON.semantic.json'`;
	test.each([
		[`bash -lc "python -m json.tool ${board} >/dev/null; echo json_exit:$?"`, true],
		[`bash -lc "jq empty ${board} 2>&1; grep -n version ${board}"`, true],
		[`bash -lc "sed -n '1,12p' ${board}"`, true],
		[`bash -lc "od -An -tx1 -N 180 ${board} 2>/dev/null"`, true],
		[`bash -lc "cat ${board} | head -5 > /tmp/peek.json"`, true],
		[`bash -lc "cat payload.json > ${board}"`, false],
		[`bash -lc "cat payload.json >> ${board}"`, false],
		[`bash -lc "sed -i 's/a/b/' ${board}"`, false],
		[`bash -lc "cp /tmp/fixed.json ${board}"`, false],
		[`bash -lc "cp ${board} /tmp/copy.json"`, true],
		[`bash -lc "rm ${board}"`, false],
		[`bash -lc "python3 - <<'EOF'\nimport json\np=${board}\nopen(p,'w').write('{}')\nEOF"`, false],
		[`bash -lc "node -e \\"require('fs').writeFileSync(${board}, '{}')\\""`, false],
	])("%s is %s", (command, reads) => {
		expect(writeGuardrail([command]).passed).toBe(reads);
	});
});

describe("write attempts", () => {
	test("help and text searches are not write attempts; an invocation is", () => {
		const doing =
			'bash -lc \'archboard semantic edit "Flask JSON" --expect-version 3 --doing "restoring" < edit.json\'';
		expect(classified("bash -lc 'archboard semantic edit --help'").write).toBe(false);
		expect(classified("bash -lc 'archboard semantic new -h'").write).toBe(false);
		expect(classified("bash -lc 'archboard help semantic edit'").write).toBe(false);
		expect(classified("bash -lc 'rg -n \"semantic edit\" ~/.agents/skills/archboard'").write).toBe(
			false,
		);
		expect(
			classified("bash -lc 'cat references/variants.md | grep \"semantic resolve\"'").write,
		).toBe(false);
		expect(classified(doing).write).toBe(true);
		expect(
			classified(
				"/home/msc/.nix-profile/bin/bash -lc 'archboard semantic edit \"Flask JSON\" --expect-version 3'",
			).write,
		).toBe(true);
		expect(
			classified("bash -lc 'ARCHBOARD_VAULT=/v archboard semantic branch \"Flask\" --as X'").write,
		).toBe(true);
		expect(
			classified("bash -lc 'cd /flask && archboard semantic adopt \"Flask\" --variant X'").write,
		).toBe(true);
		const verdict = writeGuardrail([
			"bash -lc 'archboard semantic edit --help'",
			doing,
			"bash -lc 'archboard semantic branch \"Flask JSON\" --as X --expect-version 3'",
		]);
		expect(verdict.passed).toBe(true);
		expect(verdict.detail).toContain("1 write attempts lacked --doing");
	});

	test("a CLI read does not hide a direct mutation later in the same shell script", () => {
		const command = `bash -lc 'archboard semantic show "Flask JSON"; rm "${VAULT}/Flask JSON.semantic.json"'`;
		expect(classified(command).class).toBe("operation");
		expect(writeGuardrail([command]).passed).toBe(false);
		expect(
			countDirectBoardWrites({ commands: [classified(command)], fileChanges: [], vault: VAULT }),
		).toBe(1);
	});
});

describe("reading the product is its own class, apart from the skill, Flask and contamination", () => {
	test("the skill is discovery, Flask is investigation, the archboard source is product-source", () => {
		const skill = classified(
			`bash -lc 'cat ${CONTEXT.skillRoot}/references/generated/semantic-edit-input.schema.json'`,
		);
		expect(skill.class).toBe("discovery");
		expect(skill.exposure).toBeNull();
		const flask = classified(`bash -lc 'rg -n load_app ${CONTEXT.checkoutRoot}/src/flask/cli.py'`);
		expect(flask.class).toBe("code-investigation");
		expect(flask.exposure).toBeNull();
		const runtime = classified(
			"bash -lc 'rg -n repeat /checkout/src/runtime/semantic-board-store/tests/flows-and-views.test.ts'",
		);
		expect(runtime.class).toBe("product-source");
		expect(runtime.exposure).toBeNull();
		const cli = classified("bash -lc 'sed -n 1,80p ../archboard/src/cli/semantic/edit.ts'");
		expect(cli.class).toBe("product-source");
		const harness = classified(
			"bash -lc 'cat /checkout/src/runtime/skill-evaluation/lib/outcomes.ts'",
		);
		expect(harness.class).toBe("product-source");
		expect(harness.exposure).toBe("harness-source");
	});

	test("the batch lives under the checkout, and a run reading its own world or records has read no product source", () => {
		for (const script of [
			`cat ${VAULT}/Flask\\ JSON.semantic.json`,
			`ls ${WORLD}`,
			`rg -n load_app ${CONTEXT.checkoutRoot}/src/flask/cli.py`,
			`cat ${RUN}/snapshot/Flask_JSON.json`,
			`rg -n semantic ${RUN}/author.jsonl`,
			`ls ${BATCH}/runs`,
		]) {
			expect(classified(`bash -lc '${script}'`).class, script).not.toBe("product-source");
		}
		// A read that leaves the batch tree for the checkout is still the product.
		expect(classified(`bash -lc 'cat ${CHECKOUT}/src/cli/semantic/edit.ts'`).class).toBe(
			"product-source",
		);
		expect(
			classified(`bash -lc 'cat ${RUN}/snapshot/x.json ${CHECKOUT}/src/server.ts'`).class,
		).toBe("product-source");
	});
});

describe("evaluation-material exposure", () => {
	test("reads of the inputs, the harness and other runs are recorded by kind; the run's own world and the CLI are not", () => {
		expect(classified("bash -lc 'cat /checkout/evals/fixtures/S11.json'").exposure).toBe(
			"evaluation-inputs",
		);
		expect(classified("bash -lc 'rg -n third /somewhere/evals/rubric.md'").exposure).toBe(
			"evaluation-inputs",
		);
		expect(
			classified("bash -lc 'sed -n 1,40p /checkout/src/runtime/skill-evaluation/lib/vault.ts'")
				.exposure,
		).toBe("harness-source");
		expect(classified(`bash -lc 'ls ${BATCH}/runs/baseline/S11/2/world/vault'`).exposure).toBe(
			"other-run",
		);
		expect(
			classified("bash -lc 'cat ../../../2/world/vault/Flask\\ JSON.semantic.json'").exposure,
		).toBe("other-run");
		expect(classified("bash -lc 'cat ../vault/Flask\\ JSON.semantic.json'").exposure).toBeNull();
		expect(classified(`bash -lc 'cat ${VAULT}/.archboard/config.yaml'`).exposure).toBeNull();
		expect(
			classified(`bash -lc 'ARCHBOARD_VAULT=${VAULT} archboard semantic show "Flask JSON"'`)
				.exposure,
		).toBeNull();
		expect(classified("bash -lc 'rg wsgi_app src/flask/app.py'").exposure).toBeNull();
		expect(
			exposureCounts([
				classified("bash -lc 'cat /checkout/evals/evals.json'"),
				classified("bash -lc 'cat /checkout/evals/coverage.json'"),
				classified(`bash -lc 'ls ${BATCH}/runs/baseline/S11/2'`),
				classified("bash -lc 'ls'"),
			]),
		).toEqual({
			"evaluation-inputs": 2,
			"harness-source": 0,
			"skill-package": 0,
			"other-run": 1,
		});
	});

	test("the harness's records of this very run, the blinding table and the batch manifest are exposure", () => {
		for (const script of [
			`cat ${RUN}/author.jsonl`,
			`rg -n semantic ${RUN}/author.jsonl`,
			`cat ${RUN}/snapshot/Flask_JSON.json`,
			`cat ${RUN}/bundle.json`,
			`cat ${BATCH}/blinding.json`,
			`cat ${BATCH}/batch.json`,
			"cat ../../author.jsonl",
			"ls ../../snapshot",
		]) {
			expect(classified(`bash -lc '${script}'`).exposure, script).toBe("other-run");
		}
	});

	test("either arm's package in the checkout is exposure, the skill installed in the run's world is not", () => {
		for (const script of [
			`cat ${CHECKOUT}/skills/archboard/SKILL.md`,
			`rg -n variant ${CHECKOUT}/docs/design/skill-evals/baseline/archboard/references/edit.md`,
		]) {
			expect(classified(`bash -lc '${script}'`).exposure, script).toBe("skill-package");
		}
		const installed = classified(`bash -lc 'cat ${CONTEXT.skillRoot}/SKILL.md'`);
		expect(installed.exposure).toBeNull();
		expect(installed.class).toBe("discovery");
	});

	test("a context without roots records no exposure, so the classes alone can be tested", () => {
		const [one] = classifyCommands(
			[{ command: "cat /checkout/evals/evals.json", exitCode: 0, status: "completed", output: "" }],
			{ skillRoot: "/s", checkoutRoot: "/c", vault: "/v" },
		);
		expect(one?.exposure).toBeNull();
	});
});

/**
 * One cumulative usage reading.
 * @param input Input tokens so far.
 * @param output Output tokens so far.
 * @returns The reading.
 */
function reading(input: number, output: number): Usage {
	return {
		input,
		cached: Math.floor(input / 2),
		cacheWrite: 0,
		output,
		reasoning: null,
		total: input + output,
	};
}

describe("grader usage in a resumed thread", () => {
	test("each call's share is the growth since the previous reading, and the session costs its last reading", () => {
		const calls = [
			{ usage: reading(500, 60) },
			{ usage: reading(1_800, 130) },
			{ usage: null },
			{ usage: reading(2_800, 190) },
		];
		expect(callUsageFrom([], calls[0]!.usage)).toEqual(reading(500, 60));
		expect(callUsageFrom(calls.slice(0, 1), calls[1]!.usage)).toEqual({
			input: 1_300,
			cached: 650,
			cacheWrite: 0,
			output: 70,
			reasoning: null,
			total: 1_370,
		});
		// A call that reported nothing leaves the previous reading in force.
		expect(callUsageFrom(calls.slice(0, 3), calls[3]!.usage)?.total).toBe(1_060);
		expect(callUsageFrom(calls.slice(0, 2), null)).toBeNull();
		expect(sessionUsage(calls)).toEqual(reading(2_800, 190));
		expect(sessionUsage([{ usage: null }])).toBeNull();
	});

	test("a reading smaller than the last is a fresh thread, counted on its own", () => {
		const calls = [
			{ usage: reading(1_000, 100) },
			{ usage: reading(300, 20) },
			{ usage: reading(900, 50) },
		];
		expect(callUsageFrom(calls.slice(0, 1), calls[1]!.usage)).toEqual(reading(300, 20));
		expect(sessionUsage(calls)?.total).toBe(1_100 + 950);
	});
});

/**
 * One run record for the report.
 * @param overrides What differs from a clean, successful baseline run.
 * @returns The record.
 */
function record(overrides: Partial<RunRecord>): RunRecord {
	return {
		run: "run-0000000000",
		arm: "baseline",
		scenario: "S11",
		workflow: "propose-compare",
		report: "primary",
		repetition: 1,
		status: "completed",
		durationMs: 10,
		usage: reading(100, 10),
		commandCounts: {
			discovery: 1,
			operation: 2,
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
		checklist: { standing: "answered", unmentioned: [], invented: [] },
		...overrides,
	};
}

describe("contamination in the report", () => {
	test("a run that read evaluation material is listed apart and blocks the token comparison, without being called a board failure", () => {
		const exposed = record({
			run: "run-0000000002",
			arm: "candidate",
			exposure: { "evaluation-inputs": 2, "harness-source": 0, "skill-package": 0, "other-run": 0 },
		});
		const report = buildReport([record({}), exposed], null);
		const row = report.scenarios[0]!;
		expect(row.candidate.contaminated).toBe(1);
		expect(row.candidate.succeeded).toBe(1);
		expect(row.tokenChangePercent).toBeNull();
		expect(report.contamination.map((run) => run.run)).toEqual(["run-0000000002"]);
		expect(report.failures).toEqual([]);
		const markdown = renderReportMarkdown(report);
		expect(markdown).toContain("run-0000000002");
		expect(markdown).toContain("evaluation-inputs ×2");
	});

	test("a direct write is an audit failure named as such, and a run recorded without the audit says so", () => {
		const patched = record({ run: "run-0000000003", directWrites: 1, guardrailsPassed: false });
		const old = record({ run: "run-0000000004", directWrites: null, exposure: null });
		const report = buildReport([patched, old], null);
		expect(report.scenarios[0]!.baseline.directWrites).toBe(1);
		expect(report.scenarios[0]!.baseline.unaudited).toBe(1);
		expect(report.contamination.map((run) => run.run)).toEqual(["run-0000000003"]);
		const markdown = renderReportMarkdown(report);
		expect(markdown).toContain("wrote 1 board files outside the CLI");
		expect(markdown).toContain("1 runs were recorded before file changes and exposure were kept");
	});

	test("clean audited runs compare as before", () => {
		const report = buildReport(
			[record({}), record({ run: "run-0000000005", arm: "candidate" })],
			null,
		);
		expect(report.scenarios[0]!.tokenChangePercent).toBe(0);
		expect(report.contamination).toEqual([]);
	});
});
