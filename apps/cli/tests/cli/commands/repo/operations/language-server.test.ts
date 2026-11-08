// `archboard repo language-server` from its arguments to the language server
// files (TASK-599): it writes the repository file of the working directory's
// checkout, registered or not, or of the chosen checkout that `--repo` names,
// writes the global file with `--global`, removes with `--remove`, keeps a
// path from the checkout root, refuses a path outside the checkout in the
// repository file, keeps every change of commands that run together, and shows
// both files without a language. Nothing here needs a server: the files are files.

import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { passServers } from "@archboard/workspace/checkouts";

const IDENTITY = "github.com/test/orders";
const cwd = process.cwd();
const reposFile = process.env["ARCHBOARD_REPOS"];
let scratch = "";
let checkout = "";
let repositoryFile = "";
let globalFile = "";
let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
	scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-repo-language-server-")));
	checkout = join(scratch, "orders");
	repositoryFile = join(checkout, ".archboard", "language-servers.json");
	globalFile = join(scratch, "state", "language-servers.json");
	process.env["ARCHBOARD_REPOS"] = join(scratch, "state", "repos.json");
	const done = Bun.spawnSync(["git", "init", "-q", checkout], {
		cwd: scratch,
		env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
	});
	if (done.exitCode !== 0) throw new Error(done.stderr.toString());
	Bun.spawnSync(["git", "remote", "add", "origin", `https://${IDENTITY}.git`], { cwd: checkout });
	mkdirSync(join(checkout, "src"));
	({ runCli } = await import("#cli/routing/operations/run.ts"));
});

beforeEach(() => {
	rmSync(join(checkout, ".archboard"), { recursive: true, force: true });
	rmSync(join(scratch, "state"), { recursive: true, force: true });
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
 * @returns Its stdout and its exit code.
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
 * The servers that a file names.
 * @param file The file.
 * @returns Them, or undefined when the file is not there.
 */
function named(file: string): unknown {
	return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

test("repo language-server writes the repository file of an unregistered checkout, keeps a path from the checkout root, and --remove empties it", async () => {
	const set = await run(join(checkout, "src"), [
		"repo",
		"language-server",
		"rust",
		"../scripts/rust-analyzer",
	]);
	expect(set.exited).toBe(0);
	expect(
		(await run(checkout, ["repo", "language-server", "c", "clangd", "--arg=--background-index"]))
			.exited,
	).toBe(0);
	const servers = {
		c: { command: "clangd", args: ["--background-index"] },
		rust: { command: "./scripts/rust-analyzer" },
	};
	expect(named(repositoryFile)).toEqual(servers);
	const shown = await run(join(checkout, "src"), ["repo", "language-server"]);
	expect(shown.exited).toBe(0);
	expect(JSON.parse(shown.stdout)).toMatchObject({
		repo: IDENTITY,
		repository: { file: repositoryFile, servers: { c: servers.c, rust: { args: [] } } },
		global: { file: globalFile, servers: {} },
	});
	await run(checkout, ["repo", "language-server", "c", "--remove"]);
	await run(checkout, ["repo", "language-server", "rust", "--remove"]);
	expect(existsSync(repositoryFile)).toBe(false);
});

test("--repo writes the file of the repository's chosen checkout, and --global writes the file of this machine with an absolute path", async () => {
	expect((await run(checkout, ["repo", "add", "."])).exited).toBe(0);
	expect(
		(await run(scratch, ["repo", "language-server", "go", "gopls", "--repo", IDENTITY])).exited,
	).toBe(0);
	expect(named(repositoryFile)).toEqual({ go: { command: "gopls" } });
	expect(
		(await run(checkout, ["repo", "language-server", "python", "bin/pyright", "--global"])).exited,
	).toBe(0);
	expect(named(globalFile)).toEqual({ python: { command: join(checkout, "bin", "pyright") } });
	expect(named(repositoryFile)).toEqual({ go: { command: "gopls" } });
});

test("a wrapper in the checkout root stays a path instead of a PATH name", async () => {
	const set = await run(checkout, ["repo", "language-server", "rust", "./rust-server"]);
	expect(set.exited).toBe(0);
	expect(passServers()(checkout, "rust")).toMatchObject({
		command: join(checkout, "rust-server"),
	});
});

test.each([
	["a command without a language", ["repo", "language-server", "--remove"]],
	["no command and no --remove", ["repo", "language-server", "c"]],
	["a command with --remove", ["repo", "language-server", "c", "clangd", "--remove"]],
	[
		"--global with --repo",
		["repo", "language-server", "c", "clangd", "--global", "--repo", IDENTITY],
	],
	["a language that has no server", ["repo", "language-server", "cobol", "cobol-lsp"]],
	[
		"an absolute path outside the checkout",
		["repo", "language-server", "rust", "/usr/bin/rust-analyzer"],
	],
	[
		"a relative path outside the checkout",
		["repo", "language-server", "rust", "../bin/rust-analyzer"],
	],
])("repo language-server refuses %s with a usage error and writes nothing", async (_, argv) => {
	expect((await run(checkout, argv)).exited).toBe(2);
	expect(existsSync(repositoryFile)).toBe(false);
	expect(existsSync(globalFile)).toBe(false);
});

test("repo language-server needs a checkout for the repository file, and never overwrites a file that it cannot read", async () => {
	const outside = join(scratch, "outside");
	mkdirSync(outside, { recursive: true });
	expect((await run(outside, ["repo", "language-server", "c", "clangd"])).exited).toBe(2);
	expect((await run(outside, ["repo", "language-server", "c", "clangd", "--global"])).exited).toBe(
		0,
	);
	mkdirSync(join(checkout, ".archboard"));
	writeFileSync(repositoryFile, "{");
	expect((await run(checkout, ["repo", "language-server", "c", "clangd"])).exited).toBe(1);
	expect(readFileSync(repositoryFile, "utf8")).toBe("{");
});

test("repo language-server commands that run together keep every change", async () => {
	const cli = join(import.meta.dir, "..", "..", "..", "..", "..", "src", "bin.ts");
	const servers = { c: "clangd", go: "gopls", rust: "rust-analyzer", swift: "sourcekit-lsp" };
	const exits = await Promise.all(
		Object.entries(servers).map(
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
	expect(named(repositoryFile)).toEqual(
		Object.fromEntries(
			Object.entries(servers).map(([language, command]) => [language, { command }]),
		),
	);
});
