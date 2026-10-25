// The code pass reads parts bound to Python files through the Python adapter
// (ADR 0046, TASK-367.08): bindings and anchors are held to definitions and
// references, and the relationships between bound parts to the evidence that
// joins their code, as for TypeScript.
//
// The checkout `orders` is a package under `src`: the API saves through the
// store and sends through the mailer, the mailer calls the notifier, and a
// listener imports the notifier as a submodule of the package.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-python-"));
const orders = join(scratch, "orders");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const ORDERS = "github.com/test/orders";
let outcome: CodeCheckOutcome;

/**
 * A part bound to code in the checkout.
 * @param id Its id.
 * @param name Its name.
 * @param path Its bound path.
 * @param symbol Its bound symbol, if any.
 * @returns The node.
 */
function part(id: string, name: string, path: string, symbol?: string) {
	return {
		id,
		name,
		kind: "module",
		order: id.charCodeAt(1) * 10,
		binding: { repo: ORDERS, path, ...(symbol === undefined ? {} : { symbol }) },
	};
}

/**
 * A relationship.
 * @param id Its id.
 * @param ends Its start and end.
 * @param kind Its kind.
 * @param anchor The file and symbol of its anchor, if any.
 * @returns The relationship.
 */
function edge(
	id: string,
	ends: readonly [string, string],
	kind: string,
	anchor?: [string, string],
) {
	const [from, to] = ends;
	return {
		id,
		order: Number(id.slice(1)) * 10,
		from,
		to,
		kind,
		...(anchor === undefined
			? {}
			: { anchor: { repo: ORDERS, path: anchor[0], symbol: anchor[1] } }),
	};
}

beforeAll(async () => {
	mkdirSync(orders, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, orders, "init", "-q", "-b", "main");
	git(scratch, orders, "remote", "add", "origin", `https://${ORDERS}.git`);
	write(orders, {
		"src/orders/__init__.py": "",
		"src/orders/store.py": [
			"def save(order):",
			"    return order",
			"",
			"class Store:",
			"    def load(self):",
			"        return None",
			"",
		].join("\n"),
		"src/orders/api.py": [
			"from orders.store import save",
			"from . import mail",
			"",
			"def create(order):",
			"    # save_in_comment",
			"    mail.send(order)",
			"    return save(order)",
			"",
		].join("\n"),
		"src/orders/mail.py": "from .notify import notify\n\ndef send(order):\n    notify(order)\n",
		"src/orders/notify.py": "def notify(order):\n    pass\n",
		"src/orders/listener.py":
			"from orders import notify\n\ndef on_event():\n    notify.notify(1)\n",
	});
	git(scratch, orders, "add", "-A");
	git(scratch, orders, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [ORDERS]: orders });
	board(vault, "Orders", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pA", "API", "src/orders/api.py"),
					part("pS", "Store", "src/orders/store.py"),
					part("pK", "Load", "src/orders/store.py", "Store.load"),
					part("pB", "Gone", "src/orders/store.py", "Missing"),
					part("pM", "Mailer", "src/orders/mail.py"),
					part("pN", "Notifier", "src/orders/notify.py", "notify"),
					part("pL", "Listener", "src/orders/listener.py"),
				],
				edges: [
					// The anchor holds: the API calls save.
					edge("e1", ["pA", "pS"], "call", ["src/orders/api.py", "save"]),
					// The name stands only in a comment, which is no use.
					edge("e2", ["pA", "pM"], "call", ["src/orders/api.py", "save_in_comment"]),
					// Drawn from the notifier, while the mailer's code calls it.
					edge("e3", ["pN", "pM"], "event"),
				],
			},
		},
	]);
	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

test("anchors, binding symbols and the relationships between parts bound to Python files are judged by the Python adapter", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"ANCHOR_SYMBOL_MISSING e2 warning",
			"BINDING_SYMBOL_MISSING pB warning",
			"RELATIONSHIP_BACKWARDS e3 information",
			"RELATIONSHIP_UNDRAWN pN warning",
		].toSorted(),
	);
	// Nothing was read as text.
	expect(outcome.skipped.map((each) => each.reason)).not.toContain("text-only");
});

test("a part that imports a submodule of the package reaches the part bound to its definition, resolved", () => {
	const undrawn = outcome.findings.find((each) => each.code === "RELATIONSHIP_UNDRAWN");
	expect(undrawn?.evidence).toEqual([
		{
			kind: "call",
			resolution: "resolved",
			from: "pL",
			to: "pN",
			repo: ORDERS,
			path: "src/orders/listener.py",
			line: 4,
			symbol: "notify",
		},
	]);
	const turned = outcome.findings.find((each) => each.subject?.id === "e3");
	expect(turned?.evidence?.map((piece) => [piece.from, piece.to, piece.kind])).toEqual([
		["pM", "pN", "call"],
	]);
});
