import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CODEX_APP_SERVER_CAPACITY } from "../../../src/shared/codex-app-server-capacity/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceRoot = path.join(repoRoot, "src");
const allowedImportRoots = [
	"src/runtime/codex-transport/",
	"src/runtime/codex-process/",
	"src/runtime/codex-session/",
	"src/runtime/codex-approvals/",
	"src/runtime/codex-dynamic-tools/",
	"src/runtime/codex-coordinator-tools/",
];
function numericCapacityValues(value: unknown): number[] {
	if (typeof value === "number" && value > 1) return [value];
	if (value === null || typeof value !== "object") return [];
	return Object.values(value).flatMap(numericCapacityValues);
}

function numericSpellings(value: number): string[] {
	const decimal = String(value);
	return [decimal, decimal.replace(/\B(?=(\d{3})+(?!\d))/g, "_")];
}

const capacityLiterals = [
	...new Set(numericCapacityValues(CODEX_APP_SERVER_CAPACITY).flatMap(numericSpellings)),
];

function productionFiles(root: string): string[] {
	const files: string[] = [];
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		const target = path.join(root, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== "tests") files.push(...productionFiles(target));
		} else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) files.push(target);
	}
	return files;
}

describe("Codex app-server capacity repository policy", () => {
	test("has one non-duration authority and no transport-local limit table", () => {
		const authorityPath = path.join(sourceRoot, "shared/codex-app-server-capacity/index.ts");
		const authority = fs.readFileSync(authorityPath, "utf8");
		expect(authority.match(/export const CODEX_APP_SERVER_CAPACITY/g) ?? []).toHaveLength(1);
		expect(authority).not.toMatch(/CODEX_\w+_MS/);
		expect(
			fs.existsSync(path.join(sourceRoot, "runtime/codex-transport/lib/limits.ts")),
		).toBeFalse();
		const localDeclarations =
			/\b(?:const|let|var)\s+(?:CODEX_TRANSPORT_MAX_|(?:MAX_)?(?:FRAME|QUEUE|STDERR|TOMBSTONE|LATE_RESPONSE))/;
		for (const file of productionFiles(path.join(sourceRoot, "runtime/codex-transport"))) {
			const source = fs.readFileSync(file, "utf8");
			expect(source).not.toMatch(localDeclarations);
		}
	});

	test("allows the shared authority only to designated production import roots", () => {
		const imports: string[] = [];
		for (const file of productionFiles(sourceRoot)) {
			const relative = path.relative(repoRoot, file).replaceAll(path.sep, "/");
			if (relative === "src/shared/codex-app-server-capacity/index.ts") continue;
			const source = fs.readFileSync(file, "utf8");
			if (source.includes("CODEX_APP_SERVER_CAPACITY")) imports.push(relative);
		}
		expect(
			imports.every((file) => allowedImportRoots.some((root) => file.startsWith(root))),
		).toBeTrue();
		expect(imports.every((file) => file.startsWith("src/runtime/codex-transport/"))).toBeTrue();
	});

	test("keeps capacity literals out of transport production code", () => {
		for (const file of productionFiles(path.join(sourceRoot, "runtime/codex-transport"))) {
			const source = fs.readFileSync(file, "utf8");
			for (const literal of capacityLiterals)
				expect(source).not.toMatch(new RegExp(`(?<![\\w])${literal}(?![\\w])`));
		}
	});

	test("keeps the capacity relationships machine-observable", () => {
		expect(CODEX_APP_SERVER_CAPACITY.frameBytes).toBe(CODEX_APP_SERVER_CAPACITY.partialFrameBytes);
		expect(Number(CODEX_APP_SERVER_CAPACITY.outbound.responseReservedBytes)).toBe(
			Number(CODEX_APP_SERVER_CAPACITY.outbound.responseReservedFrames) *
				Number(CODEX_APP_SERVER_CAPACITY.outbound.maxReverseResponseBytes),
		);
		expect(CODEX_APP_SERVER_CAPACITY.outbound.responseReservedFrames).toBeGreaterThanOrEqual(
			CODEX_APP_SERVER_CAPACITY.outbound.pendingReverseRequests,
		);
		expect(CODEX_APP_SERVER_CAPACITY.retention.issues).toBeGreaterThanOrEqual(
			CODEX_APP_SERVER_CAPACITY.retention.lateResponses,
		);
	});
});
