// Which checkout the coordinator's work goes to (ADR 0050). What is guarded: a workhorse tool
// names a checkout by the directory that holds a vault or by the vault itself, through any link,
// and a delegation to a checkout starts that checkout's workhorse when it has none; nothing else
// starts one.

import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkoutNamedBy, readyDelegatedWorkhorse } from "../codex-workbench-adapters.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A directory holding a vault, and a link to it. */
function checkout() {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "archboard-checkouts-")));
	roots.push(root);
	const repository = join(root, "payments");
	mkdirSync(join(repository, ".archboard", "vault"), { recursive: true });
	const linked = join(root, "linked");
	symlinkSync(repository, linked);
	return { root, repository, linked };
}

/** The workhorse of a checkout of a tab session that has gone, which builds none. */
function ended(): never {
	throw new Error("The tab session is not live, so it can start no workhorse.");
}

/** A coordinator tool call. */
function call(tool: string, args: unknown) {
	return { params: { namespace: "archboard_workhorse", tool, arguments: args } } as never;
}

test("a workhorse tool names a checkout by its directory or its vault, through any link", () => {
	const { root, repository, linked } = checkout();
	expect(checkoutNamedBy(repository)).toBe(repository);
	expect(checkoutNamedBy(join(repository, ".archboard", "vault"))).toBe(repository);
	expect(checkoutNamedBy(linked)).toBe(repository);
	// A directory with no vault, a path that is not there and a relative path name none. A
	// directory in no vault layout is one the server serves no vault from, so it is no checkout.
	expect(checkoutNamedBy(root)).toBeNull();
	expect(checkoutNamedBy(join(root, "missing"))).toBeNull();
	expect(checkoutNamedBy("payments")).toBeNull();
});

test("a delegation starts the workhorse of the checkout it names, and nothing else starts one", async () => {
	const { root, linked, repository } = checkout();
	const started: string[] = [];
	const workhorseOf = (named: string) => ({
		actions: {
			ensureStarted: async () => {
				started.push(named);
				if (named === "fails") throw new Error("The workhorse could not start.");
			},
		},
	});

	await readyDelegatedWorkhorse(call("delegate_to_workhorse", { checkout: linked }), workhorseOf);
	expect(started).toEqual([repository]);

	await readyDelegatedWorkhorse(call("inspect_workhorse", { checkout: repository }), workhorseOf);
	await readyDelegatedWorkhorse(call("delegate_to_workhorse", { checkout: root }), workhorseOf);
	await readyDelegatedWorkhorse(call("delegate_to_workhorse", {}), workhorseOf);
	expect(started).toEqual([repository]);

	// A start that fails leaves the delegation itself to answer.
	const failing = () => workhorseOf("fails");
	expect(
		await readyDelegatedWorkhorse(call("delegate_to_workhorse", { checkout: repository }), failing),
	).toBeUndefined();
	// So does a tab session that can build no workhorse any more, because its tab has gone.
	expect(
		await readyDelegatedWorkhorse(call("delegate_to_workhorse", { checkout: repository }), ended),
	).toBeUndefined();
});
