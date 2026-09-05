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
const referencePaths = [
	"docs/design/operator-canvas-shell.md",
	"docs/design/assets/operator-canvas-shell.png",
] as const;
const authorityHeading = "## UI visual authority";

type ReferenceState = {
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

function guidanceFailures(
	source: string,
	references: ReadonlyMap<(typeof referencePaths)[number], ReferenceState>,
): string[] {
	const instruction = uiWorkerInstruction(authoritySection(source));
	const failures: string[] = [];
	for (const referencePath of referencePaths) {
		const reference = references.get(referencePath);
		if (!reference) {
			failures.push(`The approved UI reference state is missing for \`${referencePath}\`.`);
			continue;
		}
		if (!instruction?.includes(`\`${referencePath}\``)) {
			failures.push(
				`AGENTS.md's ${authorityHeading} section must name the approved UI reference \`${referencePath}\` inside the UI-worker instruction.`,
			);
		}
		if (!reference.isFile) {
			failures.push(`The approved UI reference is missing at \`${referencePath}\`.`);
		}
		if (!reference.isTracked) {
			failures.push(`The approved UI reference must be tracked at \`${referencePath}\`.`);
		}
	}
	return failures;
}

function referenceIsTracked(referencePath: string): boolean {
	const result = spawnSync(
		"git",
		["ls-files", "--cached", "--error-unmatch", "--", referencePath],
		{
			cwd: repoRoot,
			encoding: "utf8",
		},
	);
	return result.status === 0 && result.stdout.trim() === referencePath;
}

function referenceState(): Map<(typeof referencePaths)[number], ReferenceState> {
	return new Map(
		referencePaths.map((referencePath) => {
			const absolutePath = path.join(repoRoot, referencePath);
			return [
				referencePath,
				{
					isFile: fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile(),
					isTracked: referenceIsTracked(referencePath),
				},
			];
		}),
	);
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
	test("requires the approved references in the UI-worker instruction", () => {
		const source = fs.readFileSync(agentsPath, "utf8");
		const failures = guidanceFailures(source, referenceState());
		expect(failures, failures.join("\n")).toEqual([]);
	});

	test("rejects a UI-worker instruction with a different reference path", () => {
		const references = referenceState();
		const referencePath = referencePaths[0];
		const source = fs
			.readFileSync(agentsPath, "utf8")
			.replace(`\`${referencePath}\``, "`docs/design/other-reference.md`");
		expect(guidanceFailures(source, references)).toEqual([
			`AGENTS.md's ${authorityHeading} section must name the approved UI reference \`${referencePath}\` inside the UI-worker instruction.`,
		]);
	});

	test("rejects a missing reference file without changing the instruction fixture", () => {
		const references = referenceState();
		const referencePath = referencePaths[1];
		references.set(referencePath, { isFile: false, isTracked: true });
		const source = fs.readFileSync(agentsPath, "utf8");
		expect(guidanceFailures(source, references)).toEqual([
			`The approved UI reference is missing at \`${referencePath}\`.`,
		]);
	});

	test("rejects an untracked reference replacement", () => {
		const references = referenceState();
		const referencePath = referencePaths[0];
		references.set(referencePath, { isFile: true, isTracked: false });
		const source = fs.readFileSync(agentsPath, "utf8");
		expect(guidanceFailures(source, references)).toEqual([
			`The approved UI reference must be tracked at \`${referencePath}\`.`,
		]);
	});

	test("rejects the relationship when it is moved outside the authority section", () => {
		const source = moveInstructionOutsideAuthority(fs.readFileSync(agentsPath, "utf8"));
		const failures = guidanceFailures(source, referenceState());
		expect(failures).toHaveLength(referencePaths.length);
		expect(failures.every((failure) => failure.includes("inside the UI-worker instruction"))).toBe(
			true,
		);
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
