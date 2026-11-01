// What `archboard repo language-server` writes and what the code check reads
// are one contract (ADR 0046, TASK-433). The command that a
// `language-server-missing` skip names, read by a shell, is one the CLI accepts
// for that checkout and language, even when the repository identity holds a
// space. A pass reads the registry file again, so a server that already runs sees
// a configuration that was written after it started. A configuration belongs to the
// checkout it was written for, and a stored command that is not a name or an
// absolute path never reaches a pass.

import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import type * as CodeCheck from "@archboard/code-intel/code-check-run";

/** A repository with no remote is named by its directory, here with a space. */
const IDENTITY = "my project";
const NEVER = "/nonexistent/clangd";
const cwd = process.cwd();
const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
let scratch = "";
let checkout = "";
let registry = "";
let vault = "";
let runCli: (argv: string[]) => Promise<void>;
let codeCheck: ReturnType<typeof CodeCheck.createCodeCheck>;

/**
 * Run Git with an owner's identity and no configuration of the machine.
 * @param directory Where it runs.
 * @param args Its arguments.
 */
function git(directory: string, ...args: string[]): void {
	const done = Bun.spawnSync(["git", ...args], {
		cwd: directory,
		env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
	});
	if (done.exitCode !== 0) throw new Error(done.stderr.toString());
}

/**
 * Write the registry as a person who edited the file would.
 * @param servers What the entry of the checkout holds.
 */
function writeRegistry(servers: unknown): void {
	const entry = {
		repo: IDENTITY,
		root: checkout,
		source: "declared",
		addedAt: "2026-10-07",
		servers,
	};
	writeFileSync(registry, JSON.stringify([entry]));
}

beforeAll(async () => {
	scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-language-server-configuration-")));
	checkout = join(scratch, "a", IDENTITY);
	registry = join(scratch, "repos.json");
	vault = join(scratch, "vault");
	process.env["ARCHBOARD_REPOS"] = registry;
	mkdirSync(join(checkout, "src"), { recursive: true });
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	git(checkout, "init", "-q");
	// `ledger.c` calls `audit_check` that `ledger.h` declares and `audit.c` defines: only a server can place the use.
	const files = {
		"src/ledger.h": "int audit_check(int amount);\n",
		"src/ledger.c":
			'#include "ledger.h"\nint post(int amount) {\n  return audit_check(amount);\n}\n',
		"src/audit.c": '#include "ledger.h"\nint audit_check(int amount) { return amount; }\n',
		"src/report.c": "int report(void) { return 0; }\n",
	};
	for (const [file, text] of Object.entries(files)) writeFileSync(join(checkout, file), text);
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop",
			name: "Shop",
			current: { id: "Built", name: "Built" },
		}),
	);
	for (const [id, path, order] of [
		["pL", "src/ledger.c", 10],
		["pR", "src/report.c", 20],
	] as const)
		writeFileSync(
			join(vault, `${id}.module.json`),
			JSON.stringify({
				schemaVersion: 1,
				id: `Shop#${id}`,
				name: id,
				kind: "module",
				order,
				binding: { repo: IDENTITY, path },
				outgoing:
					id === "pL"
						? [
								{
									id: "Shop#e1",
									order: 10,
									to: "Shop#pR",
									kind: "call",
									anchor: { repo: IDENTITY, path: "src/ledger.c", symbol: "audit_check" },
								},
							]
						: [],
			}),
		);
	codeCheck = (await import("@archboard/code-intel/code-check-run")).createCodeCheck();
	({ runCli } = await import("#cli/operations/invocation/run.ts"));
});

afterAll(() => {
	process.chdir(cwd);
	if (caller.ARCHBOARD_REPOS === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller.ARCHBOARD_REPOS;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Run the CLI in a directory.
 * @param directory Where it runs.
 * @param argv The arguments.
 * @returns What it wrote to stdout and how it exited.
 */
async function run(directory: string, argv: string[]) {
	process.chdir(directory);
	let stdout = "";
	const out = spyOn(process.stdout, "write").mockImplementation((chunk) => {
		stdout += String(chunk);
		return true;
	});
	const err = spyOn(process.stderr, "write").mockImplementation(() => true);
	process.exitCode = 0;
	try {
		await runCli(argv);
		return { stdout, exited: process.exitCode };
	} finally {
		out.mockRestore();
		err.mockRestore();
		process.exitCode = 0;
	}
}

/**
 * The servers `repo list` shows for a checkout.
 * @param root The checkout.
 * @returns Them, or undefined when it shows none.
 */
async function listed(root = checkout): Promise<unknown> {
	const { stdout } = await run(scratch, ["repo", "list"]);
	const parsed = JSON.parse(stdout) as { repos: { root: string; servers?: unknown }[] };
	return parsed.repos.find((entry) => entry.root === root)?.servers;
}

/**
 * The `language-server-missing` skips of one pass over the vault.
 * @returns Them.
 */
async function missingSkips() {
	const answer = await codeCheck.run({
		vault,
		variant: undefined,
		everyDraft: false,
		plans: [],
		signal: new AbortController().signal,
	});
	if (!("boards" in answer)) throw new Error(answer.error);
	return answer.skipped.filter((skip) => skip.reason === "language-server-missing");
}

test("the command a language-server-missing skip names is one the CLI accepts, and the next pass reads what it wrote", async () => {
	// A person edited the file: a relative command is no server, so it never reaches a pass.
	writeRegistry({ c: { command: "./clangd", args: [] } });
	expect(await listed()).toBeUndefined();
	const [skip, ...others] = await missingSkips();
	expect(others).toEqual([]);
	expect(skip?.repo).toBe(IDENTITY);
	const named = /`(archboard [^`]*)`/u.exec(skip?.detail ?? "")?.[1];
	expect(named).toContain("language-server c");
	// Read as a shell reads it, with the program the agent chose.
	const words = Bun.spawnSync(["sh", "-c", `printf '%s\\0' ${named?.replace("<command>", NEVER)}`])
		.stdout.toString()
		.split("\0")
		.slice(1, -1);
	expect((await run(scratch, words)).exited).toBe(0);
	expect(await listed()).toEqual({ c: { command: NEVER, args: [] } });
	// The same process asks again, as a server that started before the command ran.
	const [again, ...rest] = await missingSkips();
	expect(rest).toEqual([]);
	expect(again?.detail).toContain(NEVER);
});

test("a configuration belongs to the checkout it was written for", async () => {
	writeRegistry({ c: { command: NEVER, args: [] } });
	const other = join(scratch, "b", IDENTITY);
	mkdirSync(other, { recursive: true });
	git(other, "init", "-q");
	// The same repository, cloned twice: only the registered clone is configured.
	const refused = await run(other, ["repo", "language-server", "c", "--remove"]);
	expect(refused.exited).toBe(2);
	expect(await listed()).toEqual({ c: { command: NEVER, args: [] } });
	// A registration at another root is another place, where nobody configured a server,
	// and the checkout that was configured keeps its servers.
	await run(other, ["repo", "add", "."]);
	expect(await listed(other)).toBeUndefined();
	expect(await listed()).toEqual({ c: { command: NEVER, args: [] } });
});
