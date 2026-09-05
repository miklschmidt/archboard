import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const moduleRoot = path.resolve(import.meta.dirname, "..");

/**
 * Every product source file in the module.
 * @returns The file paths.
 */
function productSourcePaths(): readonly string[] {
	return readdirSync(moduleRoot, { recursive: true, withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() &&
				[".ts", ".tsx"].includes(path.extname(entry.name)) &&
				!path.relative(moduleRoot, entry.parentPath).startsWith("tests"),
		)
		.map((entry) => path.join(entry.parentPath, entry.name));
}

const SOURCES = productSourcePaths().map((file) => ({
	file: path.relative(moduleRoot, file),
	text: readFileSync(file, "utf8"),
}));

const FORBIDDEN_RAW_INPUTS = Object.freeze([
	"RealtimeSemanticEvent",
	"TransportServerNotification",
	"RTCDataChannel",
	"thread/realtime/item/transcript/delta",
	"thread/realtime/transcript/delta",
	"thread/realtime/transcript/done",
	"MessageEvent",
	"dataChannel",
	"onmessage",
	"message.data",
	"event.data",
	'addEventListener("message"',
	"addEventListener('message'",
] as const);

const FORBIDDEN_DEPENDENCIES = Object.freeze([
	"codex-app-server-contract",
	"codex-protocol",
	"codex-realtime-host",
	"workbench-transport",
] as const);

describe("voice transcript input boundary", () => {
	test("depends on no raw semantic event, transport notification, or data-channel text path", () => {
		expect(SOURCES.length).toBeGreaterThan(0);
		for (const { file, text } of SOURCES) {
			for (const forbidden of FORBIDDEN_RAW_INPUTS) {
				expect(text, `${file} names ${forbidden}`).not.toContain(forbidden);
			}
			const imports = [...text.matchAll(/from "([^"]+)"/gu)].map((match) => match[1] ?? "");
			for (const dependency of FORBIDDEN_DEPENDENCIES) {
				expect(
					imports.some((modulePath) => modulePath.includes(dependency)),
					`${file} imports ${dependency}`,
				).toBe(false);
			}
		}
	});

	test("reads the adapter's records through the realtime module root alone", () => {
		const contract = SOURCES.find(({ file }) => file === "contract.ts");
		expect(contract?.text).toContain('from "@/ui/codex-realtime"');
		for (const { file, text } of SOURCES) {
			expect(text, file).not.toMatch(/@\/ui\/codex-realtime\/lib\//u);
		}
	});
});
