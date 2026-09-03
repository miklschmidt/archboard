import { expect, test } from "bun:test";

import {
	BROWSER_ADAPTER_PATH,
	BROWSER_TEST_PATHS,
	browserOwnerCommandArguments,
	validateBrowserSelection,
} from "../browser/support/agent-browser.ts";

const owner = BROWSER_TEST_PATHS[12];
const testName = "save-elsewhere recovery releases the old holder and queues a trusted drag";

test("an exact test name selects one focused owner and one Bun test", () => {
	expect(
		validateBrowserSelection([
			"bun",
			BROWSER_ADAPTER_PATH,
			"--focus",
			owner,
			"--test-name",
			testName,
		]),
	).toEqual({ mode: "focus", files: [owner], testName });
	expect(browserOwnerCommandArguments(owner, testName)).toEqual([
		"test",
		"--no-orphans",
		"--isolate",
		"--max-concurrency=1",
		"--test-name-pattern",
		`^${testName}$`,
		owner,
	]);
});

test("the exact-name selector rejects package, empty, and multiple-owner forms", () => {
	for (const command of [
		["bun", BROWSER_ADAPTER_PATH, owner, "--test-name", testName],
		["bun", BROWSER_ADAPTER_PATH, "--focus", owner, "--test-name"],
		[
			"bun",
			BROWSER_ADAPTER_PATH,
			"--focus",
			BROWSER_TEST_PATHS[11],
			owner,
			"--test-name",
			testName,
		],
	]) {
		expect(() => validateBrowserSelection(command)).toThrow();
	}
});

test("the Bun filter escapes regular-expression punctuation", () => {
	expect(browserOwnerCommandArguments(owner, "proof (exact)?")).toContain("^proof \\(exact\\)\\?$");
});
