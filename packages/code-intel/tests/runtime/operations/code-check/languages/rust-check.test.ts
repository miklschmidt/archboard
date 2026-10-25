// The code pass reads parts bound to Rust crates, modules and files through
// the Rust adapter (ADR 0046, TASK-540): bindings and anchors are held to
// definitions and references, the relationships between bound parts to the
// evidence that joins their code across modules and crates, and a container
// bound to a crate to what its `lib.rs` exposes.
//
// The checkout `shop` is the fixture workspace `fixtures/rust-shop`: the
// binary `shop` calls the library `ledger`'s `record` under the name `book`,
// which `lib.rs` passes on from its private module `entry`, and `entry.rs`
// builds `Money` of the module `money`. The library is a container of its
// modules. One relationship is anchored at `entry.balance`, a trait method
// called through a value, which only rust-analyzer resolves; no server is
// configured for Rust, so the check says so once and keeps the adapter's
// evidence.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";
import { FIXTURES } from "#tests/runtime/support/code-facts/checkout.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-rust-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
const CHECKOUT = "crates/shop/src/checkout.rs";
const ENTRY = "crates/ledger/src/entry.rs";
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
	const fixture = join(FIXTURES, "rust-shop");
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
	board(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pShop", "crates/shop"),
					part("pCart", CHECKOUT, { parent: "pShop" }),
					part("pLed", "crates/ledger/src"),
					part("pEntry", ENTRY, { parent: "pLed" }),
					part("pMoney", "crates/ledger/src/money", { parent: "pLed" }),
					part("pGone", "crates/ledger/src/lib.rs", { symbol: "missing" }),
				],
				edges: [
					// The anchor holds: the renamed import leads through the re-export to `post`.
					edge("e1", ["pCart", "pEntry"], "call", [CHECKOUT, "book"]),
					// The name is nowhere in the file.
					edge("e2", ["pEntry", "pMoney"], "call", [ENTRY, "Nope"]),
					// Drawn from the money, while the entry builds money.
					edge("e3", ["pMoney", "pEntry"], "call"),
					// A trait method called through a value, which only rust-analyzer resolves.
					edge("e4", ["pCart", "pEntry"], "call", [CHECKOUT, "entry.balance"]),
				],
			},
		},
	]);
	const check = await import("#runtime/api/code-check-run.ts");
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

test("anchors, binding symbols and the relationships between parts bound to Rust crates, modules and files are judged by the Rust adapter", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"ANCHOR_SYMBOL_MISSING e2 warning",
			"BINDING_SYMBOL_MISSING pGone warning",
			// The library exposes `audit`, `Entry` and three names of `money` that the shop does not use.
			"EXPOSED_UNUSED pLed information",
			"RELATIONSHIP_BACKWARDS e3 information",
			"RELATIONSHIP_UNDRAWN pLed warning",
			"RELATIONSHIP_UNDRAWN pMoney warning",
		].toSorted(),
	);
	expect(outcome.skipped.map((each) => each.reason)).not.toContain("text-only");
	// The library's interface is read; the binary `shop` has no library, so it exposes none.
	const unknown = outcome.skipped.filter((each) => each.reason === "exposure-unknown");
	expect(unknown.map((each) => each.subject?.id)).toEqual(["pShop"]);
});

test("a call reaches a module of another crate through a path from the crate's name, and a manifest's dependency reaches the crate", () => {
	const evidenceOf = (id: string) =>
		outcome.findings
			.find((each) => each.code === "RELATIONSHIP_UNDRAWN" && each.subject?.id === id)
			?.evidence?.map((piece) => [
				piece.from,
				piece.kind,
				piece.resolution,
				piece.path,
				piece.symbol,
			]);
	expect(evidenceOf("pMoney")).toEqual([
		["pCart", "call", "resolved", CHECKOUT, "ledger.money.Money.from_cents"],
	]);
	expect(evidenceOf("pLed")).toEqual([
		["pShop", "build-dependency", "resolved", "crates/shop/Cargo.toml", "ledger"],
		// `ledger::cents!` is the macro the library exports from its root.
		["pCart", "call", "resolved", CHECKOUT, "ledger.cents"],
	]);
	const turned = outcome.findings.find((each) => each.subject?.id === "e3");
	expect(turned?.evidence?.map((piece) => [piece.from, piece.to, piece.symbol])).toEqual([
		["pEntry", "pMoney", "Money.from_cents"],
	]);
});

test("a checkout with no configured Rust server says language-server-missing once for it, and names the command that configures one", () => {
	expect(outcome.skipped.filter((each) => each.reason.startsWith("language-server-"))).toEqual([
		{
			reason: "language-server-missing",
			repo: SHOP,
			detail: expect.stringContaining(`repo language-server rust <command> --repo ${SHOP}`),
		},
	]);
});
