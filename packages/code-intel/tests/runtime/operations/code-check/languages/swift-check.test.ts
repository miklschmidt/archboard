// The code pass reads parts bound to Swift files and targets through the Swift
// adapter (ADR 0046, TASK-367.12): bindings and anchors are held to
// definitions and references, and the relationships between bound parts to
// the evidence that joins their code, with no import naming a file.
//
// The checkout `shop` is a Swift package. App imports Core and Util, which
// `Package.swift` makes its dependencies, and calls `Ledger.refund`, which an
// extension in another file of Core defines. The extension's `refund` builds
// a `Money`. Parts bind the target directories, the extension's member and
// `Money.swift`. One relationship is anchored at `ledger.balance`, a use
// through a value that only sourcekit-lsp resolves. The pass names
// sourcekit-lsp. Its configured server exits when started, so the check says
// so once and keeps the adapter's evidence.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-swift-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
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
		binding: { repo: SHOP, path, ...(symbol === undefined ? {} : { symbol }) },
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
	write(shop, {
		"Package.swift": [
			"// swift-tools-version:5.9",
			"import PackageDescription",
			"",
			"let package = Package(",
			'    name: "Shop",',
			"    targets: [",
			'        .target(name: "Core"),',
			'        .target(name: "Util"),',
			'        .executableTarget(name: "App", dependencies: ["Core", "Util"]),',
			"    ]",
			")",
			"",
		].join("\n"),
		"Sources/Core/Ledger.swift": [
			"public struct Ledger {",
			"    public init() {}",
			"    public func balance() -> Int { 0 }",
			"}",
			"",
		].join("\n"),
		"Sources/Core/Ledger+Refund.swift": [
			"public extension Ledger {",
			"    static func refund(_ cents: Int) -> Money {",
			"        Money(cents: cents)",
			"    }",
			"}",
			"",
		].join("\n"),
		"Sources/Core/Money.swift": "public struct Money {\n    public let cents: Int\n}\n",
		"Sources/Util/Format.swift": "public func format(_ cents: Int) -> String { String(cents) }\n",
		"Sources/App/main.swift": [
			"import Core",
			"import Util",
			"",
			"let ledger = Ledger()",
			"let refund = Ledger.refund(5)",
			"let balance = ledger.balance()",
			"",
		].join("\n"),
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	// A configured server that fails after starting.
	const fails = { command: process.execPath, args: ["-e", "process.exit(7)"] };
	register(scratch, { [SHOP]: shop }, { swift: fails });
	board(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pA", "App", "Sources/App"),
					part("pC", "Core", "Sources/Core"),
					part("pU", "Util", "Sources/Util"),
					part("pR", "Refund", "Sources/Core", "Ledger.refund"),
					part("pM", "Money", "Sources/Core/Money.swift"),
					part("pB", "Gone", "Sources/Core", "Ledger.missing"),
				],
				edges: [
					// The anchor holds and supports: App's code constructs Core's Ledger.
					edge("e1", ["pA", "pC"], "call", ["Sources/App/main.swift", "Ledger"]),
					// The name is nowhere in the file.
					edge("e2", ["pM", "pU"], "call", ["Sources/Core/Money.swift", "Nope"]),
					// Drawn from Money, while the extension's refund builds a Money.
					edge("e3", ["pM", "pR"], "call"),
					// A call through a value, which the pass asks sourcekit-lsp about.
					edge("e4", ["pA", "pC"], "call", ["Sources/App/main.swift", "ledger.balance"]),
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

test("anchors, binding symbols and the relationships between parts bound to Swift targets and files are judged by the Swift adapter", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"ANCHOR_SYMBOL_MISSING e2 warning",
			"BINDING_SYMBOL_MISSING pB warning",
			"RELATIONSHIP_BACKWARDS e3 information",
			"RELATIONSHIP_UNDRAWN pR warning",
			"RELATIONSHIP_UNDRAWN pU warning",
		].toSorted(),
	);
	expect(outcome.skipped.map((each) => each.reason)).not.toContain("text-only");
});

test("a call reaches an extension's member in another file of the imported module, and an import of a declared dependency reaches the target's directory", () => {
	const undrawn = (id: string) =>
		outcome.findings.find((each) => each.code === "RELATIONSHIP_UNDRAWN" && each.subject?.id === id)
			?.evidence;
	expect(undrawn("pR")).toEqual([
		{
			kind: "call",
			resolution: "resolved",
			from: "pA",
			to: "pR",
			repo: SHOP,
			path: "Sources/App/main.swift",
			line: 5,
			symbol: "Ledger.refund",
		},
	]);
	expect(undrawn("pU")).toEqual([
		{
			kind: "build-dependency",
			resolution: "resolved",
			from: "pA",
			to: "pU",
			repo: SHOP,
			path: "Sources/App/main.swift",
			line: 2,
			symbol: "Util",
		},
	]);
	const turned = outcome.findings.find((each) => each.subject?.id === "e3");
	expect(turned?.evidence?.map((piece) => [piece.from, piece.to, piece.kind])).toEqual([
		["pR", "pM", "call"],
	]);
});

test("a configured Swift server that exits is said once with its checkout, and its questions stay unasked", () => {
	expect(outcome.skipped.filter((each) => each.reason.startsWith("language-server-"))).toEqual([
		{ reason: "language-server-failed", repo: SHOP, detail: expect.any(String) },
	]);
});
