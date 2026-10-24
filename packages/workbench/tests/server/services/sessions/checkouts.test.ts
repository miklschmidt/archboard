// Which checkout the coordinator's work goes to (ADR 0050). What is guarded: a workhorse tool
// names a checkout by the directory that holds a vault or by the vault itself, through any link,
// and a delegation to a checkout starts that checkout's workhorse when it has none; nothing else
// starts one.

import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readyDelegatedWorkhorse } from "#server/services/sessions/checkouts.ts";
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

	await readyDelegatedWorkhorse(
		call("delegate_to_workhorse", { checkout: linked }),
		workhorseOf,
		checkoutNamedBy,
	);
	expect(started).toEqual([repository]);

	await readyDelegatedWorkhorse(
		call("inspect_workhorse", { checkout: repository }),
		workhorseOf,
		checkoutNamedBy,
	);
	await readyDelegatedWorkhorse(
		call("delegate_to_workhorse", { checkout: root }),
		workhorseOf,
		checkoutNamedBy,
	);
	await readyDelegatedWorkhorse(call("delegate_to_workhorse", {}), workhorseOf, checkoutNamedBy);
	await readyDelegatedWorkhorse(call("stop_workhorses", {}), workhorseOf, checkoutNamedBy);
	expect(started).toEqual([repository]);

	// A start that fails leaves the delegation itself to answer.
	const failing = () => workhorseOf("fails");
	expect(
		await readyDelegatedWorkhorse(
			call("delegate_to_workhorse", { checkout: repository }),
			failing,
			checkoutNamedBy,
		),
	).toBeUndefined();
	// So does a tab session that can build no workhorse any more, because its tab has gone.
	expect(
		await readyDelegatedWorkhorse(
			call("delegate_to_workhorse", { checkout: repository }),
			ended,
			checkoutNamedBy,
		),
	).toBeUndefined();
});

const admitIndependentCheckout = (named: string) =>
	named === "allowed" ? "/independent/project" : null;

test("the supplied host admits a checkout without a vault and refuses every other checkout", async () => {
	const starts: string[] = [];
	const workhorseOf = (admittedCheckout: string) => ({
		actions: {
			ensureStarted: async () => {
				starts.push(admittedCheckout);
			},
		},
	});
	await readyDelegatedWorkhorse(
		call("delegate_to_workhorse", { checkout: "allowed" }),
		workhorseOf,
		admitIndependentCheckout,
	);
	await readyDelegatedWorkhorse(
		call("delegate_to_workhorse", { checkout: "/not-admitted" }),
		workhorseOf,
		admitIndependentCheckout,
	);
	expect(starts).toEqual(["/independent/project"]);
});
