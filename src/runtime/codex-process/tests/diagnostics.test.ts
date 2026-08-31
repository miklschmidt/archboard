import { describe, expect, test } from "bun:test";

import { createCodexDiagnosticsBuffer } from "../diagnostics.js";

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

	test("never publishes an ambiguous secret carry between adversarial one-byte splits", () => {
		const secret = "split-secret";
		const diagnostics = createCodexDiagnosticsBuffer(128, [secret]);
		for (let index = 0; index < secret.length; index += 1) {
			diagnostics.append(secret[index]!);
			const intermediate = diagnostics.snapshot();
			if (index < secret.length - 1) expect(intermediate.text).toBe("");
			else expect(intermediate.text).toBe("[REDACTED]");
			expect(intermediate.text).not.toContain(secret.slice(0, index + 1));
			expect(Buffer.byteLength(intermediate.text, "utf8")).toBeLessThanOrEqual(128);
		}
		expect(diagnostics.snapshot().text).toBe("[REDACTED]");
	});

	test("does not reconstruct a secret across the bounded matcher carry", () => {
		const diagnostics = createCodexDiagnosticsBuffer(128, ["abcd"]);
		diagnostics.append("abcde");

		const snapshot = diagnostics.snapshot();
		expect(snapshot.text).not.toContain("abcd");
		expect(snapshot.text).toBe("[REDACTED]");
		diagnostics.finalize();
		expect(diagnostics.snapshot().text).toBe("[REDACTED]e");
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

	test("caps serialized diagnostics at a UTF-8 boundary", () => {
		const diagnostics = createCodexDiagnosticsBuffer(4);
		diagnostics.append("aéé");
		const snapshot = diagnostics.snapshot();

		expect(snapshot.text).toBe("aé");
		expect(snapshot.byteLength).toBe(Buffer.byteLength(snapshot.text, "utf8"));
		expect(snapshot.byteLength).toBeLessThanOrEqual(4);
		expect(Buffer.byteLength(snapshot.text, "utf8")).toBeLessThanOrEqual(4);
		expect(snapshot.truncated).toBe(true);
	});

	test("caps redaction expansion without emitting invalid UTF-8", () => {
		const diagnostics = createCodexDiagnosticsBuffer(5, ["é"]);
		diagnostics.append("é");
		const snapshot = diagnostics.snapshot();

		expect(snapshot.text).toBe("[REDA");
		expect(snapshot.byteLength).toBe(Buffer.byteLength(snapshot.text, "utf8"));
		expect(Buffer.byteLength(snapshot.text, "utf8")).toBeLessThanOrEqual(5);
	});
});
