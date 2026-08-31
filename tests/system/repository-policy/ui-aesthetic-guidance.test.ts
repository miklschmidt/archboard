import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	discoverNativeTests,
	inspectTestInventory,
	type InventoryInput,
} from "./support/test-inventory.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ownerPath = "tests/system/repository-policy/ui-aesthetic-guidance.test.ts";
const agentsPath = path.join(repoRoot, "AGENTS.md");
const guidePath = "docs/design/archboard-ui-aesthetics.md";
const requiredGuideReference = `\`${guidePath}\``;

function uiWorkerInstruction(source: string): string | undefined {
	const start = source.indexOf("Every UI-design or UI-implementation worker");
	if (start < 0) return undefined;
	const end = source.indexOf("\n\n", start);
	return source.slice(start, end < 0 ? source.length : end);
}

function guidanceFailures(source: string, guideIsFile: boolean): string[] {
	const instruction = uiWorkerInstruction(source);
	const failures: string[] = [];
	if (!instruction?.includes(requiredGuideReference)) {
		failures.push(
			`AGENTS.md must require UI workers to read the exact guide path \`${guidePath}\` inside the UI-worker instruction.`,
		);
	}
	if (!guideIsFile) {
		failures.push(
			`The required UI aesthetic guide is missing at the tracked path \`${guidePath}\`; restore that file before changing rendered UI.`,
		);
	}
	return failures;
}

function realInventory(): InventoryInput {
	const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
		scripts: Record<string, string>;
	};
	return {
		repoRoot,
		scripts: packageJson.scripts,
		nativeTests: discoverNativeTests(repoRoot),
	};
}

describe("UI aesthetic guidance repository policy", () => {
	test("requires the exact guide path in the UI-worker instruction and the guide file", () => {
		const source = fs.readFileSync(agentsPath, "utf8");
		const guideIsFile =
			fs.existsSync(path.join(repoRoot, guidePath)) &&
			fs.statSync(path.join(repoRoot, guidePath)).isFile();
		const failures = guidanceFailures(source, guideIsFile);
		expect(failures, failures.join("\n")).toEqual([]);
	});

	test("rejects a UI-worker instruction with a different guide path", () => {
		const source = fs
			.readFileSync(agentsPath, "utf8")
			.replace(requiredGuideReference, "`docs/design/other-guide.md`");
		expect(guidanceFailures(source, true)).toEqual([
			`AGENTS.md must require UI workers to read the exact guide path \`${guidePath}\` inside the UI-worker instruction.`,
		]);
	});

	test("rejects a missing guide file without changing the instruction fixture", () => {
		const source = fs.readFileSync(agentsPath, "utf8");
		expect(guidanceFailures(source, false)).toEqual([
			`The required UI aesthetic guide is missing at the tracked path \`${guidePath}\`; restore that file before changing rendered UI.`,
		]);
	});

	test("is reached once through check and the repository lane", () => {
		const inventory = inspectTestInventory(realInventory());
		expect(inventory.errors).toEqual([]);
		expect(inventory.reachableScripts.get("check")).toBe(1);
		expect(inventory.reachableScripts.get("test")).toBe(1);
		expect(inventory.reachableScripts.get("test:repository")).toBe(1);
		expect(
			inventory.nativeLanes.get("test:repository")?.filter((file) => file === ownerPath),
		).toEqual([ownerPath]);
	});
});
