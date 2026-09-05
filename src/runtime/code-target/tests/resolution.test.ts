import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import { join, win32 } from "node:path";

import {
	isPathWithin,
	resolveLocalCodeTarget,
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
} from "../index.ts";
import { createResolverFixture, type ResolverFixture } from "./support.ts";

let fixture: ResolverFixture;
let previousRegistry: string | undefined;

beforeEach(() => {
	fixture = createResolverFixture();
	previousRegistry = process.env["ARCHBOARD_REPOS"];
	process.env["ARCHBOARD_REPOS"] = fixture.registry;
});

afterEach(() => {
	if (previousRegistry === undefined) {
		delete process.env["ARCHBOARD_REPOS"];
	} else {
		process.env["ARCHBOARD_REPOS"] = previousRegistry;
	}
	fixture.dispose();
});

describe("registered checkout", () => {
	test("re-reads and verifies the canonical checkout identity", async () => {
		expect(resolveRegisteredCheckout(fixture.repository, await snapshotCheckoutAccess())).toEqual({
			ok: true,
			repository: fixture.repository,
			root: fixture.checkout,
		});
	});

	test("refuses a changed origin identity", async () => {
		const before = await snapshotCheckoutAccess();
		expect(resolveRegisteredCheckout(fixture.repository, before).ok).toBeTrue();
		Bun.spawnSync(["git", "remote", "set-url", "origin", "https://github.com/other/repo.git"], {
			cwd: fixture.checkout,
		});
		const after = await snapshotCheckoutAccess();
		expect(resolveRegisteredCheckout(fixture.repository, after)).toMatchObject({
			ok: false,
			code: "CHECKOUT_IDENTITY_CHANGED",
		});
		expect(resolveRegisteredCheckout(fixture.repository, before).ok).toBeTrue();
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
	] as const)("accepts %s as an in-root %s", async (relative, kind, expected) => {
		const binding = { repo: fixture.repository, path: relative };
		expect(
			resolveLocalCodeTarget(binding, await snapshotCheckoutAccess({ bindings: [binding] })),
		).toEqual({
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
		async (relative) => {
			const binding = { repo: fixture.repository, path: relative };
			expect(
				resolveLocalCodeTarget(binding, await snapshotCheckoutAccess({ bindings: [binding] })),
			).toMatchObject({
				ok: false,
				code: "TARGET_OUTSIDE_CHECKOUT",
			});
		},
	);

	test.each(["../outside/secret.ts", "/tmp/absolute", "C:\\absolute\\file.ts"])(
		"rejects lexical or absolute escape %s",
		async (relative) => {
			const binding = { repo: fixture.repository, path: relative };
			expect(
				resolveLocalCodeTarget(binding, await snapshotCheckoutAccess({ bindings: [binding] })),
			).toMatchObject({
				ok: false,
				code: "TARGET_OUTSIDE_CHECKOUT",
			});
		},
	);

	test("rejects a missing target", async () => {
		const binding = { repo: fixture.repository, path: "src/missing.ts" };
		expect(
			resolveLocalCodeTarget(binding, await snapshotCheckoutAccess({ bindings: [binding] })),
		).toMatchObject({
			ok: false,
			code: "TARGET_UNAVAILABLE",
		});
	});

	test("one snapshot is deeply immutable and resolves only its captured filesystem evidence", async () => {
		const binding = { repo: fixture.repository, path: "src/index.ts" };
		const snapshot = await snapshotCheckoutAccess({ bindings: [binding] });
		const first = resolveLocalCodeTarget(binding, snapshot);
		const entry = snapshot.entries[0]!;
		const inspection = snapshot.inspection(fixture.repository)!;
		expect(Object.isFrozen(snapshot.entries)).toBeTrue();
		expect(Object.isFrozen(entry)).toBeTrue();
		expect(Object.isFrozen(inspection)).toBeTrue();
		expect(() => ((entry as { root: string }).root = "/mutated")).toThrow();
		expect(() => ((inspection as { root: string }).root = "/mutated")).toThrow();
		fs.rmSync(join(fixture.checkout, "src/index.ts"));
		expect(resolveLocalCodeTarget(binding, snapshot)).toEqual(first);
		const fresh = await snapshotCheckoutAccess({ bindings: [binding] });
		expect(resolveLocalCodeTarget(binding, fresh)).toMatchObject({
			ok: false,
			code: "TARGET_UNAVAILABLE",
		});
	});

	test("one snapshot does not follow a target symlink replaced after capture", async () => {
		const binding = { repo: fixture.repository, path: "src/inside-file.ts" };
		const snapshot = await snapshotCheckoutAccess({ bindings: [binding] });
		const first = resolveLocalCodeTarget(binding, snapshot);
		fs.unlinkSync(join(fixture.checkout, binding.path));
		fs.symlinkSync(join(fixture.outside, "secret.ts"), join(fixture.checkout, binding.path));
		expect(resolveLocalCodeTarget(binding, snapshot)).toEqual(first);
		const fresh = await snapshotCheckoutAccess({ bindings: [binding] });
		expect(resolveLocalCodeTarget(binding, fresh)).toMatchObject({
			ok: false,
			code: "TARGET_OUTSIDE_CHECKOUT",
		});
	});

	test("one snapshot does not inspect a checkout root replaced after capture", async () => {
		const binding = { repo: fixture.repository, path: "src/index.ts" };
		const snapshot = await snapshotCheckoutAccess({ bindings: [binding] });
		const first = resolveLocalCodeTarget(binding, snapshot);
		fs.renameSync(fixture.checkout, join(fixture.root, "retired-checkout"));
		fs.mkdirSync(fixture.checkout);
		expect(resolveLocalCodeTarget(binding, snapshot)).toEqual(first);
		const fresh = await snapshotCheckoutAccess({ bindings: [binding] });
		expect(resolveLocalCodeTarget(binding, fresh)).toMatchObject({
			ok: false,
			code: "CHECKOUT_UNAVAILABLE",
		});
	});
});

function fixturePath(relative: string): () => string {
	return () => join(fixture.checkout, relative);
}
