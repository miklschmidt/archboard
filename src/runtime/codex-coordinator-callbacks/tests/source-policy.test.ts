import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const moduleRoot = path.resolve(import.meta.dirname, "..");

function sources(): { readonly file: string; readonly text: string }[] {
	const results: { readonly file: string; readonly text: string }[] = [];
	for (const entry of fs.readdirSync(path.join(moduleRoot, "lib"), { withFileTypes: true })) {
		if (entry.isFile() && entry.name.endsWith(".ts")) {
			results.push({
				file: entry.name,
				text: fs.readFileSync(path.join(moduleRoot, "lib", entry.name), "utf8"),
			});
		}
	}
	return results;
}

describe("coordinator callback source policy", () => {
	test("has no wait dependency, legacy user-role adapter, or unsafe cast", () => {
		const text = sources()
			.map((source) => source.text)
			.join("\n");
		expect(text).not.toContain("wait_threads");
		expect(text).not.toContain("waitThreads");
		expect(text).not.toContain("RealtimeHost");
		expect(text).not.toMatch(/\sas\s+(?:any|unknown|const)\b/u);
		expect(text).not.toContain('role: "user"');
	});

	test("keeps one call site per route and every source file below 500 lines", () => {
		const text = sources()
			.map((source) => source.text)
			.join("\n");
		expect(text.match(/\.threadInjectItems\(/gu)).toHaveLength(1);
		expect(text.match(/\.realtimeAppendText\(/gu)).toHaveLength(1);
		for (const source of sources()) {
			expect(source.text.split("\n").length, source.file).toBeLessThanOrEqual(500);
		}
	});
});
