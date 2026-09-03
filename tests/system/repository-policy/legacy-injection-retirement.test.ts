import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { BROWSER_TEST_PATHS } from "../browser/support/agent-browser.ts";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const read = (relativePath: string): string =>
	readFileSync(path.join(repoRoot, relativePath), "utf8");

const currentDocumentPaths = [
	"AGENTS.md",
	"README.md",
	"TESTING.md",
	"DESIGN.md",
	"docs/agents/test-suite.md",
] as const;

const currentDocuments = new Map(
	currentDocumentPaths.map((relativePath) => [relativePath, read(relativePath)]),
);

const designSectionHeading = "### 2. Mid-conversation context — the bound app-server session";
const nextDesignSectionHeading = "### 3. On-demand query — CLI";
const designSectionLink = "DESIGN.md#2-mid-conversation-context--the-bound-app-server-session";

function sectionBetween(source: string, start: string, end: string): string {
	const startIndex = source.indexOf(start);
	const endIndex = source.indexOf(end, startIndex + start.length);
	if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
		throw new Error(`Could not resolve the section between ${start} and ${end}.`);
	}
	return source.slice(startIndex, endIndex);
}

function isTestOwnedSource(relativePath: string): boolean {
	const segments = relativePath.split("/");
	return (
		segments.includes("tests") ||
		segments.includes("__tests__") ||
		/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativePath)
	);
}

describe("legacy injection retirement policy", () => {
	test("keeps retired runtime, routes, commands, and control imports unavailable", async () => {
		for (const retired of [
			"src/cli/commands/inject.ts",
			"src/runtime/engine/injection.ts",
			"src/runtime/engine/app-server-control.ts",
			"tests/system/canvas-state/injection.test.ts",
			"tests/system/canvas-state/support/injection-daemon.ts",
		])
			expect(existsSync(path.join(repoRoot, retired)), retired).toBeFalse();

		const retiredConcepts = [
			["retired injection route", /\/api\/injection(?:\/|\b)/i],
			["retired control module", /\bapp-server-control\b/i],
			[
				"retired injection module",
				/(?:runtime\/engine\/injection|\binjection\.[cm]?[jt]s\b|(?:\.\.?\/)+injection(?:\.[cm]?[jt]s)?\b)/i,
			],
		] as const;
		const forbiddenProductionReferences: string[] = [];
		for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan({
			cwd: path.join(repoRoot, "src"),
		})) {
			if (isTestOwnedSource(file)) continue;
			const source = read(path.join("src", file));
			for (const [concept, pattern] of retiredConcepts) {
				if (pattern.test(source)) forbiddenProductionReferences.push(`src/${file}: ${concept}`);
			}
		}
		expect(forbiddenProductionReferences).toEqual([]);

		const audit = JSON.parse(read("docs/design/cli-command-audit.json")) as {
			readonly entries: readonly { readonly path?: string }[];
		};
		expect(audit.entries.some((entry) => entry.path === "inject")).toBeFalse();
	});

	test("keeps current setup and architecture on the private linked session", () => {
		for (const [relativePath, source] of currentDocuments) {
			for (const retired of [
				"ARCHBOARD_INJECT",
				"/api/injection",
				"app-server-control",
				"control.sock",
				"~/.codex",
			])
				expect(source.includes(retired), `${relativePath}: ${retired}`).toBeFalse();

			const executableBlocks = [...source.matchAll(/```(?:bash|sh|toml)\n([\s\S]*?)```/g)].map(
				(match) => match[1] ?? "",
			);
			expect(
				executableBlocks.some((block) =>
					/(?:inject|control[ -]socket|realtime_conversation\s*=)/i.test(block),
				),
				relativePath,
			).toBeFalse();
		}

		const design = currentDocuments.get("DESIGN.md")!;
		const authoritative = sectionBetween(design, designSectionHeading, nextDesignSectionHeading);
		for (const identifier of [
			"thread/inject_items",
			"input_text",
			"delivered",
			"not_delivered",
			"outcome_unknown",
		])
			expect(authoritative.includes(identifier), identifier).toBeTrue();
		const voiceRelationship = authoritative
			.split(/\n\n+/)
			.find((paragraph) => /realtime voice/i.test(paragraph));
		if (voiceRelationship === undefined) {
			throw new Error("The coordinator-to-workhorse voice relationship is absent.");
		}
		expect(voiceRelationship).toMatch(/coordinator/i);
		expect(voiceRelationship).toMatch(/\bnot\b[^.]*\bworkhorse\b/i);

		const testing = currentDocuments.get("TESTING.md")!;
		for (const identifier of [
			"CODEX_HOME",
			"CODEX_SQLITE_HOME",
			"config.toml",
			"excalidraw-canvas/codex-workbench",
		])
			expect(testing.includes(identifier), identifier).toBeTrue();

		for (const relativePath of ["AGENTS.md", "README.md", "TESTING.md"] as const) {
			expect(currentDocuments.get(relativePath), relativePath).toContain(designSectionLink);
		}

		const later = sectionBetween(design, "**Later**", "## Verified element metadata");
		expect(later).not.toMatch(/owned workbench session/i);
	});

	test("accepts spoken approval only from the matching final user item", () => {
		const design = currentDocuments.get("DESIGN.md")!;
		const authoritative = sectionBetween(design, designSectionHeading, nextDesignSectionHeading);
		const spokenApproval = authoritative
			.split(/\n\n+/)
			.find((paragraph) => /spoken approval/i.test(paragraph) && /\barm\b/i.test(paragraph));
		if (spokenApproval === undefined) throw new Error("The spoken-approval policy is absent.");

		const normalized = spokenApproval.replace(/\s+/g, " ");
		expect(normalized).toMatch(/next matching final user item/i);
		const cannotArm = normalized.match(/(?<sources>[^.]*) cannot arm it\./i);
		if (cannotArm?.groups?.sources === undefined) {
			throw new Error("The spoken-approval policy has no explicit cannot-arm source set.");
		}
		expect(cannotArm.groups.sources.trim()).toMatch(/(?:^|,\s*)Assistant output(?:,|$)/);
		expect(normalized).not.toMatch(/Assistant output[^.]*\b(?:may|can|does) arm\b/i);
	});

	test(`reports ${BROWSER_TEST_PATHS.length} executable browser owners and keeps prose count-free`, () => {
		expect(new Set(BROWSER_TEST_PATHS).size).toBe(BROWSER_TEST_PATHS.length);
		for (const [relativePath, source] of currentDocuments) {
			expect(source, relativePath).not.toMatch(
				/\b(?:all\s+)?\d+\s+(?:canonical\s+|real-browser\s+)?browser owners?\b/i,
			);
		}

		const testGuide = currentDocuments.get("docs/agents/test-suite.md")!;
		expect(testGuide).toContain("BROWSER_TEST_PATHS");
		expect(testGuide).toContain("BROWSER_TEST_PATHS.length");
		expect(testGuide).toContain("bun run test:serial-browser");
	});
});
