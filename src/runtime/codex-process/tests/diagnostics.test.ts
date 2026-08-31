import { describe, expect, test } from "bun:test";

import { createCodexDiagnosticsBuffer } from "../index.js";

describe("Codex process diagnostics", () => {
	test("redacts a secret split across stderr chunks before retaining it", () => {
		const diagnostics = createCodexDiagnosticsBuffer(128, ["split-secret"]);
		const first = diagnostics.append("token=split-");
		const second = diagnostics.append("secret");
		const snapshot = diagnostics.snapshot();

		expect(first).not.toContain("split-secret");
		expect(second).not.toContain("split-secret");
		expect(snapshot.redacted).toBe(true);
		expect(snapshot.text).not.toContain("split-secret");
		expect(snapshot.text).toContain("[REDACTED]");
	});

	test("does not reconstruct a secret across the bounded matcher carry", () => {
		const diagnostics = createCodexDiagnosticsBuffer(128, ["abcd"]);
		diagnostics.append("abcde");

		const snapshot = diagnostics.snapshot();
		expect(snapshot.text).not.toContain("abcd");
		expect(snapshot.text).toBe("[REDACTED]e");
	});

	test("reports truncation after redaction expands a retained diagnostic", () => {
		const diagnostics = createCodexDiagnosticsBuffer(8, ["abcd"]);
		diagnostics.append("abcd");

		expect(diagnostics.snapshot().truncated).toBe(true);
	});

	test("bounds retained diagnostics while counting raw input bytes", () => {
		const diagnostics = createCodexDiagnosticsBuffer(16);
		diagnostics.append("x".repeat(100));
		const snapshot = diagnostics.snapshot();

		expect(snapshot.byteLength).toBe(16);
		expect(snapshot.totalBytes).toBe(100);
		expect(snapshot.truncated).toBe(true);
		expect(snapshot.droppedBytes).toBe(84);
	});

	test("counts invalid UTF-8 input as received bytes", () => {
		const diagnostics = createCodexDiagnosticsBuffer(16);
		diagnostics.append(new Uint8Array([0xff, 0xfe]));

		expect(diagnostics.snapshot().totalBytes).toBe(2);
	});
});
