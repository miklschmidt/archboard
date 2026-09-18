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
	`${BATCH}/runs/candidate/S11/3/author.jsonl`,
	`${WORLD}/flask/README.md`,
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
 * @param output What the command printed.
 * @returns Its exposure.
 */
function exposureOf(script: string, output = ""): string | null | undefined {
	return classifyCommands([{ command: script, exitCode: 2, status: "failed", output }], {
		skillRoot: `${WORLD}/home/.agents/skills/archboard`,
		checkoutRoot: `${WORLD}/flask`,
		archboardRoot: "/checkout",
		vault: `${WORLD}/vault`,
		exposure: ROOTS,
	})[0]?.exposure;
}

/**
 * What a command prints when the path it names does not exist.
 * @param named The path as the command spelled it.
 * @returns The output.
 */
function missing(named: string): string {
	return `sed: can't read ${named}: No such file or directory\n`;
}

test("a plain batch path that does not exist, and that the command reports missing, read nothing", () => {
	// Codex's skill-root alias expanded one level short of the run's world.
	const misread = alias(BATCH);
	expect(exposureOf(`bash -lc "sed -n '1,240p' ${misread}"`, missing(misread))).toBeNull();
	expect(
		exposureOf(`bash -lc "sed -n 1p ${misread} && cat ${BATCH}/blinding.json"`, missing(misread)),
	).toBe("other-run");
	const relative = "../../../9/world/vault/x.json";
	expect(exposureOf(`bash -lc 'cat ${relative}'`, missing(relative))).toBeNull();
	// The path is gone now, but the command's output shows it was read then.
	expect(exposureOf(`bash -lc 'cat ${misread}'`, "---\nname: archboard\n")).toBe("other-run");
});

test("a relative path is read from wherever the script may be: a cd that found its file takes the read with it", () => {
	expect(exposureOf(`bash -lc 'cd ${WORLD}/flask/src/flask && cat ../../README.md'`)).toBeNull();
	for (const script of [
		`cd ${WORLD}/vault && cat ../../author.jsonl`,
		// A cd in a subshell, or one that failed, leaves the script where it was.
		`(cd ${WORLD}/flask/src/flask); cat ../../author.jsonl`,
		`(cd ${WORLD}/flask/src/flask && ls) && cat ../../author.jsonl`,
		"cd /does/not/exist || true; cat ../../author.jsonl",
		"cd /does/not/exist; cat ../../../2/world/vault/x.json",
		// A relative cd moves the script as surely as an absolute one.
		"cd .. && cd .. && cd .. && cat ./2/author.jsonl",
	])
		expect(exposureOf(`bash -lc '${script}'`), script).toBe("other-run");
});

test("a cd's flags are not its directory, and many relative cds are weighed one by one", () => {
	for (const flag of ["-P", "--", "-L --"])
		expect(
			exposureOf(`bash -lc 'cd ${flag} ${WORLD}/flask/src/flask && cat ../../README.md'`),
			flag,
		).toBeNull();
	// Thirty cds into subdirectories and back out past the checkout. Weighing
	// every combination of them would never finish.
	const deep = Array.from({ length: 30 }, (_, index) => `cd d${index}`).join(" && ");
	expect(exposureOf(`bash -lc '${deep} && cat ${"../".repeat(32)}author.jsonl'`)).toBe("other-run");
});

test("a path that exists, a pattern, the batch root, a quoted or joined word, or an escape from the world is exposure", () => {
	for (const script of [
		`ls ${BATCH}/runs/baseline/S11/2/world/vault`,
		`cat "${BATCH}/blinding.json"`,
		`ls ${BATCH}`,
		`ls ${BATCH}/`,
		`cat ${BATCH}/runs/*/S11/*/world/vault/x.json`,
		`cat ${BATCH}/runs/$ARM/S11/2/author.jsonl`,
		`cat ${BATCH}/runs/base"line"/S11/2/run.json`,
		`cat ${BATCH}/runs/base''line/S11/2/run.json`,
		`cat '${BATCH}/runs/base'line/S11/2/run.json`,
		`cat "${BATCH}/runs/base"*/S11/2/run.json`,
		`cat ${WORLD}/../author.jsonl`,
		`cat ..'/../'author.jsonl`,
	])
		expect(exposureOf(`bash -lc '${script}'`, missing(`${BATCH}/runs/base`)), script).toBe(
			"other-run",
		);
	// A script that assigns or expands a variable exempts nothing, even where
	// the output reports the prefix it assigned missing.
	expect(
		exposureOf(
			`bash -lc 'X=${BATCH}/runs/base; ls $X; cat \${X}line/S11/2/run.json'`,
			`ls: cannot access '${BATCH}/runs/base': No such file or directory\n{}`,
		),
	).toBe("other-run");
	// A variable assembled from a prefix that does not exist reads what it expands to.
	expect(exposureOf(`bash -lc 'X=${BATCH}/runs/base; cat \${X}line/S11/2/run.json'`, "{}")).toBe(
		"other-run",
	);
	expect(exposureOf(`bash -lc 'cat ${WORLD}/vault/"Flask JSON.semantic.json"'`)).toBeNull();
});

/**
 * A batch whose one run recorded an other-run read at run time and stored the
 * command that earned it, as a batch that sat at `recordedRoot` when it ran.
 * @param command What the author ran and what it printed, given where the batch sat.
 * @param recordedRoot Where the batch sat when the run happened, or undefined for where it sits now.
 * @returns The batch root as it sits now.
 */
function batchWithStoredCommand(
	command: (root: string) => readonly [string, string],
	recordedRoot?: string,
): string {
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
		JSON.stringify([
			{ command: command(then)[0], exitCode: 2, status: "failed", output: command(then)[1] },
		]),
	);
	return batchRoot;
}

/**
 * The mis-expanded skill alias.
 * @param root Where the batch sat.
 * @returns The path.
 */
function alias(root: string): string {
	return `${root}/world/home/.agents/skills/archboard/SKILL.md`;
}

test("the report re-reads a run's stored commands, so a read the command shows found nothing sets no saved run aside", () => {
	for (const [label, command, recordedRoot, contaminated] of [
		[
			"a mis-expanded skill alias",
			(root: string) =>
				[`bash -lc "sed -n '1,240p' ${alias(root)}"`, missing(alias(root))] as const,
			undefined,
			false,
		],
		[
			"a path gone since the run, whose output shows it was read",
			(root: string) => [`bash -lc 'cat ${alias(root)}'`, "---\nname: archboard\n"] as const,
			undefined,
			true,
		],
		[
			"the blinding table",
			(root: string) => [`bash -lc 'cat ${root}/blinding.json'`, "{}"] as const,
			undefined,
			true,
		],
		[
			"the blinding table of a batch moved since it ran",
			(root: string) => [`bash -lc 'cat ${root}/blinding.json'`, "{}"] as const,
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
	const batchRoot = batchWithStoredCommand((root) => [
		`bash -lc 'cat ${root}/blinding.json'`,
		"{}",
	]);
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

test("a run whose stored commands cannot be read keeps the count it recorded, and the report goes on", () => {
	for (const stored of ["{ not json", JSON.stringify([{ command: 7 }])]) {
		const batchRoot = batchWithStoredCommand((root) => [
			`bash -lc 'cat ${root}/blinding.json'`,
			"{}",
		]);
		try {
			const directory = path.join(batchRoot, "runs", "baseline", scenario.id, "1");
			fs.writeFileSync(path.join(directory, "commands.json"), stored);
			const [read] = readManifests(batchRoot);
			if (read === undefined) throw new Error("no manifest was read");
			expect(recordOf(batchRoot, loaded, read).exposure?.["other-run"], stored).toBe(1);
		} finally {
			fs.rmSync(batchRoot, { recursive: true, force: true });
		}
	}
});
