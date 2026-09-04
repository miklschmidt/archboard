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

	test("uses semantic theme names without raw palettes or theme-specific variants", () => {
		const combined = SOURCES.map((source) => source.text).join("\n");
		expect(combined).toContain("text-foreground");
		expect(combined).toContain("text-muted-foreground");
		expect(combined).toContain("border-border");
		expect(combined).not.toContain("dark:");
		expect(combined).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
		expect(combined).not.toMatch(/\b(?:rgb|rgba|hsl|oklch)\(/u);
		expect(combined).not.toMatch(/(?:slate|gray|zinc|neutral|stone|red|blue|green)-[0-9]/u);
		expect(combined).not.toMatch(/\b(?:bg|text|border|p|m|gap|h|w)-\[/u);
	});
});
