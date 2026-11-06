// gopls for Go (TASK-575): the server starts in the `go.work` that holds a
// file, so one server answers for every module the workspace uses, and opens
// the file before it asks. A file no `go.mod` holds is said once and starts
// nothing. A stand-in owns the lifecycle; where gopls runs, as in the dev
// shell, the real server answers a method call through a value across the
// modules of the fixture workspace.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openLanguageServers } from "#runtime/language-servers/services/session.ts";
import { FIXTURES } from "#tests/runtime/support/code-facts/checkout.ts";
import {
	running,
	workspace,
	type Workspace,
} from "#tests/runtime/support/language-servers/fixture.ts";

/** Short bounds, so a stand-in that fails costs the suite little. */
const STOP_MS = 300;

/** The shop's call of `Post` through a value, which the ledger defines on line 18 of `ledger.go`. */
const POST = { file: "shop/main.go", line: 14, symbol: "book.Post" };

/** The real gopls, where one runs on this machine. */
const GOPLS = (() => {
	const program = Bun.which("gopls");
	if (program === null || Bun.which("go") === null) return undefined;
	const version = Bun.spawnSync([program, "version"], { stdout: "ignore", stderr: "ignore" });
	return version.exitCode === 0 ? program : undefined;
})();

let current: Workspace | undefined;
let active: ReturnType<typeof openLanguageServers> | undefined;
let controller = new AbortController();

beforeEach(() => {
	controller = new AbortController();
});
afterEach(async () => {
	controller.abort();
	await active?.close();
	active = undefined;
	for (const pid of current?.pids().filter(running) ?? []) process.kill(pid, "SIGKILL");
	current?.remove();
	current = undefined;
});

/**
 * The files of the fixture workspace `go-shop`.
 * @returns Each file and its text.
 */
function goShop(): Record<string, string> {
	const fixture = join(FIXTURES, "go-shop");
	return Object.fromEntries(
		readdirSync(fixture, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => {
				const file = join(entry.parentPath, entry.name);
				return [file.slice(fixture.length + 1), readFileSync(file, "utf8")];
			}),
	);
}

test("gopls starts in the go.work that holds a module's file, and opens the file before it asks", async () => {
	current = workspace(goShop(), {
		[`${POST.file}:${POST.line}:Post`]: { path: "ledger/ledger.go", line: 18, character: 17 },
	});
	const session = (active = openLanguageServers({
		servers: current.table("needs-open", "go"),
		signal: controller.signal,
		stopMs: STOP_MS,
	}));
	expect(await session.definition({ root: current.root, ...POST })).toEqual({
		status: "answered",
		locations: [{ path: join(current.root, "ledger/ledger.go"), line: 18, character: 17 }],
	});
	await session.close();
	expect(session.unavailable()).toEqual([]);
	expect(current.starts()).toEqual([{ cwd: current.root, options: null }]);
	expect(
		current
			.methods()
			.filter((method) => method !== "answer")
			.slice(0, 4),
	).toEqual(["initialize", "initialized", "textDocument/didOpen", "textDocument/definition"]);
});

test("a module with no go.work starts the server in the module, and a Go file no go.mod holds starts none and is said once", async () => {
	current = workspace({
		"service/go.mod": "module example.com/service\n\ngo 1.22\n",
		"service/main.go": "package main\n\nfunc main() {\n\thelper()\n}\n\nfunc helper() {}\n",
		"scripts/tool.go": "package main\n\nfunc main() {\n\thelper()\n}\n\nfunc helper() {}\n",
	});
	const session = (active = openLanguageServers({
		servers: current.table("needs-open", "go"),
		signal: controller.signal,
		stopMs: STOP_MS,
	}));
	const asked = { root: current.root, line: 4, symbol: "helper" };
	expect(await session.definition({ ...asked, file: "scripts/tool.go" })).toEqual({
		status: "unasked",
	});
	await session.definition({ ...asked, file: "service/main.go" });
	await session.close();
	expect(session.unavailable().map((entry) => entry.reason)).toEqual(["unready"]);
	expect(current.starts()).toEqual([{ cwd: join(current.root, "service"), options: null }]);
});

test.skipIf(GOPLS === undefined)(
	"the real gopls resolves a method called through a value across the modules of a workspace",
	async () => {
		current = workspace(goShop());
		const program = GOPLS ?? "";
		const session = (active = openLanguageServers({
			servers: (language) =>
				language === "go"
					? { status: "command", argv: [program] }
					: { status: "missing", detail: `no ${language} server` },
			signal: controller.signal,
		}));
		const answer = await session.definition({ root: current.root, ...POST });
		await session.close();
		// The answer and why none came, together, so a failure says which.
		expect({ answer, unavailable: session.unavailable() }).toEqual({
			answer: {
				status: "answered",
				locations: [
					{ path: join(current.root, "ledger/ledger.go"), line: 18, character: expect.any(Number) },
				],
			},
			unavailable: [],
		});
	},
	60_000,
);
