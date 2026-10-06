// clangd for C, C++ and Objective-C (TASK-367.15), against a stand-in server
// that, as clangd does, answers only about an open file and knows a
// definition in another file only once the index it reports has ended: the
// server starts in the directory of the file's `compile_commands.json`, reads
// a copy of it whose module cache, index and temporary files stay in a
// directory of its own, with no `CLANGD_FLAGS`, and is asked only once its
// index ended; the copy keeps nothing of a command that could run a program
// or write elsewhere; a file with no database, or a database with no command,
// is said once and starts nothing; an index that never ends fails the server
// once.

import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { openLanguageServers } from "@/runtime/language-servers/index";
import { running, workspace, type Workspace } from "@/runtime/language-servers/tests/fixture";

/** Short bounds, so a stand-in that fails costs the suite little. */
const SHORT = { startMs: 2000, requestMs: 1000, stopMs: 300 } as const;

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
		timeouts: SHORT,
	});
}

/**
 * A database as CMake writes it into `build`: one command listed with a module
 * cache inside the checkout, and one spelled as a command line.
 * @param root The checkout.
 * @returns Its text.
 */
function database(root: string): string {
	return JSON.stringify([
		{
			directory: ".",
			file: "../src/ledger.c",
			arguments: ["cc", "-I../include", `-fmodules-cache-path=${root}/mc`, "-c", "../src/ledger.c"],
		},
		{
			directory: join(root, "build"),
			file: "../src/sends.m",
			command: "cc -x objective-c -Xclang -fmodules-cache-path=mc -- ../src/sends.m",
		},
	]);
}

test("clangd starts in the directory of the file's database, reads a copy whose module cache and index stay in its own directory, and is asked about an opened file once its index ended", async () => {
	current = workspace(
		{ "include/ledger.h": HEADER, "src/ledger.c": LEDGER, "src/audit.c": "int audit_check;\n" },
		{ "../src/ledger.c:3:audit_check": { path: "../src/audit.c", line: 1 } },
	);
	const at = current;
	mkdirSync(join(at.root, "build"));
	writeFileSync(join(at.root, "build/compile_commands.json"), database(at.root));
	const flags = process.env["CLANGD_FLAGS"];
	process.env["CLANGD_FLAGS"] = "--query-driver=**";
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
	const [args = []] = at.argvs();
	expect(args).toEqual(expect.arrayContaining(["--background-index", "--enable-config=false"]));
	const own = args.find((arg) => arg.startsWith("--compile-commands-dir="))?.split("=")[1] ?? "";
	expect(relative(at.root, own).startsWith("..")).toBe(true);
	expect(existsSync(own)).toBe(false);
	expect(at.environments()).toEqual([{ TMPDIR: own, CLANGD_FLAGS: null }]);
	const [copy] = at.databases() as { directory: string; arguments: string[] }[][];
	expect(copy?.map((command) => command.directory)).toEqual([
		join(at.root, "build"),
		join(at.root, "build"),
	]);
	for (const command of copy ?? []) {
		const caches = command.arguments.filter((arg) => arg.includes("-fmodules-cache-path"));
		expect(caches).toEqual([`-fmodules-cache-path=${join(own, "modules")}`]);
	}
	const asked = at.methods().filter((method) => method !== "answer");
	expect(asked.indexOf("textDocument/didOpen")).toBeLessThan(
		asked.indexOf("textDocument/definition"),
	);
});

test("the copy keeps nothing of a command that could run a program of the checkout or write outside the server's own directory", async () => {
	const hostile = [
		"tools/clang",
		"-Iinclude",
		"-Xclang=-fmodules-cache-path=mc",
		"-Wp,-fmodules-cache-path=mc",
		"@tools/flags.rsp",
		"-Btools",
		"-B",
		"tools",
		"--config=tools/x.cfg",
		"-Xopenmp-target",
		"--nvptx-arch-tool=tools/arch",
		"-x",
		"cuda",
		"--offload-arch=native",
		"-c",
		"src/ledger.c",
		"-sectcreate",
		"--",
		"src/ledger.c",
		"--amdgpu-arch-tool=tools/arch",
	];
	const cl = [
		"C:\\VS\\bin\\clang-cl.exe",
		"/clang:--nvptx-arch-tool=tools\\arch",
		"/c",
		"ledger.c",
	];
	current = workspace({
		"src/ledger.c": LEDGER,
		"compile_commands.json": JSON.stringify([
			{ directory: ".", file: "src/ledger.c", arguments: hostile },
			{ directory: ".", file: "src/audit.c", arguments: cl },
		]),
	});
	const at = current;
	const session = clangdSession(at);
	await session.definition({ root: at.root, file: "src/ledger.c", line: 3, symbol: "audit_check" });
	await session.close();
	const own = at
		.argvs()[0]
		?.find((arg) => arg.startsWith("--compile-commands-dir="))
		?.split("=")[1];
	const [copy = []] = at.databases() as { arguments: string[] }[][];
	const [gcc = [], clangCl = []] = copy.map((command) => command.arguments);
	// The compiler moves into the server's own directory under its name, and
	// the copy's own flags stand right after it, where no flag of the command
	// can take one as its value.
	expect(gcc[0]).toBe(join(own ?? "", "compiler", "clang"));
	expect(gcc.slice(1, 4).every((arg) => arg.includes(own ?? "?"))).toBe(true);
	expect(clangCl.slice(1, 4).every((arg) => arg.startsWith("/clang:"))).toBe(true);
	for (const args of [gcc, clangCl]) {
		const named = args.filter((arg) => /fmodules-cache-path|arch-tool/u.test(arg));
		expect(named.every((arg) => arg.includes(own ?? "?"))).toBe(true);
		const kept = args.filter((arg) => /^(?:@|-B|--config|--prefix|--$)/u.test(arg));
		expect(kept).toEqual([]);
	}
	expect(gcc).toEqual(
		expect.arrayContaining(["-Iinclude", "--offload-arch=native", "-sectcreate"]),
	);
});

test("a C++ name through its class and an Objective-C selector are asked where their last name stands", async () => {
	current = workspace(
		{ "src/sends.m": SENDS, "compile_commands.json": database("/elsewhere") },
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

test("a server whose index never ends is said once as failed, and is stopped with the server it runs as its child, so nothing writes into its own directory once that is removed", async () => {
	current = workspace({
		"compile_commands.json": database("/elsewhere"),
		"src/ledger.c": LEDGER,
		"src/audit.c": LEDGER,
	});
	const at = current;
	const session = clangdSession(at, "wrapped,needs-open,indexes-never,writes");
	const ask = (file: string) =>
		session.definition({ root: at.root, file, line: 3, symbol: "audit_check" });
	expect(await Promise.all([ask("src/ledger.c"), ask("src/audit.c")])).toEqual([
		{ status: "unasked" },
		{ status: "unasked" },
	]);
	await session.close();
	expect(session.unavailable().map((entry) => entry.reason)).toEqual(["failed"]);
	await Bun.sleep(100);
	expect(at.pids()).toHaveLength(2);
	expect(at.pids().filter(running)).toEqual([]);
	const own = at.argvs()[0]?.find((arg) => arg.startsWith("--compile-commands-dir="));
	expect(existsSync(own?.split("=")[1] ?? "")).toBe(false);
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
		{ "compile_commands.json": database("/elsewhere"), "Shop/Ledger.m": SENDS },
		{ "outline:Shop/Ledger.m": [implementation] },
	);
	const at = current;
	const session = clangdSession(at);
	const location = { path: join(at.root, "Shop/Ledger.m"), line: 3, character: 7 };
	expect(await session.declaration(at.root, location)).toBe("code");
	await session.close();
});
