// Which command starts the server of a language in a checkout (TASK-433):
// a language with no configured server has none, a configured one runs
// exactly its command and arguments, and TypeScript runs the native `tsc` of the checkout's
// own TypeScript 7 or later, else Archboard's.

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
import { languageServerOf } from "@/runtime/language-servers/index";

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
function checkoutWith(version: string | undefined, native = true) {
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
		mkdirSync(join(root, "node_modules/typescript"), { recursive: true });
		writeFileSync(join(root, "node_modules/typescript/package.json"), JSON.stringify({ version }));
	}
	if (native) {
		mkdirSync(join(program, ".."), { recursive: true });
		writeFileSync(program, "#!/bin/sh\n");
		chmodSync(program, 0o755);
	}
	return { root, program };
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
	const own = checkoutWith("7.1.0");
	expect(languageServerOf("typescript", own.root, {})).toEqual({
		status: "command",
		argv: [own.program, "--lsp", "--stdio"],
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
