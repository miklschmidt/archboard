import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const moduleRoot = path.resolve(import.meta.dirname, "..");

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

function namedTypeImports(source: string, modulePath: string): readonly string[] {
	const escapedPath = modulePath.replaceAll(".", "\\.").replaceAll("/", "\\/");
	const match = new RegExp(`import type \\{([^}]+)\\} from "${escapedPath}";`, "u").exec(source);
	if (match?.[1] === undefined) return [];
	return match[1]
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
}

describe("voice transcript input boundary", () => {
	test("finds every product source owned by the module", () => {
		expect(SOURCES.map((source) => source.file).toSorted()).toEqual([
			"contract.ts",
			"index.tsx",
			"lib/VoiceTranscript.tsx",
			"lib/projection.ts",
		]);
	});

	test("accepts only canonical transcript records and the projected voice session", () => {
		const contract = SOURCES.find((source) => source.file === "contract.ts")?.text ?? "";
		const combined = SOURCES.map((source) => source.text).join("\n");

		expect(namedTypeImports(contract, "../codex-realtime/index.js")).toEqual([
			"RealtimeTranscriptRecord",
		]);
		expect(namedTypeImports(contract, "../voice-session/index.js")).toEqual(["VoiceSessionView"]);
		expect(contract).toContain("readonly records: readonly RealtimeTranscriptRecord[];");
		expect(contract).toContain("readonly session: VoiceSessionView;");
		expect(combined.match(/from "\.\.\/codex-realtime\/index\.js"/gu)).toHaveLength(1);
		expect(combined.match(/from "\.\.\/voice-session\/index\.js"/gu)).toHaveLength(1);
	});

	test("names no raw semantic event, transport notification, or data-channel text path", () => {
		for (const { file, text } of SOURCES) {
			for (const forbidden of FORBIDDEN_RAW_INPUTS) {
				expect(text, `${file} names ${forbidden}`).not.toContain(forbidden);
			}
		}
	});
});
