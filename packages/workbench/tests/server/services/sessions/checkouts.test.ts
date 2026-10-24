// Which checkout the coordinator's work goes to (ADR 0050). What is guarded: a workhorse tool
// names a checkout by the directory that holds a vault or by the vault itself, through any link,
// and a delegation to a checkout starts that checkout's workhorse when it has none; nothing else
// starts one.

import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkoutNamedBy } from "#server/services/host/archboard-checkouts.ts";

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

test("a workhorse tool names a checkout by its directory or its vault, through any link", () => {
	const { root, repository, linked } = checkout();
	expect(checkoutNamedBy(repository)).toBe(repository);
	expect(checkoutNamedBy(join(repository, ".archboard", "vault"))).toBe(repository);
	expect(checkoutNamedBy(linked)).toBe(repository);
	// A directory whose vault is a link names the checkout the server serves that vault from, and
	// one whose vault leads out of the layout names none: the server serves no vault there.
	const borrowing = join(root, "borrowing");
	mkdirSync(borrowing);
	symlinkSync(join(repository, ".archboard"), join(borrowing, ".archboard"));
	expect(checkoutNamedBy(borrowing)).toBe(repository);
	const outside = join(root, "outside");
	mkdirSync(join(outside, ".archboard"), { recursive: true });
	mkdirSync(join(root, "plain"));
	symlinkSync(join(root, "plain"), join(outside, ".archboard", "vault"));
	expect(checkoutNamedBy(outside)).toBeNull();
	// A directory with no vault, a path that is not there and a relative path name none.
	expect(checkoutNamedBy(root)).toBeNull();
	expect(checkoutNamedBy(join(root, "missing"))).toBeNull();
	expect(checkoutNamedBy("payments")).toBeNull();
});
