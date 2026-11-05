// Which command starts the server of a language in a checkout (TASK-433):
// a language with no configured server has none, a configured one runs
// exactly its command and arguments, and TypeScript runs a configured server, else the
// native `tsc` of the checkout's own TypeScript 7 or later, else
// typescript-language-server for the checkout's TypeScript before 7 (TASK-579.13),
// else Archboard's where Archboard has a TypeScript (a checkout, not a release).

import { afterEach, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	defaultTypescriptServer,
	languageServerOf,
} from "#runtime/operations/language-servers/server-command.ts";

const directories: string[] = [];

afterEach(() => {
	for (const each of directories.splice(0)) rmSync(each, { recursive: true, force: true });
});

/**
 * A checkout that installs a TypeScript package of one version, with a stand-in native program.
 * @param version The package's version, or undefined for no TypeScript.
 * @param native Whether the platform's native package is installed too.
 * @returns The checkout and the program a version 7 gives it.
 */
function checkoutWith(
	version: string | undefined,
	native = Number.parseInt(version ?? "7", 10) >= 7,
) {
	const root = mkdtempSync(join(tmpdir(), "archboard-typescript-choice-"));
	directories.push(root);
	const program = join(
		root,
		"node_modules/@typescript",
		`typescript-${process.platform}-${process.arch}`,
		"lib",
		process.platform === "win32" ? "tsc.exe" : "tsc",
	);
	if (version !== undefined) {
		mkdirSync(join(root, "node_modules/typescript/lib"), { recursive: true });
		writeFileSync(join(root, "node_modules/typescript/package.json"), JSON.stringify({ version }));
		writeFileSync(join(root, "node_modules/typescript/lib/tsserver.js"), "");
	}
	if (native) {
		mkdirSync(join(program, ".."), { recursive: true });
		writeFileSync(program, "#!/bin/sh\n");
		chmodSync(program, 0o755);
	}
	return { root, program };
}

/**
 * An executable stand-in for typescript-language-server in a directory.
 * @param directory The directory.
 * @returns The program.
 */
function wrapperIn(directory: string): string {
	mkdirSync(directory, { recursive: true });
	const program = join(directory, "typescript-language-server");
	writeFileSync(program, "#!/bin/sh\n");
	chmodSync(program, 0o755);
	return program;
}

/**
 * A directory of its own, removed after the test.
 * @returns The directory.
 */
function directory(): string {
	const made = mkdtempSync(join(tmpdir(), "archboard-typescript-choice-"));
	directories.push(made);
	return made;
}

/**
 * Run with a `PATH` that holds only a directory, then restore it.
 * @param path The directory.
 * @param run What to run.
 * @returns What it returns.
 */
function withPath<T>(path: string, run: () => T): T {
	const before = process.env["PATH"];
	process.env["PATH"] = path;
	try {
		return run();
	} finally {
		process.env["PATH"] = before;
	}
}

/**
 * A checkout of version 7 whose `typescript` package, or the native program
 * beside it, is a link to a place outside the checkout.
 * @param link What the link leaves the checkout from.
 * @returns The checkout.
 */
function checkoutLinkedOut(link: "package" | "program") {
	const elsewhere = checkoutWith("7.1.0");
	if (link === "package") {
		const root = mkdtempSync(join(tmpdir(), "archboard-typescript-choice-"));
		directories.push(root);
		mkdirSync(join(root, "node_modules"));
		symlinkSync(
			join(elsewhere.root, "node_modules/typescript"),
			join(root, "node_modules/typescript"),
		);
		return { root };
	}
	const own = checkoutWith("7.1.0");
	unlinkSync(own.program);
	symlinkSync(elsewhere.program, own.program);
	return own;
}

/**
 * The TypeScript command of a checkout.
 * @param root The checkout.
 * @returns Its program, or the reason it has none.
 */
function typescriptProgram(root: string): string {
	const server = languageServerOf("typescript", root, {});
	return server.status === "command" ? (server.argv[0] ?? "") : server.detail;
}

test("TypeScript runs the native tsc of the checkout's own TypeScript 7 or later, and otherwise Archboard's, also when a link leaves the checkout", () => {
	// No typescript-language-server on the PATH, so a TypeScript before 7 has no server of its own.
	withPath(directory(), () => {
		const own = checkoutWith("7.1.0");
		expect(languageServerOf("typescript", own.root, {})).toEqual({
			status: "command",
			argv: [own.program, "--lsp", "--stdio"],
			initializationOptions: { tsserver: { useSyntaxServer: "never" } },
			typescript: { version: "7.1.0", from: "checkout" },
		});
		const archboards = typescriptProgram(checkoutWith(undefined, false).root);
		for (const other of [
			checkoutWith("6.0.3"),
			checkoutWith("next"),
			checkoutWith("7.1.0", false),
			checkoutWith(undefined),
			checkoutLinkedOut("package"),
			checkoutLinkedOut("program"),
		]) {
			const chosen = typescriptProgram(other.root);
			expect(chosen).toBe(archboards);
			expect(chosen.startsWith(other.root)).toBe(false);
		}
	});
});

test("a configured TypeScript server wins over the checkout's own TypeScript 7", () => {
	const own = checkoutWith("7.1.0");
	expect(
		languageServerOf("typescript", own.root, { typescript: { command: "bun", args: ["--stdio"] } }),
	).toEqual({
		status: "command",
		argv: [Bun.which("bun") ?? "", "--stdio"],
		initializationOptions: { tsserver: { useSyntaxServer: "never" } },
	});
	expect(
		languageServerOf("typescript", own.root, {
			typescript: { command: "archboard-no-such-server", args: [] },
		}),
	).toMatchObject({ status: "missing" });
});

test("a release, which ships no TypeScript, runs the checkout's TypeScript 7 or reports the server missing", () => {
	withPath(directory(), () => {
		const own = checkoutWith("7.1.0");
		expect(defaultTypescriptServer(own.root, false)).toEqual({
			status: "command",
			argv: [own.program, "--lsp", "--stdio"],
			initializationOptions: { tsserver: { useSyntaxServer: "never" } },
			typescript: { version: "7.1.0", from: "checkout" },
		});
		for (const other of [
			checkoutWith("6.0.3"),
			checkoutWith(undefined),
			checkoutWith("7.1.0", false),
		]) {
			expect(defaultTypescriptServer(other.root, false).status).toBe("missing");
		}
	});
});

test("a checkout's TypeScript before 7 runs typescript-language-server from its node_modules, else from the PATH, on its own tsserver", () => {
	const elsewhere = wrapperIn(directory());
	const own = checkoutWith("5.9.3");
	const local = wrapperIn(join(own.root, "node_modules/.bin"));
	const tsserver = join(own.root, "node_modules/typescript/lib/tsserver.js");
	const expected = (wrapper: string) =>
		({
			status: "command",
			argv: [wrapper, "--stdio"],
			initializationOptions: {
				tsserver: { useSyntaxServer: "never", path: tsserver },
				disableAutomaticTypingAcquisition: true,
			},
			typescript: { version: "5.9.3", from: "checkout" },
		}) as const;
	withPath(join(elsewhere, ".."), () => {
		expect(defaultTypescriptServer(own.root, false)).toEqual(expected(local));
		unlinkSync(local);
		symlinkSync(elsewhere, local);
		// A link that leaves the checkout is no program of the checkout, so the PATH decides.
		expect(defaultTypescriptServer(own.root, false)).toEqual(expected(elsewhere));
	});
});

test("a checkout's TypeScript before 7 with no typescript-language-server falls back to Archboard's in a checkout and is missing in a release", () => {
	const own = checkoutWith("5.9.3");
	const empty = directory();
	withPath(empty, () => {
		expect(defaultTypescriptServer(own.root, false).status).toBe("missing");
		const fallback = defaultTypescriptServer(own.root, true);
		expect(fallback.status === "command" && fallback.typescript?.from).toBe("archboard");
		expect(fallback.status === "command" && fallback.initializationOptions).toEqual({
			tsserver: { useSyntaxServer: "never" },
		});
	});
});

test("a language with no configured server has none, and a configured one runs exactly its command and arguments", () => {
	for (const language of ["python", "csharp", "swift", "c"] as const) {
		expect(languageServerOf(language, "/checkout", {}).status).toBe("missing");
	}
	expect(
		languageServerOf("c", "/checkout", { c: { command: "bun", args: ["--background-index"] } }),
	).toEqual({ status: "command", argv: [Bun.which("bun") ?? "", "--background-index"] });
	expect(
		languageServerOf("c", "/checkout", { c: { command: "archboard-no-such-server", args: [] } }),
	).toMatchObject({ status: "missing" });
});
