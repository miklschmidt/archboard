import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const sharedRoot = path.join(repoRoot, "src/shared/codex-realtime-host");
const wireIdentityOwner = path.join(
	repoRoot,
	"src/shared/codex-workbench-identity/lib/identity.ts",
);
const runtimeRoot = path.join(repoRoot, "src/runtime/codex-realtime");

function sourceFiles(root: string): string[] {
	if (!fs.existsSync(root)) {
		return [];
	}
	return fs
		.readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && [".ts", ".tsx", ".mts"].includes(path.extname(entry.name)))
		.map((entry) => path.join(entry.parentPath, entry.name));
}

const IDENTITY_TYPES = ["RealtimeSessionId", "RealtimeCorrelationId", "RealtimeItemId"] as const;
function exportedIdentityTypes(source: string): readonly string[] {
	return IDENTITY_TYPES.filter((name) =>
		// Either spelling declares the brand once: an inline `export type` or a
		// `type` declaration re-exported through the module's grouped export list.
		new RegExp(`(?:^|\\n)(?:export\\s+)?type\\s+${name}\\s*=`, "u").test(source),
	);
}

describe("neutral Codex realtime host contract", () => {
	test("owns browser-media brands once", () => {
		const allSources = sourceFiles(path.join(repoRoot, "src"));
		const brandOwners = allSources.filter(
			(file) =>
				file !== wireIdentityOwner &&
				exportedIdentityTypes(fs.readFileSync(file, "utf8")).length > 0,
		);
		expect(brandOwners).toEqual([path.join(sharedRoot, "lib/contract.ts")]);
		expect(exportedIdentityTypes(fs.readFileSync(brandOwners[0]!, "utf8"))).toEqual(IDENTITY_TYPES);
	});

	test("detects duplicate exported identity owners in every supported source extension", () => {
		for (const [name, source] of [
			["duplicate.tsx", "export type RealtimeSessionId = string;"],
			["duplicate.mts", "export type RealtimeItemId = string;"],
		] as const) {
			expect(exportedIdentityTypes(source), name).not.toEqual([]);
		}
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
