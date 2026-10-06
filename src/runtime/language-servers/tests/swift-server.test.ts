// sourcekit-lsp for Swift (TASK-367.16), against a stand-in server that, as
// sourcekit-lsp does, answers only about an open file: the server starts in
// the package that holds the file, with background indexing off and after it
// has loaded its index; a package it cannot answer about without a build is
// said once and starts nothing; and a server that failed in one package starts
// in no other package of the checkout.

import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { openLanguageServers, readLanguageServers } from "@/runtime/language-servers/index";
import { workspace, type Workspace } from "@/runtime/language-servers/tests/fixture";

/** Short bounds, so a stand-in that fails costs the suite little. */
const SHORT = { startMs: 2000, requestMs: 1000, stopMs: 300 } as const;

/** A Swift file whose `post` calls `normalize`, which the file defines on line 8. */
const LEDGER = [
	"public struct Ledger {",
	"    public init() {}",
	"    public func post(_ amount: Int) -> Int {",
	"        return normalize(amount)",
	"    }",
	"}",
	"",
	"public func normalize(_ amount: Int) -> Int { abs(amount) }",
	"",
].join("\n");

/** A manifest; the check never reads it here. */
const MANIFEST = "// swift-tools-version:5.9\n";

/** A unit in the index store that a build writes. */
const UNIT = ".build/debug/index/store/v5/units/Ledger.swift.o-1";

let current: Workspace | undefined;

afterEach(() => {
	current?.remove();
	current = undefined;
});

/**
 * A session whose Swift server is the stand-in.
 * @param at The workspace.
 * @returns The session.
 */
function swiftSession(at: Workspace) {
	return openLanguageServers({
		servers: at.table("needs-open", "swift"),
		signal: new AbortController().signal,
		timeouts: SHORT,
	});
}

/**
 * The question about the use of `normalize` in a package's ledger.
 * @param at The workspace.
 * @param base The package, relative to the checkout.
 * @returns The question.
 */
function normalizeIn(at: Workspace, base: string) {
	return { root: at.root, file: `${base}/Sources/Core/Ledger.swift`, line: 4, symbol: "normalize" };
}

test("sourcekit-lsp is asked in the package that holds the file, with background indexing off, after it loaded its index, about the file it opened", async () => {
	current = workspace(
		{
			"apps/shop/Package.swift": MANIFEST,
			"apps/shop/Sources/Core/Ledger.swift": LEDGER,
			[`apps/shop/${UNIT}`]: "",
		},
		{ "Sources/Core/Ledger.swift:4:normalize": { path: "Sources/Core/Ledger.swift", line: 8 } },
	);
	const session = swiftSession(current);
	expect(await session.definition(normalizeIn(current, "apps/shop"))).toEqual({
		status: "answered",
		locations: [
			{ path: join(current.root, "apps/shop/Sources/Core/Ledger.swift"), line: 8, character: 0 },
		],
	});
	await session.close();
	expect(session.unavailable()).toEqual([]);
	expect(current.starts()).toEqual([
		{ cwd: join(current.root, "apps/shop"), options: { backgroundIndexing: false } },
	]);
	const asked = current.methods().filter((method) => method !== "answer");
	expect(asked.slice(0, 5)).toEqual([
		"initialize",
		"initialized",
		"workspace/synchronize",
		"textDocument/didOpen",
		"textDocument/definition",
	]);
});

test("a package that no build has indexed is said once for all its directories, keeps its questions unasked, and starts no server, while an indexed one is asked", async () => {
	current = workspace(
		{
			"bare/Package.swift": MANIFEST,
			"bare/Sources/Core/Ledger.swift": LEDGER,
			"bare/Sources/App/Other.swift": LEDGER,
			"built/Package.swift": MANIFEST,
			"built/Sources/Core/Ledger.swift": LEDGER,
			[`built/${UNIT}`]: "",
		},
		{ "Sources/Core/Ledger.swift:4:normalize": { path: "Sources/Core/Ledger.swift", line: 8 } },
	);
	const session = swiftSession(current);
	const other = { ...normalizeIn(current, "bare"), file: "bare/Sources/App/Other.swift" };
	const [bare, again, built] = await Promise.all([
		session.definition(normalizeIn(current, "bare")),
		session.definition(other),
		session.definition(normalizeIn(current, "built")),
	]);
	expect([bare, again]).toEqual([{ status: "unasked" }, { status: "unasked" }]);
	expect(built.status).toBe("answered");
	await session.close();
	expect(session.unavailable()).toEqual([
		{ language: "swift", reason: "unready", root: current.root, detail: expect.any(String) },
	]);
	expect(current.starts().map((start) => start.cwd)).toEqual([join(current.root, "built")]);
});

test("a package whose own configuration turns background indexing on, and a file no package holds, are each said once and start no server", async () => {
	current = workspace({
		"shop/Package.swift": MANIFEST,
		"shop/.sourcekit-lsp/config.json": JSON.stringify({ backgroundIndexing: true }),
		"shop/Sources/Core/Ledger.swift": LEDGER,
		[`shop/${UNIT}`]: "",
		"Scripts/Sources/Core/Ledger.swift": LEDGER,
	});
	const session = swiftSession(current);
	expect(await session.definition(normalizeIn(current, "shop"))).toEqual({ status: "unasked" });
	expect(await session.definition(normalizeIn(current, "Scripts"))).toEqual({ status: "unasked" });
	await session.close();
	expect(session.unavailable().map((entry) => entry.reason)).toEqual(["unready", "unready"]);
	expect(current.pids()).toEqual([]);
});

test("a server that failed in one package is not started in another package of that checkout", async () => {
	current = workspace({
		"one/Package.swift": MANIFEST,
		"one/Sources/Core/Ledger.swift": LEDGER,
		[`one/${UNIT}`]: "",
		"two/Package.swift": MANIFEST,
		"two/Sources/Core/Ledger.swift": LEDGER,
		[`two/${UNIT}`]: "",
	});
	const session = openLanguageServers({
		servers: current.table("exit-on-definition", "swift"),
		signal: new AbortController().signal,
		timeouts: SHORT,
	});
	expect(await session.definition(normalizeIn(current, "one"))).toEqual({ status: "unasked" });
	expect(await session.definition(normalizeIn(current, "two"))).toEqual({ status: "unasked" });
	await session.close();
	expect(session.unavailable().map((entry) => [entry.reason, entry.root])).toEqual([
		["failed", current.root],
	]);
	expect(current.starts().map((start) => start.cwd)).toEqual([join(current.root, "one")]);
});

test("Swift has no server until language-servers.json names one", () => {
	const swift = readLanguageServers(join(import.meta.dir, "no-language-servers.json")).get("swift");
	expect(swift?.status).toBe("missing");
});
