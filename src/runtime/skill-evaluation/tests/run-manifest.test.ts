// A run's manifest is the only place what its author did survives the run:
// the class of every command and every kind of material it reached for. The
// 2026-09-17 batch recorded nine runs that read the product's source and
// reported nought for all forty, because the schema that read run.json named
// fewer classes than the one that wrote it. What is written is read back here.

import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildReport,
	loadSuite,
	readManifests,
	recordOf,
	writeRunManifest,
	type RunManifestFields,
	type Scenario,
} from "@/runtime/skill-evaluation/index";

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

/**
 * A manifest as a run writes it.
 * @param overrides What this run recorded of itself.
 * @returns The fields.
 */
function manifest(overrides: Partial<RunManifestFields> = {}): RunManifestFields {
	return {
		run: "run-0000000001",
		arm: "baseline",
		scenario: scenario.id,
		workflow: scenario.workflow,
		report: scenario.report,
		repetition: 1,
		status: "completed",
		usage: null,
		commandCounts: {
			discovery: 5,
			operation: 6,
			"code-investigation": 3,
			"product-source": 4,
			setup: 1,
			ambiguous: 0,
		},
		directWrites: 0,
		exposure: {
			"evaluation-inputs": 0,
			"harness-source": 0,
			"skill-package": 1,
			"other-run": 2,
		},
		outcomesPassed: true,
		guardrailsPassed: true,
		...overrides,
	};
}

/**
 * A batch directory holding one run's manifest, written as the run writes it.
 * @param fields The manifest, or raw JSON as an older harness left it.
 * @returns The batch root.
 */
function batchWith(fields: RunManifestFields | string): string {
	const batchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "run-manifest-"));
	const directory = path.join(batchRoot, "runs", "baseline", scenario.id, "1");
	if (typeof fields === "string") {
		fs.mkdirSync(directory, { recursive: true });
		fs.writeFileSync(path.join(directory, "run.json"), fields);
	} else writeRunManifest(directory, fields);
	return batchRoot;
}

test("every class and every kind a run records is read back, and reaches the report", () => {
	const batchRoot = batchWith(manifest());
	try {
		const [read] = readManifests(batchRoot);
		if (read === undefined) throw new Error("no manifest was read");
		expect(read.commandCounts).toEqual({
			discovery: 5,
			operation: 6,
			"code-investigation": 3,
			"product-source": 4,
			setup: 1,
			ambiguous: 0,
		});
		expect(read.exposure).toEqual({
			"evaluation-inputs": 0,
			"harness-source": 0,
			"skill-package": 1,
			"other-run": 2,
		});
		const record = recordOf(batchRoot, loaded, read);
		expect(record.commandCounts["product-source"]).toBe(4);
		const report = buildReport([record], null);
		expect(report.scenarios[0]?.baseline.productSourceReads).toBe(1);
		expect(report.contamination.map((run) => run.run)).toEqual([record.run]);
	} finally {
		fs.rmSync(batchRoot, { recursive: true, force: true });
	}
});

test("a manifest written before a class or a kind existed reads as nought for it, not as a refusal", () => {
	const older = {
		...manifest(),
		commandCounts: { discovery: 2, operation: 1, "code-investigation": 0, setup: 0, ambiguous: 0 },
		exposure: { "evaluation-inputs": 0, "harness-source": 0, "other-run": 0 },
	};
	const batchRoot = batchWith(JSON.stringify(older));
	try {
		const [read] = readManifests(batchRoot);
		expect(read?.commandCounts["product-source"]).toBe(0);
		expect(read?.commandCounts.discovery).toBe(2);
		expect(read?.exposure?.["skill-package"]).toBe(0);
	} finally {
		fs.rmSync(batchRoot, { recursive: true, force: true });
	}
});

test("a run that cannot say what it did fails there, rather than reporting nought", () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "run-manifest-"));
	try {
		expect(() => writeRunManifest(directory, manifest({ status: "half-done" }))).toThrow();
		expect(fs.existsSync(path.join(directory, "run.json"))).toBe(false);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
