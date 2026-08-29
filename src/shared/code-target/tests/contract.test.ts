import { describe, expect, test } from "bun:test";

import {
	CodeTargetOpenReplySchema,
	OpenerSelectionSchema,
	buildInternalCodeTargetUrl,
	parseInternalCodeTargetUrl,
} from "../index.ts";

describe("internal code-target URLs", () => {
	test("round-trips board and element identity through the one reserved shape", () => {
		const url = buildInternalCodeTargetUrl({ board: "system/payments", element: "a b" });
		expect(url).toBe("/api/code-targets/open?board=system%2Fpayments&element=a+b");
		expect(parseInternalCodeTargetUrl(url)).toEqual({
			board: "system/payments",
			element: "a b",
		});
	});

	test.each([
		"https://example.test/api/code-targets/open?board=b&element=e",
		"api/code-targets/open?board=b&element=e",
		"/api/code-targets/open?board=b&element=e#fragment",
		"/api/code-targets/open?board=b&element=e&path=/tmp/file",
		"/api/code-targets/open?board=b&board=c&element=e",
		"/api/code-targets/open?board=&element=e",
		"/api/code-targets/open?board=b",
		"/api/other?board=b&element=e",
	])("rejects every non-exact spelling: %s", (candidate) => {
		expect(parseInternalCodeTargetUrl(candidate)).toBeNull();
	});
});

describe("opener selection", () => {
	const supportedSelections: unknown[] = [
		{ version: 1, kind: "platform" },
		{ version: 1, kind: "preset", preset: "vscode" },
		{ version: 1, kind: "custom", executable: "/opt/editor", argv: ["--reuse", "{path}"] },
	];
	test.each(supportedSelections)("accepts a strict supported selection", (selection) => {
		const parsed = OpenerSelectionSchema.safeParse(selection);
		expect(parsed.success).toBeTrue();
		if (parsed.success) expect(JSON.stringify(parsed.data)).toBe(JSON.stringify(selection));
	});

	test.each([
		{ version: 1, kind: "custom", executable: "editor", argv: [] },
		{ version: 1, kind: "custom", executable: "editor", argv: ["{path}", "{path}"] },
		{ version: 1, kind: "custom", executable: "editor\0bad", argv: ["{path}"] },
		{ version: 1, kind: "platform", extra: true },
	])("rejects an unsafe or non-strict selection", (selection) => {
		expect(OpenerSelectionSchema.safeParse(selection).success).toBeFalse();
	});
});

describe("wire replies", () => {
	test("parses success and non-2xx failure replies through one discriminated contract", () => {
		expect(
			CodeTargetOpenReplySchema.parse({
				success: true,
				code: "CODE_TARGET_OPENED",
				repository: "github.com/acme/payments",
				path: "src/index.ts",
				kind: "file",
			}),
		).toMatchObject({ success: true, kind: "file" });
		expect(
			CodeTargetOpenReplySchema.parse({
				success: false,
				code: "OPENER_UNAVAILABLE",
				error: "The configured executable was not found.",
				actions: [{ kind: "settings", label: "Opener settings" }],
			}),
		).toMatchObject({ success: false, code: "OPENER_UNAVAILABLE" });
	});

	test("rejects an unvalidated GitHub action", () => {
		expect(
			CodeTargetOpenReplySchema.safeParse({
				success: false,
				code: "TARGET_UNAVAILABLE",
				error: "No local target.",
				actions: [{ kind: "github", label: "Open GitHub", href: "https://evil.test/acme" }],
			}).success,
		).toBeFalse();
	});
});
