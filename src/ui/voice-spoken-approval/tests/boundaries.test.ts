import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const moduleRoot = path.resolve(import.meta.dirname, "..");

const sources = readdirSync(moduleRoot, { recursive: true, withFileTypes: true })
	.filter(
		(entry) =>
			entry.isFile() &&
			[".ts", ".tsx"].includes(path.extname(entry.name)) &&
			!path.relative(moduleRoot, entry.parentPath).startsWith("tests"),
	)
	.map((entry) => ({
		file: path.relative(moduleRoot, path.join(entry.parentPath, entry.name)),
		text: readFileSync(path.join(entry.parentPath, entry.name), "utf8"),
	}));

describe("spoken approval UI boundary", () => {
	test("finds the complete product module: logic only, no presentation", () => {
		expect(
			sources.map(({ file }) => file).toSorted((left, right) => left.localeCompare(right)),
		).toEqual(["contract.ts", "index.ts", "lib/copy.ts", "lib/projection.ts", "lib/rows.ts"]);
	});

	test("imports no runtime, server, CLI, privileged, media, or decision owner", () => {
		const forbidden = [
			"/runtime/",
			"/server/",
			"/cli/",
			"/privileged/",
			"getUserMedia",
			"RTCPeerConnection",
			"approvalRespond",
			"dynamicApprovalRespond",
			"onClick",
			"awaiting_user",
			"BrowserVoice ",
			"transcript",
			"GatePresentation",
			"nowMs",
		];
		for (const source of sources) {
			for (const value of forbidden) {
				expect(source.text, `${source.file} names ${value}`).not.toContain(value);
			}
		}
	});

	test("owns no decision: the ordinary card is the only owner of approval decisions", () => {
		for (const source of sources) {
			expect(source.text, source.file).not.toMatch(/\b(?:accept|decline)\s*\(/u);
			expect(source.text, source.file).not.toContain("submitApprovalDecision");
		}
	});
});
