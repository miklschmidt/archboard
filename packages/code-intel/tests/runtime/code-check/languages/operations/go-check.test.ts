// The code pass reads parts bound to Go packages and files through the Go
// adapter (ADR 0046, TASK-575): bindings and anchors are held to definitions
// and references, the relationships between bound parts to the evidence that
// joins their code across packages and modules, and a container bound to a
// package to what it exports.
//
// The checkout `shop` is the fixture workspace `fixtures/go-shop`: a
// `go.work` uses the modules `example.com/ledger` and `example.com/shop`, and
// the shop's `go.mod` replaces the ledger with its local directory. The
// program `shop` imports the ledger as `books`, calls `books.New`, and parses
// an amount with the ledger's subpackage `money`. The ledger is a container of
// the package `money`. One relationship is anchored at `book.Post`, a method
// called through a value, which only gopls resolves; no server is configured
// for Go, so the check says so once and keeps the adapter's evidence.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/code-check/operations/check.ts";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";
import { FIXTURES } from "#tests/runtime/support/code-facts/checkout.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-go-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
const MAIN = "shop/main.go";
const LEDGER = "ledger/ledger.go";
let outcome: CodeCheckOutcome;

/**
 * A part bound to code in the checkout.
 * @param id Its id.
 * @param path Its bound path.
 * @param extra Its bound symbol and the part that holds it, if any.
 * @param extra.symbol The bound symbol.
 * @param extra.parent The id of the part that holds it.
 * @returns The node.
 */
function part(id: string, path: string, extra: { symbol?: string; parent?: string } = {}) {
	const { symbol, parent } = extra;
	return {
		id,
		name: id.slice(1),
		kind: "module",
		order: id.charCodeAt(1) * 10,
		binding: { repo: SHOP, path, ...(symbol === undefined ? {} : { symbol }) },
		...(parent === undefined ? {} : { parent }),
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
		...(anchor === undefined ? {} : { anchor: { repo: SHOP, path: anchor[0], symbol: anchor[1] } }),
	};
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	const fixture = join(FIXTURES, "go-shop");
	const files = readdirSync(fixture, { recursive: true, withFileTypes: true }).filter((entry) =>
		entry.isFile(),
	);
	write(
		shop,
		Object.fromEntries(
			files.map((entry) => {
				const file = join(entry.parentPath, entry.name);
				return [file.slice(fixture.length + 1), readFileSync(file, "utf8")];
			}),
		),
	);
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [SHOP]: shop });
	document(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pShop", "shop"),
					part("pMain", MAIN, { parent: "pShop" }),
					part("pLed", "ledger"),
					part("pBook", LEDGER, { parent: "pLed" }),
					part("pMoney", "ledger/money", { parent: "pLed" }),
					part("pGone", LEDGER, { symbol: "missing" }),
				],
				edges: [
					// The anchor holds: the aliased import leads to the ledger's `New`.
					edge("e1", ["pMain", "pBook"], "call", [MAIN, "books.New"]),
					// The name is nowhere in the file.
					edge("e2", ["pBook", "pMoney"], "call", [LEDGER, "Nope"]),
					// Drawn from the money, while the book adds money.
					edge("e3", ["pMoney", "pBook"], "call"),
					// A method called through a value, which only gopls resolves.
					edge("e4", ["pMain", "pBook"], "call", [MAIN, "book.Post"]),
				],
			},
		},
	]);
	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readStatesToCheck(vault, undefined);
	if (!read.ok) throw new Error("no documents");
	outcome = await check.checkCode(vault, read.states, new AbortController().signal);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

test("anchors, binding symbols and the relationships between parts bound to Go packages and files are judged by the Go adapter", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"ANCHOR_SYMBOL_MISSING e2 warning",
			"BINDING_SYMBOL_MISSING pGone warning",
			// The ledger exports `Archive`, which no other package calls.
			"EXPOSED_UNUSED pLed information",
			"RELATIONSHIP_BACKWARDS e3 information",
			// The shop's relationship to the book stands for its imports of the ledger and its money.
			"RELATIONSHIP_UNDRAWN pLed information",
			"RELATIONSHIP_UNDRAWN pMoney information",
		].toSorted(),
	);
	expect(outcome.skipped.map((each) => each.reason)).not.toContain("text-only");
	// The ledger's exports are read; the shop is a package `main`, which exports none.
	const unknown = outcome.skipped.filter((each) => each.reason === "exposure-unknown");
	expect(unknown.map((each) => each.subject?.id)).toEqual(["pShop"]);
});

test("an import reaches the package of another module through its module path, and a call through the import's name reaches the file that defines it", () => {
	const evidenceOf = (code: string, id: string) =>
		outcome.findings
			.find((each) => each.code === code && each.subject?.id === id)
			?.evidence?.map((piece) => [
				piece.from,
				piece.kind,
				piece.resolution,
				piece.path,
				piece.symbol,
			]);
	expect(evidenceOf("RELATIONSHIP_UNDRAWN", "pMoney")).toEqual([
		["pShop", "build-dependency", "resolved", "shop/checkout.go", "example.com/ledger/money"],
		["pMain", "build-dependency", "resolved", MAIN, "example.com/ledger/money"],
	]);
	expect(evidenceOf("RELATIONSHIP_UNDRAWN", "pLed")).toEqual([
		["pShop", "build-dependency", "resolved", "shop/checkout.go", "example.com/ledger"],
		["pMain", "build-dependency", "resolved", MAIN, "example.com/ledger"],
	]);
	expect(evidenceOf("RELATIONSHIP_BACKWARDS", "e3")).toEqual([
		["pBook", "call", "resolved", LEDGER, "money.Add"],
	]);
	const message = outcome.findings.find((each) => each.code === "EXPOSED_UNUSED")?.message;
	expect(message).toContain("Archive");
});

test("a checkout with no configured Go server reports language-server-missing once", () => {
	expect(outcome.skipped.filter((each) => each.reason.startsWith("language-server-"))).toEqual([
		{
			reason: "language-server-missing",
			repo: SHOP,
			detail: expect.any(String),
		},
	]);
});
