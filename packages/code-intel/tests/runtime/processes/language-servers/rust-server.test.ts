// rust-analyzer for Rust (TASK-540): the server starts in the Cargo workspace
// that holds a file, so one server answers for every member, opens the file,
// and is asked only once its cache priming has ended, which it begins once it
// has loaded the workspace. A file no `Cargo.toml` holds is said once and
// starts nothing. A stand-in that primes as rust-analyzer does owns the
// lifecycle; where rust-analyzer runs, the real server answers a call across
// the crates of the fixture workspace.

import { afterEach, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openLanguageServers } from "#runtime/services/language-servers/session.ts";
import { FIXTURES } from "#tests/runtime/support/code-facts/checkout.ts";
import {
	running,
	workspace,
	type Workspace,
} from "#tests/runtime/support/language-servers/fixture.ts";

/** Short bounds, so a stand-in that fails costs the suite little. */
const STOP_MS = 300;

/** The use of `book` in the shop's checkout, which `ledger` defines as `post` on line 27 of `entry.rs`. */
const BOOK = { file: "crates/shop/src/checkout.rs", line: 6, symbol: "book" };

/** The real rust-analyzer, where one runs on this machine. */
const ANALYZER = (() => {
	const program = Bun.which("rust-analyzer");
	if (program === null) return undefined;
	const version = Bun.spawnSync([program, "--version"], { stdout: "ignore", stderr: "ignore" });
	return version.exitCode === 0 ? program : undefined;
})();

let current: Workspace | undefined;

afterEach(() => {
	for (const pid of current?.pids().filter(running) ?? []) process.kill(pid, "SIGKILL");
	current?.remove();
	current = undefined;
});

/**
 * The files of the fixture workspace `rust-shop`.
 * @returns Each file and its text.
 */
function rustShop(): Record<string, string> {
	const fixture = join(FIXTURES, "rust-shop");
	return Object.fromEntries(
		readdirSync(fixture, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => {
				const file = join(entry.parentPath, entry.name);
				return [file.slice(fixture.length + 1), readFileSync(file, "utf8")];
			}),
	);
}

test("rust-analyzer starts in the workspace that holds a member's file, and is asked once its cache priming ended", async () => {
	current = workspace(rustShop(), {
		[`${BOOK.file}:${BOOK.line}:book`]: {
			path: "crates/ledger/src/entry.rs",
			line: 27,
			character: 7,
		},
	});
	const session = openLanguageServers({
		servers: current.table("needs-open,primes", "rust"),
		signal: new AbortController().signal,
		stopMs: STOP_MS,
	});
	expect(await session.definition({ root: current.root, ...BOOK })).toEqual({
		status: "answered",
		locations: [{ path: join(current.root, "crates/ledger/src/entry.rs"), line: 27, character: 7 }],
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

test("a Rust file no Cargo.toml holds starts no server, and is said once", async () => {
	current = workspace({ "scripts/tool.rs": "fn main() {\n    helper();\n}\nfn helper() {}\n" });
	const session = openLanguageServers({
		servers: current.table("needs-open,primes", "rust"),
		signal: new AbortController().signal,
		stopMs: STOP_MS,
	});
	const asked = { root: current.root, file: "scripts/tool.rs", line: 2, symbol: "helper" };
	expect(await session.definition(asked)).toEqual({ status: "unasked" });
	await session.close();
	expect(session.unavailable().map((entry) => entry.reason)).toEqual(["unready"]);
	expect(current.starts()).toEqual([]);
});

test.skipIf(ANALYZER === undefined)(
	"the real rust-analyzer resolves a renamed import across the crates of a workspace to the function it names",
	async () => {
		current = workspace(rustShop());
		const program = ANALYZER ?? "";
		const session = openLanguageServers({
			servers: (language) =>
				language === "rust"
					? { status: "command", argv: [program] }
					: { status: "missing", detail: `no ${language} server` },
			signal: new AbortController().signal,
		});
		const answer = await session.definition({ root: current.root, ...BOOK });
		await session.close();
		// The answer and why none came, together, so a failure says which.
		expect({ answer, unavailable: session.unavailable() }).toEqual({
			answer: {
				status: "answered",
				locations: [
					{
						path: join(current.root, "crates/ledger/src/entry.rs"),
						line: 27,
						character: expect.any(Number),
					},
				],
			},
			unavailable: [],
		});
	},
	60_000,
);
