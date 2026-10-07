// clangd for C, C++ and Objective-C (TASK-367.15, TASK-433), against a stand-in
// server that, as clangd does, answers only about an open file and knows a
// definition in another file only once the index it reports has ended: the
// server starts in the directory of the file's `compile_commands.json` with
// exactly the arguments and the environment it is given, and is asked only
// once its index ended; a file with no database, or a database with no
// command, is said once and starts nothing; an index that never ends fails the
// waits until its caller cancels the pass.

import { afterEach, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openLanguageServers } from "@/runtime/language-servers/index";
import { running, workspace, type Workspace } from "@/runtime/language-servers/tests/fixture";

/** Short bounds, so a stand-in that fails costs the suite little. */
const STOP_MS = 300;

/** A header that declares what two source files define. */
const HEADER = "int ledger_post(int amount);\nint audit_check(int amount);\n";

/** A source file whose `ledger_post` calls `audit_check`, which another file defines. */
const LEDGER =
	'#include "ledger.h"\nint ledger_post(int amount) {\n  return audit_check(amount);\n}\n';

/** An Objective-C send and a C++ call through a class, on lines 2 and 3. */
const SENDS =
	"int pay(Ledger *ledger) {\n  [ledger post:3 by:4];\n  WriteBatchInternal::Append(a, b);\n}\n";

let current: Workspace | undefined;

afterEach(() => {
	for (const pid of current?.pids().filter(running) ?? []) process.kill(pid, "SIGKILL");
	current?.remove();
	current = undefined;
});

/**
 * A session whose C-family server is the stand-in.
 * @param at The workspace.
 * @param mode The stand-in's mode.
 * @returns The session.
 */
function clangdSession(at: Workspace, mode = "needs-open,indexes") {
	return openLanguageServers({
		servers: at.table(mode, "c"),
		signal: new AbortController().signal,
		stopMs: STOP_MS,
	});
}

/** A database as CMake writes it into `build`: one command listed, and one spelled as a command line. */
const DATABASE = JSON.stringify([
	{
		directory: ".",
		file: "../src/ledger.c",
		arguments: ["cc", "-I../include", "-c", "../src/ledger.c"],
	},
	{
		directory: "build",
		file: "../src/sends.m",
		command: "cc -x objective-c -- ../src/sends.m",
	},
]);

test("clangd starts in the directory of the file's database with the arguments and the environment it is given, and is asked about an opened file once its index ended", async () => {
	current = workspace(
		{ "include/ledger.h": HEADER, "src/ledger.c": LEDGER, "src/audit.c": "int audit_check;\n" },
		{ "../src/ledger.c:3:audit_check": { path: "../src/audit.c", line: 1 } },
	);
	const at = current;
	mkdirSync(join(at.root, "build"));
	writeFileSync(join(at.root, "build/compile_commands.json"), DATABASE);
	const flags = process.env["CLANGD_FLAGS"];
	process.env["CLANGD_FLAGS"] = "--query-driver=**";
	const environment = { ...process.env };
	const session = clangdSession(at);
	const question = { root: at.root, file: "src/ledger.c", line: 3, symbol: "audit_check" };
	try {
		expect(await session.definition(question)).toEqual({
			status: "answered",
			locations: [{ path: join(at.root, "src/audit.c"), line: 1, character: 0 }],
		});
		await session.close();
	} finally {
		if (flags === undefined) delete process.env["CLANGD_FLAGS"];
		else process.env["CLANGD_FLAGS"] = flags;
	}
	expect(session.unavailable()).toEqual([]);
	expect(at.starts().map((start) => start.cwd)).toEqual([join(at.root, "build")]);
	expect(at.argvs()).toEqual([[]]);
	expect(at.environments()).toEqual([environment]);
	const asked = at.methods().filter((method) => method !== "answer");
	expect(asked.indexOf("textDocument/didOpen")).toBeLessThan(
		asked.indexOf("textDocument/definition"),
	);
});

test("a C++ name through its class and an Objective-C selector are asked where their last name stands", async () => {
	current = workspace(
		{ "src/sends.m": SENDS, "compile_commands.json": DATABASE },
		{
			"src/sends.m:2:post": { path: "src/sends.m", line: 1 },
			"src/sends.m:3:Append": { path: "src/sends.m", line: 1 },
		},
	);
	const at = current;
	const session = clangdSession(at);
	const ask = (line: number, symbol: string) =>
		session.definition({ root: at.root, file: "src/sends.m", line, symbol });
	const [send, member] = await Promise.all([
		ask(2, "Ledger::post:by:"),
		ask(3, "WriteBatchInternal::Append"),
	]);
	await session.close();
	expect(
		[send, member].map((answer) => answer.status === "answered" && answer.locations.length),
	).toEqual([1, 1]);
});

test("a file with no database in its checkout, and a database that lists no command, are each said once and start no server", async () => {
	current = workspace({
		"tools/compile_commands.json": "[]",
		"tools/gen.c": LEDGER,
		"src/ledger.c": LEDGER,
		"lib/audit.c": LEDGER,
	});
	const at = current;
	const session = clangdSession(at);
	const unasked = { status: "unasked" } as const;
	for (const file of ["tools/gen.c", "src/ledger.c", "lib/audit.c"]) {
		expect(
			await session.definition({ root: at.root, file, line: 3, symbol: "audit_check" }),
		).toEqual(unasked);
	}
	await session.close();
	expect(session.unavailable()).toEqual([
		{ language: "c", reason: "unready", root: at.root, detail: expect.any(String) },
		{ language: "c", reason: "unready", root: at.root, detail: expect.any(String) },
	]);
	expect(at.pids()).toEqual([]);
});

test("a caller cancels an index that never ends and stops the server and its child", async () => {
	current = workspace({
		"compile_commands.json": DATABASE,
		"src/ledger.c": LEDGER,
		"src/audit.c": LEDGER,
	});
	const at = current;
	const controller = new AbortController();
	const session = openLanguageServers({
		servers: at.table("wrapped,needs-open,indexes-never", "c"),
		signal: controller.signal,
		stopMs: STOP_MS,
	});
	const ask = (file: string) =>
		session.definition({ root: at.root, file, line: 3, symbol: "audit_check" });
	const asked = Promise.all([ask("src/ledger.c"), ask("src/audit.c")]);
	while (!at.methods().includes("textDocument/didOpen")) await Bun.sleep(5);
	controller.abort();
	expect(await asked).toEqual([{ status: "unasked" }, { status: "unasked" }]);
	await session.close();
	expect(session.unavailable()).toEqual([]);
	await Bun.sleep(100);
	expect(at.pids()).toHaveLength(2);
	expect(at.pids().filter(running)).toEqual([]);
});

test("an Objective-C method of clangd's outline, whose name it puts at the method's sign, declares code at its selector", async () => {
	const method = {
		name: "-post:by:",
		kind: 6,
		range: { start: { line: 2, character: 0 }, end: { line: 4, character: 1 } },
		selectionRange: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } },
	};
	const implementation = {
		name: "Ledger",
		kind: 5,
		range: { start: { line: 1, character: 0 }, end: { line: 5, character: 4 } },
		selectionRange: { start: { line: 1, character: 16 }, end: { line: 1, character: 22 } },
		children: [method],
	};
	current = workspace(
		{ "compile_commands.json": DATABASE, "Shop/Ledger.m": SENDS },
		{ "outline:Shop/Ledger.m": [implementation] },
	);
	const at = current;
	const session = clangdSession(at);
	const location = { path: join(at.root, "Shop/Ledger.m"), line: 3, character: 7 };
	expect(await session.declaration(at.root, location)).toBe("code");
	await session.close();
});
