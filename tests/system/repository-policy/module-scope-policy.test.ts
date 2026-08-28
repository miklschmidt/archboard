import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	analyzeModuleScope,
	moduleGraph,
	parseModuleSources,
	type ModuleScopeResult,
} from "./support/module-scope-analysis.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureRoot = path.join(repoRoot, "tests/system/repository-policy/fixtures/module-scope");
const fixtureNames = [
	"answers-every-message-twice",
	"binds-the-port-again",
	"blanks-a-kept-board",
	"reload-safe",
	"rewinds-a-mutable-literal",
	"starts-a-second-timer",
] as const;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-module-scope-"));
const tempFiles = new Map<string, string>();
let fixtureResults = new Map<string, ModuleScopeResult>();

beforeAll(async () => {
	for (const name of fixtureNames) {
		const source = path.join(fixtureRoot, `${name}.fixture.ts.txt`);
		const target = path.join(tempRoot, `${name}.ts`);
		fs.copyFileSync(source, target);
		tempFiles.set(name, target);
	}
	const files = [...tempFiles.values()];
	const parsed = await parseModuleSources(repoRoot, files);
	fixtureResults = new Map(
		fixtureNames.map((name) => {
			const file = tempFiles.get(name);
			if (!file) throw new Error(`missing temporary fixture ${name}`);
			return [name, analyzeModuleScope(repoRoot, [file], parsed)];
		}),
	);
});

afterAll(() => {
	fs.rmSync(tempRoot, { recursive: true, force: true });
});

function rules(name: string): string[] {
	return fixtureResults.get(name)?.findings.map((finding) => finding.rule) ?? [];
}

describe("module-scope policy negative fixtures", () => {
	test("detects new state at module scope", () => {
		expect(rules("reload-safe")).not.toContain("new-at-module-scope");
		const safe = fixtureResults.get("reload-safe");
		expect(safe?.waived.map((finding) => finding.rule)).toEqual(["new-at-module-scope"]);
	});

	test("detects a mutable module-scope literal", () => {
		expect(rules("rewinds-a-mutable-literal")).toContain("mutable-literal-at-module-scope");
	});

	test("detects a timer started at module scope", () => {
		expect(rules("starts-a-second-timer")).toContain("timer-at-module-scope");
	});

	test("detects a listener added without replacement", () => {
		expect(rules("answers-every-message-twice")).toContain("listener-at-module-scope");
	});

	test("detects a port bound at module scope", () => {
		expect(rules("binds-the-port-again")).toContain("bind-at-module-scope");
	});

	test("detects an unguarded long-lived mutation", () => {
		expect(rules("blanks-a-kept-board")).toContain("mutation-at-module-scope");
	});

	test("accepts guarded state and reports the hot-safe waiver", () => {
		const safe = fixtureResults.get("reload-safe");
		expect(safe?.findings).toEqual([]);
		expect(safe?.waived).toHaveLength(1);
		expect(safe?.waived[0]?.reason).toBe("a fixture, and nothing holds it past the module");
	});
});

test("the real reload graph has no unwaived module-scope state", async () => {
	const entries = [
		path.join(repoRoot, "src/dev-canvas.ts"),
		path.join(repoRoot, "src/server.ts"),
		path.join(repoRoot, "src/server/canvas/lib/application.ts"),
	];
	const parsed = await parseModuleSources(repoRoot, []);
	const files = moduleGraph(entries, parsed);
	const result = analyzeModuleScope(repoRoot, files, parsed);
	expect(result.findings).toEqual([]);
});
