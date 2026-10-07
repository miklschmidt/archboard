// `archboard repo language-server` from its arguments to the registry file
// (TASK-433): it sets or removes the server of one language for the working
// directory's registered checkout or the one `--repo` names, `repo list` shows
// it, registering the same checkout again keeps it and `repo forget` removes
// it with the checkout. Nothing here needs a server: the registry is a file.

import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const IDENTITY = "github.com/test/orders";
const cwd = process.cwd();
const reposFile = process.env["ARCHBOARD_REPOS"];
let scratch = "";
let checkout = "";
let registry = "";
let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
	scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-repo-language-server-")));
	checkout = join(scratch, "orders");
	registry = join(scratch, "repos.json");
	process.env["ARCHBOARD_REPOS"] = registry;
	const git = (...args: string[]) => {
		const done = Bun.spawnSync(["git", ...args], {
			cwd: scratch,
			env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
		});
		if (done.exitCode !== 0) throw new Error(done.stderr.toString());
	};
	git("init", "-q", checkout);
	Bun.spawnSync(["git", "remote", "add", "origin", `https://${IDENTITY}.git`], { cwd: checkout });
	({ runCli } = await import("@/cli/commands/run"));
});

afterAll(() => {
	process.chdir(cwd);
	if (reposFile === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = reposFile;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Run the CLI in a directory and capture what it wrote and how it exited.
 * @param directory Where it runs.
 * @param argv The arguments.
 * @returns Its stdout parsed as JSON where it is, and its exit code.
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
 * The servers `repo list` shows for the checkout.
 * @returns Them, or undefined when it shows none.
 */
async function listed(): Promise<unknown> {
	const { stdout } = await run(scratch, ["repo", "list"]);
	const parsed = JSON.parse(stdout) as { repos: { repo: string; servers?: unknown }[] };
	return parsed.repos.find((entry) => entry.repo === IDENTITY)?.servers;
}

test("repo language-server sets the server of a language for the working directory's registered checkout, repo list shows it, and registering the checkout again keeps it", async () => {
	const added = await run(checkout, ["repo", "add", "."]);
	expect(added.exited).toBe(0);
	expect(JSON.parse(added.stdout)).toMatchObject({ repo: IDENTITY, source: "declared" });
	const set = await run(checkout, [
		"repo",
		"language-server",
		"c",
		"clangd",
		"--arg=--background-index",
	]);
	expect(set.exited).toBe(0);
	const servers = { c: { command: "clangd", args: ["--background-index"] } };
	expect(JSON.parse(set.stdout)).toMatchObject({ repo: IDENTITY, language: "c", servers });
	expect(await listed()).toEqual(servers);
	await run(checkout, ["repo", "add", "."]);
	expect(await listed()).toEqual(servers);
	await run(scratch, [
		"repo",
		"language-server",
		"python",
		"pyright-langserver",
		"--repo",
		IDENTITY,
	]);
	expect(Object.keys((await listed()) as object).toSorted()).toEqual(["c", "python"]);
	await run(checkout, ["repo", "language-server", "c", "--remove"]);
	expect(Object.keys((await listed()) as object)).toEqual(["python"]);
});

test("repo forget removes the servers with the checkout", async () => {
	await run(scratch, ["repo", "forget", IDENTITY]);
	await run(checkout, ["repo", "add", "."]);
	expect(await listed()).toBeUndefined();
});

test.each([
	["a checkout that is not registered", ["repo", "language-server", "c", "clangd"], "unregistered"],
	["a registry that is not valid", ["repo", "language-server", "c", "clangd"], "invalid"],
	["no command and no --remove", ["repo", "language-server", "c"], "registered"],
	["a relative command", ["repo", "language-server", "c", "./bin/clangd"], "registered"],
	[
		"a language that has no configurable server",
		["repo", "language-server", "typescript", "tsc"],
		"registered",
	],
])(
	"repo language-server refuses %s with a usage error and changes nothing",
	async (_, argv, state) => {
		await run(scratch, ["repo", "forget", IDENTITY]);
		if (state === "registered") await run(checkout, ["repo", "add", "."]);
		if (state === "invalid") writeFileSync(registry, "{");
		const before = readFileSync(registry, "utf8");
		const refused = await run(checkout, argv);
		expect(refused.exited).toBe(2);
		expect(readFileSync(registry, "utf8")).toBe(before);
	},
);

test("a registration from before servers existed, and one that was observed, takes a server and stays what it was", async () => {
	const stored = { repo: IDENTITY, root: checkout, source: "observed", addedAt: "2026-10-01" };
	writeFileSync(registry, JSON.stringify({ repos: [stored] }));
	const before = readFileSync(registry, "utf8");
	const listedLegacy = await run(scratch, ["repo", "list"]);
	expect(listedLegacy.exited).toBe(0);
	expect(JSON.parse(listedLegacy.stdout)).toMatchObject({ repos: [{ ...stored, exists: true }] });
	expect(readFileSync(registry, "utf8")).toBe(before);
	expect((await run(checkout, ["repo", "language-server", "c", "clangd"])).exited).toBe(0);
	expect(await listed()).toEqual({ c: { command: "clangd", args: [] } });
	const [kept] = JSON.parse(readFileSync(registry, "utf8")) as { source: string }[];
	expect(kept?.source).toBe("observed");
});

test("repo commands that run together keep every change", async () => {
	await run(scratch, ["repo", "forget", IDENTITY]);
	await run(checkout, ["repo", "add", "."]);
	const cli = join(import.meta.dir, "..", "..", "..", "bin.ts");
	const commands = {
		python: "pyright-langserver",
		csharp: "csharp-ls",
		swift: "sourcekit-lsp",
		c: "clangd",
	};
	const exits = await Promise.all(
		Object.entries(commands).map(
			([language, command]) =>
				Bun.spawn([process.execPath, cli, "repo", "language-server", language, command], {
					cwd: checkout,
					env: { ...process.env },
					stdout: "ignore",
					stderr: "ignore",
				}).exited,
		),
	);
	expect(exits).toEqual([0, 0, 0, 0]);
	expect(await listed()).toEqual(
		Object.fromEntries(
			Object.entries(commands).map(([language, command]) => [language, { command, args: [] }]),
		),
	);
});

test("repo language-server takes the lock that a process that died left behind", async () => {
	await run(checkout, ["repo", "add", "."]);
	const lock = `${registry}.lock`;
	mkdirSync(lock);
	const longAgo = new Date(Date.now() - 60_000);
	utimesSync(lock, longAgo, longAgo);
	expect((await run(checkout, ["repo", "language-server", "c", "clangd"])).exited).toBe(0);
	expect(existsSync(lock)).toBe(false);
});

test.skipIf(process.getuid?.() === 0)(
	"repo language-server exits 1 and leaves the registry as it was when it cannot write it",
	async () => {
		const readOnly = join(scratch, "read-only");
		const file = join(readOnly, "repos.json");
		mkdirSync(readOnly);
		const stored = [{ repo: IDENTITY, root: checkout, source: "declared", addedAt: "2026-10-01" }];
		writeFileSync(file, JSON.stringify(stored));
		process.env["ARCHBOARD_REPOS"] = file;
		chmodSync(readOnly, 0o500);
		try {
			expect((await run(checkout, ["repo", "language-server", "c", "clangd"])).exited).toBe(1);
			expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(stored);
		} finally {
			chmodSync(readOnly, 0o700);
			process.env["ARCHBOARD_REPOS"] = registry;
		}
	},
);
