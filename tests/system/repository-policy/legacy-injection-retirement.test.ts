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

		const forbiddenProductionReferences: string[] = [];
		for (const area of ["src/server", "src/runtime", "src/ui"] as const) {
			for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan({
				cwd: path.join(repoRoot, area),
			})) {
				const source = read(path.join(area, file));
				if (
					source.includes("injection.js") ||
					source.includes("app-server-control.js") ||
					source.includes('"/api/injection"') ||
					source.includes('"/api/injection/test"')
				)
					forbiddenProductionReferences.push(`${area}/${file}`);
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
			])
				expect(source.includes(retired), `${relativePath}: ${retired}`).toBeFalse();

			const executableBlocks = [...source.matchAll(/```(?:bash|sh|toml)\n([\s\S]*?)```/g)].map(
				(match) => match[1] ?? "",
			);
			expect(
				executableBlocks.some((block) => /(?:inject|control[ -]socket)/i.test(block)),
				relativePath,
			).toBeFalse();
		}

		const testing = currentDocuments.get("TESTING.md")!;
		expect(testing).not.toMatch(/~\/\.codex/i);
		expect(testing).toContain("Do not edit user-global Codex configuration");
		for (const marker of [
			"CODEX_HOME",
			"CODEX_SQLITE_HOME",
			"config.toml",
			"epoch manifests",
			"app-server state",
		])
			expect(testing.includes(marker), marker).toBeTrue();
		expect(testing).toMatch(/separate persistent\s+coordinator/);

		const design = currentDocuments.get("DESIGN.md")!;
		for (const marker of [
			"thread/inject_items",
			"one developer message",
			"one `input_text` part",
			"`delivered`",
			"`not_delivered`",
			"`outcome_unknown`",
		])
			expect(design.includes(marker), marker).toBeTrue();
		expect(design).not.toMatch(/voice session attaches to an \*\*existing\*\* thread|same thread/i);
	});

	test("accepts spoken approval only from the matching final user item", () => {
		const design = currentDocuments.get("DESIGN.md")!;
		expect(design).toMatch(/next\s+matching final user item/);
		expect(design).toContain("Assistant output");
		expect(design).not.toMatch(/assistant transcript|assistant item[^\n]*arm/i);
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
