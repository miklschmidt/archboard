import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
const authorityHeading = "## UI visual authority";

type GuideState = {
	isFile: boolean;
	isTracked: boolean;
};

function authoritySection(source: string): string | undefined {
	const lines = source.split(/\r?\n/);
	const start = lines.indexOf(authorityHeading);
	if (start < 0) return undefined;
	const body: string[] = [];
	for (let index = start + 1; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (line.startsWith("## ")) break;
		body.push(line);
	}
	return body.join("\n");
}

function uiWorkerInstruction(section: string | undefined): string | undefined {
	if (section === undefined) return undefined;
	const start = section.indexOf("Every UI-design or UI-implementation worker");
	if (start < 0) return undefined;
	const end = section.indexOf("\n\n", start);
	return section.slice(start, end < 0 ? section.length : end);
}

function guidanceFailures(source: string, guide: GuideState): string[] {
	const instruction = uiWorkerInstruction(authoritySection(source));
	const failures: string[] = [];
	if (!instruction?.includes(requiredGuideReference)) {
		failures.push(
			`AGENTS.md's ${authorityHeading} section must require UI workers to read the exact guide path \`${guidePath}\` inside the UI-worker instruction.`,
		);
	}
	if (!guide.isFile) {
		failures.push(
			`The required UI aesthetic guide is missing at the tracked path \`${guidePath}\`; restore that file before changing rendered UI.`,
		);
	}
	if (!guide.isTracked) {
		failures.push(
			`The required UI aesthetic guide must be tracked at the exact path \`${guidePath}\`; add that path to the repository before changing rendered UI.`,
		);
	}
	return failures;
}

function guideIsTracked(): boolean {
	const result = spawnSync("git", ["ls-files", "--cached", "--error-unmatch", "--", guidePath], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	return result.status === 0 && result.stdout.trim() === guidePath;
}

function guideState(): GuideState {
	const absolutePath = path.join(repoRoot, guidePath);
	return {
		isFile: fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile(),
		isTracked: guideIsTracked(),
	};
}

function moveInstructionOutsideAuthority(source: string): string {
	const instruction = uiWorkerInstruction(authoritySection(source));
	const heading = `${authorityHeading}\n`;
	const headingStart = source.indexOf(heading);
	if (!instruction || headingStart < 0) return source;
	const withoutInstruction = source.replace(instruction, "");
	return withoutInstruction.replace(heading, `${instruction}\n\n${heading}`);
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
		const failures = guidanceFailures(source, guideState());
		expect(failures, failures.join("\n")).toEqual([]);
	});

	test("rejects a UI-worker instruction with a different guide path", () => {
		const source = fs
			.readFileSync(agentsPath, "utf8")
			.replace(requiredGuideReference, "`docs/design/other-guide.md`");
		expect(guidanceFailures(source, { isFile: true, isTracked: true })).toEqual([
			`AGENTS.md's ${authorityHeading} section must require UI workers to read the exact guide path \`${guidePath}\` inside the UI-worker instruction.`,
		]);
	});

	test("rejects a missing guide file without changing the instruction fixture", () => {
		const source = fs.readFileSync(agentsPath, "utf8");
		expect(guidanceFailures(source, { isFile: false, isTracked: true })).toEqual([
			`The required UI aesthetic guide is missing at the tracked path \`${guidePath}\`; restore that file before changing rendered UI.`,
		]);
	});

	test("rejects an untracked guide replacement", () => {
		const source = fs.readFileSync(agentsPath, "utf8");
		expect(guidanceFailures(source, { isFile: true, isTracked: false })).toEqual([
			`The required UI aesthetic guide must be tracked at the exact path \`${guidePath}\`; add that path to the repository before changing rendered UI.`,
		]);
	});

	test("rejects the relationship when it is moved outside the authority section", () => {
		const source = moveInstructionOutsideAuthority(fs.readFileSync(agentsPath, "utf8"));
		expect(guidanceFailures(source, { isFile: true, isTracked: true })).toEqual([
			`AGENTS.md's ${authorityHeading} section must require UI workers to read the exact guide path \`${guidePath}\` inside the UI-worker instruction.`,
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
