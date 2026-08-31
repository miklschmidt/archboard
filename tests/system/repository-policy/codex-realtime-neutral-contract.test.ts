import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const sharedRoot = path.join(repoRoot, "src/shared/codex-realtime-host");
const uiIndex = path.join(repoRoot, "src/ui/codex-realtime/index.ts");
const runtimeRoot = path.join(repoRoot, "src/runtime/codex-realtime");

function sourceFiles(root: string): string[] {
	if (!fs.existsSync(root)) return [];
	return fs
		.readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
		.map((entry) => path.join(entry.parentPath, entry.name));
}

describe("neutral Codex realtime host contract", () => {
	test("owns browser-media brands once and re-exports the exact UI names", () => {
		const allSources = sourceFiles(path.join(repoRoot, "src"));
		const brandOwners = allSources.filter((file) =>
			fs.readFileSync(file, "utf8").includes("BrowserRealtimeIdentitySchemas"),
		);
		expect(brandOwners).toEqual([path.join(sharedRoot, "lib/contract.ts")]);
		const ui = fs.readFileSync(uiIndex, "utf8");
		expect(ui).toContain('from "../../shared/codex-realtime-host/index.js";');
		expect(ui).not.toMatch(
			/type\s+(?:RealtimeSessionId|RealtimeCorrelationId|RealtimeItemId)\s*=/u,
		);
	});

	test("keeps runtime on the neutral root and rejects every runtime-to-UI import", () => {
		for (const file of sourceFiles(runtimeRoot)) {
			const source = fs.readFileSync(file, "utf8");
			expect(source, file).not.toMatch(/(?:from|import\()\s*["'][^"']*\/ui\//u);
			if (source.includes("RealtimeHost")) {
				expect(source, file).toContain("shared/codex-realtime-host/index.js");
			}
		}
	});
});
