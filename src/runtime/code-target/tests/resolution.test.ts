import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join, win32 } from "node:path";

import { isPathWithin, resolveLocalCodeTarget, resolveRegisteredCheckout } from "../index.ts";
import { createResolverFixture, type ResolverFixture } from "./support.ts";

let fixture: ResolverFixture;
let previousRegistry: string | undefined;

beforeEach(() => {
	fixture = createResolverFixture();
	previousRegistry = process.env.ARCHBOARD_REPOS;
	process.env.ARCHBOARD_REPOS = fixture.registry;
});

afterEach(() => {
	if (previousRegistry === undefined) delete process.env.ARCHBOARD_REPOS;
	else process.env.ARCHBOARD_REPOS = previousRegistry;
	fixture.dispose();
});

describe("registered checkout", () => {
	test("re-reads and verifies the canonical checkout identity", () => {
		expect(resolveRegisteredCheckout(fixture.repository)).toEqual({
			ok: true,
			repository: fixture.repository,
			root: fixture.checkout,
		});
	});

	test("refuses a changed origin identity", () => {
		Bun.spawnSync(["git", "remote", "set-url", "origin", "https://github.com/other/repo.git"], {
			cwd: fixture.checkout,
		});
		expect(resolveRegisteredCheckout(fixture.repository)).toMatchObject({
			ok: false,
			code: "CHECKOUT_IDENTITY_CHANGED",
		});
	});
});

describe("local code target containment", () => {
	test("rejects a Windows cross-drive relative result", () => {
		expect(isPathWithin("C:\\repo", "D:\\escape", win32)).toBeFalse();
		expect(isPathWithin("C:\\repo", "C:\\repo\\src", win32)).toBeTrue();
	});

	test.each([
		["", "directory", fixturePath("")],
		["src/index.ts", "file", fixturePath("src/index.ts")],
		["src/nested", "directory", fixturePath("src/nested")],
		["src/inside-file.ts", "file", fixturePath("src/index.ts")],
		["src/inside-directory", "directory", fixturePath("src/nested")],
	] as const)("accepts %s as an in-root %s", (relative, kind, expected) => {
		expect(resolveLocalCodeTarget({ repo: fixture.repository, path: relative })).toEqual({
			ok: true,
			repository: fixture.repository,
			root: fixture.checkout,
			target: expected(),
			path: relative,
			kind,
		});
	});

	test.each(["src/outside-file.ts", "src/outside-directory"])(
		"rejects the realpath escape %s",
		(relative) => {
			expect(resolveLocalCodeTarget({ repo: fixture.repository, path: relative })).toMatchObject({
				ok: false,
				code: "TARGET_OUTSIDE_CHECKOUT",
			});
		},
	);

	test.each(["../outside/secret.ts", "/tmp/absolute", "C:\\absolute\\file.ts"])(
		"rejects lexical or absolute escape %s",
		(relative) => {
			expect(resolveLocalCodeTarget({ repo: fixture.repository, path: relative })).toMatchObject({
				ok: false,
				code: "TARGET_OUTSIDE_CHECKOUT",
			});
		},
	);

	test("rejects a missing target", () => {
		expect(
			resolveLocalCodeTarget({ repo: fixture.repository, path: "src/missing.ts" }),
		).toMatchObject({
			ok: false,
			code: "TARGET_UNAVAILABLE",
		});
	});
});

function fixturePath(relative: string): () => string {
	return () => join(fixture.checkout, relative);
}
