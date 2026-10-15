// Which port a checkout's server listens on, and when a command hands itself
// to the source of the archboard checkout it stands in (ADR 0049,
// TASK-472.08). The tests build stand-in checkouts in a temporary directory:
// a `.git` directory or file, a package.json and a `bin/archboard`.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkoutPort, handOffTarget, worktreePort } from "@/runtime/engine/source-checkout";

let scratch = "";

beforeAll(() => {
	scratch = realpathSync.native(mkdtempSync(join(tmpdir(), "archboard-source-checkout-")));
});

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Make a checkout root below the scratch directory.
 * @param name Its directory name.
 * @param options What it is.
 * @param options.linked Whether it is a linked worktree, whose `.git` is a file.
 * @param options.packageName The name its package.json gives, or none for no package.json.
 * @returns Its root.
 */
function checkout(name: string, options: { linked?: boolean; packageName?: string } = {}): string {
	const root = join(scratch, name);
	mkdirSync(join(root, "bin"), { recursive: true });
	if (options.linked === true) {
		writeFileSync(join(root, ".git"), "gitdir: /elsewhere/.git/worktrees/x\n");
	} else {
		mkdirSync(join(root, ".git"));
	}
	if (options.packageName !== undefined) {
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: options.packageName }));
		writeFileSync(join(root, "bin", "archboard"), "#!/usr/bin/env bash\n");
	}
	return root;
}

test("the main checkout keeps 3000 and a linked worktree takes a stable port in 10000 to 19999", () => {
	expect(checkoutPort(checkout("main"))).toBe(3000);
	const linked = checkout("linked", { linked: true });
	const port = checkoutPort(linked);
	expect(port).toBeGreaterThanOrEqual(10000);
	expect(port).toBeLessThanOrEqual(19999);
	expect(checkoutPort(linked)).toBe(port);
	// The hash is the port of a worktree on every run and every machine, so a
	// change to it moves every worktree's server.
	expect(worktreePort("/home/ada/archboard/.worktrees/feature")).toBe(19275);
	expect(worktreePort("/home/ada/archboard/.worktrees/other")).toBe(16646);
});

test("a command in another archboard checkout runs that checkout's bin/archboard", () => {
	const running = checkout("running", { packageName: "archboard" });
	const standing = checkout("standing", { packageName: "archboard", linked: true });
	mkdirSync(join(standing, "src", "deep"), { recursive: true });

	expect(handOffTarget(join(standing, "src", "deep"), running)).toBe(
		join(standing, "bin", "archboard"),
	);
	expect(handOffTarget(standing, standing)).toBeNull();
});

test("only the checkout root the directory stands in decides", () => {
	const running = checkout("root-running", { packageName: "archboard" });
	const outer = checkout("outer", { packageName: "archboard" });
	const nested = join(outer, "fixtures", "shop");
	mkdirSync(join(nested, ".git"), { recursive: true });
	writeFileSync(join(nested, "package.json"), JSON.stringify({ name: "shop" }));
	const elsewhere = checkout("payments", { packageName: "payments" });
	const plain = join(scratch, "no-checkout");
	mkdirSync(plain);

	expect(handOffTarget(nested, running)).toBeNull();
	expect(handOffTarget(elsewhere, running)).toBeNull();
	expect(handOffTarget(plain, running)).toBeNull();
});

test("a bin/archboard that links to a third checkout gets no hand-off, so none can loop", () => {
	const running = checkout("loop-running", { packageName: "archboard" });
	const third = checkout("loop-third", { packageName: "archboard" });
	const standing = checkout("loop-standing", { packageName: "archboard" });
	rmSync(join(standing, "bin", "archboard"));
	symlinkSync(join(third, "bin", "archboard"), join(standing, "bin", "archboard"));

	expect(handOffTarget(standing, running)).toBeNull();
});
