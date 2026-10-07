// Which command starts the server of a language in a checkout (ADR 0046,
// TASK-433).
//
// A server that can run code of a checkout runs only where the agent that
// works in that repository configured it, as the server configuration of `repo
// language-server` on the checkout's registration, and then as an editor runs
// it: that command, those arguments, the user's environment. A bare command is
// looked up on the `PATH`; an absolute path names the program itself. A
// language with no configured server has no server, and the pass says so once for the
// checkout.
//
// TypeScript needs no configuration. Its server is the native `tsc --lsp`
// that TypeScript 7 ships in its `typescript` package, found in the checkout's
// own `node_modules/typescript` when that package is version 7 or later and
// holds the native program for this machine, and otherwise in Archboard's
// own. A TypeScript before 7 has no `--lsp`, so the check falls back to
// Archboard's. The rule reads the checkout's root only, so a monorepo whose
// packages install different versions uses the version installed at its root.

import fs from "node:fs";
import path from "node:path";
import type { Language } from "@/runtime/language-servers/lib/languages";
import type { LanguageServers } from "@/shared/language-servers/index";

/** The server one language uses in a checkout, or why it has none. */
type LanguageServer =
	| { readonly status: "command"; readonly argv: readonly [string, ...string[]] }
	| { readonly status: "missing"; readonly detail: string };

/** The first TypeScript that is a language server, with `tsc --lsp --stdio`. */
const FIRST_NATIVE_TYPESCRIPT = 7;

/**
 * Whether a path, with its links resolved, is inside a directory.
 * @param directory The directory, resolved.
 * @param file The path, resolved.
 * @returns True when it is.
 */
function isInside(directory: string, file: string): boolean {
	const relative = path.relative(directory, file);
	return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * The native `tsc` that goes with a `typescript` package: the program of the
 * platform's package, beside the `typescript` package or inside it. The
 * package's own `bin/tsc` only finds this program and replaces itself with
 * it, so the check starts the program itself and stops exactly the process it
 * started.
 * @param typescript The package's directory, with its links resolved.
 * @returns The program, or undefined when the package has none for this machine.
 */
function nativeTsc(typescript: string): string | undefined {
	const native = path.join("@typescript", `typescript-${process.platform}-${process.arch}`);
	const program = process.platform === "win32" ? "tsc.exe" : "tsc";
	return [path.join(typescript, "node_modules", native), path.join(typescript, "..", native)]
		.map((directory) => path.join(directory, "lib", program))
		.find((file) => fs.existsSync(file));
}

/**
 * The major version a `typescript` package declares.
 * @param typescript The package's directory.
 * @returns The major version, or 0 when the manifest names none.
 */
function majorVersionOf(typescript: string): number {
	const manifest: unknown = JSON.parse(
		fs.readFileSync(path.join(typescript, "package.json"), "utf8"),
	);
	const version =
		typeof manifest === "object" && manifest !== null && "version" in manifest
			? manifest.version
			: undefined;
	return typeof version === "string" ? Number.parseInt(version, 10) : 0;
}

/**
 * The native `tsc` of the checkout's own `typescript` package.
 * @param root The checkout, absolute.
 * @returns The program, or undefined when the checkout installs no TypeScript
 * of version 7 or later with a native program for this machine.
 */
function checkoutTsc(root: string): string | undefined {
	try {
		const typescript = fs.realpathSync(path.join(root, "node_modules", "typescript"));
		if (!isInside(fs.realpathSync(root), typescript)) return undefined;
		return majorVersionOf(typescript) >= FIRST_NATIVE_TYPESCRIPT
			? nativeTsc(typescript)
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * The native `tsc` of Archboard's own `typescript` package.
 * @returns The program, or undefined when there is none for this machine.
 */
function archboardTsc(): string | undefined {
	try {
		const manifest = Bun.resolveSync("typescript/package.json", import.meta.dir);
		return nativeTsc(path.dirname(fs.realpathSync(manifest)));
	} catch {
		return undefined;
	}
}

/**
 * The TypeScript server of a checkout.
 * @param root The checkout, absolute.
 * @returns The server.
 */
function typescriptServer(root: string): LanguageServer {
	const program = checkoutTsc(root) ?? archboardTsc();
	if (program === undefined) {
		return {
			status: "missing",
			detail: `neither the checkout's nor Archboard's typescript package has a native tsc for ${process.platform}-${process.arch}`,
		};
	}
	return { status: "command", argv: [program, "--lsp", "--stdio"] };
}

/**
 * The server one language uses in a checkout.
 * @param language The language.
 * @param root The checkout, absolute.
 * @param configured The servers the checkout's registration holds.
 * @returns The server, or why there is none.
 */
function languageServerOf(
	language: Language,
	root: string,
	configured: LanguageServers,
): LanguageServer {
	if (language === "typescript") return typescriptServer(root);
	const server = configured[language];
	if (server === undefined) {
		return { status: "missing", detail: "no server is configured" };
	}
	const program = Bun.which(server.command);
	if (program === null) {
		// A name is looked up on the `PATH` this process started with, which a
		// server that already runs keeps, whatever the agent's shell has since.
		const where = path.isAbsolute(server.command)
			? "is not an executable file"
			: "is not on the PATH of the Archboard server";
		return { status: "missing", detail: `${server.command} (configured for ${language}) ${where}` };
	}
	return { status: "command", argv: [program, ...server.args] };
}

export { type LanguageServer, languageServerOf };
