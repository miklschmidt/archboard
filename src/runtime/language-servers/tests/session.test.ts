// The language servers of one pass, against a stand-in server that speaks the
// protocol over stdio: what a question is answered, what is said once when a
// server is missing or fails, and that every server has ended when the
// session closes.

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { openLanguageServers } from "@/runtime/language-servers/index";
import { running, workspace, type Workspace } from "@/runtime/language-servers/tests/fixture";

/** Short bounds, so a hung stand-in costs the suite little. */
const SHORT = { startMs: 2000, requestMs: 300, stopMs: 300 } as const;

/** A file that uses a name through a value and one it defines itself. */
const FILE = [
	"import type { Store } from './store';",
	"export function load(store: Store) {",
	"  return store?.read(helper());",
	"}",
	"function helper() { return 1; }",
].join("\n");

let current: Workspace | undefined;

afterEach(() => {
	current?.remove();
	current = undefined;
});

/**
 * A workspace with the file above and answers for its two uses.
 * @returns The workspace.
 */
function withFile(): Workspace {
	current = workspace(
		{ "src/load.ts": FILE, "src/store.ts": "export interface Store { read(n: number): number }\n" },
		{ "src/load.ts:3:read": { path: "src/store.ts", line: 1 }, "src/load.ts:3:helper": [] },
	);
	return current;
}

describe("a pass's language servers", () => {
	test("ask the server of the file's language at the use's last name, start it once, and stop it on close", async () => {
		const at = withFile();
		const session = openLanguageServers({
			servers: at.table(),
			signal: new AbortController().signal,
			timeouts: SHORT,
		});
		const question = { root: at.root, file: "src/load.ts", line: 3 };
		const [read, helper, again] = await Promise.all([
			session.definition({ ...question, symbol: "store.read" }),
			session.definition({ ...question, symbol: "helper" }),
			session.definition({ ...question, symbol: "store.read" }),
		]);
		expect(read).toEqual({
			status: "answered",
			locations: [{ path: join(at.root, "src/store.ts"), line: 1, character: 0 }],
		});
		expect(helper).toEqual({ status: "answered", locations: [] });
		expect(again).toEqual(read);
		expect(at.pids()).toHaveLength(1);
		await session.close();
		expect(running(at.pids()[0] ?? 0)).toBe(false);
		expect(session.unavailable()).toEqual([]);
		const methods = at.methods();
		expect(methods.filter((method) => method === "textDocument/definition")).toHaveLength(2);
		expect(methods.slice(-2)).toEqual(["shutdown", "exit"]);
		expect(methods).toContain("answer");
	});

	test("ask nothing about a file no server reads, or a use its line does not hold", async () => {
		const at = withFile();
		const session = openLanguageServers({
			servers: at.table(),
			signal: new AbortController().signal,
		});
		const unasked = { status: "unasked" } as const;
		expect(
			await session.definition({ root: at.root, file: "notes.md", line: 1, symbol: "x" }),
		).toEqual(unasked);
		expect(
			await session.definition({ root: at.root, file: "src/load.ts", line: 1, symbol: "nowhere" }),
		).toEqual(unasked);
		await session.close();
		expect(at.pids().every((pid) => !running(pid))).toBe(true);
	});

	test("say once for the checkout that a language has no server, and start nothing", async () => {
		const at = withFile();
		const session = openLanguageServers({
			servers: () => ({ status: "missing", detail: "tsc is not installed" }),
			signal: new AbortController().signal,
		});
		const question = { root: at.root, file: "src/load.ts", line: 3 };
		expect(await session.definition({ ...question, symbol: "store.read" })).toEqual({
			status: "unasked",
		});
		expect(await session.definition({ ...question, symbol: "helper" })).toEqual({
			status: "unasked",
		});
		await session.close();
		expect(session.unavailable()).toEqual([
			{ language: "typescript", reason: "missing", root: at.root, detail: "tsc is not installed" },
		]);
		expect(at.pids()).toEqual([]);
	});

	test.each([
		["ends", "exit-on-definition"],
		["does not answer in time", "hang-definition"],
	])("say once that a server that %s failed, stop it, and ask it nothing more", async (_, mode) => {
		const at = withFile();
		const session = openLanguageServers({
			servers: at.table(mode),
			signal: new AbortController().signal,
			timeouts: SHORT,
		});
		const question = { root: at.root, file: "src/load.ts", line: 3 };
		expect(await session.definition({ ...question, symbol: "store.read" })).toEqual({
			status: "unasked",
		});
		expect(await session.definition({ ...question, symbol: "helper" })).toEqual({
			status: "unasked",
		});
		await session.close();
		expect(session.unavailable()).toEqual([
			{ language: "typescript", reason: "failed", root: at.root, detail: expect.any(String) },
		]);
		expect(at.pids()).toHaveLength(1);
		expect(running(at.pids()[0] ?? 0)).toBe(false);
		expect(at.methods().filter((method) => method === "textDocument/definition")).toHaveLength(1);
	});

	test("say once that a server that does not start failed, and leave no process", async () => {
		const at = withFile();
		const session = openLanguageServers({
			servers: at.table("hang-initialize"),
			signal: new AbortController().signal,
			timeouts: { ...SHORT, startMs: SHORT.requestMs },
		});
		expect(
			await session.definition({ root: at.root, file: "src/load.ts", line: 3, symbol: "helper" }),
		).toEqual({ status: "unasked" });
		await session.close();
		expect(session.unavailable().map((entry) => entry.reason)).toEqual(["failed"]);
		expect(running(at.pids()[0] ?? 0)).toBe(false);
	});

	test("keep asking a server that refused one question", async () => {
		const at = withFile();
		const session = openLanguageServers({
			servers: at.table("refuse-definition"),
			signal: new AbortController().signal,
			timeouts: SHORT,
		});
		const question = { root: at.root, file: "src/load.ts", line: 3 };
		expect(await session.definition({ ...question, symbol: "store.read" })).toEqual({
			status: "unasked",
		});
		expect(await session.definition({ ...question, symbol: "helper" })).toEqual({
			status: "unasked",
		});
		await session.close();
		expect(session.unavailable()).toEqual([]);
		expect(at.methods().filter((method) => method === "textDocument/definition")).toHaveLength(2);
	});

	test("kill a server that does not exit when asked", async () => {
		const at = withFile();
		const session = openLanguageServers({
			servers: at.table("deaf"),
			signal: new AbortController().signal,
			timeouts: SHORT,
		});
		await session.definition({ root: at.root, file: "src/load.ts", line: 3, symbol: "helper" });
		expect(running(at.pids()[0] ?? 0)).toBe(true);
		await session.close();
		expect(running(at.pids()[0] ?? 0)).toBe(false);
	});

	test("on a cancelled pass, stop waiting, say nothing failed, and kill every server at once", async () => {
		const at = withFile();
		const controller = new AbortController();
		const timeouts = { startMs: 2000, requestMs: 10_000, stopMs: 10_000 };
		const servers = at.table("hang-definition,deaf");
		const session = openLanguageServers({ servers, signal: controller.signal, timeouts });
		const asked = session.definition({
			root: at.root,
			file: "src/load.ts",
			line: 3,
			symbol: "helper",
		});
		while (!at.methods().includes("textDocument/definition")) await Bun.sleep(5);
		const started = performance.now();
		controller.abort();
		expect(await asked).toEqual({ status: "unasked" });
		await session.close();
		expect(performance.now() - started).toBeLessThan(timeouts.stopMs);
		expect(session.unavailable()).toEqual([]);
		expect(running(at.pids()[0] ?? 0)).toBe(false);
	});

	test("start no server for a question that was still looking at its project when the session closed", async () => {
		// Python's row looks for the checkout's virtual environment before a start.
		current = workspace({ "src/app.py": "def pay():\n    return post(1)\n" });
		const session = openLanguageServers({
			servers: current.table("normal", "python"),
			signal: new AbortController().signal,
			timeouts: SHORT,
		});
		const asked = session.definition({
			root: current.root,
			file: "src/app.py",
			line: 2,
			symbol: "post",
		});
		await session.close();
		expect(await asked).toEqual({ status: "unasked" });
		expect(current.pids()).toEqual([]);
	});
});
