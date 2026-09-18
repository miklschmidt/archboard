// A read of nothing is not a read of another run. Codex 0.155.0 lists an
// installed skill under an alias; authors that expanded it one level short of
// their own world named a path beside it, got "No such file or directory", and
// were set aside as contaminated. The classifier asks whether a literal path
// exists, and the report asks it again of every saved run's stored commands, so
// the rule reaches a batch that was run and graded before it.

import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildReport,
	classifyCommands,
	loadSuite,
	readManifests,
	recordOf,
	writeRunManifest,
	type Scenario,
} from "@/runtime/skill-evaluation/index";
import type { ExposureRoots } from "@/runtime/skill-evaluation/audit";

const checkout = path.resolve(import.meta.dir, "../../../..");
const loaded = loadSuite(path.join(checkout, "evals"));

/**
 * Any scenario of the suite, so the report can group the record.
 * @returns The first scenario.
 */
function someScenario(): Scenario {
	const first = loaded.suite.evals[0];
	if (first === undefined) throw new Error("the suite has no scenarios");
	return first;
}

const scenario = someScenario();

const BATCH = "/checkout/.skill-evals/2026-09-18T14-01-43-895Z";
const WORLD = `${BATCH}/runs/candidate/S11/3/world`;
const PRESENT = new Set([
	BATCH,
	`${BATCH}/runs/baseline/S11/2/world/vault`,
	`${BATCH}/blinding.json`,
]);
const ROOTS: ExposureRoots = {
	evaluationInputs: "/checkout/evals",
	harnessSource: "/checkout/src/runtime/skill-evaluation",
	skillPackages: ["/checkout/skills/archboard"],
	batchRoot: BATCH,
	world: WORLD,
	exists: (file) => PRESENT.has(file),
};

/**
 * One command's exposure, against a batch holding only the present paths.
 * @param script The inner script.
 * @returns Its exposure.
 */
function exposureOf(script: string): string | null | undefined {
	return classifyCommands([{ command: script, exitCode: 2, status: "failed", output: "" }], {
		skillRoot: `${WORLD}/home/.agents/skills/archboard`,
		checkoutRoot: `${WORLD}/flask`,
		archboardRoot: "/checkout",
		vault: `${WORLD}/vault`,
		exposure: ROOTS,
	})[0]?.exposure;
}

test("a literal batch path that exists nowhere read nothing; one that exists, a pattern, or the batch root is exposure", () => {
	// Codex's skill-root alias expanded one level short of the run's world.
	expect(
		exposureOf(`bash -lc "sed -n '1,240p' ${BATCH}/world/home/.agents/skills/archboard/SKILL.md"`),
	).toBeNull();
	expect(exposureOf("bash -lc 'cat ../../../9/world/vault/x.json'")).toBeNull();
	for (const script of [
		`ls ${BATCH}/runs/baseline/S11/2/world/vault`,
		`cat "${BATCH}/blinding.json"`,
		`ls ${BATCH}`,
		`ls ${BATCH}/`,
		`cat ${BATCH}/runs/*/S11/*/world/vault/x.json`,
		`cat ${BATCH}/runs/$ARM/S11/2/author.jsonl`,
	])
		expect(exposureOf(`bash -lc '${script}'`), script).toBe("other-run");
});

/**
 * A batch whose one run recorded an other-run read at run time and stored the
 * command that earned it, as a batch that sat at `recordedRoot` when it ran.
 * @param command What the author ran, given where the batch sat.
 * @param recordedRoot Where the batch sat when the run happened, or undefined for where it sits now.
 * @returns The batch root as it sits now.
 */
function batchWithStoredCommand(command: (root: string) => string, recordedRoot?: string): string {
	const batchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "reaudit-"));
	const then = recordedRoot ?? batchRoot;
	const place = path.join("runs", "baseline", scenario.id, "1");
	writeRunManifest(path.join(batchRoot, place), {
		run: "run-0000000001",
		arm: "baseline",
		scenario: scenario.id,
		workflow: scenario.workflow,
		report: scenario.report,
		repetition: 1,
		status: "completed",
		usage: null,
		commandCounts: {
			discovery: 1,
			operation: 0,
			"code-investigation": 0,
			"product-source": 0,
			setup: 0,
			ambiguous: 0,
		},
		directWrites: 0,
		exposure: { "evaluation-inputs": 0, "harness-source": 0, "skill-package": 0, "other-run": 1 },
		install: {
			skillRoot: path.join(then, place, "world", "home", ".agents", "skills", "archboard"),
		},
		outcomesPassed: true,
		guardrailsPassed: true,
	});
	fs.writeFileSync(path.join(batchRoot, "blinding.json"), "{}");
	fs.writeFileSync(
		path.join(batchRoot, place, "commands.json"),
		JSON.stringify([{ command: command(then), exitCode: 2, status: "failed", output: "" }]),
	);
	return batchRoot;
}

test("the report re-reads a run's stored commands, so a path that exists nowhere sets no saved run aside", () => {
	for (const [label, command, recordedRoot, contaminated] of [
		[
			"a mis-expanded skill alias",
			(root: string) =>
				`bash -lc "sed -n '1,240p' ${root}/world/home/.agents/skills/archboard/SKILL.md"`,
			undefined,
			false,
		],
		[
			"the blinding table",
			(root: string) => `bash -lc 'cat ${root}/blinding.json'`,
			undefined,
			true,
		],
		[
			"the blinding table of a batch moved since it ran",
			(root: string) => `bash -lc 'cat ${root}/blinding.json'`,
			"/elsewhere/.skill-evals/moved",
			true,
		],
	] as const) {
		const batchRoot = batchWithStoredCommand(command, recordedRoot);
		try {
			const [read] = readManifests(batchRoot);
			if (read === undefined) throw new Error("no manifest was read");
			const record = recordOf(batchRoot, loaded, read);
			expect(record.exposure?.["other-run"], label).toBe(contaminated ? 1 : 0);
			expect(buildReport([record], null).contamination.length, label).toBe(contaminated ? 1 : 0);
		} finally {
			fs.rmSync(batchRoot, { recursive: true, force: true });
		}
	}
});

test("a run recorded before exposure was kept stays unaudited, whatever commands it stored", () => {
	const batchRoot = batchWithStoredCommand((root) => `bash -lc 'cat ${root}/blinding.json'`);
	try {
		const directory = path.join(batchRoot, "runs", "baseline", scenario.id, "1");
		const { exposure: _exposure, ...older } = JSON.parse(
			fs.readFileSync(path.join(directory, "run.json"), "utf8"),
		);
		fs.writeFileSync(path.join(directory, "run.json"), JSON.stringify(older));
		const [read] = readManifests(batchRoot);
		if (read === undefined) throw new Error("no manifest was read");
		expect(recordOf(batchRoot, loaded, read).exposure).toBeNull();
	} finally {
		fs.rmSync(batchRoot, { recursive: true, force: true });
	}
});
