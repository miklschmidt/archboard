// The language server files (ADR 0046, TASK-599): a checkout's
// `.archboard/language-servers.json` names its servers, the global file beside
// the registry fills each language that it leaves out, a relative command in
// the repository file is a path from the checkout root, and a file that cannot
// be read decides every language that it could name.

import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
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
import { passServers, setServer } from "#runtime/store/language-servers.ts";

const caller = process.env["ARCHBOARD_REPOS"];
let scratch = "";
let root = "";
let repositoryFile = "";
let globalFile = "";

beforeAll(() => {
	scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-language-server-files-")));
	root = join(scratch, "checkout");
	repositoryFile = join(root, ".archboard", "language-servers.json");
	globalFile = join(scratch, "state", "language-servers.json");
	process.env["ARCHBOARD_REPOS"] = join(scratch, "state", "repos.json");
});

beforeEach(() => {
	rmSync(root, { recursive: true, force: true });
	rmSync(join(scratch, "state"), { recursive: true, force: true });
	mkdirSync(join(root, ".archboard"), { recursive: true });
	mkdirSync(join(scratch, "state"), { recursive: true });
});

afterAll(() => {
	if (caller === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller;
	rmSync(scratch, { recursive: true, force: true });
});

test("the repository file wins for each language it names, the global file fills the rest, and a relative command is a path from the checkout root", () => {
	writeFileSync(
		repositoryFile,
		JSON.stringify({ rust: { command: "scripts/rust-analyzer" }, c: { command: "clangd" } }),
	);
	writeFileSync(
		globalFile,
		JSON.stringify({ c: { command: "/opt/clangd" }, go: { command: "gopls", args: ["serve"] } }),
	);
	const servers = passServers();
	expect(servers(root, "rust")).toEqual({
		command: join(root, "scripts", "rust-analyzer"),
		args: [],
		file: repositoryFile,
	});
	expect(servers(root, "c")).toEqual({ command: "clangd", args: [], file: repositoryFile });
	expect(servers(root, "go")).toEqual({ command: "gopls", args: ["serve"], file: globalFile });
	expect(servers(root, "python")).toBeUndefined();
	rmSync(repositoryFile);
	rmSync(globalFile);
	expect(passServers()(root, "c")).toBeUndefined();
});

test.each([
	["not JSON", "{"],
	["an unknown language", JSON.stringify({ cobol: { command: "cobol-lsp" } })],
	["an unknown field", JSON.stringify({ c: { command: "clangd", env: {} } })],
	["an empty command", JSON.stringify({ c: { command: "" } })],
	["an absolute path", JSON.stringify({ c: { command: "/opt/clangd" } })],
	["a path that leaves the checkout", JSON.stringify({ c: { command: "tools/../../clangd" } })],
])("a repository file with %s decides every language with its problem", (_, text) => {
	writeFileSync(repositoryFile, text);
	writeFileSync(globalFile, JSON.stringify({ go: { command: "gopls" } }));
	const servers = passServers();
	for (const language of ["c", "go", "typescript"] as const) {
		expect(servers(root, language)).toEqual({ problem: expect.stringContaining(repositoryFile) });
	}
});

test("a global file that cannot be read decides each language that the repository file leaves out, and a relative command is one it cannot hold", () => {
	writeFileSync(repositoryFile, JSON.stringify({ c: { command: "clangd" } }));
	writeFileSync(globalFile, JSON.stringify({ go: { command: "bin/gopls" } }));
	const servers = passServers();
	expect(servers(root, "c")).toMatchObject({ command: "clangd" });
	expect(servers(root, "go")).toEqual({ problem: expect.stringContaining(globalFile) });
});

test("setting a server keeps the file in language order without empty arguments, removing the last one deletes the file, and a file that cannot be read is never overwritten", () => {
	rmSync(join(root, ".archboard"), { recursive: true });
	setServer("repository", "rust", { command: "scripts/rust-analyzer", args: [] }, root);
	const written = setServer(
		"repository",
		"python",
		{ command: "pyright-langserver", args: ["--stdio"] },
		root,
	);
	expect(written.file).toBe(repositoryFile);
	expect(readFileSync(repositoryFile, "utf8")).toBe(
		`${JSON.stringify(
			{
				python: { command: "pyright-langserver", args: ["--stdio"] },
				rust: { command: "scripts/rust-analyzer" },
			},
			null,
			"\t",
		)}\n`,
	);
	setServer("repository", "python", undefined, root);
	setServer("repository", "rust", undefined, root);
	expect(existsSync(repositoryFile)).toBe(false);
	writeFileSync(globalFile, "{");
	expect(() => setServer("global", "c", { command: "clangd", args: [] })).toThrow(globalFile);
	expect(readFileSync(globalFile, "utf8")).toBe("{");
});
