// An identity with several known checkouts resolves to its chosen checkout,
// for every reader of the snapshot (code targets, the code check, behind,
// footprint and locality): ADR 0049, TASK-472.02. With one checkout the
// results are the ones the other tests in this folder assert.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { checkoutFor, declareDirectory, forgetDirectory } from "@/runtime/engine/repo-registry";
import {
	resolveLocalCodeTarget,
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
} from "../index.ts";
import { createResolverFixture, type ResolverFixture } from "./support.ts";

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
		bindings: [{ repo: fixture.repository, path: "src/clone-only.ts" }],
	});
	const checkout = resolveRegisteredCheckout(fixture.repository, snapshot);
	return checkout.ok ? checkout.root : checkout.code;
}

test("a checkout that is added later is not read, and the one that use chooses is", async () => {
	expect(await resolvedRoot()).toBe(fixture.checkout);
	await declareDirectory(other);
	expect(await resolvedRoot()).toBe(fixture.checkout);
	expect(checkoutFor(fixture.repository)).toBe(fixture.checkout);

	await declareDirectory(other, { choose: true });
	expect(await resolvedRoot()).toBe(other);
	expect(checkoutFor(fixture.repository)).toBe(other);
	const target = resolveLocalCodeTarget(
		{ repo: fixture.repository, path: "src/clone-only.ts" },
		await snapshotCheckoutAccess({
			bindings: [{ repo: fixture.repository, path: "src/clone-only.ts" }],
		}),
	);
	expect(target).toMatchObject({ ok: true, root: other });
});

test("an identity whose chosen checkout was forgotten resolves as unregistered, though another is known", async () => {
	await declareDirectory(other);
	await forgetDirectory(fixture.checkout);
	expect(await resolvedRoot()).toBe("CHECKOUT_UNAVAILABLE");
	expect(checkoutFor(fixture.repository)).toBeUndefined();
	const snapshot = await snapshotCheckoutAccess();
	expect(snapshot.inspection(fixture.repository)).toBeUndefined();
	expect(snapshot.entries).toEqual([]);
});
