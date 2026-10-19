// An identity with several known checkouts resolves to its chosen checkout,
// for every reader of the snapshot (code targets, the code check, behind,
// footprint and locality): ADR 0049, TASK-472.02. With one checkout the
// results are the ones the other tests in this folder assert.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chosenCheckouts, declareDirectory, forgetDirectory } from "@archboard/workspace/checkouts";
import {
	resolveLocalCodeTarget,
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
} from "#runtime/operations/checkout-snapshot.ts";
import {
	createResolverFixture,
	type ResolverFixture,
} from "#tests/runtime/support/resolver-fixture.ts";

/**
 * The root of the chosen checkout of an identity.
 * @param repo The repository identity.
 * @returns Its root, or undefined when it has none.
 */
function chosenRoot(repo: string): string | undefined {
	return chosenCheckouts().find((each) => each.repo === repo)?.root;
}

let fixture: ResolverFixture;
let previousRegistry: string | undefined;
let other = "";

beforeEach(() => {
	fixture = createResolverFixture();
	previousRegistry = process.env["ARCHBOARD_REPOS"];
	process.env["ARCHBOARD_REPOS"] = fixture.registry;
	// A second clone of the same repository, with a file the first one lacks.
	const clone = join(fixture.root, "clone");
	mkdirSync(join(clone, "src"), { recursive: true });
	writeFileSync(join(clone, "src", "clone-only.ts"), "export {};\n");
	for (const args of [
		["init", "-q"],
		["remote", "add", "origin", `https://${fixture.repository}.git`],
	]) {
		Bun.spawnSync(["git", ...args], { cwd: clone });
	}
	other = realpathSync.native(clone);
});

afterEach(() => {
	if (previousRegistry === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = previousRegistry;
	fixture.dispose();
});

/**
 * Where a binding into the clone-only file resolves.
 * @returns The checkout root it resolved in, or the failure code.
 */
async function resolvedRoot(): Promise<string> {
	const snapshot = await snapshotCheckoutAccess({
		vault: null,
		bindings: [{ repo: fixture.repository, path: "src/clone-only.ts" }],
	});
	const checkout = resolveRegisteredCheckout(fixture.repository, snapshot);
	return checkout.ok ? checkout.root : checkout.code;
}

test("a checkout that is added later is not read, and the one that use chooses is", async () => {
	expect(await resolvedRoot()).toBe(fixture.checkout);
	await declareDirectory(other);
	expect(await resolvedRoot()).toBe(fixture.checkout);
	expect(chosenRoot(fixture.repository)).toBe(fixture.checkout);

	await declareDirectory(other, { choose: true });
	expect(await resolvedRoot()).toBe(other);
	expect(chosenRoot(fixture.repository)).toBe(other);
	const target = resolveLocalCodeTarget(
		{ repo: fixture.repository, path: "src/clone-only.ts" },
		await snapshotCheckoutAccess({
			vault: null,
			bindings: [{ repo: fixture.repository, path: "src/clone-only.ts" }],
		}),
	);
	expect(target).toMatchObject({ ok: true, root: other });
});

test("an identity whose chosen checkout was forgotten resolves as unregistered, though another is known", async () => {
	await declareDirectory(other);
	await forgetDirectory(fixture.checkout);
	expect(await resolvedRoot()).toBe("CHECKOUT_UNAVAILABLE");
	expect(chosenRoot(fixture.repository)).toBeUndefined();
	const snapshot = await snapshotCheckoutAccess({ vault: null });
	expect(snapshot.inspection(fixture.repository)).toBeUndefined();
	expect(snapshot.entries).toEqual([]);
});
