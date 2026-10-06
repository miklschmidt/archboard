// pyright for Python and csharp-ls for C# (TASK-367.14), against the stand-in
// server: each answers in the checkout once it is told what it needs to read
// it, the Python environment or the .NET solution, and a .NET checkout with
// nothing to load is said once and starts nothing. Which program each
// language runs by default comes from `language-servers.json` and the `PATH`.

import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLanguageServers } from "@/runtime/language-servers/index";
import { workspace, type Workspace } from "@/runtime/language-servers/tests/fixture";

/** Short bounds, so a stand-in that fails costs the suite little. */
const SHORT = { startMs: 2000, requestMs: 1000, stopMs: 300 } as const;

/** A virtual environment as `python -m venv` makes it; the stand-in never runs its interpreter. */
const VENV = { ".venv/pyvenv.cfg": "home = /usr/bin\n", ".venv/bin/python": "" };

/** A Python file that calls a function of another module. */
const PYTHON = {
	"src/shop/app.py": "from shop.ledger import post\n\ndef pay():\n    return post(1)\n",
	"src/shop/ledger.py": "def post(amount):\n    return amount\n",
};

/** A C# file that calls a method of a class another file declares. */
const CSHARP = {
	"src/Shop/Checkout.cs":
		"class Checkout {\n  void Pay(Ledger ledger) {\n    ledger.Post(1);\n  }\n}\n",
	"src/Shop/Ledger.cs": "class Ledger {\n  public void Post(int amount) {}\n}\n",
	"src/Shop/Shop.csproj": '<Project Sdk="Microsoft.NET.Sdk" />\n',
};

/**
 * A range on one line, as the protocol spells it.
 * @param line The line, from 0.
 * @param from Its first column.
 * @param to Its last column.
 * @returns The range.
 */
function on(line: number, from: number, to: number) {
	return { start: { line, character: from }, end: { line, character: to } };
}

let current: Workspace | undefined;

afterEach(() => {
	current?.remove();
	current = undefined;
});

/**
 * A workspace whose checkout is a Git repository with its files committed.
 * @param files Each file of the checkout and its text.
 * @param answers The stand-in's answers.
 * @param ignored What the checkout's `.gitignore` ignores, written after the commit.
 * @returns The workspace.
 */
function committed(
	files: Readonly<Record<string, string>>,
	answers: Readonly<Record<string, unknown>>,
	ignored: readonly string[] = [],
): Workspace {
	current = workspace(files, answers);
	const root = current.root;
	/**
	 * Run Git in the checkout, with no configuration of this machine.
	 * @param args Its arguments.
	 */
	const git = (...args: string[]): void => {
		const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
		const run = Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
			cwd: root,
			env,
		});
		if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
	};
	git("init", "-q");
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the checkout");
	if (ignored.length > 0) writeFileSync(join(root, ".gitignore"), `${ignored.join("\n")}\n`);
	return current;
}

/**
 * Write files into a checkout after its commit, as this machine makes them.
 * @param at The workspace.
 * @param files Each file and its text.
 */
function place(at: Workspace, files: Readonly<Record<string, string>>): void {
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(join(at.root, file, ".."), { recursive: true });
		writeFileSync(join(at.root, file), text);
	}
}

/**
 * Ask the stand-in, as the server of a language, where a use is defined, and close the session.
 * @param at The workspace.
 * @param language The language it stands in for.
 * @param question The file, line and spelling of the use.
 * @param question.file The file.
 * @param question.line The line.
 * @param question.symbol The spelling.
 * @returns The answer, and what the session could not ask.
 */
async function ask(
	at: Workspace,
	language: "python" | "csharp",
	question: { file: string; line: number; symbol: string },
) {
	const session = openLanguageServers({
		servers: at.table(language === "python" ? "needs-open" : "normal", language),
		signal: new AbortController().signal,
		timeouts: SHORT,
	});
	const answer = await session.definition({ root: at.root, ...question });
	await session.close();
	return { answer, unavailable: session.unavailable() };
}

describe("pyright", () => {
	const use = { file: "src/shop/app.py", line: 4, symbol: "post" };
	const answers = { "src/shop/app.py:4:post": { path: "src/shop/ledger.py", line: 1 } };

	test("is told the interpreter of the checkout's own virtual environment, and answers about a file it opened", async () => {
		const at = committed(PYTHON, answers, [".venv/"]);
		place(at, VENV);
		expect(await ask(at, "python", use)).toEqual({
			answer: {
				status: "answered",
				locations: [{ path: join(at.root, "src/shop/ledger.py"), line: 1, character: 0 }],
			},
			unavailable: [],
		});
		expect(at.configurations()).toEqual([
			[{ pythonPath: join(at.root, ".venv/bin/python") }, null],
		]);
	});

	test("names code that runs where its outline declares a function whose parameters share its line", async () => {
		// pyright lists the parameters of a function under it, on the line of its name.
		const post = {
			kind: 12,
			range: { start: { line: 0, character: 0 }, end: { line: 1, character: 17 } },
			selectionRange: on(0, 4, 8),
			children: [{ kind: 13, range: on(0, 9, 15), selectionRange: on(0, 9, 15) }],
		};
		const at = committed(PYTHON, {
			"src/shop/app.py:4:post": { path: "src/shop/ledger.py", line: 1, character: 4 },
			"outline:src/shop/ledger.py": [post],
		});
		const session = openLanguageServers({
			servers: at.table("needs-open", "python"),
			signal: new AbortController().signal,
			timeouts: SHORT,
		});
		const answer = await session.definition({ root: at.root, ...use });
		const [location] = answer.status === "answered" ? answer.locations : [];
		expect(location && (await session.declaration(at.root, location))).toBe("code");
		await session.close();
	});

	test("is told no interpreter in a checkout that has none", async () => {
		const none = committed(PYTHON, answers);
		expect((await ask(none, "python", use)).answer.status).toBe("answered");
		expect(none.configurations()).toEqual([[null, null]]);
	});

	test("starts nowhere a checkout ships the interpreter of its .venv, also through a link or in another case, and says so once", async () => {
		// basedpyright runs .venv/bin/python by itself when it is told no interpreter.
		const shipping = [
			() => committed({ ...PYTHON, ...VENV }, answers),
			() => {
				const at = committed({ ...PYTHON, "tools/env/bin/python": "" }, answers, [".venv"]);
				symlinkSync("tools/env", join(at.root, ".venv"));
				return at;
			},
			// On a disk that ignores case, .VENV and .venv are one directory.
			() => {
				const at = committed({ ...PYTHON, ".VENV/bin/python": "" }, answers, [".venv/"]);
				place(at, VENV);
				return at;
			},
		];
		for (const checkout of shipping) {
			const at = checkout();
			expect(await ask(at, "python", use)).toEqual({
				answer: { status: "unasked" },
				unavailable: [
					{ language: "python", reason: "unready", root: at.root, detail: expect.any(String) },
				],
			});
			expect(at.pids()).toEqual([]);
			at.remove();
		}
	});
});

describe("csharp-ls", () => {
	const use = { file: "src/Shop/Checkout.cs", line: 3, symbol: "ledger.Post" };
	const answers = { "src/Shop/Checkout.cs:3:Post": { path: "src/Shop/Ledger.cs", line: 2 } };

	test("is told to load the solution nearest the checkout's root", async () => {
		const at = committed(
			{ ...CSHARP, "Shop.sln": "", "src/Shop/Shop.sln": "", "tools/Build.sln": "" },
			answers,
		);
		expect(await ask(at, "csharp", use)).toEqual({
			answer: {
				status: "answered",
				locations: [{ path: join(at.root, "src/Shop/Ledger.cs"), line: 2, character: 0 }],
			},
			unavailable: [],
		});
		expect(at.configurations()).toEqual([
			[null, { solutionPathOverride: join(at.root, "Shop.sln") }],
		]);
	});

	test("loads the project files itself in a checkout with no solution", async () => {
		const at = committed(CSHARP, answers);
		expect((await ask(at, "csharp", use)).answer.status).toBe("answered");
		expect(at.configurations()).toEqual([[null, null]]);
	});

	test("does not start, and is said once, in a checkout with nothing to load", async () => {
		const { "src/Shop/Shop.csproj": _project, ...code } = CSHARP;
		const at = committed(code, answers);
		const session = openLanguageServers({
			servers: at.table("normal", "csharp"),
			signal: new AbortController().signal,
			timeouts: SHORT,
		});
		const unasked = { status: "unasked" } as const;
		expect(await session.definition({ root: at.root, ...use })).toEqual(unasked);
		expect(await session.definition({ root: at.root, ...use, line: 2, symbol: "Ledger" })).toEqual(
			unasked,
		);
		await session.close();
		expect(session.unavailable()).toEqual([
			{ language: "csharp", reason: "unready", root: at.root, detail: expect.any(String) },
		]);
		expect(at.pids()).toEqual([]);
	});
});

describe("the default servers", () => {
	const directories: string[] = [];
	let directory = "";
	afterEach(() => {
		for (const each of directories.splice(0)) rmSync(each, { recursive: true, force: true });
	});

	/**
	 * The server of each language with no `language-servers.json`, read by a
	 * process whose `PATH` holds only these programs: a process looks the
	 * `PATH` up as it started.
	 * @param programs The programs.
	 * @returns The table, by language.
	 */
	const withPrograms = (...programs: string[]): Record<string, unknown> => {
		directory = mkdtempSync(join(tmpdir(), "archboard-language-server-path-"));
		directories.push(directory);
		for (const program of programs) {
			writeFileSync(join(directory, program), "#!/bin/sh\n");
			chmodSync(join(directory, program), 0o755);
		}
		const read = [
			'import { readLanguageServers } from "@/runtime/language-servers/index";',
			`const table = readLanguageServers(${JSON.stringify(join(directory, "none.json"))});`,
			"console.log(JSON.stringify(Object.fromEntries(table)));",
		].join("\n");
		const run = Bun.spawnSync([process.execPath, "-e", read], {
			cwd: join(import.meta.dir, "..", "..", "..", ".."),
			env: { PATH: directory },
		});
		return JSON.parse(run.stdout.toString()) as Record<string, unknown>;
	};

	test("run pyright for Python, or basedpyright where only it is installed, and nothing without either", () => {
		expect(withPrograms("pyright-langserver", "basedpyright-langserver")["python"]).toEqual({
			status: "command",
			argv: [join(directory, "pyright-langserver"), "--stdio"],
		});
		expect(withPrograms("basedpyright-langserver")["python"]).toEqual({
			status: "command",
			argv: [join(directory, "basedpyright-langserver"), "--stdio"],
		});
		expect(withPrograms()["python"]).toMatchObject({ status: "missing" });
	});

	test("run clangd for C, C++ and Objective-C from the PATH, and nothing without it", () => {
		expect(withPrograms("clangd")["c"]).toEqual({
			status: "command",
			argv: [join(directory, "clangd")],
		});
		expect(withPrograms()["c"]).toMatchObject({ status: "missing" });
	});

	test("run no C# server without an entry, even where csharp-ls is installed", () => {
		expect(withPrograms("csharp-ls")["csharp"]).toMatchObject({ status: "missing" });
	});
});
