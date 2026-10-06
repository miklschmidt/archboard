import { expect, test } from "bun:test";

import { githubUrlForBinding } from "../presentation.ts";

test.each([
	[
		{ repo: "github.com/ac me/repo#1", path: "src/a b#%/café.ts", branch: "feature/links" },
		"https://github.com/ac%20me/repo%231/tree/feature%2Flinks/src/a%20b%23%25/caf%C3%A9.ts",
	],
	[
		{ repo: "github.com/acme/repo", path: "", commit: "deadbeef", branch: "ignored" },
		"https://github.com/acme/repo/tree/deadbeef",
	],
	[
		{ repo: "github.com/acme/repo", path: ".", branch: "main" },
		"https://github.com/acme/repo/tree/main",
	],
	[{ repo: "github.com/acme/repo", path: "src" }, "https://github.com/acme/repo/tree/HEAD/src"],
] as const)("derives the exact GitHub tree target %#", (binding, expected) => {
	expect(githubUrlForBinding(binding)).toBe(expected);
});

test.each([
	{ repo: "gitlab.com/acme/repo", path: "src" },
	{ repo: "GitHub.com/acme/repo", path: "src" },
	{ repo: "github.com/acme", path: "src" },
	{ repo: "github.com/acme/repo/extra", path: "src" },
	{ repo: "github.com//repo", path: "src" },
	{ repo: "github.com/acme/repo", path: "/absolute" },
	{ repo: "github.com/acme/repo", path: "C:\\absolute" },
	{ repo: "github.com/acme/repo", path: "src\\file" },
	{ repo: "github.com/acme/repo", path: "src//file" },
	{ repo: "github.com/acme/repo", path: "src/./file" },
	{ repo: "github.com/acme/repo", path: "src/../file" },
])("rejects an ineligible remote target %#", (binding) => {
	expect(githubUrlForBinding(binding)).toBeUndefined();
});

test.each([
	[
		{ repo: "github.com/acme/repo", path: "src/a b.ts", commit: "deadbeef" },
		"https://github.com/acme/repo/blob/deadbeef/src/a%20b.ts#L12",
	],
	[
		{ repo: "github.com/acme/repo", path: "src/a.ts", branch: "release/2.1" },
		"https://github.com/acme/repo/blob/release%2F2.1/src/a.ts#L12",
	],
	[
		{ repo: "github.com/acme/repo", path: "src/a.ts" },
		"https://github.com/acme/repo/blob/HEAD/src/a.ts#L12",
	],
	// The repository root is a directory, which has no line to link to.
	[{ repo: "github.com/acme/repo", path: "" }, "https://github.com/acme/repo/tree/HEAD"],
] as const)(
	"links a file at the line the caller found, on the ref the binding names %#",
	(binding, expected) => {
		expect(githubUrlForBinding(binding, 12)).toBe(expected);
	},
);
