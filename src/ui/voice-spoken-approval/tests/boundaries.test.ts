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
	test("finds the complete product module", () => {
		expect(sources.map(({ file }) => file).toSorted()).toEqual([
			"contract.ts",
			"index.ts",
			"lib/VoiceSpokenApproval.tsx",
			"lib/projection.ts",
		]);
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
			"BrowserVoice",
			"transcript",
			"GatePresentation",
			"nowMs",
		];
		for (const source of sources)
			for (const value of forbidden)
				expect(source.text, `${source.file} names ${value}`).not.toContain(value);
	});

	test("uses the semantic theme with no second visual direction", () => {
		for (const source of sources) {
			expect(source.text, source.file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
			expect(source.text, source.file).not.toMatch(/\b(?:rgb|rgba|hsl|oklch)\(/u);
			expect(source.text, source.file).not.toMatch(/\bdark:/u);
			expect(source.text, source.file).not.toMatch(/\b(?:gradient|glow|backdrop-blur)/u);
			expect(source.text, source.file).not.toMatch(/\bshadow-(?!flat\b)/u);
		}
	});
});
